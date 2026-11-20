var BeSafeCallCheck = (function () {
  "use strict";
  var KEY = "incase-call-check";
  var el = BeSafe.el;

  function read() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function write(value) {
    try {
      if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
      else sessionStorage.removeItem(KEY);
    } catch (e) {}
  }

  function checkedLabel(c) {
    if (!c.verifiedAt) return "Checked";
    return "Checked " + new Date(c.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function badge(c) {
    return el("span", { className: "badge green", title: "You confirmed this number works" }, [
      el("img", { src: "images/check.png", alt: "" }), " " + checkedLabel(c),
    ]);
  }

  function button(c, onStart) {
    var link = el("a", {
      href: "tel:" + c.phone,
      className: "badge-verify call-check",
      title: "Call " + c.name + " to check the number works",
    }, ["Call to check"]);
    link.addEventListener("click", function () {
      write({ id: c.id, at: Date.now() });
      if (onStart) setTimeout(onStart, 400);
    });
    return link;
  }

  function isPending(c) {
    var p = read();
    return !!p && p.id === c.id && Date.now() - p.at < 60 * 60 * 1000;
  }

  function prompt(c, handlers) {
    var box = el("div", { className: "call-prompt", role: "group", "aria-label": "Did the call work?" });
    var yes = el("button", { type: "button", className: "btn btn-small btn-dark" }, ["Yes, it works"]);
    var no = el("button", { type: "button", className: "btn btn-small" }, ["No"]);
    var later = el("button", { type: "button", className: "link-btn" }, ["Not now"]);

    yes.addEventListener("click", function () {
      yes.disabled = no.disabled = true;
      BeSafe.api("POST", "/api/contacts/" + c.id + "/verify", {}).then(function () {
        write(null);
        handlers.done(c.name + "'s number is checked.");
      }).catch(function (err) {
        yes.disabled = no.disabled = false;
        handlers.error(err.message);
      });
    });
    no.addEventListener("click", function () {
      write(null);
      handlers.failed();
    });
    later.addEventListener("click", function () {
      write(null);
      box.remove();
    });

    box.appendChild(el("p", {}, [
      "Did " + BeSafe.firstName(c.name) + " answer on " + BeSafeValidate.formatPhone(c.phone) + "?",
    ]));
    box.appendChild(el("div", { className: "call-prompt-actions" }, [yes, no, later]));
    setTimeout(function () {
      if (box.isConnected) box.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return box;
  }

  return { badge: badge, button: button, prompt: prompt, isPending: isPending };
})();
