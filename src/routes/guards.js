function requireUser(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: req.sessionExpired ? "You were signed out after 15 minutes without activity." : "Please log in." });
}

function requireAdmin(store) {
  return async (req, res, next) => {
    if (!req.user) return requireUser(req, res, next);
    if (req.user.role === "admin") return next();
    await store.audit.log("access_denied", { actorId: req.user.id, subjectId: req.user.id, detail: req.path });
    res.status(403).json({ error: "Admins only." });
  };
}

function safeNext(value, fallback = "/home.html") {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : fallback;
}

function parseId(value) {
  return /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
}

const text = (body, key) => (typeof body?.[key] === "string" ? body[key].trim() : "");

function rejectIfInvalid(res, errors) {
  const fields = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  if (!Object.keys(fields).length) return false;
  res.status(422).json({ error: "Please fix the highlighted fields.", fields });
  return true;
}

module.exports = { requireUser, requireAdmin, safeNext, parseId, text, rejectIfInvalid };
