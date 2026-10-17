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

  async function ownContact(req, res) {
    const id = parseId(req.params.id);
    const contact = id && await store.contacts.get(req.user.id, id);
    if (contact) return contact;
    if (id && await store.contacts.exists(id)) {
      await store.audit.log("access_denied", { actorId: req.user.id, subjectId: req.user.id, detail: `contact ${id}` });
    }
    res.status(404).json({ error: "That contact doesn't exist." });
    return null;
  }

  r.get("/contacts", async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "all";
    const [contacts, counts] = await Promise.all([
      store.contacts.listForUser(req.user.id, { search: q, filter }),
      store.contacts.counts(req.user.id),
    ]);
    res.json({ contacts: contacts.map(contactJson), counts });
  });

  r.post("/contacts", async (req, res) => {
    const { contact, errors } = readContact(req.body);
    if (rejectIfInvalid(res, errors)) return;
    if ((await store.contacts.counts(req.user.id)).all >= MAX_CONTACTS) {
      return res.status(422).json({ error: `You can keep up to ${MAX_CONTACTS} contacts.` });
    }
    const id = await store.contacts.create(req.user.id, contact);
    await store.audit.log("contact_added", { actorId: req.user.id, subjectId: req.user.id, detail: contact.name });
    res.status(201).json({ contact: contactJson(await store.contacts.get(req.user.id, id)) });
  });

  r.put("/contacts/:id", async (req, res) => {
    const old = await ownContact(req, res);
    if (!old) return;
    const { contact, errors } = readContact(req.body);
    if (rejectIfInvalid(res, errors)) return;
    await store.contacts.update(req.user.id, old.id, contact);
    const event = contact.verified && !old.verified ? "contact_verified" : "contact_updated";
    await store.audit.log(event, { actorId: req.user.id, subjectId: req.user.id, detail: contact.name });
    res.json({ contact: contactJson(await store.contacts.get(req.user.id, old.id)) });
  });

  r.post("/contacts/:id/move", async (req, res) => {
    const c = await ownContact(req, res);
    if (!c) return;
    const pos = await store.contacts.move(req.user.id, c.id, req.body?.direction === "up" ? "up" : "down");
    if (pos) {
      await store.audit.log("order_changed", {
        actorId: req.user.id, subjectId: req.user.id, detail: `${c.name} moved to ${String(pos).padStart(2, "0")}`,
      });
    }
    res.json({ position: pos || c.position });
  });

  r.post("/contacts/reorder", async (req, res) => {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = raw.map(parseId);
    if (!ids.length || ids.some((id) => !id)) return res.status(400).json({ error: "Invalid contact list." });
    if (!(await store.contacts.reorder(req.user.id, ids))) {
      return res.status(422).json({ error: "The order must include every one of your contacts exactly once. Clear the search and filters, then try again." });
    }
    await store.audit.log("order_rearranged", { actorId: req.user.id, subjectId: req.user.id });
    res.json({ ok: true });
  });

  r.post("/contacts/:id/verify", async (req, res) => {
    const c = await ownContact(req, res);
    if (!c) return;
    if (!c.verified) {
      await store.contacts.markVerified(req.user.id, c.id);
      await store.audit.log("contact_verified", { actorId: req.user.id, subjectId: req.user.id, detail: c.name });
    }
    res.json({ contact: contactJson(await store.contacts.get(req.user.id, c.id)) });
  });

  r.delete("/contacts/:id", async (req, res) => {
    const c = await ownContact(req, res);
    if (!c) return;
    await store.contacts.remove(req.user.id, c.id);
    await store.audit.log("contact_deleted", { actorId: req.user.id, subjectId: req.user.id, detail: c.name });
    res.json({ ok: true });
  });

  return r;
}

module.exports = contactRoutes;
module.exports.contactJson = contactJson;
