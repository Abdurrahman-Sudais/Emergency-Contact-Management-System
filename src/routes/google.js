const crypto = require("node:crypto");
const express = require("express");
const V = require("../../public/js/validate");
const { hashPassword } = require("../security/passwords");
const { cookieString } = require("../security/sessions");
const { safeNext } = require("./guards");
const { deviceName } = require("../format");

const COOKIE = "g_oauth";

function sameValue(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function displayName(name, email) {
  const clean = String(name || "").replace(/[^\p{L}\p{M} .'’-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!V.name(clean)) return clean;
  const fromEmail = email.split("@")[0].replace(/[^\p{L}]+/gu, " ").trim().slice(0, 80);
  return V.name(fromEmail) ? "InCase User" : fromEmail;
}

module.exports = function googleRoutes({ store, sessions, google, appUrl }) {
  const r = express.Router();

  const redirectUri = (req) => `${appUrl || `${req.protocol}://${req.get("host")}`}/api/auth/google/callback`;
  const back = (res, reason) => res.redirect(`/login.html?google=${reason}`);

  r.get("/auth/google", (req, res) => {
    if (!google) return res.status(404).json({ error: "Google sign-in isn't set up." });
    const flow = google.start(redirectUri(req));
    const saved = Buffer.from(JSON.stringify({
      state: flow.state,
      nonce: flow.nonce,
      verifier: flow.verifier,
      next: safeNext(req.query.next, ""),
    })).toString("base64url");
    res.append("Set-Cookie", cookieString(COOKIE, saved, { secure: req.secure, maxAgeSec: 600 }));
    res.redirect(flow.url);
  });

  r.get("/auth/google/callback", async (req, res) => {
    if (!google) return res.status(404).json({ error: "Google sign-in isn't set up." });
    res.append("Set-Cookie", cookieString(COOKIE, "", { secure: req.secure, maxAgeSec: 0 }));

    if (req.query.error) return back(res, "cancelled");
    let saved = null;
    try {
      saved = JSON.parse(Buffer.from(String(req.cookies[COOKIE] || ""), "base64url").toString("utf8"));
    } catch {}
    if (!saved || typeof req.query.code !== "string" || !sameValue(req.query.state, saved.state)) return back(res, "failed");

    let account;
    try {
      account = await google.finish({ code: req.query.code, redirectUri: redirectUri(req), verifier: saved.verifier, nonce: saved.nonce });
    } catch (err) {
      console.error("Google sign-in failed:", err.message);
      return back(res, "failed");
    }

    let user = await store.users.byGoogle(account.sub);
    let isNew = false;
    if (!user) {
      const existing = await store.users.byEmail(account.email);
      let id;
      const unusable = () => hashPassword(crypto.randomBytes(32).toString("base64url"));
      if (existing && existing.email_verified) {
        id = existing.id;
        await store.users.linkGoogle(id, account.sub);
      } else if (existing) {
        id = existing.id;
        await store.users.claimUnverified(id, account.sub, await unusable());
        await store.codes.remove(id, "signup");
        await sessions.endAllFor(id);
        isNew = !existing.last_login_at;
      } else {
        id = await store.users.create({ name: displayName(account.name, account.email), email: account.email, passwordHash: await unusable() });
        await store.users.markGoogleSignup(id, account.sub);
        await store.audit.log("register", { actorId: id, subjectId: id, detail: "Google" });
        isNew = true;
      }
      user = await store.users.byId(id);
    }

    if (user.status !== "active") return back(res, "suspended");

    await store.users.recordLogin(user.id);
    await sessions.start(req, res, user.id);
    await store.audit.log("login", { actorId: user.id, subjectId: user.id, detail: ["Google", deviceName(req.get("user-agent"))].filter(Boolean).join(" · ") });
    res.redirect(isNew ? "/step1.html" : saved.next || "/home.html");
  });

  return r;
};
