const crypto = require("node:crypto");
const { cookieString } = require("./sessions");

const COOKIE = "csrf";
const SAFE = ["GET", "HEAD", "OPTIONS"];

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrf() {
  return (req, res, next) => {
    let expected;
    if (req.session) {
      expected = req.session.csrf_token;
    } else {
      expected = req.cookies[COOKIE];
      if (!/^[\w-]{43}$/.test(expected || "")) {
        expected = crypto.randomBytes(32).toString("base64url");
        res.append("Set-Cookie", cookieString(COOKIE, expected, { secure: req.secure }));
      }
    }
    req.csrfToken = expected;

    if (SAFE.includes(req.method)) return next();

    const photoUpload = req.path === "/profile/photo" && req.is(["image/jpeg", "image/png", "image/webp"]);
    if (!req.is("application/json") && !photoUpload) {
      const err = new Error("Expected JSON");
      err.status = 415;
      return next(err);
    }
    if (!safeEqual(req.get("x-csrf-token"), expected)) {
      const err = new Error("CSRF token missing or wrong");
      err.status = 403;
      err.csrf = true;
      return next(err);
    }
    next();
  };
}

module.exports = { csrf };
