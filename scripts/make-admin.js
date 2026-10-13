const { loadConfig } = require("../src/config");
const { openDatabase } = require("../src/db");

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}

const db = openDatabase(loadConfig().dbPath);
const { changes } = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
console.log(changes ? `${email} is now an admin.` : `No account found for ${email}.`);
