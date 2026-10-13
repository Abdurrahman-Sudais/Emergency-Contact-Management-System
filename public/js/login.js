(function () {
  "use strict";
  var form = document.getElementById("login-form");
  var email = document.getElementById("email");
  var password = document.getElementById("password");
  var errorBox = document.getElementById("login-error");
  var params = new URLSearchParams(location.search);

  var notices = {
    expired: "You were signed out after 15 minutes without activity. Please log in again.",
    out: "You have been signed out.",
    deleted: "Your account and all your contacts have been deleted.",
  };
  Object.keys(notices).forEach(function (key) {
    if (params.get(key) === "1") InCase.flash(document.getElementById("notice"), notices[key]);
  });

  document.getElementById("forgot").addEventListener("click", function (e) {
    e.preventDefault();
    document.getElementById("forgot-help").hidden = false;
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var problem = InCaseValidate.email(email.value) || (password.value ? null : "Error: enter your password.");
    if (problem) {
      InCase.flash(errorBox, problem, true);
      return;
    }
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    InCase.api("POST", "/api/login", {
      email: email.value,
      password: password.value,
      remember: document.getElementById("remember").checked,
      next: params.get("next") || "",
    }).then(function (res) {
      location.href = res.next;
    }).catch(function (err) {
      button.disabled = false;
      password.value = "";
      password.classList.add("invalid");
      InCase.flash(errorBox, err.message, true);
      password.focus();
    });
  });
})();
