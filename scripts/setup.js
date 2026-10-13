const fs = require("node:fs");
const crypto = require("node:crypto");

if (fs.existsSync(".env")) {
  console.log(".env already exists - leaving it alone.");
} else {
  const example = fs.readFileSync(".env.example", "utf8");
  const key = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(".env", example.replace(/^DATA_KEY=.*$/m, `DATA_KEY=${key}`));
  console.log("Created .env with a new DATA_KEY. Keep this file private and never commit it.");
}
console.log("Next: `npm run seed` for demo data, then `npm start`.");
