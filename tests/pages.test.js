const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startApp } = require("./helpers");

const PUBLIC = path.join(__dirname, "..", "public");
const pages = fs.readdirSync(PUBLIC).filter((f) => f.endsWith(".html"));

describe("HTML pages", () => {
  test("UI-01 every page has the mobile viewport tag (responsive design)", () => {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0">/, page);
      assert.match(html, /<html lang="en">/, page);
    }
  });

  test("UI-02 no inline scripts or inline styles (the CSP would block them)", () => {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${page} has an inline <script>`);
      assert.ok(!/\sstyle="/i.test(html), `${page} has a style="" attribute`);
      assert.ok(!/\son[a-z]+="/i.test(html), `${page} has an onclick-style handler`);
    }
  });

  test("UI-03 every linked page, script, stylesheet and image exists", () => {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith("tel"));
      for (const ref of refs) {
        const file = path.join(PUBLIC, ref.replace(/^\//, ""));
        assert.ok(fs.existsSync(file), `${page} links to missing ${ref}`);
      }
    }
  });

  test("UI-04 every form field has a label (usability and screen readers)", () => {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      for (const [, id] of html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)) {
        const tag = html.match(new RegExp(`<(?:input|select|textarea)[^>]*id="${id}"[^>]*>`))[0];
        if (/type="(hidden|radio|checkbox)"/.test(tag)) continue;
        const labelled = html.includes(`for="${id}"`) || /aria-label="/.test(tag);
        assert.ok(labelled, `${page}: #${id} has no label`);
      }
    }
  });

  test("UI-05 every page uses a unique id only once", () => {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.deepEqual(dupes, [], page);
    }
  });

  test("UI-06 the CSS has phone and tablet layouts", () => {
    const css = fs.readFileSync(path.join(PUBLIC, "app.css"), "utf8");
    assert.match(css, /@media \(max-width: 700px\)/);
    assert.match(css, /@media \(max-width: 800px\)/);
    assert.match(css, /\.tabbar/);
  });
});

describe("Error handling", () => {
  let t;
  before(async () => (t = await startApp()));
  after(() => t.close());

  test("UI-07 unknown pages show the friendly 404 page", async () => {
    const r = await t.browser().get("/no-such-page");
    assert.equal(r.status, 404);
    assert.match(r.text, /Page not found/);
  });

  test("UI-08 unknown contact ids and bad ids return 404, not a crash", async () => {
    const b = await t.signedIn("errors@example.com");
    for (const id of ["999", "abc", "-1", "1.5", "0"]) {
      assert.equal((await b.put(`/api/contacts/${id}`, {})).status, 404, id);
    }
  });

  test("UI-09 the server keeps working after bad requests", async () => {
    const b = t.browser();
    await b.request("POST", "/api/login", { raw: "{{{", headers: { "content-type": "application/json" } });
    await b.request("GET", "/%E0%A4%A");
    assert.equal((await t.browser().get("/login.html")).status, 200);
  });
});
