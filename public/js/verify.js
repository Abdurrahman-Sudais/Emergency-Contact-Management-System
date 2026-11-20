(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("verify-form");
  var codeInput = $("v-code");
  var resend = $("v-resend");
  var params = new URLSearchParams(location.search);
  var email = (params.get("email") || "").trim();

  if (!email) {
    location.replace("signup.html");
    return;
  }
  $("v-email").value = email;
  $("v-email-text").textContent = email;

  var countdown = null;
  function startTimer(seconds) {
    clearInterval(countdown);
    var left = seconds;
    resend.disabled = true;
    var tick = function () {
      if (left <= 0) {
        clearInterval(countdown);
        resend.disabled = false;
        $("v-timer").textContent = "";
        return;
      }
      $("v-timer").textContent = "(in " + left + "s)";
      left -= 1;
    };
    tick();
    countdown = setInterval(tick, 1000);
  }
  startTimer(60);

  codeInput.addEventListener("input", function () {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    if (codeInput.value.length === 6) form.requestSubmit();
  });

  var busy = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(codeInput.value)) {
      BeSafe.flash($("v-error"), "Error: enter the 6-digit code from the email.", true);
      return;
    }
    busy = true;
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    BeSafe.api("POST", "/api/verify-email", { email: email, code: codeInput.value }).then(function (res) {
      location.href = res.next;
    }).catch(function (err) {
      busy = false;
      button.disabled = false;
      codeInput.value = "";
      codeInput.focus();
      BeSafe.flash($("v-notice"), "");
      BeSafe.flash($("v-error"), err.message, true);
    });
  });

  resend.addEventListener("click", function () {
    resend.disabled = true;
    BeSafe.api("POST", "/api/verify-email/resend", { email: email }).then(function (res) {
      BeSafe.flash($("v-error"), "", true);
      BeSafe.flash($("v-notice"), res.message);
      startTimer(res.waitSeconds || 60);
    }).catch(function (err) {
      resend.disabled = false;
      BeSafe.flash($("v-error"), err.message, true);
    });
  });

  codeInput.focus();
})();
