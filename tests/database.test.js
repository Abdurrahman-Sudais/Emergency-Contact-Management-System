const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { openDatabase } = require("../src/db");
const { createStore } = require("../src/store");
const { createCipher } = require("../src/security/encryption");

const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA";
let db, store;

before(async () => {
  db = await openDatabase();
  store = createStore(db, createCipher(crypto.randomBytes(32)), Date.now);
});
after(() => db.close());

const newUser = (email, extra = {}) => store.users.create({ name: "Db User", email, passwordHash: HASH, ...extra });
const newContact = (userId, name = "Contact Person") => store.contacts.create(userId, { name, phone: "+2348025550142", relationship: "family" });
const count = async (sql, params) => (await db.one(sql, params)).n;

describe("Schema rules", () => {
  test("DB-01 the six tables exist", async () => {
    const rows = await db.all(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    assert.deepEqual(rows.map((r) => r.table_name), ["audit_log", "contacts", "photos", "sessions", "support_requests", "users"]);
  });

  test("DB-02 emails are unique, ignoring capitals", async () => {
    await newUser("unique@example.com");
    await assert.rejects(newUser("UNIQUE@example.com"), /duplicate key|unique/i);
  });

  test("DB-03 roles and statuses are limited to known values", async () => {
    const id = await newUser("roles@example.com");
    await assert.rejects(db.query(`UPDATE users SET role = 'superuser' WHERE id = $1`, [id]), /check constraint/i);
    await assert.rejects(db.query(`UPDATE users SET status = 'whatever' WHERE id = $1`, [id]), /check constraint/i);
  });

  test("DB-04 a plain-text password can't be stored (must be an Argon2id hash)", async () => {
    await assert.rejects(store.users.create({ name: "Plain Text", email: "plain@example.com", passwordHash: "hunter2!!!" }), /check constraint/i);
  });

  test("DB-05 contacts must have a valid relationship and an international phone", async () => {
    const id = await newUser("rules@example.com");
    await assert.rejects(store.contacts.create(id, { name: "Bad Rel", phone: "+2348025550142", relationship: "enemy" }), /check constraint/i);
    await assert.rejects(store.contacts.create(id, { name: "Bad Phone", phone: "08025550142", relationship: "family" }), /check constraint/i);
  });

  test("DB-06 a contact can't point at a user that doesn't exist", async () => {
    await assert.rejects(newContact(987654), /foreign key/i);
  });
});

describe("Relationships and integrity", () => {
  test("DB-07 deleting a user also deletes their contacts, sessions and photo (cascade)", async () => {
    const id = await newUser("cascade@example.com");
    await newContact(id);
    await newContact(id, "Second Person");
    await db.query(`INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, last_seen_at) VALUES ('h', $1, 'c', 0, 0)`, [id]);
    await store.photos.set(id, "image/png", Buffer.from("png"));
    await store.users.remove(id);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = $1`, [id]), 0);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = $1`, [id]), 0);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM photos WHERE user_id = $1`, [id]), 0);
  });

  test("DB-08 positions stay 1..n with no gaps after deletes", async () => {
    const id = await newUser("positions@example.com");
    const ids = [];
    for (const n of ["Ann One", "Ben Two", "Cat Three", "Dan Four"]) ids.push(await newContact(id, n));
    await store.contacts.remove(id, ids[1]);
    await store.contacts.remove(id, ids[0]);
    const list = await store.contacts.listForUser(id);
    assert.deepEqual(list.map((c) => [c.position, c.name]), [[1, "Cat Three"], [2, "Dan Four"]]);
  });

  test("DB-09 every contact query is scoped to its owner", async () => {
    const a = await newUser("scope-a@example.com");
    const b = await newUser("scope-b@example.com");
    const cid = await newContact(a, "Owned By A");
    assert.equal(await store.contacts.get(b, cid), null);
    assert.equal(await store.contacts.update(b, cid, { name: "Changed", phone: "+2348025550142", relationship: "family" }), 0);
    assert.equal(await store.contacts.remove(b, cid), 0);
    assert.equal((await store.contacts.get(a, cid)).name, "Owned By A");
  });

  test("DB-10 a failed transaction leaves no half-written changes", async () => {
    const id = await newUser("tx@example.com");
    await assert.rejects(store.transaction(async (tx) => {
      await tx.contacts.create(id, { name: "First Saved", phone: "+2348025550142", relationship: "family" });
      await tx.contacts.create(id, { name: "x", phone: "+2348025550142", relationship: "family" });
    }));
    assert.equal((await store.contacts.listForUser(id)).length, 0);
  });

  test("DB-11 notes round-trip through encryption, and tampering is detected", async () => {
    const id = await newUser("crypto@example.com");
    const cid = await store.contacts.create(id, { name: "Note Person", phone: "+2348025550142", relationship: "friend", note: "Allergic to bees" });
    assert.equal((await store.contacts.get(id, cid)).note, "Allergic to bees");

    const raw = (await db.one(`SELECT note_enc FROM contacts WHERE id = $1`, [cid])).note_enc;
    const bytes = Buffer.from(raw.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    await db.query(`UPDATE contacts SET note_enc = $1 WHERE id = $2`, ["v1:" + bytes.toString("base64"), cid]);
    await assert.rejects(store.contacts.get(id, cid), /authenticate/);
  });

  test("DB-12 deleting an account removes its activity history too", async () => {
    const id = await newUser("history@example.com");
    await store.audit.log("contact_added", { actorId: id, subjectId: id, detail: "Someone Private" });
    await store.transaction(async (tx) => {
      await tx.audit.removeForUser(id);
      await tx.users.remove(id);
    });
    assert.equal(await count(`SELECT COUNT(*) AS n FROM audit_log WHERE detail = 'Someone Private'`), 0);
  });

  test("DB-13 the tables are locked away from Supabase's public API roles", async () => {
    const { SCHEMA } = require("../src/db");
    assert.match(SCHEMA, /ENABLE ROW LEVEL SECURITY/);
    assert.match(SCHEMA, /REVOKE ALL ON %I FROM anon, authenticated/);
  });
});
