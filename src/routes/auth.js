const express = require("express");
const V = require("../../public/js/validate");
const { hashPassword, verifyPassword, burnTime } = require("../security/passwords");
const { safeNext, text, rejectIfInvalid } = require("./guards");
const { deviceName } = require("../format");

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const WRONG = "Error: email or password is wrong. Try again.";

const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };

const CODE_WRONG = "Error: that code is wrong or has expired. Check the email or send a new code.";

module.exports = function authRoutes({ store, sessions, now, otp, google }) {
  const r = express.Router();

  async function sendCode(user, purpose, email) {
    try {
      return await otp.issue(user, purpose, email);
    } catch (err) {
      console.error("Couldn't send verification email:", err.message);
      return { sent: false, failed: true };
    }
  }

  r.get("/session", async (req, res) => {
    const user = publicUser(req.user);
    if (user) user.photo = req.user.photo_version ?? null;
    res.json({ user, csrfToken: req.csrfToken, google: !!google });
  });

  r.post("/login", async (req, res, next) => {
    try {
      const email = text(req.body, "email");
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      const user = !V.email(email) && password.length <= 128 ? await store.users.byEmail(email) : null;
      if (!user) {
        await burnTime(password);
        return res.status(401).json({ error: WRONG });
      }

      if (user.locked_until && user.locked_until > now()) {
        const mins = Math.ceil((user.locked_until - now()) / 60000);
        return res.status(423).json({ error: `Error: too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.` });
      }

      if (!(await verifyPassword(password, user.password_hash))) {
        await store.audit.log("login_failed", { subjectId: user.id });
        if (await store.users.recordFailedLogin(user, MAX_ATTEMPTS, LOCK_MS)) {
          await store.audit.log("account_locked", { subjectId: user.id });
          return res.status(423).json({ error: "Error: too many failed attempts. This account is locked for 15 minutes." });
        }
        return res.status(401).json({ error: WRONG });
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Error: this account is suspended. Contact an administrator." });
      }

      if (!user.email_verified) {
        await sendCode(user, "signup", user.email);
        return res.status(403).json({
          error: "Please confirm your email first. We've sent a 6-digit code to " + user.email + ".",
          needsVerification: true,
          email: user.email,
        });
      }

      await store.users.recordLogin(user.id);
      await sessions.start(req, res, user.id);
      await store.audit.log("login", { actorId: user.id, subjectId: user.id, detail: deviceName(req.get("user-agent")) });
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
      const existing = errors.email ? null : await store.users.byEmail(email);
      if (existing && existing.email_verified) errors.email = "Error: an account already uses this email. Log in instead.";
      if (rejectIfInvalid(res, errors)) return;

      const passwordHash = await hashPassword(password);
      let id;
      if (existing) {
        id = existing.id;
        await store.users.restartSignup(id, { name, passwordHash });
      } else {
        id = await store.users.create({ name, email, passwordHash });
        await store.audit.log("register", { actorId: id, subjectId: id });
      }

      const sent = await sendCode(await store.users.byId(id), "signup", email);
      res.status(201).json({
        needsVerification: true,
        email,
        message: sent.failed
          ? "Account created, but we couldn't send the email. Tap \"Send a new code\" in a moment."
          : "We've sent a 6-digit code to " + email + ".",
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/verify-email", async (req, res) => {
    const email = text(req.body, "email");
    const code = text(req.body, "code").replace(/\s/g, "");
    const user = !V.email(email) && /^\d{6}$/.test(code) ? await store.users.byEmail(email) : null;
    if (!user || user.email_verified) return res.status(400).json({ error: CODE_WRONG });

    const result = await otp.check(user, "signup", code);
    if (!result.ok) {
      const error = result.reason === "locked"
        ? "Error: too many wrong codes. Send a new code and try again."
        : CODE_WRONG;
      return res.status(400).json({ error });
    }
    if (user.status !== "active") {
      return res.status(403).json({ error: "Error: this account is suspended. Contact an administrator." });
    }

    const firstTime = !user.last_login_at;
    await store.users.markEmailVerified(user.id);
    await store.users.recordLogin(user.id);
    await sessions.start(req, res, user.id);
    await store.audit.log("email_verified", { actorId: user.id, subjectId: user.id });
    res.json({ ok: true, next: firstTime ? "/step1.html" : "/home.html" });
  });

  r.post("/verify-email/resend", async (req, res) => {
    const email = text(req.body, "email");
    const user = V.email(email) ? null : await store.users.byEmail(email);
    let waitSeconds = 60;
    if (user && !user.email_verified && user.status === "active") {
      const result = await sendCode(user, "signup", user.email);
      if (result.waitSeconds) waitSeconds = result.waitSeconds;
    }
    res.json({ ok: true, waitSeconds, message: "If that email is waiting to be confirmed, a new code is on its way." });
  });

  r.post("/logout", async (req, res) => {
    await sessions.end(req, res);
    res.json({ ok: true });
  });

  return r;
};

module.exports.publicUser = publicUser;
