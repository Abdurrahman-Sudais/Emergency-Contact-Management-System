const { loadConfig } = require("./config");
const { openDatabase } = require("./db");
const { createApp } = require("./app");

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
    ...overrides,
  });
  return { app, config, db };
}

module.exports = { start };
