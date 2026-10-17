const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, contact } = require("./helpers");

let t;
before(async () => (t = await startApp()));
after(() => t.close());

async function withContacts(email, names) {
  const b = await t.signedIn(email);
  const ids = [];
  for (const name of names) ids.push((await b.post("/api/contacts", contact({ name }))).json.contact.id);
  return { b, ids };
}

const order = async (b) => (await b.get("/api/contacts")).json.contacts.map((c) => [c.position, c.name]);

describe("Drag-and-drop reordering", () => {
  test("FUN-13 sending the full list in a new order saves that order", async () => {
    const { b, ids } = await withContacts("drag@example.com", ["Ada One", "Bola Two", "Chi Three"]);
    const r = await b.post("/api/contacts/reorder", { ids: [ids[2], ids[0], ids[1]] });
    assert.equal(r.status, 200);
    assert.deepEqual(await order(b), [[1, "Chi Three"], [2, "Ada One"], [3, "Bola Two"]]);
    const home = (await b.get("/api/home")).json;
    assert.equal(home.activity[0].text, "Call order rearranged");
    assert.equal(home.readiness[1].done, true);
  });

  test("FUN-14 a partial list (e.g. from a filtered view) is refused and nothing changes", async () => {
    const { b, ids } = await withContacts("partial@example.com", ["Ada One", "Bola Two", "Chi Three"]);
    const before = await order(b);
    const r = await b.post("/api/contacts/reorder", { ids: [ids[1], ids[0]] });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /every one of your contacts/);
    assert.deepEqual(await order(b), before);
  });

  test("FUN-15 duplicates and bad ids are refused", async () => {
    const { b, ids } = await withContacts("dupes@example.com", ["Ada One", "Bola Two"]);
    assert.equal((await b.post("/api/contacts/reorder", { ids: [ids[0], ids[0]] })).status, 422);
    assert.equal((await b.post("/api/contacts/reorder", { ids: [ids[0], "abc"] })).status, 400);
    assert.equal((await b.post("/api/contacts/reorder", { ids: [] })).status, 400);
    assert.equal((await b.post("/api/contacts/reorder", {})).status, 400);
  });

  test("SEC-33 another user's contact ids can't be slipped into a reorder", async () => {
    const owner = await withContacts("reorder-owner@example.com", ["Ada One", "Bola Two"]);
    const other = await withContacts("reorder-other@example.com", ["Chi Three"]);
    const r = await other.b.post("/api/contacts/reorder", { ids: [owner.ids[1], owner.ids[0]] });
    assert.equal(r.status, 422);
    assert.deepEqual(await order(owner.b), [[1, "Ada One"], [2, "Bola Two"]]);
  });
});

describe("Verifying a number", () => {
  test("FUN-16 verify marks the contact as verified and changes nothing else", async () => {
    const b = await t.signedIn("verify@example.com");
    const c = (await b.post("/api/contacts", contact({ name: "Kemi Adeyemi", label: "Doctor", note: "Spare key" }))).json.contact;
    assert.equal(c.verified, false);

    const r = await b.post(`/api/contacts/${c.id}/verify`, {});
    assert.equal(r.status, 200);
    assert.equal(r.json.contact.verified, true);
    assert.equal(r.json.contact.label, "Doctor");
    assert.equal(r.json.contact.note, "Spare key");
    assert.equal((await b.get("/api/home")).json.activity[0].text, "Kemi Adeyemi verified");

    await b.post(`/api/contacts/${c.id}/verify`, {});
    const verifiedEvents = (await b.get("/api/home")).json.activity.filter((a) => a.text.endsWith("verified"));
    assert.equal(verifiedEvents.length, 1, "verifying twice is logged once");
  });

  test("SEC-34 you can't verify someone else's contact", async () => {
    const owner = await t.signedIn("verify-owner@example.com");
    const id = (await owner.post("/api/contacts", contact())).json.contact.id;
    const other = await t.signedIn("verify-other@example.com");
    assert.equal((await other.post(`/api/contacts/${id}/verify`, {})).status, 404);
    assert.equal((await owner.get("/api/contacts")).json.contacts[0].verified, false);
  });

  test("SEC-35 verify needs the anti-CSRF token", async () => {
    const b = await t.signedIn("verify-csrf@example.com");
    const id = (await b.post("/api/contacts", contact())).json.contact.id;
    assert.equal((await b.post(`/api/contacts/${id}/verify`, {}, { csrf: false })).status, 403);
  });
});

describe("Tour pages", () => {
  test("UI-10 step2.html and step3.html open the single tour page", async () => {
    for (const page of ["/step1.html", "/step2.html", "/step3.html"]) {
      const r = await t.browser().get(page);
      assert.equal(r.status, 200, page);
      assert.match(r.text, /data-step="3"/, page);
      assert.match(r.text, /js\/tour\.js/, page);
    }
  });

  test("UI-11 the tour only promises features the app has", async () => {
    const html = (await t.browser().get("/step1.html")).text;
    assert.doesNotMatch(html, /responder|EMERGENCY MODE|Share location|shares your location/);
  });
});
