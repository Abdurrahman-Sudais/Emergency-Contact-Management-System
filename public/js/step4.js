(function () {
  "use strict";
  var V = BeSafeValidate;
  var form = document.getElementById("first-contact");
  var name = document.getElementById("name");
  var phone = document.getElementById("phone");
  var country = document.getElementById("country");

  function code() {
    var c = country.value.replace(/\s/g, "");
    return c.charAt(0) === "+" ? c : "+" + c;
  }

  function fullPhone() {
    var v = phone.value.trim();
    return v.charAt(0) === "+" ? v : code() + v.replace(/^0/, "");
  }

  function check() {
    var nameError = V.name(name.value);
    var codeError = phone.value.trim().charAt(0) === "+" ? null : V.countryCode(country.value);
    var phoneError = codeError || (phone.value.trim() ? V.phone(fullPhone()) : "Error: enter a phone number.");
    BeSafe.showFieldError(name, nameError);
    BeSafe.showFieldError(phone, phoneError);
    return !nameError && !phoneError;
  }

  name.addEventListener("blur", function () { if (name.value) BeSafe.showFieldError(name, V.name(name.value)); });
  phone.addEventListener("blur", function () { if (phone.value) BeSafe.showFieldError(phone, V.phone(fullPhone())); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check()) return;
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    BeSafe.api("POST", "/api/contacts", {
      name: name.value,
      phone: fullPhone(),
      relationship: form.querySelector("input[name=relation]:checked").value,
    }).then(function () {
      location.href = "home.html";
    }).catch(function (err) {
      button.disabled = false;
      BeSafe.showFieldError(name, err.fields.name);
      BeSafe.showFieldError(phone, err.fields.phone);
      BeSafe.flash(document.getElementById("form-error"), err.fields.name || err.fields.phone ? "" : err.message, true);
    });
  });
})();
