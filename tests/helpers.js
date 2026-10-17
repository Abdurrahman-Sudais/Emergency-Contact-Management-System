const crypto = require("node:crypto");
const { openDatabase } = require("../src/db");
const { createApp } = require("../src/app");
const { hashPassword } = require("../src/security/passwords");

async function startApp(options = {}) {
  const db = await openDatabase();
  const clock = { now: Date.UTC(2026, 9, 13, 12, 0, 0) };
  const dataKey = crypto.randomBytes(32);
  const mail = [];
  const mailer = { send: async (m) => { mail.push(m); } };
  const app = createApp({ db, dataKey, now: () => clock.now, logErrors: false, mailer, ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    db,
    clock,
    mail,
    lastCode(email) {
      const m = [...mail].reverse().find((x) => x.to.toLowerCase() === email.toLowerCase());
      return m ? m.code : null;
    },

    async register(b, { name = "New Person", email, password = "Password!123" }) {
      const r = await b.post("/api/register", { name, email, password });
      if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
      const v = await b.post("/api/verify-email", { email, code: this.lastCode(email) });
      if (v.status !== 200) throw new Error(`verify failed: ${v.status} ${JSON.stringify(v.json)}`);
      return v;
    },
    base,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await db.close();
    },
    advance(ms) {
      clock.now += ms;
    },
    browser: () => new Browser(base),

    async createUser({ name = "Test User", email, password = "Password!123", role = "user" }) {
      const hash = await hashPassword(password);
      const row = await db.one(
        `INSERT INTO users (name, email, password_hash, role, created_at, email_verified) VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
        [name, email, hash, role, clock.now]
      );
      return row.id;
    },

    async signedIn(email, password = "Password!123", opts = {}) {
      await this.createUser({ email, password, ...opts });
      const b = this.browser();
      const r = await b.post("/api/login", { email, password });
      if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
      return b;
    },
  };
}

class Browser {
  constructor(base) {
    this.base = base;
    this.cookies = {};
    this.rawSetCookies = [];
  }

  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(method, path, { body, headers = {}, csrf = true, raw } = {}) {
    if (method !== "GET" && csrf && !this.csrfToken) await this.refreshSession();
    const h = { cookie: this.cookieHeader(), ...headers };
    if (method !== "GET" && csrf) h["x-csrf-token"] ??= this.csrfToken;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) {
      h["content-type"] ??= "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: "manual" });
    this.rawSetCookies = res.headers.getSetCookie();
    for (const c of this.rawSetCookies) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (attrs.some((a) => /max-age=0/i.test(a))) delete this.cookies[name];
      else this.cookies[name] = value;
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (this.rawSetCookies.some((c) => c.startsWith("sid="))) this.csrfToken = null;
    return { status: res.status, headers: res.headers, text, json, location: res.headers.get("location") };
  }

  async refreshSession() {
    const r = await this.request("GET", "/api/session");
    this.csrfToken = r.json.csrfToken;
    return r.json;
  }

  get(path) {
    return this.request("GET", path);
  }
  post(path, body, opts) {
    return this.request("POST", path, { body, ...opts });
  }
  put(path, body, opts) {
    return this.request("PUT", path, { body, ...opts });
  }
  del(path, body, opts) {
    return this.request("DELETE", path, { body, ...opts });
  }
}

const contact = (over = {}) => ({ name: "Tunde Bello", phone: "+234 802 555 0142", relationship: "family", ...over });

module.exports = { startApp, contact };
