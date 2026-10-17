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

  const databaseUrl = env.DATABASE_URL || null;
  if (env.VERCEL && !databaseUrl) {
    throw new Error("DATABASE_URL is missing. On Vercel the app needs the Supabase connection string.");
  }

  const smtpHost = env.SMTP_HOST || null;
  if (production && !smtpHost) {
    throw new Error("Email isn't set up. Add SMTP_HOST, SMTP_USER, SMTP_PASS (and MAIL_FROM) so sign-up codes can be sent.");
  }

  return {
    production,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || null,
    appUrl: env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : null,
    smtpHost,
    smtpPort: Number(env.SMTP_PORT) || 465,
    smtpUser: env.SMTP_USER || "",
    smtpPass: env.SMTP_PASS || "",
    mailFrom: env.MAIL_FROM || (env.SMTP_USER ? `InCase <${env.SMTP_USER}>` : "InCase <no-reply@incase.local>"),
    databaseUrl,
    dbDir: env.DB_DIR || path.join("data", "pgdata"),
    dbCaCert: env.DATABASE_CA_CERT ? env.DATABASE_CA_CERT.replace(/\\n/g, "\n") : null,
    port: Number(env.PORT) || 3000,
    httpsPort: Number(env.HTTPS_PORT) || 3443,
    dataKey,
    tlsKeyFile: env.TLS_KEY_FILE || null,
    tlsCertFile: env.TLS_CERT_FILE || null,
    trustProxy: env.TRUST_PROXY === "1",
    forceHttps: production || env.FORCE_HTTPS === "1",
  };
}

module.exports = { loadConfig };
