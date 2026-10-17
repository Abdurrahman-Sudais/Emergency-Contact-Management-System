const express = require("express");
const V = require("../../public/js/validate");
const { text, rejectIfInvalid } = require("./guards");

const HOUR = 60 * 60 * 1000;
const PER_EMAIL = 3;
const PER_ADDRESS = 10;

function message(v) {
  if (v.length < 10) return "Error: tell us a little more (at least 10 characters).";
  if (v.length > 1000) return "Error: keep it under 1000 characters.";
  return null;
}

module.exports = function supportRoutes({ store, now }) {
  const r = express.Router();
  const byAddress = new Map();

  function tooManyFromAddress(ip) {
    const t = now();
    const recent = (byAddress.get(ip) || []).filter((at) => t - at < HOUR);
    recent.push(t);
    byAddress.set(ip, recent);
    if (byAddress.size > 5000) byAddress.clear();
    return recent.length > PER_ADDRESS;
  }

  r.post("/support", async (req, res) => {
    const name = text(req.body, "name");
    const email = text(req.body, "email");
    const body = text(req.body, "message");

    const errors = { name: V.name(name), email: V.email(email), message: message(body) };
    if (rejectIfInvalid(res, errors)) return;

    if (tooManyFromAddress(req.ip) || (await store.support.recentFrom(email, HOUR)) >= PER_EMAIL) {
      return res.status(429).json({ error: "You've already sent a few messages. An admin will get back to you - please try again in an hour." });
    }

    await store.support.create({ userId: req.user ? req.user.id : null, name, email, message: body });
    res.status(201).json({ ok: true, message: "Message sent. An admin will contact you at " + email + "." });
  });

  return r;
};
