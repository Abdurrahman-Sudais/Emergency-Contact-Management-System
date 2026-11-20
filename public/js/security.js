(function () {
  "use strict";
  BeSafe.session().then(function (s) {
    if (s.user) {
      BeSafe.api("POST", "/api/privacy-reviewed").catch(function () {});
    } else {
      document.querySelectorAll(".topnav .links, .tabbar").forEach(function (n) { n.hidden = true; });
      var user = document.querySelector(".topnav .user");
      user.textContent = "";
      user.appendChild(BeSafe.el("a", { href: "login.html" }, ["Log in"]));
    }
  });
})();
