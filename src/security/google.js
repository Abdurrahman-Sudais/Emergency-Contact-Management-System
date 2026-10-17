const crypto = require("node:crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const random = () => crypto.randomBytes(32).toString("base64url");
const challengeFor = (verifier) => crypto.createHash("sha256").update(verifier).digest("base64url");

function decodePayload(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function createGoogle({ clientId, clientSecret, fetchImpl = fetch, now = Date.now }) {
  function start(redirectUri) {
    const state = random();
    const nonce = random();
    const verifier = random();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challengeFor(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return { url: `${AUTH_URL}?${params}`, state, nonce, verifier };
  }

  function checkClaims(claims, nonce) {
    if (!ISSUERS.includes(claims.iss)) throw new Error("Wrong issuer");
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(clientId)) throw new Error("Token is for a different app");
    if (!claims.exp || claims.exp * 1000 <= now()) throw new Error("Token expired");
    if (!nonce || claims.nonce !== nonce) throw new Error("Nonce mismatch");
    if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("Google email not verified");
    if (!claims.sub || !claims.email) throw new Error("Missing account details");
    return { sub: String(claims.sub), email: String(claims.email), name: String(claims.name || "") };
  }

  async function finish({ code, redirectUri, verifier, nonce }) {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.id_token) throw new Error("Google refused the sign-in: " + (body.error || res.status));
    return checkClaims(decodePayload(body.id_token), nonce);
  }

  return { start, finish, checkClaims };
}

module.exports = { createGoogle, decodePayload };
