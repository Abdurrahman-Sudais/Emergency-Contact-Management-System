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
    if (params.get(key) === "1") BeSafe.flash(document.getElementById("notice"), notices[key]);
  });

  var googleProblems = {
    cancelled: "Google sign-in was cancelled.",
    failed: "Error: Google sign-in didn't work. Please try again.",
    suspended: "Error: this account is suspended. Contact an administrator.",
  };
  if (googleProblems[params.get("google")]) {
    BeSafe.flash(errorBox, googleProblems[params.get("google")], params.get("google") !== "cancelled");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var problem = BeSafeValidate.email(email.value) || (password.value ? null : "Error: enter your password.");
    if (problem) {
      BeSafe.flash(errorBox, problem, true);
      return;
    }
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    BeSafe.api("POST", "/api/login", {
      email: email.value,
      password: password.value,
      next: params.get("next") || "",
    }).then(function (res) {
      location.href = res.next;
    }).catch(function (err) {
      if (err.data && err.data.needsVerification) {
        location.href = "verify.html?email=" + encodeURIComponent(err.data.email);
        return;
      }
      button.disabled = false;
      password.value = "";
      password.classList.add("invalid");
      BeSafe.flash(errorBox, err.message, true);
      var help = document.getElementById("help-link");
      help.href = "support.html?email=" + encodeURIComponent(email.value.trim());
      help.classList.toggle("urgent", err.status === 403 || err.status === 423);
      password.focus();
    });
  });
})();
