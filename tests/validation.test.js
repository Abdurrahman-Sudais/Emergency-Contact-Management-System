const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const V = require("../public/js/validate");
const { startApp, contact } = require("./helpers");

describe("Validation rules (shared browser/server code)", () => {
  test("VAL-01 names: letters, spaces, . ' - only, 2-80 characters", () => {
    for (const ok of ["Tunde Bello", "Dr. Kemi Adeyemi", "O'Neil", "Jean-Luc", "Ọlá Adébáyọ̀"]) assert.equal(V.name(ok), null, ok);
    for (const bad of ["", "A", "x".repeat(81), "<script>", "Robert'); DROP TABLE users;--", "Name123"]) assert.ok(V.name(bad), bad);
  });

  test("VAL-02 emails need text before and after the @ and a domain ending", () => {
    for (const ok of ["amina@example.com", "a.b+c@sub.example.ng"]) assert.equal(V.email(ok), null, ok);
    assert.match(V.email("amina@example"), /add the part after @/);
    assert.match(V.email("amina.example.com"), /needs an @/);
    assert.ok(V.email(""));
    assert.ok(V.email("a b@example.com"));
  });

  test("VAL-03 passwords: 10+ characters and one symbol", () => {
    assert.equal(V.password("Correct!pw1"), null);
    assert.match(V.password("Short!1"), /10 or more/);
    assert.match(V.password("NoSymbolsHere1"), /symbol/);
    assert.deepEqual(V.passwordChecks("abc"), { length: false, symbol: false, max: true });
  });

  test("VAL-04 Nigerian numbers need exactly 10 digits after +234, with a helpful count", () => {
    assert.equal(V.phone("+234 802 555 0142"), null);
    assert.equal(V.phone("0802 555 0142"), null, "local format with leading 0 is accepted");
    assert.equal(V.phone("+234 803 555"), "Error: needs 10 digits after +234. Add 4 more.");
    assert.equal(V.phone("+234 803 555 01234"), "Error: needs 10 digits after +234. Remove 1.");
  });

  test("VAL-05 other countries: 8-15 digits; letters rejected", () => {
    assert.equal(V.phone("+44 20 7946 0958"), null);
    assert.ok(V.phone("+1 23"));
    assert.ok(V.phone("call me"));
    assert.ok(V.phone(""));
  });

  test("VAL-06 phone numbers are stored in one format and shown nicely", () => {
    assert.equal(V.normalizePhone("0802-555-0142"), "+2348025550142");
    assert.equal(V.normalizePhone("+234 (802) 555 0142"), "+2348025550142");
    assert.equal(V.formatPhone("+2348025550142"), "+234 802 555 0142");
  });

  test("VAL-07 relationship must be one of the five choices", () => {
    for (const r of ["family", "friend", "doctor", "neighbour", "work"]) assert.equal(V.relationship(r), null);
    assert.ok(V.relationship("boss"));
  });
});

describe("Server-side enforcement (bypassing the browser)", () => {
  let t, b;
  before(async () => {
    t = await startApp();
    b = await t.signedIn("val@example.com");
  });
  after(() => t.close());

  test("VAL-08 signup with every field wrong returns a message per field", async () => {
    const r = await t.browser().post("/api/register", { name: "", email: "amina@example", password: "short" });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.fields).sort(), ["email", "name", "password"]);
    assert.match(r.json.fields.email, /add the part after @/);
  });

  test("VAL-09 the server rejects a bad contact even if the browser checks are skipped", async () => {
    const r = await b.post("/api/contacts", contact({ phone: "+234 803 555", relationship: "boss" }));
    assert.equal(r.status, 422);
    assert.equal(r.json.fields.phone, "Error: needs 10 digits after +234. Add 4 more.");
    assert.ok(r.json.fields.relationship);
    assert.equal((await b.get("/api/contacts")).json.contacts.length, 0, "nothing was saved");
  });

  test("VAL-10 wrong data types (numbers, arrays, objects) are treated as empty, not crashes", async () => {
    const r = await b.post("/api/contacts", { name: ["Tunde"], phone: 2348025550142, relationship: { $ne: 1 } });
    assert.equal(r.status, 422);
    assert.ok(r.json.fields.name && r.json.fields.phone && r.json.fields.relationship);
  });

  test("VAL-11 notes and labels have length limits", async () => {
    const r = await b.post("/api/contacts", contact({ note: "x".repeat(501), label: "y".repeat(41) }));
    assert.equal(r.status, 422);
    assert.ok(r.json.fields.note);
    assert.ok(r.json.fields.label);
  });

  test("VAL-12 profile: bad email, unknown blood group and long allergies are refused", async () => {
    const d = await b.put("/api/profile/details", { name: "Val Person", email: "nope", phone: "" });
    assert.equal(d.status, 422);
    assert.ok(d.json.fields.email);
    const m = await b.put("/api/profile/medical", { bloodGroup: "Z positive", allergies: "a".repeat(201) });
    assert.equal(m.status, 422);
    assert.ok(m.json.fields.bloodGroup && m.json.fields.allergies);
  });

  test("VAL-13 password change: wrong current password and weak new password", async () => {
    const r = await b.put("/api/profile/password", { currentPassword: "wrong", newPassword: "weak" });
    assert.equal(r.status, 422);
    assert.ok(r.json.fields.currentPassword);
    assert.ok(r.json.fields.newPassword);
  });

  test("VAL-14 requests bigger than 20 KB are refused", async () => {
    const r = await b.post("/api/contacts", contact({ note: "x".repeat(25000) }));
    assert.equal(r.status, 413);
  });

  test("VAL-15 broken JSON gets a clean 400, not a crash", async () => {
    const r = await b.request("POST", "/api/contacts", { raw: "{not json", headers: { "content-type": "application/json" } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, "That request didn't look right.");
  });
});
