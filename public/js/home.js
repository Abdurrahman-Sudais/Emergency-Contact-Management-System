(function () {
  "use strict";
  var el = InCase.el;
  var $ = function (id) { return document.getElementById(id); };

  document.querySelectorAll(".today").forEach(function (p) { p.textContent = InCase.longDate(Date.now()); });

  InCase.session().then(function (s) {
    $("first-name").textContent = InCase.firstName(s.user.name);
  });

  if (new URLSearchParams(location.search).get("denied") === "1") {
    var main = document.querySelector("main");
    main.insertBefore(el("div", { className: "error-box error", role: "alert" }, ["That page is for administrators only."]), main.firstChild);
  }

  function roleOf(c) {
    return c.label || InCase.RELATIONSHIPS[c.relationship];
  }

  InCase.api("GET", "/api/home").then(function (data) {
    var contacts = data.contacts;

    if (!contacts.length) {
      $("dash-grid").hidden = true;
      $("no-contacts").hidden = false;
    } else {
      $("dash-grid").hidden = false;
      var first = contacts[0];
      $("hero-name").textContent = first.name;
      $("hero-meta").textContent = roleOf(first) + " · " + InCaseValidate.formatPhone(first.phone);
      $("hero-call").href = "tel:" + first.phone;
      $("hero-call").querySelector("span").textContent = "Call " + InCase.firstName(first.name);
      if (!first.verified) {
        $("hero-badge").className = "badge grey";
        $("hero-badge").textContent = "Needs review";
      }

      var list = $("side-list");
      list.textContent = "";
      contacts.slice(1, 3).forEach(function (c, i) {
        list.appendChild(el("div", { className: "card contact-row" }, [
          el("span", { className: "num" }, [InCase.pad2(i + 2)]),
          el("div", { className: "who" }, [el("b", {}, [c.name]), el("span", { className: "muted" }, [roleOf(c)])]),
          el("a", { href: "tel:" + c.phone, className: "btn btn-small", "aria-label": "Call " + c.name }, [InCase.icon("phone"), " Call"]),
        ]));
      });
      if (contacts.length < 3) {
        list.appendChild(el("a", { href: "contacts.html", className: "card contact-row add-row" }, [
          el("span", { className: "num" }, [InCase.pad2(contacts.length + 1)]),
          el("span", { className: "who muted" }, ["Add another contact"]),
          InCase.icon("plus"),
        ]));
      } else if (contacts.length > 3) {
        list.appendChild(el("a", { href: "contacts.html", className: "more-link" }, ["See all " + contacts.length + " contacts →"]));
      }
    }

    var done = data.readiness.filter(function (r) { return r.done; }).length;
    var left = data.readiness.length - done;
    $("ready-count").textContent = done + " of " + data.readiness.length + " done";
    $("things-left").textContent = left ? left + " thing" + (left === 1 ? "" : "s") + " left to finish your setup." : "Your setup is complete.";
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
      activity.appendChild(el("li", {}, [el("time", {}, [InCase.shortDate(e.at)]), " " + e.text]));
    });
  }).catch(function (err) {
    alert(err.message);
  });
})();
