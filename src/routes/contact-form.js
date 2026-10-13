const V = require("../../public/js/validate");
const { text } = require("./guards");

function readContact(body) {
  const contact = {
    name: text(body, "name"),
    label: text(body, "label"),
    phone: text(body, "phone"),
    relationship: text(body, "relationship"),
    note: text(body, "note"),
    verified: body?.verified === true,
  };
  const errors = {
    name: V.name(contact.name),
    phone: V.phone(contact.phone),
    relationship: V.relationship(contact.relationship),
    label: V.label(contact.label),
    note: V.note(contact.note),
  };
  contact.phone = V.normalizePhone(contact.phone);
  return { contact, errors };
}

module.exports = { readContact };
