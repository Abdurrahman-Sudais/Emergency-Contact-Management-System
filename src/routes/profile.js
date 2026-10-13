const express = require("express");
const V = require("../../public/js/validate");
const { requireUser, text, rejectIfInvalid } = require("./guards");
const { hashPassword, verifyPassword } = require("../security/passwords");
const { BLOOD_GROUPS } = require("../store");
const { transaction } = require("../db");

const str = (body, key) => (typeof body?.[key] === "string" ? body[key] : "");

module.exports = function profileRoutes({ db, store, sessions }) {
  const r = express.Router();
  r.use("/profile", requireUser);

  r.get("/profile", (req, res) => {
    const u = req.user;
    res.json({
      name: u.name,
      email: u.email,
      phone: u.phone ? V.formatPhone(u.phone) : "",
      role: u.role,
      joined: u.created_at,
      medical: store.users.getMedical(u),
      bloodGroups: BLOOD_GROUPS,
    });
  });

  r.put("/profile/details", (req, res) => {
    const name = text(req.body, "name");
    const email = text(req.body, "email");
    const phone = text(req.body, "phone");
    const errors = { name: V.name(name), email: V.email(email), phone: phone ? V.phone(phone) : null };
    if (!errors.email && store.users.emailTaken(email, req.user.id)) errors.email = "Error: another account already uses this email.";
    if (rejectIfInvalid(res, errors)) return;

    store.users.updateDetails(req.user.id, { name, email, phone: phone ? V.normalizePhone(phone) : null });
    store.audit.log("profile_updated", { actorId: req.user.id, subjectId: req.user.id });
    res.json({ ok: true, message: "Details saved." });
  });

  r.put("/profile/medical", (req, res) => {
    const medical = { bloodGroup: str(req.body, "bloodGroup"), allergies: text(req.body, "allergies") };
    const errors = {
      bloodGroup: BLOOD_GROUPS.includes(medical.bloodGroup) ? null : "Error: choose a blood group from the list.",
      allergies: V.allergies(medical.allergies),
    };
    if (rejectIfInvalid(res, errors)) return;

    store.users.setMedical(req.user.id, medical);
    store.audit.log("medical_updated", { actorId: req.user.id, subjectId: req.user.id });
    res.json({ ok: true, message: "Medical notes saved and encrypted." });
  });

  r.put("/profile/password", async (req, res, next) => {
    try {
      const current = str(req.body, "currentPassword");
      const fresh = str(req.body, "newPassword");
      const errors = {
        currentPassword: (await verifyPassword(current, req.user.password_hash)) ? null : "Error: that isn't your current password.",
        newPassword: V.password(fresh) || (fresh === current ? "Error: choose a password you haven't used here." : null),
      };
      if (rejectIfInvalid(res, errors)) return;

      store.users.updatePassword(req.user.id, await hashPassword(fresh));
      store.audit.log("password_changed", { actorId: req.user.id, subjectId: req.user.id });
      sessions.endAllFor(req.user.id);
      sessions.start(req, res, req.user.id, { persistent: !!req.session.persistent });
      res.json({ ok: true, message: "Password updated. Other devices have been signed out." });
    } catch (err) {
      next(err);
    }
  });

  r.delete("/profile", async (req, res, next) => {
    try {
      if (!(await verifyPassword(str(req.body, "password"), req.user.password_hash))) {
        return res.status(422).json({ error: "Error: that password is wrong. Nothing was deleted.", fields: { password: "Error: that password is wrong." } });
      }
      if (req.user.role === "admin" && store.users.adminCount() <= 1) {
        return res.status(422).json({ error: "Error: you are the only admin. Make someone else an admin first." });
      }
      const id = req.user.id;
      sessions.end(req, res);
      transaction(db, () => {
        store.audit.removeForUser(id);
        store.users.remove(id);
        store.audit.log("account_deleted", { detail: `user #${id}` });
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
};
