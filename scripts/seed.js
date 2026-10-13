const { loadConfig } = require("../src/config");
const { openDatabase } = require("../src/db");
const { createStore } = require("../src/store");
const { createCipher } = require("../src/security/encryption");
const { hashPassword } = require("../src/security/passwords");

(async () => {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const store = createStore(db, createCipher(config.dataKey), Date.now);

  if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0) {
    console.log("The database already has accounts - seed skipped.");
    return;
  }

  const ADMIN_PW = "Admin!Demo2026";
  const USER_PW = "Amina!Demo2026";

  store.users.create({ name: "Samad Oyewole", email: "admin@incase.test", passwordHash: await hashPassword(ADMIN_PW), role: "admin" });
  const amina = store.users.create({ name: "Amina Bello", email: "amina@example.com", phone: "+2348015550100", passwordHash: await hashPassword(USER_PW) });
  for (const [name, email] of [["Tunde Bello", "tunde@example.com"], ["Funke Oladipo", "funke@example.com"], ["Chidi Eze", "chidi@example.com"]]) {
    store.users.create({ name, email, passwordHash: await hashPassword(USER_PW) });
  }

  store.users.setMedical(amina, { bloodGroup: "O positive", allergies: "" });
  const contacts = [
    { name: "Tunde Bello", label: "Brother", phone: "+2348025550142", relationship: "family", verified: true },
    { name: "Dr. Kemi Adeyemi", label: "Family doctor", phone: "+2348035550177", relationship: "doctor", verified: true, note: "Has my medical history." },
    { name: "Funke Oladipo", label: "Neighbour", phone: "+2348055550119", relationship: "neighbour", verified: false },
    { name: "Mrs. Ibrahim", label: "Aunt", phone: "+2348075550163", relationship: "family", verified: true },
    { name: "Chidi Eze", label: "Colleague", phone: "+2348065550188", relationship: "work", verified: false },
  ];
  for (const c of contacts) {
    store.contacts.create(amina, c);
    store.audit.log("contact_added", { actorId: amina, subjectId: amina, detail: c.name });
  }

  console.log("Demo data created:");
  console.log(`  Admin  admin@incase.test   / ${ADMIN_PW}`);
  console.log(`  User   amina@example.com   / ${USER_PW}`);
  console.log("These passwords are public - only use the seed for local demos.");
})();
