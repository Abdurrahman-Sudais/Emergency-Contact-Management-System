(function () {
  "use strict";

  if (window.lucide) lucide.createIcons();

  InCase.session().then(function (s) {
    if (!s.user) return;
    var user = s.user;

    document.querySelectorAll(".user").forEach(function (box) {
      var avatar = box.querySelector(".avatar");
      var name = box.querySelector(".user-name");
      if (avatar) avatar.textContent = InCase.initials(user.name);
      if (name) name.textContent = user.name;
    });

    if (user.role !== "admin") {
      document.querySelectorAll('a[href="admin.html"]').forEach(function (a) { a.remove(); });
    }
  });

  document.querySelectorAll('a[href="login.html"]').forEach(function (link) {
    if (!link.closest(".user")) return;
    link.addEventListener("click", function (e) {
      e.preventDefault();
      InCase.api("POST", "/api/logout").finally(function () { location.href = "login.html?out=1"; });
    });
  });
})();
