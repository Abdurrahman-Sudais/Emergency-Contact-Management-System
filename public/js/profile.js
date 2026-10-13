(function () {
  "use strict";
  var V = InCaseValidate;
  var $ = function (id) { return document.getElementById(id); };

  function said(form, text, isError) {
    InCase.flash(form.querySelector("[data-message]"), text, isError);
  }

  function showServerErrors(form, err, map) {
    Object.keys(map).forEach(function (key) { InCase.showFieldError($(map[key]), err.fields[key]); });
    said(form, Object.keys(err.fields).length ? "" : err.message, true);
  }

  function fill(p) {
    $("profile-name").textContent = p.name;
    var joined = new Date(p.joined).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    $("profile-meta").textContent = (p.role === "admin" ? "Admin" : "User") + " · joined " + joined;
    $("p-name").value = p.name;
    $("p-phone").value = p.phone;
    $("p-email").value = p.email;
    $("blood").value = p.medical.bloodGroup;
    $("allergies").value = p.medical.allergies;
  }

  function load() {
    return InCase.api("GET", "/api/profile").then(fill);
  }
  load();

  var details = $("details-form");
  details.addEventListener("submit", function (e) {
    e.preventDefault();
    var errors = {
      "p-name": V.name($("p-name").value),
      "p-email": V.email($("p-email").value),
      "p-phone": $("p-phone").value.trim() ? V.phone($("p-phone").value) : null,
    };
    Object.keys(errors).forEach(function (id) { InCase.showFieldError($(id), errors[id]); });
    if (errors["p-name"] || errors["p-email"] || errors["p-phone"]) return;

    InCase.api("PUT", "/api/profile/details", {
      name: $("p-name").value, phone: $("p-phone").value, email: $("p-email").value,
    }).then(function (res) {
      said(details, res.message);
      load();
      document.querySelectorAll(".user .user-name").forEach(function (n) { n.textContent = $("p-name").value.trim(); });
      refreshAvatars();
    }).catch(function (err) {
      showServerErrors(details, err, { name: "p-name", phone: "p-phone", email: "p-email" });
    });
  });

  var medical = $("medical-form");
  medical.addEventListener("submit", function (e) {
    e.preventDefault();
    InCase.api("PUT", "/api/profile/medical", {
      bloodGroup: $("blood").value, allergies: $("allergies").value,
    }).then(function (res) {
      said(medical, res.message);
    }).catch(function (err) {
      showServerErrors(medical, err, { allergies: "allergies" });
    });
  });

  var pw = $("password-form");
  pw.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = V.password($("new-pw").value);
    InCase.showFieldError($("new-pw"), msg);
    InCase.showFieldError($("old-pw"), $("old-pw").value ? null : "Error: enter your current password.");
    if (msg || !$("old-pw").value) return;

    InCase.api("PUT", "/api/profile/password", {
      currentPassword: $("old-pw").value, newPassword: $("new-pw").value,
    }).then(function (res) {
      pw.reset();
      said(pw, res.message);
      InCase.resetSession();
    }).catch(function (err) {
      showServerErrors(pw, err, { currentPassword: "old-pw", newPassword: "new-pw" });
    });
  });

  $("logout-btn").addEventListener("click", function () {
    InCase.api("POST", "/api/logout").finally(function () { location.href = "login.html?out=1"; });
  });

  $("delete-open").addEventListener("click", function () {
    $("delete-form").hidden = false;
    $("del-pw").focus();
  });
  $("delete-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!confirm("Delete your account and every contact? This can't be undone.")) return;
    InCase.api("DELETE", "/api/profile", { password: $("del-pw").value }).then(function () {
      location.href = "login.html?deleted=1";
    }).catch(function (err) {
      InCase.showFieldError($("del-pw"), err.message);
    });
  });

  var MAX_SIDE = 512;
  var MAX_FILE = 10 * 1024 * 1024;
  var TYPES = ["image/jpeg", "image/png", "image/webp"];
  var photoInput = $("photo-input");

  function refreshAvatars() {
    InCase.resetSession();
    return InCase.session().then(function (s) {
      InCase.paintAvatars(s.user);
      $("photo-remove").hidden = !s.user.photo;
    });
  }
  refreshAvatars();

  function photoError(message) {
    InCase.showFieldError(photoInput, message);
  }

  function shrink(file) {
    return createImageBitmap(file).then(function (img) {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error()); }, "image/jpeg", 0.9);
      });
    });
  }

  $("photo-change").addEventListener("click", function () {
    photoInput.click();
  });

  photoInput.addEventListener("change", function () {
    var file = photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    if (TYPES.indexOf(file.type) < 0) return photoError("Error: choose a JPG, PNG or WebP picture.");
    if (file.size > MAX_FILE) return photoError("Error: that picture is too big. Choose one under 10 MB.");
    photoError(null);
    $("photo-change").disabled = true;

    shrink(file).catch(function () {
      throw new Error("Error: that picture couldn't be opened. Try another one.");
    }).then(function (blob) {
      return InCase.api("PUT", "/api/profile/photo", blob);
    }).then(refreshAvatars).catch(function (err) {
      photoError(err.message);
    }).finally(function () {
      $("photo-change").disabled = false;
    });
  });

  $("photo-remove").addEventListener("click", function () {
    if (!confirm("Remove your profile photo?")) return;
    InCase.api("DELETE", "/api/profile/photo").then(refreshAvatars).catch(function (err) {
      photoError(err.message);
    });
  });
})();
