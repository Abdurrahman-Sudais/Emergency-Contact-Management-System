(function () {
  "use strict";
  var block = document.getElementById("google-block");
  if (!block) return;

  BeSafe.session().then(function (s) {
    if (!s.google) return;
    var next = new URLSearchParams(location.search).get("next");
    if (next) document.getElementById("google-btn").href = "/api/auth/google?next=" + encodeURIComponent(next);
    block.hidden = false;
  });
})();
