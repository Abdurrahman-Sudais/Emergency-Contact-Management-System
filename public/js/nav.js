(function () {
  "use strict";

  if (window.lucide) lucide.createIcons();

  BeSafe.session().then(function (s) {
    if (!s.user) return;
    var user = s.user;

    document.querySelectorAll(".user").forEach(function (box) {
      var name = box.querySelector(".user-name");
      if (name) name.textContent = user.name;
    });

    BeSafe.paintAvatars(user);

    if (user.role === "admin") {
      document.querySelectorAll(".admin-only").forEach(function (a) {
        a.hidden = false;
      });
    } else {
      document.querySelectorAll('a[href="admin.html"]').forEach(function (a) {
        a.remove();
      });
    }
  });

  document.querySelectorAll('a[href="login.html"]').forEach(function (link) {
    if (!link.closest(".user")) return;
    link.addEventListener("click", function (e) {
      e.preventDefault();
      BeSafe.api("POST", "/api/logout").finally(function () { location.href = "login.html?out=1"; });
    });
  });
})();
