(function () {
  "use strict";
  var V = BeSafeValidate;
  var form = document.getElementById("signup-form");
  var fields = {
    name: document.getElementById("name"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
  };

  function updateChecks() {
    var c = V.passwordChecks(fields.password.value);
    form.querySelectorAll("[data-check]").forEach(function (row) {
      var ok = !!c[row.getAttribute("data-check")];
      row.classList.toggle("ok", ok);
      row.querySelector("img").src = ok ? "images/check.png" : "images/x.png";
    });
  }
  fields.password.addEventListener("input", updateChecks);

  Object.keys(fields).forEach(function (key) {
    fields[key].addEventListener("blur", function () {
      if (fields[key].value) BeSafe.showFieldError(fields[key], V[key](fields[key].value));
    });
    fields[key].addEventListener("input", function () {
      if (fields[key].classList.contains("invalid")) BeSafe.showFieldError(fields[key], V[key](fields[key].value));
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = true;
    Object.keys(fields).forEach(function (key) {
      var msg = V[key](fields[key].value);
      BeSafe.showFieldError(fields[key], msg);
      if (msg && ok) {
        fields[key].focus();
        ok = false;
      }
    });
    if (!ok) return;

    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    BeSafe.api("POST", "/api/register", {
      name: fields.name.value,
      email: fields.email.value,
      password: fields.password.value,
    }).then(function (res) {
      location.href = "verify.html?email=" + encodeURIComponent(res.email);
    }).catch(function (err) {
      button.disabled = false;
      Object.keys(fields).forEach(function (key) { BeSafe.showFieldError(fields[key], err.fields[key]); });
      if (!Object.keys(err.fields).length) alert(err.message);
    });
  });
})();
