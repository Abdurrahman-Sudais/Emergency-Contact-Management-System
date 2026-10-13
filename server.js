const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { loadConfig } = require("./src/config");
const { openDatabase } = require("./src/db");
const { createApp } = require("./src/app");

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = openDatabase(config.dbPath);
const tls = config.tlsKeyFile && config.tlsCertFile;

const app = createApp({
  db,
  dataKey: config.dataKey,
  forceHttps: config.forceHttps || !!tls,
  trustProxy: config.trustProxy,
});

if (tls) {
  const options = { key: fs.readFileSync(config.tlsKeyFile), cert: fs.readFileSync(config.tlsCertFile) };
  https.createServer(options, app).listen(config.httpsPort, () => {
    console.log(`InCase running on https://localhost:${config.httpsPort}`);
  });
  http.createServer((req, res) => {
    const host = (req.headers.host || "localhost").replace(/:\d+$/, "");
    res.writeHead(301, { Location: `https://${host}:${config.httpsPort}${req.url}` }).end();
  }).listen(config.port, () => console.log(`HTTP on port ${config.port} redirects to HTTPS`));
} else {
  app.listen(config.port, () => {
    console.log(`InCase running on http://localhost:${config.port}`);
    if (!config.production) console.log("Tip: run `npm run cert` and set TLS_KEY_FILE/TLS_CERT_FILE to try it over HTTPS.");
  });
}
