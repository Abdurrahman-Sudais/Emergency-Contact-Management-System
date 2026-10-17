const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

let t;
before(async () => (t = await startApp()));
after(() => t.close());

const signUp = (b, email, password = "Password!123") => b.post("/api/register", { name: "Test Person", email, password });
const mailsTo = (email) => t.mail.filter((m) => m.to === email).length;

describe("Email verification at sign-up", () => {
  test("EMAIL-01 an unconfirmed account can't log in; logging in sends a fresh code instead", async () => {
    await signUp(t.browser(), "unconfirmed@example.com");
    t.advance(61 * 1000);
    const before = mailsTo("unconfirmed@example.com");

    const b = t.browser();
    const r = await b.post("/api/login", { email: "unconfirmed@example.com", password: "Password!123" });
    assert.equal(r.status, 403);
    assert.equal(r.json.needsVerification, true);
    assert.equal(mailsTo("unconfirmed@example.com"), before + 1);
    assert.equal((await b.get("/api/home")).status, 401);
  });

  test("EMAIL-02 a wrong code is refused; 5 wrong codes cancel the code", async () => {
    await signUp(t.browser(), "guess@example.com");
    const right = t.lastCode("guess@example.com");
    const wrong = right === "000000" ? "111111" : "000000";
    const b = t.browser();
    for (let i = 0; i < 4; i++) {
      const r = await b.post("/api/verify-email", { email: "guess@example.com", code: wrong });
      assert.equal(r.status, 400);
      assert.match(r.json.error, /wrong or has expired/);
    }
    const fifth = await b.post("/api/verify-email", { email: "guess@example.com", code: wrong });
    assert.match(fifth.json.error, /too many wrong codes/);
    const late = await b.post("/api/verify-email", { email: "guess@example.com", code: right });
    assert.equal(late.status, 400, "even the right code no longer works");
  });

  test("EMAIL-03 codes expire after 10 minutes", async () => {
    await signUp(t.browser(), "slow@example.com");
    const code = t.lastCode("slow@example.com");
    t.advance(10 * 60 * 1000 + 1);
    const r = await t.browser().post("/api/verify-email", { email: "slow@example.com", code });
    assert.equal(r.status, 400);
  });

  test("EMAIL-04 'send a new code' waits a minute between emails and allows 5 an hour", async () => {
    const b = t.browser();
    await signUp(b, "resend@example.com");
    assert.equal(mailsTo("resend@example.com"), 1);

    const early = await b.post("/api/verify-email/resend", { email: "resend@example.com" });
    assert.equal(early.status, 200);
    assert.equal(mailsTo("resend@example.com"), 1, "no new email within a minute");

    for (let i = 0; i < 6; i++) {
      t.advance(61 * 1000);
      await b.post("/api/verify-email/resend", { email: "resend@example.com" });
    }
    assert.equal(mailsTo("resend@example.com"), 5, "at most 5 emails an hour");

    const newest = t.lastCode("resend@example.com");
    const v = await b.post("/api/verify-email", { email: "resend@example.com", code: newest });
    assert.equal(v.status, 200, "the newest code works");
  });

  test("EMAIL-05 the answers never reveal whether an email is registered", async () => {
    const unknown = await t.browser().post("/api/verify-email/resend", { email: "nobody@example.com" });
    t.advance(61 * 1000);
    await signUp(t.browser(), "known@example.com");
    t.advance(61 * 1000);
    const known = await t.browser().post("/api/verify-email/resend", { email: "known@example.com" });
    assert.equal(unknown.status, known.status);
    assert.equal(unknown.json.message, known.json.message);
    assert.equal(mailsTo("nobody@example.com"), 0);

    const badUnknown = await t.browser().post("/api/verify-email", { email: "nobody@example.com", code: "123456" });
    const badKnown = await t.browser().post("/api/verify-email", { email: "known@example.com", code: "123456" });
    assert.equal(badUnknown.json.error, badKnown.json.error);
  });

  test("EMAIL-06 codes are stored only as a keyed hash", async () => {
    await signUp(t.browser(), "hashed@example.com");
    const code = t.lastCode("hashed@example.com");
    const rows = await t.db.all(`SELECT c.code_hash FROM email_codes c JOIN users u ON u.id = c.user_id WHERE u.email = 'hashed@example.com'`);
    assert.equal(rows.length, 1);
    assert.match(rows[0].code_hash, /^[0-9a-f]{64}$/);
    assert.ok(!rows[0].code_hash.includes(code));
  });

  test("EMAIL-07 the email contains the code and never the password", async () => {
    await signUp(t.browser(), "content@example.com", "Secret!pass99");
    const m = t.mail.filter((x) => x.to === "content@example.com").pop();
    assert.ok(m.text.includes(m.code));
    assert.ok(!m.text.includes("Secret!pass99"));
  });

  test("EMAIL-08 someone can't hold an email hostage by signing up with it and never confirming", async () => {
    await signUp(t.browser(), "victim@example.com", "Attacker!pw1");
    t.advance(61 * 1000);
    const owner = t.browser();
    const r = await signUp(owner, "victim@example.com", "Owner!pass12");
    assert.equal(r.status, 201, "the real owner can still sign up");
    await owner.post("/api/verify-email", { email: "victim@example.com", code: t.lastCode("victim@example.com") });
    t.advance(61 * 1000);
    const attacker = await t.browser().post("/api/login", { email: "victim@example.com", password: "Attacker!pw1" });
    assert.equal(attacker.status, 401, "the earlier password no longer works");
  });

  test("EMAIL-09 confirmed emails can't be signed up again", async () => {
    await t.register(t.browser(), { email: "taken@example.com" });
    const r = await signUp(t.browser(), "taken@example.com");
    assert.equal(r.status, 422);
  });
});

describe("Changing your email", () => {
  test("EMAIL-10 a new email only takes over once its code is entered", async () => {
    const b = t.browser();
    await t.register(b, { email: "old@example.com" });
    const save = await b.put("/api/profile/details", { name: "Test Person", phone: "", email: "new@example.com" });
    assert.equal(save.json.pendingEmail, "new@example.com");
    assert.equal((await b.get("/api/profile")).json.email, "old@example.com", "still the old email");

    assert.equal((await b.post("/api/profile/email/confirm", { code: "000000" === t.lastCode("new@example.com") ? "111111" : "000000" })).status, 400);
    const ok = await b.post("/api/profile/email/confirm", { code: t.lastCode("new@example.com") });
    assert.equal(ok.status, 200);
    const p = (await b.get("/api/profile")).json;
    assert.equal(p.email, "new@example.com");
    assert.equal(p.pendingEmail, null);
    assert.equal((await t.browser().post("/api/login", { email: "new@example.com", password: "Password!123" })).status, 200);
  });

  test("EMAIL-11 an email change can be cancelled", async () => {
    const b = t.browser();
    await t.register(b, { email: "stay@example.com" });
    await b.put("/api/profile/details", { name: "Test Person", phone: "", email: "typo@example.con" });
    await b.post("/api/profile/email/cancel", {});
    const p = (await b.get("/api/profile")).json;
    assert.equal(p.email, "stay@example.com");
    assert.equal(p.pendingEmail, null);
    assert.equal((await b.post("/api/profile/email/confirm", { code: t.lastCode("typo@example.con") })).status, 400);
  });

  test("EMAIL-12 the code page is for signed-out visitors", async () => {
    assert.equal((await t.browser().get("/verify.html")).status, 200);
    const b = await t.signedIn("verify-page@example.com");
    const r = await b.get("/verify.html");
    assert.equal(r.status, 302);
  });
});
