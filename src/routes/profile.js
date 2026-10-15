const express = require("express");
const V = require("../../public/js/validate");
const { requireUser, text, rejectIfInvalid } = require("./guards");
const { hashPassword, verifyPassword } = require("../security/passwords");
const { BLOOD_GROUPS } = require("../store");
const { detectImageType, cleanImage, IMAGE_TYPES } = require("../security/images");

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const str = (body, key) => (typeof body?.[key] === "string" ? body[key] : "");

module.exports = function profileRoutes({ store, sessions }) {
  const r = express.Router();
  r.use("/profile", requireUser);

  r.get("/profile", async (req, res) => {
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

  r.get("/profile/photo", async (req, res) => {
    const photo = await store.photos.get(req.user.id);
    if (!photo) return res.status(404).json({ error: "No photo yet." });
    res.set({
      "Content-Type": photo.type,
      "Content-Disposition": 'inline; filename="photo"',
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    });
    res.send(Buffer.from(photo.data));
  });

  r.put("/profile/photo", express.raw({ type: IMAGE_TYPES, limit: MAX_PHOTO_BYTES }), async (req, res) => {
    const type = detectImageType(req.body);
    if (!type) {
      return res.status(422).json({ error: "Error: that file isn't a JPG, PNG or WebP picture." });
    }
    const clean = cleanImage(req.body, type);
    if (!clean) {
      return res.status(422).json({ error: "Error: that picture looks damaged. Try another one." });
    }
    const version = await store.photos.set(req.user.id, type, clean);
    await store.audit.log("photo_updated", { actorId: req.user.id, subjectId: req.user.id });
    res.json({ ok: true, photo: version, message: "Photo updated." });
  });

  r.delete("/profile/photo", async (req, res) => {
    if (await store.photos.remove(req.user.id)) {
      await store.audit.log("photo_removed", { actorId: req.user.id, subjectId: req.user.id });
    }
    res.json({ ok: true, photo: null, message: "Photo removed." });
  });

  r.put("/profile/details", async (req, res) => {
    const name = text(req.body, "name");
    const email = text(req.body, "email");
    const phone = text(req.body, "phone");
    const errors = { name: V.name(name), email: V.email(email), phone: phone ? V.phone(phone) : null };
    if (!errors.email && await store.users.emailTaken(email, req.user.id)) errors.email = "Error: another account already uses this email.";
    if (rejectIfInvalid(res, errors)) return;

    await store.users.updateDetails(req.user.id, { name, email, phone: phone ? V.normalizePhone(phone) : null });
    await store.audit.log("profile_updated", { actorId: req.user.id, subjectId: req.user.id });
    res.json({ ok: true, message: "Details saved." });
  });

  r.put("/profile/medical", async (req, res) => {
    const medical = { bloodGroup: str(req.body, "bloodGroup"), allergies: text(req.body, "allergies") };
    const errors = {
      bloodGroup: BLOOD_GROUPS.includes(medical.bloodGroup) ? null : "Error: choose a blood group from the list.",
      allergies: V.allergies(medical.allergies),
    };
    if (rejectIfInvalid(res, errors)) return;

    await store.users.setMedical(req.user.id, medical);
    await store.audit.log("medical_updated", { actorId: req.user.id, subjectId: req.user.id });
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

      await store.users.updatePassword(req.user.id, await hashPassword(fresh));
      await store.audit.log("password_changed", { actorId: req.user.id, subjectId: req.user.id });
      await sessions.endAllFor(req.user.id);
      await sessions.start(req, res, req.user.id, { persistent: !!req.session.persistent });
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
      if (req.user.role === "admin" && await store.users.adminCount() <= 1) {
        return res.status(422).json({ error: "Error: you are the only admin. Make someone else an admin first." });
      }
      const id = req.user.id;
      await sessions.end(req, res);
      await store.transaction(async (tx) => {
        await tx.audit.removeForUser(id);
        await tx.users.remove(id);
        await tx.audit.log("account_deleted", { detail: `user #${id}` });
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
};
