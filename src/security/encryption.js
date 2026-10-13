const crypto = require("node:crypto");

function createCipher(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Encryption key must be 32 bytes");

  return {
    encrypt(plaintext) {
      if (plaintext == null || plaintext === "") return null;
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return "v1:" + Buffer.concat([iv, tag, body]).toString("base64");
    },

    decrypt(stored) {
      if (!stored) return "";
      if (!stored.startsWith("v1:")) throw new Error("Unknown ciphertext format");
      const raw = Buffer.from(stored.slice(3), "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

module.exports = { createCipher };
