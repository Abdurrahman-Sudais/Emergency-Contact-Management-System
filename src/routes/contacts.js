const express = require("express");
const { requireUser, parseId, rejectIfInvalid } = require("./guards");
const { readContact } = require("./contact-form");

const FILTERS = ["all", "family", "friend", "doctor", "neighbour", "work", "review"];
const MAX_CONTACTS = 50;

const contactJson = (c) => ({
  id: c.id,
  name: c.name,
  label: c.label || "",
  phone: c.phone,
  relationship: c.relationship,
  note: c.note,
  position: c.position,
  verified: !!c.verified,
});

function contactRoutes({ store }) {
  const r = express.Router();
  r.use("/contacts", requireUser);

  function ownContact(req, res) {
    const id = parseId(req.params.id);
    const contact = id && store.contacts.get(req.user.id, id);
    if (contact) return contact;
    if (id && store.contacts.exists(id)) {
      store.audit.log("access_denied", { actorId: req.user.id, subjectId: req.user.id, detail: `contact ${id}` });
    }
    res.status(404).json({ error: "That contact doesn't exist." });
    return null;
  }

  r.get("/contacts", (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "all";
    res.json({
      contacts: store.contacts.listForUser(req.user.id, { search: q, filter }).map(contactJson),
      counts: store.contacts.counts(req.user.id),
    });
  });

  r.post("/contacts", (req, res) => {
    const { contact, errors } = readContact(req.body);
    if (rejectIfInvalid(res, errors)) return;
    if (store.contacts.counts(req.user.id).all >= MAX_CONTACTS) {
      return res.status(422).json({ error: `You can keep up to ${MAX_CONTACTS} contacts.` });
    }
    const id = store.contacts.create(req.user.id, contact);
    store.audit.log("contact_added", { actorId: req.user.id, subjectId: req.user.id, detail: contact.name });
    res.status(201).json({ contact: contactJson(store.contacts.get(req.user.id, id)) });
  });

  r.put("/contacts/:id", (req, res) => {
    const old = ownContact(req, res);
    if (!old) return;
    const { contact, errors } = readContact(req.body);
    if (rejectIfInvalid(res, errors)) return;
    store.contacts.update(req.user.id, old.id, contact);
    const event = contact.verified && !old.verified ? "contact_verified" : "contact_updated";
    store.audit.log(event, { actorId: req.user.id, subjectId: req.user.id, detail: contact.name });
    res.json({ contact: contactJson(store.contacts.get(req.user.id, old.id)) });
  });

  r.post("/contacts/:id/move", (req, res) => {
    const c = ownContact(req, res);
    if (!c) return;
    const pos = store.contacts.move(req.user.id, c.id, req.body?.direction === "up" ? "up" : "down");
    if (pos) {
      store.audit.log("order_changed", {
        actorId: req.user.id, subjectId: req.user.id, detail: `${c.name} moved to ${String(pos).padStart(2, "0")}`,
      });
    }
    res.json({ position: pos || c.position });
  });

  r.delete("/contacts/:id", (req, res) => {
    const c = ownContact(req, res);
    if (!c) return;
    store.contacts.remove(req.user.id, c.id);
    store.audit.log("contact_deleted", { actorId: req.user.id, subjectId: req.user.id, detail: c.name });
    res.json({ ok: true });
  });

  return r;
}

module.exports = contactRoutes;
module.exports.contactJson = contactJson;
