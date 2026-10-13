const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { startApp } = require("./helpers");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

function pngWithText(text) {
  const iendAt = TINY_PNG.length - 12;
  return Buffer.concat([TINY_PNG.subarray(0, iendAt), pngChunk("tEXt", Buffer.from("Comment\0" + text)), TINY_PNG.subarray(iendAt)]);
}

function jpegWithExif(secret) {
  const segment = (marker, data) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(data.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, data]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
    segment(0xe1, Buffer.from("Exif\0\0" + secret, "binary")),
    segment(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]),
  ]);
}

const upload = (b, buf, type = "image/png", opts = {}) =>
  b.request("PUT", "/api/profile/photo", { raw: buf, headers: { "content-type": type }, ...opts });

let t;
before(async () => (t = await startApp()));
after(() => t.close());

describe("Profile photos", () => {
  test("PHOTO-01 upload a picture; it shows up in your session and can be downloaded", async () => {
    const b = await t.signedIn("photo@example.com");
    assert.equal((await b.refreshSession()).user.photo, null);
    const r = await upload(b, TINY_PNG);
    assert.equal(r.status, 200);
    assert.ok((await b.refreshSession()).user.photo);

    const res = await fetch(t.base + "/api/profile/photo", { headers: { cookie: b.cookieHeader() } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), TINY_PNG);
  });

  test("PHOTO-02 hidden location data (EXIF) is removed from JPG photos", async () => {
    const b = await t.signedIn("exif@example.com");
    const original = jpegWithExif("GPS-LAT-6.5244-LON-3.3792");
    assert.equal((await upload(b, original, "image/jpeg")).status, 200);
    const id = t.db.prepare(`SELECT id FROM users WHERE email = 'exif@example.com'`).get().id;
    const stored = Buffer.from(t.db.prepare(`SELECT data FROM photos WHERE user_id = ?`).get(id).data);
    assert.ok(!stored.includes("GPS-LAT"));
    assert.ok(stored.length < original.length);
    assert.deepEqual([...stored.subarray(0, 2)], [0xff, 0xd8]);
  });

  test("PHOTO-03 text hidden inside PNG files is removed", async () => {
    const b = await t.signedIn("pngtext@example.com");
    assert.equal((await upload(b, pngWithText("secret-note"))).status, 200);
    const id = t.db.prepare(`SELECT id FROM users WHERE email = 'pngtext@example.com'`).get().id;
    const stored = Buffer.from(t.db.prepare(`SELECT data FROM photos WHERE user_id = ?`).get(id).data);
    assert.ok(!stored.includes("secret-note"));
  });

  test("PHOTO-04 a file that only pretends to be an image is refused", async () => {
    const b = await t.signedIn("fake@example.com");
    const r = await upload(b, Buffer.from("<script>alert(document.cookie)</script>".padEnd(64)), "image/png");
    assert.equal(r.status, 422);
    assert.match(r.json.error, /isn't a JPG, PNG or WebP/);
    assert.equal((await b.refreshSession()).user.photo, null);
  });

  test("PHOTO-05 a damaged image is refused", async () => {
    const b = await t.signedIn("broken@example.com");
    const r = await upload(b, TINY_PNG.subarray(0, 30));
    assert.equal(r.status, 422);
  });

  test("PHOTO-06 SVG, HTML and other file types are refused", async () => {
    const b = await t.signedIn("svg@example.com");
    for (const type of ["image/svg+xml", "text/html", "application/octet-stream"]) {
      assert.equal((await upload(b, Buffer.from("<svg onload=alert(1)>"), type)).status, 415, type);
    }
  });

  test("PHOTO-07 files over 2 MB are refused", async () => {
    const b = await t.signedIn("big@example.com");
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const r = await upload(b, big);
    assert.equal(r.status, 413);
    assert.match(r.json.error, /2 MB/);
  });

  test("PHOTO-08 uploads need the anti-CSRF token", async () => {
    const b = await t.signedIn("csrfphoto@example.com");
    assert.equal((await upload(b, TINY_PNG, "image/png", { csrf: false })).status, 403);
  });

  test("PHOTO-09 signed-out visitors can't read or change photos", async () => {
    const anon = t.browser();
    assert.equal((await anon.get("/api/profile/photo")).status, 401);
    assert.equal((await upload(anon, TINY_PNG)).status, 401);
  });

  test("PHOTO-10 you only ever get your own photo", async () => {
    const owner = await t.signedIn("owner-photo@example.com");
    await upload(owner, TINY_PNG);
    const other = await t.signedIn("no-photo@example.com");
    assert.equal((await other.get("/api/profile/photo")).status, 404);
  });

  test("PHOTO-11 photos are served so the browser can't run them as a page", async () => {
    const b = await t.signedIn("headers-photo@example.com");
    await upload(b, TINY_PNG);
    const r = await b.get("/api/profile/photo");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(r.headers.get("content-security-policy"), /sandbox/);
    assert.match(r.headers.get("content-disposition"), /^inline/);
  });

  test("PHOTO-12 remove your photo; deleting the account removes it too", async () => {
    const b = await t.signedIn("remove-photo@example.com");
    await upload(b, TINY_PNG);
    assert.equal((await b.del("/api/profile/photo", {})).status, 200);
    assert.equal((await b.get("/api/profile/photo")).status, 404);

    await upload(b, TINY_PNG);
    const id = t.db.prepare(`SELECT id FROM users WHERE email = 'remove-photo@example.com'`).get().id;
    await b.del("/api/profile", { password: "Password!123" });
    assert.equal(t.db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE user_id = ?`).get(id).n, 0);
  });
});
