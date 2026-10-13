const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, contact } = require("./helpers");

let t;
before(async () => (t = await startApp()));
after(() => t.close());

describe("02 Password hashing", () => {
  test("SEC-01 only a salted Argon2id hash is stored, never the password", async () => {
    await t.browser().post("/api/register", { name: "Hash Check", email: "hash@example.com", password: "Plain!text99" });
    await t.browser().post("/api/register", { name: "Hash Twin", email: "twin@example.com", password: "Plain!text99" });
    const rows = t.db.prepare(`SELECT password_hash FROM users WHERE email IN ('hash@example.com', 'twin@example.com')`).all();
    for (const r of rows) {
      assert.match(r.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      assert.ok(!r.password_hash.includes("Plain!text99"));
    }
    assert.notEqual(rows[0].password_hash, rows[1].password_hash, "same password, different salt, different hash");
  });
});

describe("03 Role-based access", () => {
  test("SEC-02 a normal user can't open the admin page or call the admin API", async () => {
    const b = await t.signedIn("user1@example.com");
    const page = await b.get("/admin.html");
    assert.equal(page.status, 302);
    assert.equal(page.location, "/home.html?denied=1");
    assert.equal((await b.get("/api/admin")).status, 403);
    assert.equal((await b.post("/api/admin/users/1/role", { role: "admin" })).status, 403);
  });

  test("SEC-03 the blocked attempt is written to the audit log", () => {
    const n = t.db.prepare(`SELECT COUNT(*) AS n FROM audit_log a JOIN users u ON u.id = a.subject_id
                            WHERE u.email = 'user1@example.com' AND a.event = 'access_denied'`).get().n;
    assert.ok(n >= 2);
  });

  test("SEC-04 an admin can change roles, and the change applies on the very next request", async () => {
    const admin = await t.signedIn("admin@example.com", "Password!123", { role: "admin" });
    const user = await t.signedIn("promote@example.com");
    const id = t.db.prepare(`SELECT id FROM users WHERE email = 'promote@example.com'`).get().id;

    assert.equal((await user.get("/api/admin")).status, 403);
    assert.equal((await admin.post(`/api/admin/users/${id}/role`, { role: "admin" })).status, 200);
    assert.equal((await user.get("/api/admin")).status, 200, "role is read from the database, not the cookie");
    await admin.post(`/api/admin/users/${id}/role`, { role: "user" });
    assert.equal((await user.get("/api/admin")).status, 403);
  });

  test("SEC-05 suspending an account signs that person out immediately", async () => {
    const admin = await t.signedIn("admin2@example.com", "Password!123", { role: "admin" });
    const user = await t.signedIn("bye@example.com");
    const id = t.db.prepare(`SELECT id FROM users WHERE email = 'bye@example.com'`).get().id;
    assert.equal((await user.get("/api/home")).status, 200);
    assert.equal((await admin.post(`/api/admin/users/${id}/suspend`, {})).status, 200);
    assert.equal((await user.get("/api/home")).status, 401);
  });

  test("SEC-06 admins can't demote or suspend themselves (no locking everyone out)", async () => {
    const admin = await t.signedIn("solo-admin@example.com", "Password!123", { role: "admin" });
    const me = (await admin.refreshSession()).user.id;
    assert.equal((await admin.post(`/api/admin/users/${me}/role`, { role: "user" })).status, 422);
    assert.equal((await admin.post(`/api/admin/users/${me}/suspend`, {})).status, 422);
  });

  test("SEC-07 the admin view never includes contacts or medical notes", async () => {
    const admin = await t.signedIn("admin3@example.com", "Password!123", { role: "admin" });
    const owner = await t.signedIn("private@example.com");
    await owner.post("/api/contacts", contact({ name: "Secret Person", note: "very private" }));
    const r = await admin.get("/api/admin");
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes("Secret Person"));
    assert.ok(!r.text.includes("very private"));
    assert.ok(!r.text.includes("password_hash"));
  });
});

describe("05 SQL injection", () => {
  test("SEC-08 an injection attempt in the login email doesn't log anyone in", async () => {
    for (const email of ["' OR '1'='1' --", "admin@example.com' --", "x@x.co' OR 1=1; --"]) {
      const r = await t.browser().post("/api/login", { email, password: "' OR '1'='1" });
      assert.equal(r.status, 401, email);
    }
  });

  test("SEC-09 injection text in search is treated as text, and the tables survive", async () => {
    const b = await t.signedIn("sqli@example.com");
    await b.post("/api/contacts", contact());
    for (const q of ["' OR 1=1 --", "%' OR '1'='1", "'; DROP TABLE contacts; --", "%", "_"]) {
      const r = await b.get("/api/contacts?q=" + encodeURIComponent(q));
      assert.equal(r.status, 200, q);
      assert.equal(r.json.contacts.length, 0, `"${q}" must not match everything`);
    }
    assert.ok(t.db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get().n > 0, "contacts table still exists");
  });

  test("SEC-10 a contact name with SQL in it is stored literally", async () => {
    const b = await t.signedIn("sqli2@example.com");
    const r = await b.post("/api/contacts", contact({ label: "x'); DELETE FROM users; --" }));
    assert.equal(r.status, 201);
    assert.equal(r.json.contact.label, "x'); DELETE FROM users; --");
    assert.ok(t.db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n > 1);
  });
});

describe("06 Cross-site scripting", () => {
  test("SEC-11 a script in a note comes back as plain JSON text, never as HTML", async () => {
    const b = await t.signedIn("xss@example.com");
    const payload = `<img src=x onerror="alert(document.cookie)"><script>alert(1)</script>`;
    await b.post("/api/contacts", contact({ note: payload }));
    const r = await b.get("/api/contacts");
    assert.match(r.headers.get("content-type"), /^application\/json/);
    assert.equal(r.json.contacts[0].note, payload);
  });

  test("SEC-12 the page scripts insert data with textContent, never innerHTML", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(__dirname, "..", "public", "js");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.includes(".min."))) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(src), `${file} writes raw HTML`);
    }
  });

  test("SEC-13 the Content Security Policy blocks inline and third-party scripts", async () => {
    const r = await t.browser().get("/login.html");
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.ok(!csp.includes("unsafe-inline"));
    assert.match(csp, /frame-ancestors 'none'/);
  });
});

describe("07 Session management", () => {
  test("SEC-14 the session cookie is HttpOnly and SameSite=Lax", async () => {
    const b = t.browser();
    await t.createUser({ email: "cookie@example.com" });
    await b.post("/api/login", { email: "cookie@example.com", password: "Password!123" });
    const sid = b.rawSetCookies.find((c) => c.startsWith("sid="));
    assert.match(sid, /HttpOnly/);
    assert.match(sid, /SameSite=Lax/);
    assert.match(sid, /Path=\//);
  });

  test("SEC-15 the cookie gets the Secure flag over HTTPS", async () => {
    const t2 = await startApp({ trustProxy: true });
    try {
      await t2.createUser({ email: "secure@example.com" });
      const b = t2.browser();
      await b.post("/api/login", { email: "secure@example.com", password: "Password!123" }, { headers: { "x-forwarded-proto": "https" } });
      assert.match(b.rawSetCookies.find((c) => c.startsWith("sid=")), /; Secure/);
    } finally {
      await t2.close();
    }
  });

  test("SEC-16 a new session id is issued at sign-in (session fixation)", async () => {
    await t.createUser({ email: "fixation@example.com" });
    const b = t.browser();
    b.cookies.sid = "attacker-chosen-session-id";
    await b.post("/api/login", { email: "fixation@example.com", password: "Password!123" });
    assert.notEqual(b.cookies.sid, "attacker-chosen-session-id");
    assert.ok(b.cookies.sid.length >= 43, "256-bit random token");
  });

  test("SEC-17 the database stores only a hash of the session token", async () => {
    const b = await t.signedIn("sidhash@example.com");
    const rows = t.db.prepare(`SELECT id_hash FROM sessions`).all();
    assert.ok(rows.every((r) => r.id_hash !== b.cookies.sid));
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash)));
  });

  test("SEC-18 sessions end after 15 minutes idle", async () => {
    const b = await t.signedIn("idle@example.com");
    t.advance(14 * 60 * 1000);
    assert.equal((await b.get("/api/home")).status, 200, "still active at 14 minutes");
    t.advance(14 * 60 * 1000);
    assert.equal((await b.get("/api/home")).status, 200, "activity resets the idle timer");
    t.advance(15 * 60 * 1000 + 1);
    const r = await b.get("/api/home");
    assert.equal(r.status, 401);
    assert.match(r.json.error, /15 minutes/);
  });

  test("SEC-19 sessions end after 12 hours even if active", async () => {
    const b = await t.signedIn("absolute@example.com");
    for (let i = 0; i < 49; i++) {
      t.advance(14 * 60 * 1000 + 59 * 1000);
      await b.get("/api/session");
    }
    assert.equal((await b.get("/api/home")).status, 401);
  });

  test("SEC-20 changing your password signs out your other devices", async () => {
    await t.createUser({ email: "devices@example.com", password: "Old!password1" });
    const phone = t.browser();
    const laptop = t.browser();
    await phone.post("/api/login", { email: "devices@example.com", password: "Old!password1" });
    await laptop.post("/api/login", { email: "devices@example.com", password: "Old!password1" });
    const r = await laptop.put("/api/profile/password", { currentPassword: "Old!password1", newPassword: "New!password2" });
    assert.equal(r.status, 200);
    assert.equal((await phone.get("/api/home")).status, 401, "other device signed out");
    assert.equal((await laptop.get("/api/home")).status, 200, "this device keeps a fresh session");
  });

  test("SEC-21 requests without the anti-CSRF token are refused", async () => {
    const b = await t.signedIn("csrf@example.com");
    const none = await b.post("/api/contacts", contact(), { csrf: false });
    assert.equal(none.status, 403);
    const wrong = await b.post("/api/contacts", contact(), { headers: { "x-csrf-token": "forged" } });
    assert.equal(wrong.status, 403);
    assert.equal((await b.get("/api/contacts")).json.contacts.length, 0);
  });

  test("SEC-22 form posts from another site (not JSON) are refused", async () => {
    const b = await t.signedIn("csrf2@example.com");
    const r = await b.request("POST", "/api/contacts", {
      raw: "name=Evil&phone=%2B2348025550142&relationship=family",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    assert.equal(r.status, 415);
  });
});

describe("08 Access-control checks", () => {
  let owner, other, id;
  before(async () => {
    owner = await t.signedIn("owner@example.com");
    other = await t.signedIn("other@example.com");
    id = (await owner.post("/api/contacts", contact({ name: "Only Mine" }))).json.contact.id;
  });

  test("SEC-23 one user can't read, edit, move or delete another user's contact", async () => {
    assert.equal((await other.put(`/api/contacts/${id}`, contact({ name: "Hacked" }))).status, 404);
    assert.equal((await other.post(`/api/contacts/${id}/move`, { direction: "up" })).status, 404);
    assert.equal((await other.del(`/api/contacts/${id}`, {})).status, 404);
    const theirs = await other.get("/api/contacts");
    assert.ok(!theirs.text.includes("Only Mine"));
    const mine = await owner.get("/api/contacts");
    assert.equal(mine.json.contacts[0].name, "Only Mine", "unchanged");
  });

  test("SEC-24 someone else's contact looks exactly like one that doesn't exist", async () => {
    const theirs = await other.del(`/api/contacts/${id}`, {});
    const missing = await other.del(`/api/contacts/999999`, {});
    assert.equal(theirs.status, missing.status);
    assert.deepEqual(theirs.json, missing.json);
  });

  test("SEC-25 the attempt is written to the audit log", () => {
    const n = t.db.prepare(`SELECT COUNT(*) AS n FROM audit_log a JOIN users u ON u.id = a.subject_id
                            WHERE u.email = 'other@example.com' AND a.event = 'access_denied'`).get().n;
    assert.ok(n >= 3);
  });
});

describe("09 Sensitive information", () => {
  test("SEC-26 medical notes and contact notes are encrypted in the database", async () => {
    const b = await t.signedIn("medical@example.com");
    await b.put("/api/profile/medical", { bloodGroup: "O negative", allergies: "penicillin" });
    await b.post("/api/contacts", contact({ note: "Has a spare key" }));

    const user = t.db.prepare(`SELECT medical_enc FROM users WHERE email = 'medical@example.com'`).get();
    assert.match(user.medical_enc, /^v1:/);
    assert.ok(!user.medical_enc.includes("penicillin"));
    const c = t.db.prepare(`SELECT note_enc FROM contacts WHERE note_enc IS NOT NULL ORDER BY id DESC LIMIT 1`).get();
    assert.ok(!c.note_enc.includes("spare key"));

    assert.equal((await b.get("/api/profile")).json.medical.allergies, "penicillin");
  });

  test("SEC-27 the API never sends password hashes or session data", async () => {
    const b = await t.signedIn("leak@example.com");
    for (const path of ["/api/session", "/api/profile", "/api/home"]) {
      const r = await b.get(path);
      assert.ok(!/argon2|password|id_hash|csrf_token/.test(JSON.stringify(r.json).replace(/"csrfToken"/, "")), path);
    }
  });

  test("SEC-28 error responses don't show stack traces or internals", async () => {
    const r = await t.browser().request("POST", "/api/login", { raw: "{", headers: { "content-type": "application/json" } });
    assert.ok(!/at .*\.js|node_modules|SyntaxError|stack/i.test(r.text));
    const missing = await t.browser().get("/api/does-not-exist");
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, { error: "Not found." });
  });

  test("SEC-29 server code and secrets can't be downloaded", async () => {
    for (const path of ["/.env", "/server.js", "/src/app.js", "/package.json", "/data/incase.db", "/../.env"]) {
      assert.equal((await t.browser().get(path)).status, 404, path);
    }
  });
});

describe("10 HTTPS and headers", () => {
  test("SEC-30 hardening headers are on every response", async () => {
    for (const path of ["/", "/login.html", "/app.css", "/api/session"]) {
      const h = (await t.browser().get(path)).headers;
      assert.equal(h.get("x-content-type-options"), "nosniff", path);
      assert.equal(h.get("x-frame-options"), "DENY", path);
      assert.equal(h.get("referrer-policy"), "no-referrer", path);
      assert.ok(h.get("content-security-policy"), path);
      assert.equal(h.get("x-powered-by"), null, path);
    }
  });

  test("SEC-31 API answers are never cached", async () => {
    const b = await t.signedIn("cache@example.com");
    assert.equal((await b.get("/api/home")).headers.get("cache-control"), "no-store");
  });

  test("SEC-32 with HTTPS forced, plain HTTP is redirected and HSTS is sent over HTTPS", async () => {
    const t2 = await startApp({ forceHttps: true, trustProxy: true });
    try {
      const plain = await t2.browser().get("/login.html");
      assert.equal(plain.status, 301);
      assert.match(plain.location, /^https:\/\//);
      const posted = await t2.browser().post("/api/login", {}, { csrf: false });
      assert.equal(posted.status, 403, "data is never accepted over plain HTTP");

      const secure = await t2.browser().request("GET", "/login.html", { headers: { "x-forwarded-proto": "https" } });
      assert.equal(secure.status, 200);
      assert.match(secure.headers.get("strict-transport-security"), /max-age=31536000/);
    } finally {
      await t2.close();
    }
  });
});
