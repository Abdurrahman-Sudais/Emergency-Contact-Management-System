const path = require("node:path");
const express = require("express");

const { createStore } = require("./store");
const { createCipher } = require("./security/encryption");
const { createSessions } = require("./security/sessions");
const { csrf } = require("./security/csrf");
const { securityHeaders, noStore } = require("./security/headers");
const { createOtp } = require("./security/otp");
const { createMailer } = require("./mailer");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const PRIVATE_PAGES = ["home", "contacts", "profile", "admin", "step4"];
const GUEST_PAGES = ["login", "signup", "verify"];

const ASSET = /\.(css|js|png|jpe?g|svg|webp|ico|txt)$/;

function createApp({ db, dataKey, now = Date.now, forceHttps = false, trustProxy = false, logErrors = true, cacheAssets = false, mailer = createMailer({}), google = null, appUrl = null }) {
  const store = createStore(db, createCipher(dataKey), now);
  const sessions = createSessions(db, now);
  const otp = createOtp({ store, mailer, dataKey, now });
  const ctx = { db, store, sessions, now, otp, google, appUrl };

  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", 1);

  app.get("/healthz", (req, res) => res.type("text").send("ok"));
  app.use(securityHeaders({ forceHttps }));
  const assets = express.static(PUBLIC_DIR, {
    index: false,
    redirect: false,
    setHeaders: (res) => res.set("Cache-Control", cacheAssets ? "public, max-age=3600, s-maxage=86400" : "no-cache"),
  });
  app.use((req, res, next) => {
    if ((req.method === "GET" || req.method === "HEAD") && ASSET.test(req.path)) return assets(req, res, next);
    next();
  });

  app.use(express.json({ limit: "20kb" }));
  app.use(sessions.middleware());

  app.use(async (req, res, next) => {
    if (req.method !== "GET") return next();
    const page = req.path === "/" ? "index" : req.path.replace(/^\//, "").replace(/\.html$/, "");

    if (page === "index" && req.user) return res.redirect("/home.html");
    if (GUEST_PAGES.includes(page) && req.user) return res.redirect("/home.html");
    if (PRIVATE_PAGES.includes(page)) {
      res.set("Cache-Control", "no-store");
      if (!req.user) {
        const expired = req.sessionExpired ? "&expired=1" : "";
        return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}${expired}`);
      }
      if (page === "admin" && req.user.role !== "admin") {
        await store.audit.log("access_denied", { actorId: req.user.id, subjectId: req.user.id, detail: "admin page" });
        return res.redirect("/home.html?denied=1");
      }
    }
    next();
  });

  app.get(["/step2.html", "/step3.html", "/step2", "/step3"], (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "step1.html"));
  });
  app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: 0 }));

  const api = express.Router();
  api.use(noStore);
  api.use(csrf());
  api.use(require("./routes/auth")(ctx));
  api.use(require("./routes/home")(ctx));
  api.use(require("./routes/contacts")(ctx));
  api.use(require("./routes/profile")(ctx));
  api.use(require("./routes/admin")(ctx));
  api.use(require("./routes/support")(ctx));
  api.use(require("./routes/google")(ctx));
  api.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use("/api", api);

  app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html")));

  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    if (status >= 500) {
      status = 500;
      if (logErrors) console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err);
    }
    const messages = {
      400: "That request didn't look right.",
      403: err.csrf ? "Your session expired. Refresh the page and try again." : "You don't have access to that.",
      413: "That file is too big. Photos can be up to 2 MB.",
      415: "Send JSON.",
      500: "Something went wrong. Please try again.",
    };
    const message = messages[status] || messages[500];
    if (req.path.startsWith("/api/")) return res.status(status).json({ error: message });
    res.status(status).type("text").send(message);
  });

  return app;
}

module.exports = { createApp };
