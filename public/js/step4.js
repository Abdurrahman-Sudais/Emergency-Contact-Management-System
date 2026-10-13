(function () {
  "use strict";
  var V = InCaseValidate;
  var form = document.getElementById("first-contact");
  var name = document.getElementById("name");
  var phone = document.getElementById("phone");
  var country = document.getElementById("country");

  function fullPhone() {
    var v = phone.value.trim();
    return v.charAt(0) === "+" ? v : country.value + v.replace(/^0/, "");
  }

  function check() {
    var nameError = V.name(name.value);
    var phoneError = phone.value.trim() ? V.phone(fullPhone()) : "Error: enter a phone number.";
    InCase.showFieldError(name, nameError);
    InCase.showFieldError(phone, phoneError);
    return !nameError && !phoneError;
  }

  name.addEventListener("blur", function () { if (name.value) InCase.showFieldError(name, V.name(name.value)); });
  phone.addEventListener("blur", function () { if (phone.value) InCase.showFieldError(phone, V.phone(fullPhone())); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check()) return;
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    InCase.api("POST", "/api/contacts", {
      name: name.value,
      phone: fullPhone(),
      relationship: form.querySelector("input[name=relation]:checked").value,
    }).then(function () {
      location.href = "home.html";
    }).catch(function (err) {
      button.disabled = false;
      InCase.showFieldError(name, err.fields.name);
      InCase.showFieldError(phone, err.fields.phone);
      InCase.flash(document.getElementById("form-error"), err.fields.name || err.fields.phone ? "" : err.message, true);
    });
  });
})();
