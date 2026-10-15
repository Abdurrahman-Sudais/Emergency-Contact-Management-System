const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { start } = require("./src/start");

(async () => {
  let ready;
  try {
    const tls = process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE;
    ready = await start(tls ? { forceHttps: true } : {});
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const { app, config } = ready;

  if (config.tlsKeyFile && config.tlsCertFile) {
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
      console.log(config.databaseUrl ? "Database: Supabase (DATABASE_URL)" : `Database: local PGlite in ${config.dbDir}`);
    });
  }
})();
