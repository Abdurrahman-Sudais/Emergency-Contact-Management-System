const { loadConfig } = require("./config");
const { openDatabase } = require("./db");
const { createApp } = require("./app");
const { createMailer } = require("./mailer");
const { createGoogle } = require("./security/google");

async function start(overrides = {}) {
  const config = loadConfig();
  const db = await openDatabase({
    url: config.databaseUrl,
    dir: config.databaseUrl ? null : config.dbDir,
    caCert: config.dbCaCert,
  });
  const app = createApp({
    db,
    dataKey: config.dataKey,
    forceHttps: config.forceHttps,
    trustProxy: config.trustProxy,
    cacheAssets: config.production,
    mailer: createMailer(config),
    google: config.googleClientId && config.googleClientSecret
      ? createGoogle({ clientId: config.googleClientId, clientSecret: config.googleClientSecret })
      : null,
    appUrl: config.appUrl,
    ...overrides,
  });
  return { app, config, db };
}

module.exports = { start };
