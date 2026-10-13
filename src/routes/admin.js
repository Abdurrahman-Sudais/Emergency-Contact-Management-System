const express = require("express");
const { requireAdmin, parseId } = require("./guards");
const { EVENT_TITLES } = require("../format");

module.exports = function adminRoutes({ store, sessions, now }) {
  const r = express.Router();
  r.use("/admin", requireAdmin(store));

  r.get("/admin", (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const t = now();
    res.json({
      stats: store.users.stats(),
      accounts: store.users.list(q).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        state: u.status === "suspended" ? "suspended" : u.locked_until > t ? "locked" : "active",
        lastLogin: u.last_login_at,
        isYou: u.id === req.user.id,
      })),
      log: store.audit.securityEvents(8).map((e) => ({
        title: EVENT_TITLES[e.event] || e.event,
        who: e.subject_name || e.detail || "Deleted account",
        detail: e.event === "role_changed" ? e.detail : "",
        at: e.created_at,
      })),
    });
  });

  function target(req, res) {
    const id = parseId(req.params.id);
    const u = id && store.users.byId(id);
    if (!u) {
      res.status(404).json({ error: "That account doesn't exist." });
      return null;
    }
    if (u.id === req.user.id) {
      res.status(422).json({ error: "You can't change your own role or status." });
      return null;
    }
    return u;
  }

  const log = (req, event, u, detail = null) => store.audit.log(event, { actorId: req.user.id, subjectId: u.id, detail });

  r.post("/admin/users/:id/role", (req, res) => {
    const u = target(req, res);
    if (!u) return;
    const role = req.body?.role === "admin" ? "admin" : "user";
    if (role !== u.role) {
      store.users.setRole(u.id, role);
      log(req, "role_changed", u, role);
    }
    res.json({ ok: true, message: `${u.name} is now ${role === "admin" ? "an admin" : "a user"}.` });
  });

  r.post("/admin/users/:id/suspend", (req, res) => {
    const u = target(req, res);
    if (!u) return;
    store.users.setStatus(u.id, "suspended");
    sessions.endAllFor(u.id);
    log(req, "suspended", u);
    res.json({ ok: true, message: `${u.name} is suspended and signed out.` });
  });

  r.post("/admin/users/:id/reinstate", (req, res) => {
    const u = target(req, res);
    if (!u) return;
    store.users.setStatus(u.id, "active");
    log(req, "reinstated", u);
    res.json({ ok: true, message: `${u.name} is reinstated.` });
  });

  r.post("/admin/users/:id/unlock", (req, res) => {
    const u = target(req, res);
    if (!u) return;
    store.users.unlock(u.id);
    log(req, "unlocked", u);
    res.json({ ok: true, message: `${u.name} is unlocked.` });
  });

  return r;
};
