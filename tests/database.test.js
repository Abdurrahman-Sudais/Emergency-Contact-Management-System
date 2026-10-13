const { test, before, describe } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { openDatabase, transaction } = require("../src/db");
const { createStore } = require("../src/store");
const { createCipher } = require("../src/security/encryption");

const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA";
let db, store;

before(() => {
  db = openDatabase(":memory:");
  store = createStore(db, createCipher(crypto.randomBytes(32)), Date.now);
});

const newUser = (email, extra = {}) => store.users.create({ name: "Db User", email, passwordHash: HASH, ...extra });
const newContact = (userId, name = "Contact Person") => store.contacts.create(userId, { name, phone: "+2348025550142", relationship: "family" });

describe("Schema rules", () => {
  test("DB-01 the four tables exist", () => {
    const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((r) => r.name);
    assert.deepEqual(names, ["audit_log", "contacts", "sessions", "users"]);
  });

  test("DB-02 emails are unique, ignoring capitals", () => {
    newUser("unique@example.com");
    assert.throws(() => newUser("UNIQUE@example.com"), /UNIQUE/);
  });

  test("DB-03 roles and statuses are limited to known values", () => {
    const id = newUser("roles@example.com");
    assert.throws(() => db.prepare(`UPDATE users SET role = 'superuser' WHERE id = ?`).run(id), /CHECK/);
    assert.throws(() => db.prepare(`UPDATE users SET status = 'whatever' WHERE id = ?`).run(id), /CHECK/);
  });

  test("DB-04 a plain-text password can't be stored (must be an Argon2id hash)", () => {
    assert.throws(() => store.users.create({ name: "Plain Text", email: "plain@example.com", passwordHash: "hunter2!!!" }), /CHECK/);
  });

  test("DB-05 contacts must have a valid relationship and an international phone", () => {
    const id = newUser("rules@example.com");
    assert.throws(() => store.contacts.create(id, { name: "Bad Rel", phone: "+2348025550142", relationship: "enemy" }), /CHECK/);
    assert.throws(() => store.contacts.create(id, { name: "Bad Phone", phone: "08025550142", relationship: "family" }), /CHECK/);
  });

  test("DB-06 a contact can't point at a user that doesn't exist", () => {
    assert.throws(() => newContact(987654), /FOREIGN KEY/);
  });
});

describe("Relationships and integrity", () => {
  test("DB-07 deleting a user also deletes their contacts and sessions (cascade)", () => {
    const id = newUser("cascade@example.com");
    newContact(id);
    newContact(id, "Second Person");
    db.prepare(`INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, last_seen_at) VALUES ('h', ?, 'c', 0, 0)`).run(id);
    store.users.remove(id);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?`).get(id).n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`).get(id).n, 0);
  });

  test("DB-08 positions stay 1..n with no gaps after deletes", () => {
    const id = newUser("positions@example.com");
    const ids = ["Ann One", "Ben Two", "Cat Three", "Dan Four"].map((n) => newContact(id, n));
    store.contacts.remove(id, ids[1]);
    store.contacts.remove(id, ids[0]);
    assert.deepEqual(store.contacts.listForUser(id).map((c) => [c.position, c.name]), [[1, "Cat Three"], [2, "Dan Four"]]);
  });

  test("DB-09 every contact query is scoped to its owner", () => {
    const a = newUser("scope-a@example.com");
    const b = newUser("scope-b@example.com");
    const cid = newContact(a, "Owned By A");
    assert.equal(store.contacts.get(b, cid), null);
    assert.equal(store.contacts.update(b, cid, { name: "Changed", phone: "+2348025550142", relationship: "family" }), 0);
    assert.equal(store.contacts.remove(b, cid), 0);
    assert.equal(store.contacts.get(a, cid).name, "Owned By A");
  });

  test("DB-10 a failed transaction leaves no half-written changes", () => {
    const id = newUser("tx@example.com");
    assert.throws(() => transaction(db, () => {
      newContact(id, "First Saved");
      newContact(id, "x");
    }));
    assert.equal(store.contacts.listForUser(id).length, 0);
  });

  test("DB-11 notes round-trip through encryption, and tampering is detected", () => {
    const id = newUser("crypto@example.com");
    const cid = store.contacts.create(id, { name: "Note Person", phone: "+2348025550142", relationship: "friend", note: "Allergic to bees" });
    assert.equal(store.contacts.get(id, cid).note, "Allergic to bees");

    const raw = db.prepare(`SELECT note_enc FROM contacts WHERE id = ?`).get(cid).note_enc;
    const bytes = Buffer.from(raw.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    db.prepare(`UPDATE contacts SET note_enc = ? WHERE id = ?`).run("v1:" + bytes.toString("base64"), cid);
    assert.throws(() => store.contacts.get(id, cid), /authenticate/);
  });

  test("DB-12 deleting an account removes its activity history too", () => {
    const id = newUser("history@example.com");
    store.audit.log("contact_added", { actorId: id, subjectId: id, detail: "Someone Private" });
    store.audit.removeForUser(id);
    store.users.remove(id);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE detail = 'Someone Private'`).get().n, 0);
  });
});
