(function () {
  "use strict";
  var V = BeSafeValidate;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("support-form");
  var fields = { name: $("s-name"), email: $("s-email"), message: $("s-message") };

  var params = new URLSearchParams(location.search);
  if (params.get("email")) fields.email.value = params.get("email");

  BeSafe.session().then(function (s) {
    if (!s.user) return;
    if (!fields.name.value) fields.name.value = s.user.name;
    if (!fields.email.value) fields.email.value = s.user.email;
  });

  function messageError(v) {
    v = v.trim();
    if (v.length < 10) return "Error: tell us a little more (at least 10 characters).";
    if (v.length > 1000) return "Error: keep it under 1000 characters.";
    return null;
  }

  var rules = { name: V.name, email: V.email, message: messageError };

  fields.message.addEventListener("input", function () {
    $("s-count").textContent = fields.message.value.length + " / 1000";
  });

  Object.keys(fields).forEach(function (k) {
    fields[k].addEventListener("blur", function () {
      if (fields[k].value) BeSafe.showFieldError(fields[k], rules[k](fields[k].value));
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = null;
    Object.keys(fields).forEach(function (k) {
      var msg = rules[k](fields[k].value);
      BeSafe.showFieldError(fields[k], msg);
      if (msg && !bad) bad = fields[k];
    });
    if (bad) return bad.focus();

    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    BeSafe.flash($("support-error"), "", true);
    BeSafe.api("POST", "/api/support", {
      name: fields.name.value,
      email: fields.email.value,
      message: fields.message.value,
    }).then(function (res) {
      BeSafe.flash($("support-done"), res.message);
      fields.message.value = "";
      $("s-count").textContent = "0 / 1000";
    }).catch(function (err) {
      Object.keys(fields).forEach(function (k) { BeSafe.showFieldError(fields[k], err.fields[k]); });
      if (!Object.keys(err.fields).length) BeSafe.flash($("support-error"), err.message, true);
    }).finally(function () {
      button.disabled = false;
    });
  });
})();
