const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { startApp } = require("./helpers");
const { createGoogle } = require("../src/security/google");

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims) => `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;

let t;
const fake = { claims: null, lastBody: null };

before(async () => {
  const google = createGoogle({
    clientId: CLIENT_ID,
    clientSecret: "secret-xyz",
    now: () => t.clock.now,
    fetchImpl: async (url, opts) => {
      fake.lastBody = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id_token: token(fake.claims) }) };
    },
  });
  t = await startApp({ google });
});
after(() => t.close());

async function googleLogin(b, over = {}, { state } = {}) {
  const start = await b.get("/api/auth/google");
  const url = new URL(start.location);
  fake.claims = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(t.clock.now / 1000) + 3600,
    nonce: url.searchParams.get("nonce"),
    email_verified: true,
    sub: "google-" + (over.email || "x"),
    email: "someone@gmail.com",
    name: "Ngozi Okafor",
    ...over,
  };
  const back = await b.get(`/api/auth/google/callback?code=auth-code&state=${encodeURIComponent(state || url.searchParams.get("state"))}`);
  return { start, url, back };
}

describe("Google sign-in", () => {
  test("GOOGLE-01 the sign-in request uses state, nonce and PKCE, and never exposes the secret", async () => {
    const b = t.browser();
    const r = await b.get("/api/auth/google");
    assert.equal(r.status, 302);
    const url = new URL(r.location);
    assert.equal(url.host, "accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("state").length >= 43);
    assert.ok(url.searchParams.get("nonce").length >= 43);
    assert.match(url.searchParams.get("redirect_uri"), /\/api\/auth\/google\/callback$/);
    assert.ok(!r.location.includes("secret-xyz"));
    assert.match(b.rawSetCookies.find((c) => c.startsWith("g_oauth=")), /HttpOnly/);
  });

  test("GOOGLE-02 a new Google user gets a confirmed account and lands on the tour", async () => {
    const b = t.browser();
    const { url, back } = await googleLogin(b, { email: "ngozi@gmail.com", sub: "g-ngozi" });
    assert.equal(back.status, 302);
    assert.equal(back.location, "/step1.html");
    const s = await b.refreshSession();
    assert.equal(s.user.email, "ngozi@gmail.com");
    assert.equal(s.user.name, "Ngozi Okafor");

    const verifier = fake.lastBody.get("code_verifier");
    assert.equal(crypto.createHash("sha256").update(verifier).digest("base64url"), url.searchParams.get("code_challenge"));
    const row = await t.db.one(`SELECT email_verified, has_password, google_sub FROM users WHERE email = 'ngozi@gmail.com'`);
    assert.deepEqual({ ...row }, { email_verified: 1, has_password: 0, google_sub: "g-ngozi" });
  });

  test("GOOGLE-03 an existing confirmed account is linked, and its password still works", async () => {
    await t.createUser({ email: "linked@gmail.com", password: "Linked!pass1" });
    const b = t.browser();
    const { back } = await googleLogin(b, { email: "linked@gmail.com", sub: "g-linked" });
    assert.equal(back.location, "/home.html");
    assert.equal((await t.browser().post("/api/login", { email: "linked@gmail.com", password: "Linked!pass1" })).status, 200);
    const again = await googleLogin(t.browser(), { email: "linked@gmail.com", sub: "g-linked" });
    assert.equal(again.back.location, "/home.html");
  });

  test("GOOGLE-04 someone who pre-registered your email can't keep access once you use Google", async () => {
    await t.browser().post("/api/register", { name: "Attacker Person", email: "target@gmail.com", password: "Attacker!pw1" });
    await googleLogin(t.browser(), { email: "target@gmail.com", sub: "g-target" });
    const attacker = await t.browser().post("/api/login", { email: "target@gmail.com", password: "Attacker!pw1" });
    assert.equal(attacker.status, 401);
  });

  test("GOOGLE-05 a reply with the wrong state is refused", async () => {
    const b = t.browser();
    const { back } = await googleLogin(b, { email: "state@gmail.com" }, { state: "forged-state" });
    assert.equal(back.location, "/login.html?google=failed");
    assert.equal((await b.refreshSession()).user, null);
  });

  test("GOOGLE-06 forged or unsafe Google replies are refused", async () => {
    const bad = [
      { aud: "someone-elses-app" },
      { nonce: "replayed-nonce" },
      { iss: "https://evil.example" },
      { email_verified: false },
      { exp: Math.floor(Date.UTC(2020, 0, 1) / 1000) },
    ];
    for (const over of bad) {
      const b = t.browser();
      const { back } = await googleLogin(b, { email: "bad@gmail.com", ...over });
      assert.equal(back.location, "/login.html?google=failed", JSON.stringify(over));
      assert.equal((await b.refreshSession()).user, null);
    }
  });

  test("GOOGLE-07 suspended accounts can't sign in with Google", async () => {
    const id = await t.createUser({ email: "banned@gmail.com" });
    await t.db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id]);
    const { back } = await googleLogin(t.browser(), { email: "banned@gmail.com", sub: "g-banned" });
    assert.equal(back.location, "/login.html?google=suspended");
  });

  test("GOOGLE-08 the callback without the browser's sign-in cookie is refused", async () => {
    const r = await t.browser().get("/api/auth/google/callback?code=x&state=y");
    assert.equal(r.location, "/login.html?google=failed");
  });

  test("GOOGLE-09 a Google-only account can set a password, and confirms deletion with its email", async () => {
    const b = t.browser();
    await googleLogin(b, { email: "nopass@gmail.com", sub: "g-nopass" });
    assert.equal((await b.get("/api/profile")).json.hasPassword, false);
    assert.equal((await b.del("/api/profile", { confirmEmail: "wrong@gmail.com" })).status, 422);

    const set = await b.put("/api/profile/password", { currentPassword: "", newPassword: "Brand!new123" });
    assert.equal(set.status, 200);
    assert.equal((await b.get("/api/profile")).json.hasPassword, true);
    assert.equal((await t.browser().post("/api/login", { email: "nopass@gmail.com", password: "Brand!new123" })).status, 200);
  });

  test("GOOGLE-10 the login page only offers Google when it's set up", async () => {
    assert.equal((await t.browser().refreshSession()).google, true);
    const plain = await startApp();
    try {
      assert.equal((await plain.browser().refreshSession()).google, false);
      assert.equal((await plain.browser().get("/api/auth/google")).status, 404);
    } finally {
      await plain.close();
    }
  });
});

describe("Call to check", () => {
  test("FUN-17 checking a number records the date; changing the number clears it", async () => {
    const b = await t.signedIn("caller@example.com");
    const c = (await b.post("/api/contacts", { name: "Funke Oladipo", phone: "+2348055550119", relationship: "neighbour" })).json.contact;
    assert.equal(c.verifiedAt, null);

    const checked = (await b.post(`/api/contacts/${c.id}/verify`, {})).json.contact;
    assert.equal(checked.verified, true);
    assert.equal(checked.verifiedAt, t.clock.now);

    const renamed = (await b.put(`/api/contacts/${c.id}`, { name: "Funke O.", phone: "+2348055550119", relationship: "neighbour" })).json.contact;
    assert.equal(renamed.verified, true, "editing the name keeps the check");

    const moved = (await b.put(`/api/contacts/${c.id}`, { name: "Funke O.", phone: "+2348055550120", relationship: "neighbour" })).json.contact;
    assert.equal(moved.verified, false, "a new number must be checked again");
    assert.equal(moved.verifiedAt, null);
  });
});
