(function () {
  "use strict";
  var el = InCase.el;
  var $ = function (id) { return document.getElementById(id); };
  var query = "";

  function message(text) {
    InCase.flash($("page-message"), text);
  }

  function badge(state) {
    if (state === "active") return el("span", { className: "badge green" }, [el("img", { src: "images/check.png", alt: "" }), " Active"]);
    if (state === "locked") return el("span", { className: "badge red" }, [el("img", { src: "images/b_lock.png", alt: "" }), " Locked"]);
    return el("span", { className: "badge grey" }, [el("img", { src: "images/x.png", alt: "" }), " Suspended"]);
  }

  function act(url, data) {
    InCase.api("POST", url, data).then(function (res) {
      message(res.message);
      load();
    }).catch(function (err) {
      message(err.message);
      load();
    });
  }

  function row(a) {
    var role;
    if (a.isYou) {
      role = el("span", {}, [(a.role === "admin" ? "Admin" : "User") + " (you)"]);
    } else {
      role = el("select", { "aria-label": "Role for " + a.name }, [
        el("option", { value: "user", selected: a.role === "user" }, ["User"]),
        el("option", { value: "admin", selected: a.role === "admin" }, ["Admin"]),
      ]);
      role.addEventListener("change", function () {
        act("/api/admin/users/" + a.id + "/role", { role: role.value });
      });
    }

    var action = null;
    if (!a.isYou) {
      var kind = a.state === "suspended" ? ["reinstate", "Reinstate"] : a.state === "locked" ? ["unlock", "Unlock"] : ["suspend", "Suspend"];
      action = el("button", { type: "button", className: "btn btn-small" }, [kind[1]]);
      action.addEventListener("click", function () {
        if (kind[0] === "suspend" && !confirm("Suspend " + a.name + "? They will be signed out straight away.")) return;
        act("/api/admin/users/" + a.id + "/" + kind[0]);
      });
    }

    return el("tr", {}, [
      el("td", {}, [el("b", {}, [a.name]), el("br"), el("span", { className: "muted" }, [a.email])]),
      el("td", {}, [role]),
      el("td", {}, [badge(a.state)]),
      el("td", { className: "muted" }, [a.lastLogin ? InCase.shortDate(a.lastLogin) : "Never"]),
      el("td", {}, [action]),
    ]);
  }

  function load() {
    InCase.api("GET", "/api/admin?" + new URLSearchParams({ q: query })).then(function (data) {
      $("stat-users").textContent = data.stats.registered;
      $("stat-active").textContent = data.stats.activeThisWeek;
      $("stat-locked").textContent = data.stats.locked;

      var body = $("accounts");
      body.textContent = "";
      if (!data.accounts.length) body.appendChild(el("tr", {}, [el("td", { colSpan: 5, className: "muted" }, ["No accounts match."])]));
      data.accounts.forEach(function (a) { body.appendChild(row(a)); });

      var log = $("audit-log");
      log.textContent = "";
      if (!data.log.length) log.appendChild(el("li", { className: "muted" }, ["No security events yet."]));
      data.log.forEach(function (e) {
        log.appendChild(el("li", {}, [
          el("b", {}, [e.title]), " · " + e.who + (e.detail ? " → " + e.detail : ""),
          el("small", {}, [InCase.shortDate(e.at).toUpperCase()]),
        ]));
      });
    }).catch(function (err) { message(err.message); });
  }

  var timer;
  $("search").addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { query = $("search").value.trim(); load(); }, 300);
  });
  $("search-form").addEventListener("submit", function (e) { e.preventDefault(); });

  load();
})();
