const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

fs.mkdirSync("certs", { recursive: true });
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "365",
  "-keyout", "certs/key.pem", "-out", "certs/cert.pem",
  "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
], { stdio: "inherit" });

console.log("Created certs/key.pem and certs/cert.pem. Add these lines to .env:");
console.log("  TLS_KEY_FILE=certs/key.pem\n  TLS_CERT_FILE=certs/cert.pem");
