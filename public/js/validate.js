(function (root) {
  "use strict";

  var RELATIONSHIPS = ["family", "friend", "doctor", "neighbour", "work"];

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function name(v) {
    v = clean(v);
    if (!v) return "Error: enter a name.";
    if (v.length < 2) return "Error: a name needs at least 2 letters.";
    if (v.length > 80) return "Error: keep the name under 80 characters.";
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(v)) return "Error: use letters, spaces, dots, hyphens or apostrophes only.";
    return null;
  }

  function email(v) {
    v = clean(v);
    if (!v) return "Error: enter your email.";
    if (v.length > 254) return "Error: that email is too long.";
    if (v.indexOf("@") < 1) return "Error: an email needs an @, like amina@example.com";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v)) return "Error: add the part after @, like amina@example.com";
    return null;
  }

  function passwordChecks(v) {
    v = String(v == null ? "" : v);
    return {
      length: v.length >= 10,
      symbol: /[^A-Za-z0-9]/.test(v),
      max: v.length <= 128,
    };
  }

  function password(v) {
    var c = passwordChecks(v);
    if (!c.length) return "Error: use 10 or more characters.";
    if (!c.symbol) return "Error: add one symbol, like ! or #";
    if (!c.max) return "Error: keep it under 128 characters.";
    return null;
  }

  function normalizePhone(v) {
    var s = clean(v).replace(/[\s().-]/g, "");
    if (/^0\d+$/.test(s)) s = "+234" + s.slice(1);
    return s;
  }

  function phone(v) {
    var raw = clean(v);
    if (!raw) return "Error: enter a phone number.";
    var s = normalizePhone(raw);
    if (!/^\+\d+$/.test(s)) return "Error: use digits only, starting with + and the country code.";
    if (s.indexOf("+234") === 0) {
      var n = s.length - 4;
      if (n < 10) return "Error: needs 10 digits after +234. Add " + (10 - n) + " more.";
      if (n > 10) return "Error: needs 10 digits after +234. Remove " + (n - 10) + ".";
      return null;
    }
    var digits = s.length - 1;
    if (digits < 8 || digits > 15) return "Error: a phone number has 8 to 15 digits with the country code.";
    return null;
  }

  function countryCode(v) {
    var s = clean(v).replace(/\s/g, "");
    if (!s) return "Error: add the country code, like +234.";
    if (!/^\+?[1-9]\d{0,3}$/.test(s)) return "Error: a country code is + and 1 to 4 digits, like +234.";
    return null;
  }

  function formatPhone(s) {
    s = String(s || "");
    var m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(s);
    if (m) return "+234 " + m[1] + " " + m[2] + " " + m[3];
    return s;
  }

  function relationship(v) {
    return RELATIONSHIPS.indexOf(v) >= 0 ? null : "Error: choose who they are to you.";
  }

  function maxLength(limit, label) {
    return function (v) {
      return clean(v).length > limit ? "Error: keep " + label + " under " + limit + " characters." : null;
    };
  }

  var api = {
    RELATIONSHIPS: RELATIONSHIPS,
    countryCode: countryCode,
    name: name,
    email: email,
    password: password,
    passwordChecks: passwordChecks,
    phone: phone,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    relationship: relationship,
    label: maxLength(40, "the label"),
    note: maxLength(500, "the note"),
    allergies: maxLength(200, "allergies"),
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeSafeValidate = api;
})(this);
