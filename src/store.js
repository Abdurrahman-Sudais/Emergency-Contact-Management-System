const { transaction } = require("./db");

const BLOOD_GROUPS = ["", "O positive", "O negative", "A positive", "A negative", "B positive", "B negative", "AB positive", "AB negative"];

const SECURITY_EVENTS = ["register", "account_locked", "role_changed", "suspended", "reinstated", "unlocked", "access_denied", "account_deleted", "password_changed"];

function createStore(db, cipher, now) {
  const q = (sql) => db.prepare(sql);

  const users = {
    create({ name, email, phone = null, passwordHash, role = "user" }) {
      const r = q(`INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(name, email, phone, passwordHash, role, now());
      return Number(r.lastInsertRowid);
    },
    byId: (id) => q(`SELECT * FROM users WHERE id = ?`).get(id),
    byEmail: (email) => q(`SELECT * FROM users WHERE email = ?`).get(email),
    emailTaken: (email, exceptId = 0) => !!q(`SELECT 1 FROM users WHERE email = ? AND id <> ?`).get(email, exceptId),

    recordFailedLogin(user, maxAttempts, lockMs) {
      const failures = user.failed_logins + 1;
      if (failures >= maxAttempts) {
        q(`UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?`).run(now() + lockMs, user.id);
        return true;
      }
      q(`UPDATE users SET failed_logins = ? WHERE id = ?`).run(failures, user.id);
      return false;
    },
    recordLogin: (id) => q(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`).run(now(), id),

    updateDetails: (id, { name, email, phone }) => q(`UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?`).run(name, email, phone, id),
    updatePassword: (id, hash) => q(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, id),
    setRole: (id, role) => q(`UPDATE users SET role = ? WHERE id = ?`).run(role, id),
    setStatus: (id, status) => q(`UPDATE users SET status = ? WHERE id = ?`).run(status, id),
    unlock: (id) => q(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?`).run(id),
    markPrivacyReviewed: (id) => q(`UPDATE users SET privacy_reviewed = 1 WHERE id = ? AND privacy_reviewed = 0`).run(id),
    remove: (id) => q(`DELETE FROM users WHERE id = ?`).run(id),
    adminCount: () => q(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`).get().n,

    getMedical(user) {
      const empty = { bloodGroup: "", allergies: "" };
      if (!user.medical_enc) return empty;
      return { ...empty, ...JSON.parse(cipher.decrypt(user.medical_enc)) };
    },
    setMedical: (id, medical) => q(`UPDATE users SET medical_enc = ? WHERE id = ?`).run(cipher.encrypt(JSON.stringify(medical)), id),

    list(search = "") {
      const like = `%${escapeLike(search)}%`;
      return q(`SELECT id, name, email, role, status, locked_until, last_login_at, created_at FROM users
                WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY name COLLATE NOCASE`).all(like, like);
    },
    stats() {
      const t = now();
      return {
        registered: q(`SELECT COUNT(*) AS n FROM users`).get().n,
        activeThisWeek: q(`SELECT COUNT(*) AS n FROM users WHERE last_login_at >= ?`).get(t - 7 * 864e5).n,
        locked: q(`SELECT COUNT(*) AS n FROM users WHERE locked_until > ?`).get(t).n,
      };
    },
  };

  const contacts = {
    listForUser(userId, { search = "", filter = "all" } = {}) {
      const params = [userId];
      let sql = `SELECT * FROM contacts WHERE user_id = ?`;
      if (search) {
        const like = `%${escapeLike(search)}%`;
        const digits = search.replace(/\D/g, "");
        sql += ` AND (name LIKE ? ESCAPE '\\' OR label LIKE ? ESCAPE '\\'` + (digits ? ` OR phone LIKE ?` : "") + `)`;
        params.push(like, like);
        if (digits) params.push(`%${digits}%`);
      }
      if (filter === "review") sql += ` AND verified = 0`;
      else if (filter !== "all") {
        sql += ` AND relationship = ?`;
        params.push(filter);
      }
      return q(sql + ` ORDER BY position`).all(...params).map(decryptContact);
    },

    counts(userId) {
      const rows = q(`SELECT relationship, COUNT(*) AS n FROM contacts WHERE user_id = ? GROUP BY relationship`).all(userId);
      const out = { all: 0, review: 0, family: 0, friend: 0, doctor: 0, neighbour: 0, work: 0 };
      for (const r of rows) {
        out[r.relationship] = r.n;
        out.all += r.n;
      }
      out.review = q(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ? AND verified = 0`).get(userId).n;
      return out;
    },

    get(userId, id) {
      const row = q(`SELECT * FROM contacts WHERE id = ? AND user_id = ?`).get(id, userId);
      return row ? decryptContact(row) : null;
    },
    exists: (id) => !!q(`SELECT 1 FROM contacts WHERE id = ?`).get(id),

    create(userId, c) {
      const t = now();
      const pos = q(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM contacts WHERE user_id = ?`).get(userId).p;
      const r = q(`INSERT INTO contacts (user_id, name, label, phone, relationship, note_enc, position, verified, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, c.name, c.label || null, c.phone, c.relationship, cipher.encrypt(c.note), pos, c.verified ? 1 : 0, t, t);
      return Number(r.lastInsertRowid);
    },

    update(userId, id, c) {
      return q(`UPDATE contacts SET name = ?, label = ?, phone = ?, relationship = ?, note_enc = ?, verified = ?, updated_at = ?
                WHERE id = ? AND user_id = ?`)
        .run(c.name, c.label || null, c.phone, c.relationship, cipher.encrypt(c.note), c.verified ? 1 : 0, now(), id, userId).changes;
    },

    remove(userId, id) {
      return transaction(db, () => {
        const changes = q(`DELETE FROM contacts WHERE id = ? AND user_id = ?`).run(id, userId).changes;
        if (changes) renumber(userId);
        return changes;
      });
    },

    move(userId, id, direction) {
      return transaction(db, () => {
        const me = q(`SELECT id, position FROM contacts WHERE id = ? AND user_id = ?`).get(id, userId);
        if (!me) return null;
        const other = direction === "up"
          ? q(`SELECT id, position FROM contacts WHERE user_id = ? AND position < ? ORDER BY position DESC LIMIT 1`).get(userId, me.position)
          : q(`SELECT id, position FROM contacts WHERE user_id = ? AND position > ? ORDER BY position ASC LIMIT 1`).get(userId, me.position);
        if (!other) return null;
        q(`UPDATE contacts SET position = ? WHERE id = ? AND user_id = ?`).run(other.position, me.id, userId);
        q(`UPDATE contacts SET position = ? WHERE id = ? AND user_id = ?`).run(me.position, other.id, userId);
        q(`UPDATE users SET order_set = 1 WHERE id = ?`).run(userId);
        return other.position;
      });
    },
  };

  function renumber(userId) {
    const rows = q(`SELECT id FROM contacts WHERE user_id = ? ORDER BY position`).all(userId);
    rows.forEach((r, i) => q(`UPDATE contacts SET position = ? WHERE id = ?`).run(i + 1, r.id));
  }

  function decryptContact(row) {
    const { note_enc, ...rest } = row;
    return { ...rest, note: cipher.decrypt(note_enc) };
  }

  const audit = {
    log(event, { actorId = null, subjectId = null, detail = null } = {}) {
      q(`INSERT INTO audit_log (actor_id, subject_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(actorId, subjectId, event, detail, now());
    },
    forUser: (userId, limit = 5) =>
      q(`SELECT event, detail, created_at FROM audit_log WHERE subject_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(userId, limit),
    securityEvents(limit = 8) {
      const marks = SECURITY_EVENTS.map(() => "?").join(", ");
      return q(`SELECT a.event, a.detail, a.created_at, u.name AS subject_name FROM audit_log a
                LEFT JOIN users u ON u.id = a.subject_id
                WHERE a.event IN (${marks}) ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).all(...SECURITY_EVENTS, limit);
    },
    removeForUser: (userId) => q(`DELETE FROM audit_log WHERE subject_id = ?`).run(userId),
  };

  return { users, contacts, audit };
}

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => "\\" + c);
}

module.exports = { createStore, BLOOD_GROUPS };
