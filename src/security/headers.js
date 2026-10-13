const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

function securityHeaders({ forceHttps }) {
  return (req, res, next) => {
    if (forceHttps && !req.secure) {
      if (req.method !== "GET" && req.method !== "HEAD") return res.status(403).send("HTTPS required");
      return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }

    if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.set({
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    next();
  };
}

function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

module.exports = { securityHeaders, noStore, CSP };
