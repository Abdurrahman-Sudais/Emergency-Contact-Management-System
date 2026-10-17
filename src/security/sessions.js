const crypto = require("node:crypto");

const COOKIE = "sid";
const IDLE_MS = 15 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieString(name, value, { secure, maxAgeSec } = {}) {
  let c = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`;
  if (secure) c += "; Secure";
  if (maxAgeSec !== undefined) c += `; Max-Age=${maxAgeSec}`;
  return c;
}

function createSessions(db, now) {
  async function start(req, res, userId, { persistent = false } = {}) {
    const old = req.cookies[COOKIE];
    if (old) await db.query(`DELETE FROM sessions WHERE id_hash = $1`, [sha256(old)]);

    const raw = token();
    const t = now();
    await db.query(
      `INSERT INTO sessions (id_hash, user_id, csrf_token, persistent, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $5)`,
      [sha256(raw), userId, token(), persistent ? 1 : 0, t]
    );
    res.append("Set-Cookie", cookieString(COOKIE, raw, {
      secure: req.secure,
      maxAgeSec: persistent ? ABSOLUTE_MS / 1000 : undefined,
    }));
    return raw;
  }

  async function end(req, res) {
    const raw = req.cookies[COOKIE];
    if (raw) await db.query(`DELETE FROM sessions WHERE id_hash = $1`, [sha256(raw)]);
    res.append("Set-Cookie", cookieString(COOKIE, "", { secure: req.secure, maxAgeSec: 0 }));
  }

  function endAllFor(userId) {
    return db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  function middleware() {
    return async (req, res, next) => {
      req.cookies = parseCookies(req.headers.cookie);
      req.session = null;
      req.user = null;

      const raw = req.cookies[COOKIE];
      if (!raw) return next();

      const idHash = sha256(raw);
      const row = await db.one(
        `SELECT s.id_hash, s.csrf_token, s.persistent, s.created_at AS session_created_at, s.last_seen_at, u.*,
                (SELECT p.updated_at FROM photos p WHERE p.user_id = u.id) AS photo_version
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1`,
        [idHash]
      );
      const t = now();

      if (!row || row.status !== "active" || t - row.last_seen_at > IDLE_MS || t - row.session_created_at > ABSOLUTE_MS) {
        if (row) {
          await db.query(`DELETE FROM sessions WHERE id_hash = $1`, [idHash]);
          req.sessionExpired = true;
        }
        res.append("Set-Cookie", cookieString(COOKIE, "", { secure: req.secure, maxAgeSec: 0 }));
        return next();
      }

      if (t - row.last_seen_at > 60 * 1000) {
        await db.query(`UPDATE sessions SET last_seen_at = $1 WHERE id_hash = $2`, [t, idHash]);
      }
      const { id_hash, csrf_token, persistent, session_created_at, last_seen_at, ...user } = row;
      req.session = { id_hash, csrf_token, persistent, created_at: session_created_at, last_seen_at, user_id: user.id };
      req.user = user;
      next();
    };
  }

  return { start, end, endAllFor, middleware };
}

module.exports = { createSessions, parseCookies, cookieString, IDLE_MS, ABSOLUTE_MS, COOKIE };
