(function () {
  "use strict";
  document.querySelectorAll(".toggle-pw, #toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var row = btn.closest(".row");
      var input = row ? row.querySelector("input") : document.getElementById("password");
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      for (var i = 0; i < btn.childNodes.length; i++) {
        var node = btn.childNodes[i];
        if (node.nodeType === 3 && node.nodeValue.trim()) {
          node.nodeValue = show ? " Hide" : " Show";
          break;
        }
      }
    });
  });
})();
