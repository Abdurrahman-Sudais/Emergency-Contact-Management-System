(function () {
  "use strict";
  var el = BeSafe.el;
  var $ = function (id) { return document.getElementById(id); };
  var query = "";

  function message(text) {
    BeSafe.flash($("page-message"), text);
  }

  function badge(state) {
    if (state === "active") return el("span", { className: "badge green" }, [el("img", { src: "images/check.png", alt: "" }), " Active"]);
    if (state === "locked") return el("span", { className: "badge red" }, [el("img", { src: "images/b_lock.png", alt: "" }), " Locked"]);
    return el("span", { className: "badge grey" }, [el("img", { src: "images/x.png", alt: "" }), " Suspended"]);
  }

  function act(url, data) {
    BeSafe.api("POST", url, data).then(function (res) {
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
      el("td", { className: "muted" }, [a.lastLogin ? BeSafe.shortDate(a.lastLogin) : "Never"]),
      el("td", {}, [action]),
    ]);
  }

  function drawSupport(requests) {
    var list = $("support-list");
    list.textContent = "";
    $("support-card").hidden = !requests.length;
    $("support-count").textContent = requests.length;
    requests.forEach(function (r) {
      var actions = [];
      var status = "No account uses this email.";
      if (r.account) {
        status = "Account: " + { active: "active", locked: "locked", suspended: "suspended" }[r.account.state];
        if (r.account.state === "locked" || r.account.state === "suspended") {
          var fix = r.account.state === "locked" ? ["unlock", "Unlock account"] : ["reinstate", "Reinstate account"];
          var fixBtn = el("button", { type: "button", className: "btn btn-small btn-dark" }, [fix[1]]);
          fixBtn.addEventListener("click", function () {
            if (!confirm(fix[1] + " for " + r.email + "? Make sure the request is genuine first.")) return;
            act("/api/admin/users/" + r.account.id + "/" + fix[0]);
          });
          actions.push(fixBtn);
        }
      }
      actions.push(el("a", { className: "btn btn-small", href: "mailto:" + r.email + "?subject=" + encodeURIComponent("Your BeSafe request") }, ["Reply by email"]));
      var done = el("button", { type: "button", className: "btn btn-small" }, ["Mark resolved"]);
      done.addEventListener("click", function () { act("/api/admin/support/" + r.id + "/resolve"); });
      actions.push(done);

      list.appendChild(el("li", {}, [
        el("b", {}, [r.name]), " · " + r.email,
        el("span", { className: "meta" }, [BeSafe.shortDate(r.at) + " · " + status]),
        el("p", { className: "msg" }, [r.message]),
        el("div", { className: "support-actions" }, actions),
      ]));
    });
  }

  function drawReviewed(requests) {
    var list = $("reviewed-list");
    list.textContent = "";
    if (!requests.length) list.appendChild(el("li", { className: "muted" }, ["Nothing reviewed yet."]));
    requests.forEach(function (r) {
      var msg = el("p", { className: "msg" }, [r.message]);
      var item = el("li", {}, [
        el("div", { className: "reviewed-head" }, [
          el("b", {}, [r.name]),
          el("span", { className: "badge green" }, [el("img", { src: "images/check.png", alt: "" }), " Resolved"]),
        ]),
        el("span", { className: "meta email" }, [r.email]),
        msg,
        el("small", {}, ["By " + r.resolvedBy + " · " + BeSafe.shortDate(r.resolvedAt).toUpperCase()]),
      ]);
      item.tabIndex = 0;
      item.setAttribute("aria-expanded", "false");
      function toggle() {
        var open = item.classList.toggle("open");
        item.setAttribute("aria-expanded", String(open));
      }
      item.addEventListener("click", toggle);
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
      list.appendChild(item);
    });
  }

  function load() {
    BeSafe.api("GET", "/api/admin?" + new URLSearchParams({ q: query })).then(function (data) {
      $("stat-users").textContent = data.stats.registered;
      $("stat-active").textContent = data.stats.activeThisWeek;
      $("stat-locked").textContent = data.stats.locked;

      var body = $("accounts");
      body.textContent = "";
      if (!data.accounts.length) body.appendChild(el("tr", {}, [el("td", { colSpan: 5, className: "muted" }, ["No accounts match."])]));
      data.accounts.forEach(function (a) { body.appendChild(row(a)); });

      drawSupport(data.support || []);
      drawReviewed(data.reviewed || []);

      var log = $("audit-log");
      log.textContent = "";
      if (!data.log.length) log.appendChild(el("li", { className: "muted" }, ["No security events yet."]));
      data.log.forEach(function (e) {
        log.appendChild(el("li", {}, [
          el("b", {}, [e.title]), " · " + e.who + (e.detail ? " → " + e.detail : ""),
          el("small", {}, [BeSafe.shortDate(e.at).toUpperCase()]),
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
