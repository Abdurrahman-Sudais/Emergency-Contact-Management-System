const express = require("express");
const V = require("../../public/js/validate");
const { hashPassword, verifyPassword, burnTime } = require("../security/passwords");
const { safeNext, text, rejectIfInvalid } = require("./guards");
const { deviceName } = require("../format");

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const WRONG = "Error: email or password is wrong. Try again.";

const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };

module.exports = function authRoutes({ store, sessions, now }) {
  const r = express.Router();

  r.get("/session", (req, res) => {
    const user = publicUser(req.user);
    if (user) user.photo = store.photos.version(user.id);
    res.json({ user, csrfToken: req.csrfToken });
  });

  r.post("/login", async (req, res, next) => {
    try {
      const email = text(req.body, "email");
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const remember = req.body?.remember === true;

      const user = !V.email(email) && password.length <= 128 ? store.users.byEmail(email) : null;
      if (!user) {
        await burnTime(password);
        return res.status(401).json({ error: WRONG });
      }

      if (user.locked_until && user.locked_until > now()) {
        const mins = Math.ceil((user.locked_until - now()) / 60000);
        return res.status(423).json({ error: `Error: too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.` });
      }

      if (!(await verifyPassword(password, user.password_hash))) {
        store.audit.log("login_failed", { subjectId: user.id });
        if (store.users.recordFailedLogin(user, MAX_ATTEMPTS, LOCK_MS)) {
          store.audit.log("account_locked", { subjectId: user.id });
          return res.status(423).json({ error: "Error: too many failed attempts. This account is locked for 15 minutes." });
        }
        return res.status(401).json({ error: WRONG });
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Error: this account is suspended. Contact an administrator." });
      }

      store.users.recordLogin(user.id);
      sessions.start(req, res, user.id, { persistent: remember });
      store.audit.log("login", { actorId: user.id, subjectId: user.id, detail: deviceName(req.get("user-agent")) });
      res.json({ user: publicUser(user), next: safeNext(req.body?.next) });
    } catch (err) {
      next(err);
    }
  });

  r.post("/register", async (req, res, next) => {
    try {
      const name = text(req.body, "name");
      const email = text(req.body, "email");
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      const errors = { name: V.name(name), email: V.email(email), password: V.password(password) };
      if (!errors.email && store.users.emailTaken(email)) errors.email = "Error: an account already uses this email. Log in instead.";
      if (rejectIfInvalid(res, errors)) return;

      const id = store.users.create({ name, email, passwordHash: await hashPassword(password) });
      store.audit.log("register", { actorId: id, subjectId: id });
      store.users.recordLogin(id);
      sessions.start(req, res, id);
      res.status(201).json({ user: publicUser(store.users.byId(id)) });
    } catch (err) {
      next(err);
    }
  });

  r.post("/logout", (req, res) => {
    sessions.end(req, res);
    res.json({ ok: true });
  });

  return r;
};

module.exports.publicUser = publicUser;
