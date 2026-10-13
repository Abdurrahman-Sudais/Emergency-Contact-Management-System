const path = require("node:path");

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";

  const dataKey = env.DATA_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(dataKey)) {
    throw new Error(
      "DATA_KEY is missing or not 64 hex characters. Run `npm run setup` to create a .env file with a fresh key."
    );
  }

  return {
    production,
    port: Number(env.PORT) || 3000,
    httpsPort: Number(env.HTTPS_PORT) || 3443,
    dbPath: env.DB_PATH || path.join("data", "incase.db"),
    dataKey: Buffer.from(dataKey, "hex"),
    tlsKeyFile: env.TLS_KEY_FILE || null,
    tlsCertFile: env.TLS_CERT_FILE || null,
    trustProxy: env.TRUST_PROXY === "1",
    forceHttps: production || env.FORCE_HTTPS === "1",
  };
}

module.exports = { loadConfig };
