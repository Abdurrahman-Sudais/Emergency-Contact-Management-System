const BLOOD_GROUPS = ["", "O positive", "O negative", "A positive", "A negative", "B positive", "B negative", "AB positive", "AB negative"];

const SECURITY_EVENTS = ["register", "account_locked", "role_changed", "suspended", "reinstated", "unlocked", "access_denied", "account_deleted", "password_changed"];

function createStore(db, cipher, now) {
  const inTx = (fn) => (db.transaction ? db.transaction(fn) : fn(db));

  const users = {
    async create({ name, email, phone = null, passwordHash, role = "user" }) {
      const row = await db.one(
        `INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, email, phone, passwordHash, role, now()]
      );
      return row.id;
    },
    byId: (id) => db.one(`SELECT * FROM users WHERE id = $1`, [id]),
    byEmail: (email) => db.one(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]),
    emailTaken: async (email, exceptId = 0) =>
      !!(await db.one(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2`, [email, exceptId])),

    async recordFailedLogin(user, maxAttempts, lockMs) {
      const failures = user.failed_logins + 1;
      if (failures >= maxAttempts) {
        await db.query(`UPDATE users SET failed_logins = 0, locked_until = $1 WHERE id = $2`, [now() + lockMs, user.id]);
        return true;
      }
      await db.query(`UPDATE users SET failed_logins = $1 WHERE id = $2`, [failures, user.id]);
      return false;
    },
    recordLogin: (id) => db.query(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = $1 WHERE id = $2`, [now(), id]),

    updateDetails: (id, { name, email, phone }) => db.query(`UPDATE users SET name = $1, email = $2, phone = $3 WHERE id = $4`, [name, email, phone, id]),
    updatePassword: (id, hash) => db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id]),
    setRole: (id, role) => db.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]),
    setStatus: (id, status) => db.query(`UPDATE users SET status = $1 WHERE id = $2`, [status, id]),
    unlock: (id) => db.query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [id]),
    markPrivacyReviewed: (id) => db.query(`UPDATE users SET privacy_reviewed = 1 WHERE id = $1 AND privacy_reviewed = 0`, [id]),
    remove: (id) => db.query(`DELETE FROM users WHERE id = $1`, [id]),
    adminCount: async () => (await db.one(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`)).n,

    getMedical(user) {
      const empty = { bloodGroup: "", allergies: "" };
      if (!user.medical_enc) return empty;
      return { ...empty, ...JSON.parse(cipher.decrypt(user.medical_enc)) };
    },
    setMedical: (id, medical) => db.query(`UPDATE users SET medical_enc = $1 WHERE id = $2`, [cipher.encrypt(JSON.stringify(medical)), id]),

    list(search = "") {
      const like = `%${escapeLike(search)}%`;
      return db.all(
        `SELECT id, name, email, role, status, locked_until, last_login_at, created_at FROM users
         WHERE name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' ORDER BY lower(name)`,
        [like]
      );
    },
    async stats() {
      const t = now();
      const row = await db.one(
        `SELECT COUNT(*) AS registered,
                COUNT(*) FILTER (WHERE last_login_at >= $1) AS active,
                COUNT(*) FILTER (WHERE locked_until > $2) AS locked
         FROM users`,
        [t - 7 * 864e5, t]
      );
      return { registered: row.registered, activeThisWeek: row.active, locked: row.locked };
    },
  };

  const contacts = {
    async listForUser(userId, { search = "", filter = "all" } = {}) {
      const params = [userId];
      let sql = `SELECT * FROM contacts WHERE user_id = $1`;
      if (search) {
        params.push(`%${escapeLike(search)}%`);
        const like = `$${params.length}`;
        let match = `name ILIKE ${like} ESCAPE '\\' OR label ILIKE ${like} ESCAPE '\\'`;
        const digits = search.replace(/\D/g, "");
        if (digits) {
          params.push(`%${digits}%`);
          match += ` OR phone LIKE $${params.length}`;
        }
        sql += ` AND (${match})`;
      }
      if (filter === "review") sql += ` AND verified = 0`;
      else if (filter !== "all") {
        params.push(filter);
        sql += ` AND relationship = $${params.length}`;
      }
      return (await db.all(sql + ` ORDER BY position`, params)).map(decryptContact);
    },

    async counts(userId) {
      const rows = await db.all(
        `SELECT relationship, COUNT(*) AS n, COUNT(*) FILTER (WHERE verified = 0) AS review
         FROM contacts WHERE user_id = $1 GROUP BY relationship`,
        [userId]
      );
      const out = { all: 0, review: 0, family: 0, friend: 0, doctor: 0, neighbour: 0, work: 0 };
      for (const r of rows) {
        out[r.relationship] = r.n;
        out.all += r.n;
        out.review += r.review;
      }
      return out;
    },

    async get(userId, id) {
      const row = await db.one(`SELECT * FROM contacts WHERE id = $1 AND user_id = $2`, [id, userId]);
      return row ? decryptContact(row) : null;
    },
    exists: async (id) => !!(await db.one(`SELECT 1 FROM contacts WHERE id = $1`, [id])),

    async create(userId, c) {
      const t = now();
      const row = await db.one(
        `INSERT INTO contacts (user_id, name, label, phone, relationship, note_enc, position, verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(position), 0) + 1 FROM contacts WHERE user_id = $1), $7, $8, $8)
         RETURNING id`,
        [userId, c.name, c.label || null, c.phone, c.relationship, cipher.encrypt(c.note), c.verified ? 1 : 0, t]
      );
      return row.id;
    },

    async update(userId, id, c) {
      const r = await db.query(
        `UPDATE contacts SET name = $1, label = $2, phone = $3, relationship = $4, note_enc = $5, verified = $6, updated_at = $7
         WHERE id = $8 AND user_id = $9`,
        [c.name, c.label || null, c.phone, c.relationship, cipher.encrypt(c.note), c.verified ? 1 : 0, now(), id, userId]
      );
      return r.count;
    },

    remove(userId, id) {
      return inTx(async (tx) => {
        const r = await tx.query(`DELETE FROM contacts WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (r.count) {
          await tx.query(
            `UPDATE contacts c SET position = r.n
             FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS n FROM contacts WHERE user_id = $1) r
             WHERE c.id = r.id`,
            [userId]
          );
        }
        return r.count;
      });
    },

    move(userId, id, direction) {
      return inTx(async (tx) => {
        const me = await tx.one(`SELECT id, position FROM contacts WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!me) return null;
        const other = direction === "up"
          ? await tx.one(`SELECT id, position FROM contacts WHERE user_id = $1 AND position < $2 ORDER BY position DESC LIMIT 1`, [userId, me.position])
          : await tx.one(`SELECT id, position FROM contacts WHERE user_id = $1 AND position > $2 ORDER BY position ASC LIMIT 1`, [userId, me.position]);
        if (!other) return null;
        await tx.query(`UPDATE contacts SET position = $1 WHERE id = $2 AND user_id = $3`, [other.position, me.id, userId]);
        await tx.query(`UPDATE contacts SET position = $1 WHERE id = $2 AND user_id = $3`, [me.position, other.id, userId]);
        await tx.query(`UPDATE users SET order_set = 1 WHERE id = $1`, [userId]);
        return other.position;
      });
    },

    reorder(userId, ids) {
      return inTx(async (tx) => {
        const rows = await tx.all(`SELECT id FROM contacts WHERE user_id = $1`, [userId]);
        const owned = new Set(rows.map((r) => r.id));
        const given = new Set(ids);
        const complete = ids.length === owned.size && given.size === ids.length && ids.every((id) => owned.has(id));
        if (!complete) return false;
        for (let i = 0; i < ids.length; i++) {
          await tx.query(`UPDATE contacts SET position = $1 WHERE id = $2 AND user_id = $3`, [i + 1, ids[i], userId]);
        }
        await tx.query(`UPDATE users SET order_set = 1 WHERE id = $1`, [userId]);
        return true;
      });
    },

    async markVerified(userId, id) {
      const r = await db.query(`UPDATE contacts SET verified = 1, updated_at = $1 WHERE id = $2 AND user_id = $3`, [now(), id, userId]);
      return r.count;
    },
  };

  function decryptContact(row) {
    const { note_enc, ...rest } = row;
    return { ...rest, note: cipher.decrypt(note_enc) };
  }

  const photos = {
    get: (userId) => db.one(`SELECT type, data, updated_at FROM photos WHERE user_id = $1`, [userId]),
    version: async (userId) => (await db.one(`SELECT updated_at FROM photos WHERE user_id = $1`, [userId]))?.updated_at ?? null,
    async set(userId, type, data) {
      const t = now();
      await db.query(
        `INSERT INTO photos (user_id, type, data, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = excluded.updated_at`,
        [userId, type, data, t]
      );
      return t;
    },
    remove: async (userId) => (await db.query(`DELETE FROM photos WHERE user_id = $1`, [userId])).count,
  };

  const support = {
    async create({ userId = null, name, email, message }) {
      const row = await db.one(
        `INSERT INTO support_requests (user_id, name, email, message, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, name, email, message, now()]
      );
      return row.id;
    },
    recentFrom: async (email, sinceMs) =>
      (await db.one(`SELECT COUNT(*) AS n FROM support_requests WHERE lower(email) = lower($1) AND created_at > $2`, [email, now() - sinceMs])).n,
    listOpen: (limit = 20) =>
      db.all(
        `SELECT r.id, r.name, r.email, r.message, r.created_at, u.id AS account_id, u.status AS account_status, u.locked_until
         FROM support_requests r LEFT JOIN users u ON lower(u.email) = lower(r.email)
         WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT $1`,
        [limit]
      ),
    resolve: async (id, adminId) =>
      (await db.query(`UPDATE support_requests SET status = 'resolved', resolved_at = $1, resolved_by = $2 WHERE id = $3 AND status = 'open'`, [now(), adminId, id])).count,
  };

  const audit = {
    log: (event, { actorId = null, subjectId = null, detail = null } = {}) =>
      db.query(`INSERT INTO audit_log (actor_id, subject_id, event, detail, created_at) VALUES ($1, $2, $3, $4, $5)`, [actorId, subjectId, event, detail, now()]),
    forUser: (userId, limit = 5) =>
      db.all(`SELECT event, detail, created_at FROM audit_log WHERE subject_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`, [userId, limit]),
    securityEvents: (limit = 8) =>
      db.all(
        `SELECT a.event, a.detail, a.created_at, u.name AS subject_name FROM audit_log a
         LEFT JOIN users u ON u.id = a.subject_id
         WHERE a.event = ANY($1) ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
        [SECURITY_EVENTS, limit]
      ),
    removeForUser: (userId) => db.query(`DELETE FROM audit_log WHERE subject_id = $1`, [userId]),
  };

  return {
    users,
    contacts,
    photos,
    support,
    audit,
    transaction: (fn) => inTx((tx) => fn(createStore(tx, cipher, now))),
  };
}

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => "\\" + c);
}

module.exports = { createStore, BLOOD_GROUPS };
