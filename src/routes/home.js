const express = require("express");
const { requireUser } = require("./guards");
const { eventText } = require("../format");
const { contactJson } = require("./contacts");

module.exports = function homeRoutes({ store }) {
  const r = express.Router();

  r.get("/home", requireUser, async (req, res) => {
    const user = req.user;
    const [contacts, events] = await Promise.all([store.contacts.listForUser(user.id), store.audit.forUser(user.id, 5)]);
    const medical = store.users.getMedical(user);
    const unverified = contacts.find((c) => !c.verified);

    const readiness = [
      { label: "Add three contacts", done: contacts.length >= 3, href: "contacts.html" },
      { label: "Set the call order", done: !!user.order_set, href: "contacts.html" },
      { label: "Add allergies to your card", done: !!medical.allergies, href: "profile.html" },
      unverified
        ? { label: `Verify ${unverified.name.split(" ")[0]}'s number`, done: false, href: "contacts.html" }
        : { label: "Verify your contacts' numbers", done: contacts.length > 0, href: "contacts.html" },
      { label: "Review your privacy", done: !!user.privacy_reviewed, href: "security.html" },
    ];

    res.json({
      contacts: contacts.map(contactJson),
      readiness,
      activity: events.map((e) => ({ at: e.created_at, text: eventText(e) })),
    });
  });

  r.post("/privacy-reviewed", requireUser, async (req, res) => {
    await store.users.markPrivacyReviewed(req.user.id);
    res.json({ ok: true });
  });

  return r;
};
