(function () {
  "use strict";
  var el = BeSafe.el;
  var $ = function (id) { return document.getElementById(id); };

  document.querySelectorAll(".today").forEach(function (p) { p.textContent = BeSafe.longDate(Date.now()); });

  BeSafe.session().then(function (s) {
    $("first-name").textContent = BeSafe.firstName(s.user.name);
  });

  if (new URLSearchParams(location.search).get("denied") === "1") {
    var main = document.querySelector("main");
    main.insertBefore(el("div", { className: "error-box error", role: "alert" }, ["That page is for administrators only."]), main.firstChild);
  }

  function roleOf(c) {
    return c.label || BeSafe.RELATIONSHIPS[c.relationship];
  }

  BeSafe.api("GET", "/api/home").then(function (data) {
    var contacts = data.contacts;

    if (!contacts.length) {
      $("dash-grid").hidden = true;
      $("no-contacts").hidden = false;
    } else {
      $("dash-grid").hidden = false;
      var first = contacts[0];
      $("hero-name").textContent = first.name;
      $("hero-meta").textContent = roleOf(first) + " · " + BeSafeValidate.formatPhone(first.phone);
      $("hero-call").href = "tel:" + first.phone;
      $("hero-call").querySelector("span").textContent = "Call " + BeSafe.firstName(first.name);
      var badge = $("hero-badge");
      if (first.verified) {
        var checked = BeSafeCallCheck.badge(first);
        checked.id = "hero-badge";
        badge.replaceWith(checked);
      } else {
        var check = BeSafeCallCheck.button(first, function () { location.reload(); });
        check.id = "hero-badge";
        check.classList.add("hero-badge-verify");
        badge.replaceWith(check);
        if (BeSafeCallCheck.isPending(first)) {
          check.closest(".hero-card").appendChild(BeSafeCallCheck.prompt(first, {
            done: function () { location.reload(); },
            failed: function () { location.href = "contacts.html"; },
            error: function (text) { alert(text); },
          }));
        }
      }

      var list = $("side-list");
      list.textContent = "";
      contacts.slice(1, 3).forEach(function (c, i) {
        list.appendChild(el("div", { className: "card contact-row" }, [
          el("span", { className: "num" }, [BeSafe.pad2(i + 2)]),
          el("div", { className: "who" }, [el("b", {}, [c.name]), el("span", { className: "muted" }, [roleOf(c)])]),
          el("a", { href: "tel:" + c.phone, className: "btn btn-small", "aria-label": "Call " + c.name }, [BeSafe.icon("phone"), " Call"]),
        ]));
      });
      if (contacts.length < 3) {
        list.appendChild(el("a", { href: "contacts.html", className: "card contact-row add-row" }, [
          el("span", { className: "num" }, [BeSafe.pad2(contacts.length + 1)]),
          el("span", { className: "who muted" }, ["Add another contact"]),
          BeSafe.icon("plus"),
        ]));
      } else if (contacts.length > 3) {
        list.appendChild(el("a", { href: "contacts.html", className: "more-link" }, ["See all " + contacts.length + " contacts →"]));
      }
    }

    var done = data.readiness.filter(function (r) { return r.done; }).length;
    $("ready-count").textContent = done + " of " + data.readiness.length + " done";
    var checklist = $("checklist");
    checklist.textContent = "";
    data.readiness.forEach(function (item) {
      checklist.appendChild(el("li", {}, [
        el("span", { className: "tick" + (item.done ? " done" : "") }, [item.done ? el("img", { src: "images/check.png", alt: "done" }) : null]),
        item.done ? item.label : el("a", { href: item.href }, [item.label]),
      ]));
    });

    var activity = $("activity");
    activity.textContent = "";
    if (!data.activity.length) activity.appendChild(el("li", { className: "muted" }, ["Nothing yet."]));
    data.activity.forEach(function (e) {
      activity.appendChild(el("li", {}, [el("time", {}, [BeSafe.shortDate(e.at)]), " " + e.text]));
    });
  }).catch(function (err) {
    alert(err.message);
  });
})();
