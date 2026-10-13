function eventText(e) {
  const d = e.detail || "";
  switch (e.event) {
    case "register": return "Account created";
    case "login": return d ? `Signed in from ${d}` : "Signed in";
    case "login_failed": return "Failed sign-in attempt";
    case "account_locked": return "Account locked after 5 failed sign-ins";
    case "contact_added": return `${d} added`;
    case "contact_updated": return `${d} updated`;
    case "contact_deleted": return `${d} removed`;
    case "contact_verified": return `${d} verified`;
    case "order_changed": return `Order changed: ${d}`;
    case "profile_updated": return "Profile details updated";
    case "medical_updated": return "Medical notes updated";
    case "password_changed": return "Password changed";
    case "photo_updated": return "Profile photo changed";
    case "photo_removed": return "Profile photo removed";
    case "role_changed": return `Role changed to ${d}`;
    case "suspended": return "Account suspended";
    case "reinstated": return "Account reinstated";
    case "unlocked": return "Account unlocked";
    case "access_denied": return "Access denied";
    case "account_deleted": return "Account deleted";
    default: return e.event;
  }
}

const EVENT_TITLES = {
  register: "Account created", account_locked: "Account locked", role_changed: "Role changed",
  suspended: "Suspended", reinstated: "Reinstated", unlocked: "Unlocked",
  access_denied: "Access denied", account_deleted: "Account deleted", password_changed: "Password changed",
};

function deviceName(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || "";
}

module.exports = { eventText, deviceName, EVENT_TITLES };
