const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, contact } = require("./helpers");

let t;
before(async () => (t = await startApp()));
after(() => t.close());

describe("Contacts", () => {
  let b;
  before(async () => (b = await t.signedIn("contacts@example.com")));

  test("FUN-01 add contacts; they get positions 1, 2, 3 in the order added", async () => {
    const people = [
      contact({ name: "Tunde Bello", label: "Brother" }),
      contact({ name: "Dr. Kemi Adeyemi", phone: "08035550177", relationship: "doctor", verified: true }),
      contact({ name: "Funke Oladipo", phone: "+234 805 555 0119", relationship: "neighbour" }),
    ];
    for (const p of people) assert.equal((await b.post("/api/contacts", p)).status, 201);
    const list = (await b.get("/api/contacts")).json.contacts;
    assert.deepEqual(list.map((c) => [c.position, c.name]), [[1, "Tunde Bello"], [2, "Dr. Kemi Adeyemi"], [3, "Funke Oladipo"]]);
    assert.equal(list[1].phone, "+2348035550177", "local number stored in international format");
  });

  test("FUN-02 move a contact up and down the call order", async () => {
    const [, kemi] = (await b.get("/api/contacts")).json.contacts;
    assert.equal((await b.post(`/api/contacts/${kemi.id}/move`, { direction: "up" })).json.position, 1);
    let names = (await b.get("/api/contacts")).json.contacts.map((c) => c.name);
    assert.deepEqual(names, ["Dr. Kemi Adeyemi", "Tunde Bello", "Funke Oladipo"]);
    assert.equal((await b.post(`/api/contacts/${kemi.id}/move`, { direction: "up" })).json.position, 1);
    await b.post(`/api/contacts/${kemi.id}/move`, { direction: "down" });
    names = (await b.get("/api/contacts")).json.contacts.map((c) => c.name);
    assert.deepEqual(names, ["Tunde Bello", "Dr. Kemi Adeyemi", "Funke Oladipo"]);
  });

  test("FUN-03 edit a contact and mark it verified", async () => {
    const funke = (await b.get("/api/contacts")).json.contacts[2];
    const r = await b.put(`/api/contacts/${funke.id}`, contact({ name: "Funke Oladipo", phone: funke.phone, relationship: "friend", verified: true, note: "Spare key" }));
    assert.equal(r.status, 200);
    assert.equal(r.json.contact.relationship, "friend");
    assert.equal(r.json.contact.verified, true);
    assert.equal(r.json.contact.note, "Spare key");
  });

  test("FUN-04 search by name, label or phone digits", async () => {
    const q = async (s) => (await b.get("/api/contacts?q=" + encodeURIComponent(s))).json.contacts.map((c) => c.name);
    assert.deepEqual(await q("kemi"), ["Dr. Kemi Adeyemi"]);
    assert.deepEqual(await q("brother"), ["Tunde Bello"]);
    assert.deepEqual(await q("0119"), ["Funke Oladipo"]);
    assert.deepEqual(await q("zzz"), []);
  });

  test("FUN-05 filter by category, with counts for each chip", async () => {
    const r = await b.get("/api/contacts?filter=doctor");
    assert.deepEqual(r.json.contacts.map((c) => c.name), ["Dr. Kemi Adeyemi"]);
    assert.deepEqual(r.json.counts, { all: 3, review: 1, family: 1, friend: 1, doctor: 1, neighbour: 0, work: 0 });
    const review = await b.get("/api/contacts?filter=review");
    assert.deepEqual(review.json.contacts.map((c) => c.name), ["Tunde Bello"]);
  });

  test("FUN-06 delete a contact; the others close the gap", async () => {
    const tunde = (await b.get("/api/contacts")).json.contacts[0];
    assert.equal((await b.del(`/api/contacts/${tunde.id}`, {})).status, 200);
    const list = (await b.get("/api/contacts")).json.contacts;
    assert.deepEqual(list.map((c) => c.position), [1, 2]);
    assert.equal(list[0].name, "Dr. Kemi Adeyemi");
  });
});

describe("Home dashboard", () => {
  test("FUN-07 readiness checklist and recent activity reflect what the user did", async () => {
    const b = await t.signedIn("home@example.com");
    let home = (await b.get("/api/home")).json;
    assert.equal(home.contacts.length, 0);
    assert.equal(home.readiness.filter((r) => r.done).length, 0);

    for (const name of ["Ada One", "Bola Two", "Chi Three"]) await b.post("/api/contacts", contact({ name, verified: true }));
    await b.post(`/api/contacts/${(await b.get("/api/contacts")).json.contacts[2].id}/move`, { direction: "up" });
    await b.put("/api/profile/medical", { bloodGroup: "", allergies: "Peanuts" });
    await b.post("/api/privacy-reviewed", {});

    home = (await b.get("/api/home")).json;
    assert.deepEqual(home.readiness.map((r) => r.done), [true, true, true, true, true]);
    assert.equal(home.activity[0].text, "Medical notes updated");
    assert.ok(home.activity.some((a) => a.text === "Order changed: Chi Three moved to 02"));
  });
});

describe("Profile", () => {
  test("FUN-08 update name, phone and email (the new email is confirmed with a code)", async () => {
    const b = await t.signedIn("profile@example.com");
    const r = await b.put("/api/profile/details", { name: "New Name", phone: "0801 555 0100", email: "new@example.com" });
    assert.equal(r.status, 200);
    let p = (await b.get("/api/profile")).json;
    assert.equal(p.name, "New Name");
    assert.equal(p.phone, "+234 801 555 0100");
    assert.equal(p.pendingEmail, "new@example.com");
    await b.post("/api/profile/email/confirm", { code: t.lastCode("new@example.com") });
    p = (await b.get("/api/profile")).json;
    assert.equal(p.email, "new@example.com");
  });

  test("FUN-09 change password: old one stops working, new one works", async () => {
    await t.createUser({ email: "pw@example.com", password: "Old!password1" });
    const b = t.browser();
    await b.post("/api/login", { email: "pw@example.com", password: "Old!password1" });
    assert.equal((await b.put("/api/profile/password", { currentPassword: "Old!password1", newPassword: "New!password2" })).status, 200);
    assert.equal((await t.browser().post("/api/login", { email: "pw@example.com", password: "Old!password1" })).status, 401);
    assert.equal((await t.browser().post("/api/login", { email: "pw@example.com", password: "New!password2" })).status, 200);
  });

  test("FUN-10 delete account needs the password, then removes everything", async () => {
    const b = await t.signedIn("delete@example.com");
    await b.post("/api/contacts", contact());
    assert.equal((await b.del("/api/profile", { password: "wrong" })).status, 422);
    assert.equal((await b.del("/api/profile", { password: "Password!123" })).status, 200);
    assert.equal((await t.db.one(`SELECT COUNT(*) AS n FROM users WHERE email = 'delete@example.com'`)).n, 0);
    assert.equal((await b.get("/api/home")).status, 401);
  });

  test("FUN-11 the only admin can't delete their account", async () => {
    const t2 = await startApp();
    try {
      const admin = await t2.signedIn("only-admin@example.com", "Password!123", { role: "admin" });
      const r = await admin.del("/api/profile", { password: "Password!123" });
      assert.equal(r.status, 422);
      assert.match(r.json.error, /only admin/);
    } finally {
      await t2.close();
    }
  });
});

describe("Admin", () => {
  test("FUN-12 stats, search, unlock and reinstate", async () => {
    const admin = await t.signedIn("boss@example.com", "Password!123", { role: "admin" });
    const id = await t.createUser({ name: "Locked Lola", email: "lola@example.com" });
    await t.db.query(`UPDATE users SET locked_until = $1 WHERE id = $2`, [t.clock.now + 600000, id]);

    let r = await admin.get("/api/admin?q=lola");
    assert.equal(r.json.accounts.length, 1);
    assert.equal(r.json.accounts[0].state, "locked");
    assert.ok(r.json.stats.locked >= 1);

    await admin.post(`/api/admin/users/${id}/unlock`, {});
    await admin.post(`/api/admin/users/${id}/suspend`, {});
    r = await admin.get("/api/admin?q=lola");
    assert.equal(r.json.accounts[0].state, "suspended");
    await admin.post(`/api/admin/users/${id}/reinstate`, {});
    r = await admin.get("/api/admin?q=lola");
    assert.equal(r.json.accounts[0].state, "active");
    assert.ok(r.json.log.some((e) => e.title === "Reinstated" && e.who === "Locked Lola"));
  });
});
