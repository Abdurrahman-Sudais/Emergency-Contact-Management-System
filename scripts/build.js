const fs = require("node:fs");

fs.mkdirSync("vercel-out", { recursive: true });
fs.writeFileSync("vercel-out/robots.txt", "User-agent: *\nAllow: /\n");
