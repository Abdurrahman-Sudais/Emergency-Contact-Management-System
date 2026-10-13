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
  const q = (sql) => db.prepare(sql);

  function start(req, res, userId, { persistent = false } = {}) {
    const old = req.cookies[COOKIE];
    if (old) q(`DELETE FROM sessions WHERE id_hash = ?`).run(sha256(old));

    const raw = token();
    const t = now();
    q(`INSERT INTO sessions (id_hash, user_id, csrf_token, persistent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(sha256(raw), userId, token(), persistent ? 1 : 0, t, t);
    res.append("Set-Cookie", cookieString(COOKIE, raw, {
      secure: req.secure,
      maxAgeSec: persistent ? ABSOLUTE_MS / 1000 : undefined,
    }));
    return raw;
  }

  function end(req, res) {
    const raw = req.cookies[COOKIE];
    if (raw) q(`DELETE FROM sessions WHERE id_hash = ?`).run(sha256(raw));
    res.append("Set-Cookie", cookieString(COOKIE, "", { secure: req.secure, maxAgeSec: 0 }));
  }

  function endAllFor(userId) {
    q(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  }

  function middleware(store) {
    return (req, res, next) => {
      req.cookies = parseCookies(req.headers.cookie);
      req.session = null;
      req.user = null;

      const raw = req.cookies[COOKIE];
      if (!raw) return next();

      const idHash = sha256(raw);
      const s = q(`SELECT * FROM sessions WHERE id_hash = ?`).get(idHash);
      const t = now();
      const user = s && store.users.byId(s.user_id);

      if (!s || !user || user.status !== "active" || t - s.last_seen_at > IDLE_MS || t - s.created_at > ABSOLUTE_MS) {
        if (s) {
          q(`DELETE FROM sessions WHERE id_hash = ?`).run(idHash);
          req.sessionExpired = true;
        }
        res.append("Set-Cookie", cookieString(COOKIE, "", { secure: req.secure, maxAgeSec: 0 }));
        return next();
      }

      q(`UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?`).run(t, idHash);
      req.session = s;
      req.user = user;
      next();
    };
  }

  return { start, end, endAllFor, middleware };
}

module.exports = { createSessions, parseCookies, cookieString, IDLE_MS, ABSOLUTE_MS, COOKIE };
