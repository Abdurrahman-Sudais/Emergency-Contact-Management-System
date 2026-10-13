const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const RELATIONSHIPS = ["family", "friend", "doctor", "neighbour", "work"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  email            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone            TEXT,
  password_hash    TEXT    NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  role             TEXT    NOT NULL DEFAULT 'user'   CHECK (role IN ('user', 'admin')),
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  failed_logins    INTEGER NOT NULL DEFAULT 0,
  locked_until     INTEGER,
  medical_enc      TEXT,
  privacy_reviewed INTEGER NOT NULL DEFAULT 0,
  order_set        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  last_login_at    INTEGER
);

CREATE TABLE IF NOT EXISTS contacts (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  label        TEXT    CHECK (label IS NULL OR length(label) <= 40),
  phone        TEXT    NOT NULL CHECK (phone LIKE '+%'),
  relationship TEXT    NOT NULL CHECK (relationship IN ('family', 'friend', 'doctor', 'neighbour', 'work')),
  note_enc     TEXT,
  position     INTEGER NOT NULL CHECK (position >= 1),
  verified     INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_by_user ON contacts (user_id, position);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash      TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token   TEXT    NOT NULL,
  persistent   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT    NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_by_subject ON audit_log (subject_id, created_at);

CREATE TABLE IF NOT EXISTS photos (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp')),
  data       BLOB    NOT NULL CHECK (length(data) <= 2097152),
  updated_at INTEGER NOT NULL
);
`;

function openDatabase(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { openDatabase, transaction, RELATIONSHIPS };
