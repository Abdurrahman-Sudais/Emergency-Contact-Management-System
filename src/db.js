const fs = require("node:fs");
const path = require("node:path");

const RELATIONSHIPS = ["family", "friend", "doctor", "neighbour", "work"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id               BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  email            TEXT    NOT NULL,
  phone            TEXT,
  password_hash    TEXT    NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  role             TEXT    NOT NULL DEFAULT 'user'   CHECK (role IN ('user', 'admin')),
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  failed_logins    INTEGER NOT NULL DEFAULT 0,
  locked_until     BIGINT,
  medical_enc      TEXT,
  privacy_reviewed INTEGER NOT NULL DEFAULT 0,
  order_set        INTEGER NOT NULL DEFAULT 0,
  created_at       BIGINT  NOT NULL,
  last_login_at    BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_codes (
  user_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      TEXT    NOT NULL CHECK (purpose IN ('signup', 'email_change')),
  email        TEXT    NOT NULL,
  code_hash    TEXT    NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  sent_at      BIGINT  NOT NULL,
  expires_at   BIGINT  NOT NULL,
  hour_started BIGINT  NOT NULL,
  hour_sends   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS contacts (
  id           BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  label        TEXT    CHECK (label IS NULL OR length(label) <= 40),
  phone        TEXT    NOT NULL CHECK (phone LIKE '+%'),
  relationship TEXT    NOT NULL CHECK (relationship IN ('family', 'friend', 'doctor', 'neighbour', 'work')),
  note_enc     TEXT,
  position     INTEGER NOT NULL CHECK (position >= 1),
  verified     INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at   BIGINT  NOT NULL,
  updated_at   BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_by_user ON contacts (user_id, position);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS verified_at BIGINT;

CREATE TABLE IF NOT EXISTS sessions (
  id_hash      TEXT    PRIMARY KEY,
  user_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token   TEXT    NOT NULL,
  persistent   INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT  NOT NULL,
  last_seen_at BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   BIGINT  REFERENCES users(id) ON DELETE SET NULL,
  subject_id BIGINT  REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT    NOT NULL,
  detail     TEXT,
  created_at BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_by_subject ON audit_log (subject_id, created_at);
CREATE INDEX IF NOT EXISTS audit_by_actor ON audit_log (actor_id);

CREATE TABLE IF NOT EXISTS photos (
  user_id    BIGINT  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp')),
  data       BYTEA   NOT NULL CHECK (octet_length(data) <= 2097152),
  updated_at BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS support_requests (
  id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT  REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  email       TEXT    NOT NULL CHECK (length(email) <= 254),
  message     TEXT    NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  BIGINT  NOT NULL,
  resolved_at BIGINT,
  resolved_by BIGINT  REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS support_by_status ON support_requests (status, created_at);
CREATE INDEX IF NOT EXISTS support_by_email ON support_requests (lower(email), created_at);

DO $lock$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    FOREACH t IN ARRAY ARRAY['users', 'contacts', 'sessions', 'audit_log', 'photos', 'support_requests', 'email_codes'] LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END
$lock$;
`;

function wrap(runner) {
  return {
    async query(sql, params = []) {
      const r = await runner.query(sql, params);
      return { rows: r.rows, count: r.rowCount ?? r.affectedRows ?? 0 };
    },
    async one(sql, params = []) {
      return (await runner.query(sql, params)).rows[0] || null;
    },
    async all(sql, params = []) {
      return (await runner.query(sql, params)).rows;
    },
  };
}

async function openPglite(dir) {
  const { PGlite } = require("@electric-sql/pglite");
  if (dir) fs.mkdirSync(path.resolve(dir), { recursive: true });
  const pg = new PGlite(dir ? path.resolve(dir) : undefined, { parsers: { 20: (v) => Number(v) } });
  await pg.waitReady;
  return {
    ...wrap(pg),
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

async function openPostgres(url, { caCert } = {}) {
  const pg = require("pg");
  const dns = require("node:dns").promises;
  pg.types.setTypeParser(20, (v) => Number(v));
  const conn = new URL(url);
  let host = conn.hostname;
  try {
    host = (await dns.resolve4(conn.hostname))[0];
  } catch {
    try {
      host = (await dns.lookup(conn.hostname, { family: 4 })).address;
    } catch {}
  }
  const pool = new pg.Pool({
    host,
    port: Number(conn.port) || 5432,
    user: decodeURIComponent(conn.username),
    password: decodeURIComponent(conn.password),
    database: conn.pathname.slice(1) || "postgres",
    ssl: { servername: conn.hostname, ...(caCert ? { ca: caCert } : { rejectUnauthorized: false }) },
    max: 3,
    idleTimeoutMillis: 60000,
    keepAlive: true,
  });
  return {
    ...wrap(pool),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openDatabase({ url, dir, caCert } = {}) {
  const db = url ? await openPostgres(url, { caCert }) : await openPglite(dir);
  const ready = await db.one(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'google_sub') AS ok`
  );
  if (!ready.ok) await db.exec(SCHEMA);
  return db;
}

module.exports = { openDatabase, RELATIONSHIPS, SCHEMA };
