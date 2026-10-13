const path = require("node:path");

function readKey(value) {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (/^[A-Za-z0-9+/]{43}=?$/.test(value)) {
    const key = Buffer.from(value, "base64");
    if (key.length === 32) return key;
  }
  return null;
}

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";

  const dataKey = readKey(env.DATA_KEY || "");
  if (!dataKey) {
    throw new Error(
      "DATA_KEY is missing or invalid (needs 32 bytes as hex or base64). Run `npm run setup` to create a .env file with a fresh key."
    );
  }

  return {
    production,
    port: Number(env.PORT) || 3000,
    httpsPort: Number(env.HTTPS_PORT) || 3443,
    dbPath: env.DB_PATH || path.join("data", "incase.db"),
    dataKey,
    tlsKeyFile: env.TLS_KEY_FILE || null,
    tlsCertFile: env.TLS_CERT_FILE || null,
    trustProxy: env.TRUST_PROXY === "1",
    forceHttps: production || env.FORCE_HTTPS === "1",
  };
}

module.exports = { loadConfig };
