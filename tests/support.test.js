const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const V = require("../public/js/validate");
const { startApp } = require("./helpers");

let t, admin;
before(async () => {
  t = await startApp();
  admin = await t.signedIn("support-admin@example.com", "Password!123", { role: "admin" });
});
after(() => t.close());

const ask = (b, over = {}) =>
  b.post("/api/support", { name: "Funke Oladipo", email: "funke@example.com", message: "My account says it is locked.", ...over });

describe("Contacting an admin", () => {
  test("SUP-01 someone who can't log in can send a request, and admins see it with the account's status", async () => {
    const id = await t.createUser({ name: "Funke Oladipo", email: "funke@example.com" });
    await t.db.query(`UPDATE users SET locked_until = $1 WHERE id = $2`, [t.clock.now + 600000, id]);

    const r = await ask(t.browser());
    assert.equal(r.status, 201);
    assert.match(r.json.message, /funke@example\.com/);

    const list = (await admin.get("/api/admin")).json.support;
    const req = list.find((s) => s.email === "funke@example.com");
    assert.ok(req);
    assert.equal(req.message, "My account says it is locked.");
    assert.deepEqual(req.account, { id, state: "locked" });
  });

  test("SUP-02 every field is checked on the server", async () => {
    const r = await t.browser().post("/api/support", { name: "", email: "nope", message: "short" });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.fields).sort(), ["email", "message", "name"]);
    const long = await ask(t.browser(), { email: "long@example.com", message: "x".repeat(1001) });
    assert.equal(long.status, 422);
  });

  test("SUP-03 more than 3 requests an hour from one email are refused (spam protection)", async () => {
    const b = t.browser();
    for (let i = 0; i < 3; i++) assert.equal((await ask(b, { email: "spam@example.com" })).status, 201);
    const fourth = await ask(b, { email: "spam@example.com" });
    assert.equal(fourth.status, 429);
    t.advance(60 * 60 * 1000 + 1);
    assert.equal((await ask(b, { email: "spam@example.com" })).status, 201);

    admin = t.browser();
    await admin.post("/api/login", { email: "support-admin@example.com", password: "Password!123" });
  });

  test("SUP-04 normal users can't read or resolve help requests", async () => {
    const user = await t.signedIn("support-user@example.com");
    assert.equal((await user.get("/api/admin")).status, 403);
    assert.equal((await user.post("/api/admin/support/1/resolve", {})).status, 403);
  });

  test("SUP-05 script text in a message is kept as plain text", async () => {
    const payload = "<img src=x onerror=alert(1)> please help me";
    await ask(t.browser(), { email: "xss-support@example.com", message: payload });
    const req = (await admin.get("/api/admin")).json.support.find((s) => s.email === "xss-support@example.com");
    assert.equal(req.message, payload);
    assert.equal(req.account, null);
  });

  test("SUP-06 requests need the anti-CSRF token", async () => {
    const r = await t.browser().post("/api/support", { name: "Tunde Bello", email: "csrf@example.com", message: "Please help me log in." }, { csrf: false });
    assert.equal(r.status, 403);
  });

  test("SUP-07 an admin can mark a request resolved, and it leaves the list", async () => {
    await ask(t.browser(), { email: "resolve-me@example.com" });
    const req = (await admin.get("/api/admin")).json.support.find((s) => s.email === "resolve-me@example.com");
    assert.equal((await admin.post(`/api/admin/support/${req.id}/resolve`, {})).status, 200);
    assert.ok(!(await admin.get("/api/admin")).json.support.some((s) => s.id === req.id));
    assert.equal((await admin.post(`/api/admin/support/${req.id}/resolve`, {})).status, 404);
  });

  test("UI-12 the login page links to the help form", async () => {
    const html = (await t.browser().get("/login.html")).text;
    assert.match(html, /href="support\.html"/);
    assert.equal((await t.browser().get("/support.html")).status, 200);
  });
});

describe("Country codes", () => {
  test("VAL-16 any country code from +1 to +9999 is accepted", () => {
    for (const ok of ["+234", "234", "+1", "+44", "+971", "+9999"]) assert.equal(V.countryCode(ok), null, ok);
    for (const bad of ["", "+", "+0", "+12345", "abc", "+2a"]) assert.ok(V.countryCode(bad), bad);
    assert.equal(V.phone("+254712345678"), null, "Kenya");
    assert.equal(V.phone("+971501234567"), null, "UAE");
  });
});
