const { loadConfig } = require("../src/config");
const { openDatabase } = require("../src/db");

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run make-admin -- <email>");
    process.exit(1);
  }
  const config = loadConfig();
  const db = await openDatabase({ url: config.databaseUrl, dir: config.dbDir, caCert: config.dbCaCert });
  const { count } = await db.query("UPDATE users SET role = 'admin' WHERE lower(email) = lower($1)", [email]);
  console.log(count ? `${email} is now an admin.` : `No account found for ${email}.`);
  await db.close();
})();
