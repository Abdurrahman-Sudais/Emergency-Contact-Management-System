const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

let t;
before(async () => (t = await startApp()));
after(() => t.close());

describe("Registration", () => {
  test("AUTH-01 a new user registers, gets an emailed code, and is signed in once it's entered", async () => {
    const b = t.browser();
    const r = await b.post("/api/register", { name: "Amina Bello", email: "amina@example.com", password: "Amina!2026pw" });
    assert.equal(r.status, 201);
    assert.equal(r.json.needsVerification, true);
    assert.equal((await b.refreshSession()).user, null, "not signed in before the email is confirmed");

    const code = t.lastCode("amina@example.com");
    assert.match(code, /^\d{6}$/);
    const v = await b.post("/api/verify-email", { email: "amina@example.com", code });
    assert.equal(v.status, 200);
    assert.equal(v.json.next, "/step1.html", "first sign-in goes to the tour");
    const s = await b.refreshSession();
    assert.equal(s.user.name, "Amina Bello");
    assert.equal(s.user.role, "user", "new accounts are never admins");
  });

  test("AUTH-02 the same email can't register twice (any capitalisation)", async () => {
    const r = await t.browser().post("/api/register", { name: "Other Person", email: "AMINA@example.com", password: "Another!pw1" });
    assert.equal(r.status, 422);
    assert.match(r.json.fields.email, /already uses this email/);
  });

  test("AUTH-03 a client can't make itself an admin by sending role=admin", async () => {
    const b = t.browser();
    const r = await b.post("/api/register", { name: "Sneaky Sam", email: "sam@example.com", password: "Sneaky!pw12", role: "admin" });
    assert.equal(r.status, 201);
    await b.post("/api/verify-email", { email: "sam@example.com", code: t.lastCode("sam@example.com") });
    assert.equal((await b.refreshSession()).user.role, "user");
    assert.equal((await b.get("/api/admin")).status, 403);
  });
});

describe("Login", () => {
  test("AUTH-04 correct email and password logs in", async () => {
    await t.createUser({ name: "Login Ok", email: "ok@example.com", password: "Correct!pw1" });
    const b = t.browser();
    const r = await b.post("/api/login", { email: "ok@example.com", password: "Correct!pw1" });
    assert.equal(r.status, 200);
    assert.equal(r.json.next, "/home.html");
    assert.equal((await b.get("/api/home")).status, 200);
  });

  test("AUTH-05 wrong password and unknown email give the same message", async () => {
    const wrongPw = await t.browser().post("/api/login", { email: "ok@example.com", password: "Wrong!pw111" });
    const noUser = await t.browser().post("/api/login", { email: "nobody@example.com", password: "Wrong!pw111" });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.json.error, noUser.json.error, "messages must not reveal which emails exist");
  });

  test("AUTH-06 five failed attempts lock the account for 15 minutes", async () => {
    await t.createUser({ name: "Lock Me", email: "lock@example.com", password: "Right!pw123" });
    const b = t.browser();
    for (let i = 1; i <= 4; i++) {
      assert.equal((await b.post("/api/login", { email: "lock@example.com", password: "nope" + i })).status, 401);
    }
    const fifth = await b.post("/api/login", { email: "lock@example.com", password: "nope5" });
    assert.equal(fifth.status, 423);
    assert.match(fifth.json.error, /locked for 15 minutes/);

    const right = await b.post("/api/login", { email: "lock@example.com", password: "Right!pw123" });
    assert.equal(right.status, 423);

    t.advance(15 * 60 * 1000 + 1);
    assert.equal((await b.post("/api/login", { email: "lock@example.com", password: "Right!pw123" })).status, 200);
  });

  test("AUTH-07 the lockout is recorded in the audit log", async () => {
    const row = (await t.db.one(`SELECT COUNT(*) AS n FROM audit_log a JOIN users u ON u.id = a.subject_id
                              WHERE u.email = 'lock@example.com' AND a.event = 'account_locked'`));
    assert.equal(row.n, 1);
  });

  test("AUTH-08 suspended accounts can't log in", async () => {
    const id = await t.createUser({ name: "Gone Away", email: "suspended@example.com", password: "Right!pw123" });
    await t.db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id]);
    const r = await t.browser().post("/api/login", { email: "suspended@example.com", password: "Right!pw123" });
    assert.equal(r.status, 403);
  });

  test("AUTH-09 ?next= can only send you to a page on this site (no open redirect)", async () => {
    await t.createUser({ name: "Next Test", email: "next@example.com", password: "Right!pw123" });
    const evil = await t.browser().post("/api/login", { email: "next@example.com", password: "Right!pw123", next: "//evil.example/phish" });
    assert.equal(evil.json.next, "/home.html");
    const good = await t.browser().post("/api/login", { email: "next@example.com", password: "Right!pw123", next: "/contacts.html" });
    assert.equal(good.json.next, "/contacts.html");
  });
});

describe("Logout and page protection", () => {
  test("AUTH-10 logout ends the session on the server (the old cookie stops working)", async () => {
    const b = await t.signedIn("logout@example.com");
    const oldCookie = b.cookies.sid;
    assert.equal((await b.post("/api/logout", {})).status, 200);

    const replay = t.browser();
    replay.cookies.sid = oldCookie;
    assert.equal((await replay.get("/api/home")).status, 401);
  });

  test("AUTH-11 private pages redirect to login when signed out", async () => {
    for (const page of ["/home.html", "/contacts.html", "/profile.html", "/admin.html", "/step4.html", "/home"]) {
      const r = await t.browser().get(page);
      assert.equal(r.status, 302, page);
      assert.match(r.location, /^\/login\.html\?next=/, page);
    }
  });

  test("AUTH-12 private API calls answer 401 when signed out", async () => {
    for (const path of ["/api/home", "/api/contacts", "/api/profile", "/api/admin"]) {
      assert.equal((await t.browser().get(path)).status, 401, path);
    }
  });

  test("AUTH-13 public pages are open to everyone", async () => {
    for (const page of ["/", "/index.html", "/login.html", "/signup.html", "/step1.html", "/step2.html", "/step3.html", "/security.html"]) {
      assert.equal((await t.browser().get(page)).status, 200, page);
    }
  });

  test("AUTH-14 signed-in users skip the login, signup and splash pages", async () => {
    const b = await t.signedIn("skip@example.com");
    for (const page of ["/", "/login.html", "/signup.html"]) {
      const r = await b.get(page);
      assert.equal(r.status, 302, page);
      assert.equal(r.location, "/home.html");
    }
  });
});
