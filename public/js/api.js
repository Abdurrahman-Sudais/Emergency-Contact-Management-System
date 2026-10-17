var InCase = (function () {
  "use strict";

  var sessionPromise = null;

  function session() {
    if (!sessionPromise) {
      sessionPromise = fetch("/api/session", { credentials: "same-origin" }).then(function (r) { return r.json(); });
    }
    return sessionPromise;
  }

  function api(method, url, data) {
    var ready = method === "GET" ? Promise.resolve(null) : session();
    return ready.then(function (s) {
      var options = { method: method, credentials: "same-origin", headers: {} };
      if (method !== "GET") {
        var isFile = data instanceof Blob;
        options.headers["Content-Type"] = isFile ? data.type : "application/json";
        options.headers["X-CSRF-Token"] = s.csrfToken;
        options.body = isFile ? data : JSON.stringify(data || {});
      }
      return fetch(url, options);
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.ok) return body;
        if (res.status === 401 && url !== "/api/login") {
          location.href = "login.html?expired=1&next=" + encodeURIComponent(location.pathname);
        }
        var err = new Error(body.error || "Something went wrong. Please try again.");
        err.status = res.status;
        err.fields = body.fields || {};
        err.data = body;
        throw err;
      });
    });
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "dataset") Object.assign(node.dataset, props[key]);
      else if (key in node) node[key] = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function icon(src) {
    return el("img", { src: "images/" + src + ".png", alt: "" });
  }

  function initials(name) {
    var parts = String(name || "").replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
  }

  function avatar(node, user) {
    if (!node || !user) return;
    node.textContent = "";
    if (user.photo) node.appendChild(el("img", { src: "/api/profile/photo?v=" + user.photo, alt: "" }));
    else node.textContent = initials(user.name);
  }

  function paintAvatars(user) {
    document.querySelectorAll(".user .avatar, #avatar-big, #profile-initials").forEach(function (node) {
      avatar(node, user);
    });
  }

  function firstName(name) {
    return String(name || "").replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(/\s+/)[0];
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  var RELATIONSHIPS = { family: "Family", friend: "Friend", doctor: "Doctor", neighbour: "Neighbour", work: "Work" };

  function longDate(ms) {
    return new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  function shortDate(ms) {
    var d = new Date(ms), today = new Date();
    var start = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var days = Math.round((start(today) - start(d)) / 864e5);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function showFieldError(input, message) {
    if (!input) return;
    var box = input.closest(".field, .fields, form").querySelector('[data-error-for="' + input.id + '"]');
    input.classList.toggle("invalid", !!message);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (box) {
      box.hidden = !message;
      var text = box.querySelector("span") || box;
      text.textContent = message || "";
    }
  }

  function flash(box, message, isError) {
    if (!box) return;
    box.hidden = !message;
    box.classList.toggle("error-box", !!isError);
    box.classList.toggle("error", !!isError);
    box.classList.toggle("flash", !isError);
    var text = box.querySelector("span") || box;
    text.textContent = message || "";
  }

  function resetSession() {
    sessionPromise = null;
  }

  return {
    session: session, resetSession: resetSession, api: api, el: el, icon: icon, initials: initials, avatar: avatar, paintAvatars: paintAvatars, firstName: firstName, pad2: pad2,
    RELATIONSHIPS: RELATIONSHIPS, longDate: longDate, shortDate: shortDate,
    showFieldError: showFieldError, flash: flash,
  };
})();
