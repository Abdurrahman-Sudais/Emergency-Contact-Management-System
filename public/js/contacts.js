(function () {
  "use strict";
  var V = InCaseValidate;
  var el = InCase.el;
  var $ = function (id) { return document.getElementById(id); };

  var state = { q: "", filter: "all", editing: null, contacts: [], total: 0 };
  var drawer = $("drawer");
  var form = $("contact-form");
  var fields = { name: $("c-name"), phone: $("c-phone"), label: $("c-label"), note: $("c-note") };

  function message(text) {
    InCase.flash($("page-message"), text);
    clearTimeout(message.timer);
    message.timer = setTimeout(function () { InCase.flash($("page-message"), ""); }, 3000);
  }

  function load() {
    var url = "/api/contacts?" + new URLSearchParams({ q: state.q, filter: state.filter });
    return InCase.api("GET", url).then(function (data) {
      state.contacts = data.contacts;
      state.total = data.counts.all;
      drawCounts(data.counts);
      drawList(data.contacts);
    }).catch(function (err) { message(err.message); });
  }

  function drawCounts(counts) {
    $("people-count").textContent = counts.all + (counts.all === 1 ? " person" : " people");
    var labels = { all: "All", family: "Family", friend: "Friends", doctor: "Medical", neighbour: "Neighbours", work: "Work", review: "Needs review" };
    document.querySelectorAll("#filters [data-filter]").forEach(function (btn) {
      var key = btn.getAttribute("data-filter");
      btn.textContent = labels[key] + " " + counts[key];
      btn.classList.toggle("active", key === state.filter);
      btn.setAttribute("aria-pressed", key === state.filter ? "true" : "false");
      btn.hidden = !counts[key] && key !== "all" && key !== "review" && key !== state.filter;
    });
  }

  function smallButton(label, src, onClick, disabled) {
    var b = el("button", { type: "button", className: "icon-btn", title: label, "aria-label": label, disabled: !!disabled }, [el("i", { dataset: { lucide: src } })]);
    b.addEventListener("click", onClick);
    return b;
  }

  function drawList(contacts) {
    var list = $("contact-list");
    list.textContent = "";
    list.hidden = !contacts.length;
    $("no-results").hidden = !!contacts.length;
    if (!contacts.length) {
      $("no-results").textContent = state.q || state.filter !== "all"
        ? "No contacts match. Try another name or number."
        : "Your list is empty. Add the people you'd want called in an emergency, in the order you'd call them.";
    }

    contacts.forEach(function (c) {
      var role = c.label || InCase.RELATIONSHIPS[c.relationship];
      list.appendChild(el("div", { className: "list-row" }, [
        el("span", { className: "num" }, [InCase.pad2(c.position)]),
        el("span", { className: "avatar" }, [InCase.initials(c.name)]),
        el("div", { className: "who" }, [
          el("b", {}, [c.name]),
          el("small", {}, [role + " · " + V.formatPhone(c.phone)]),
          c.note ? el("span", { className: "note" }, [c.note]) : null,
        ]),
        c.verified
          ? el("span", { className: "badge green" }, [el("img", { src: "images/check.png", alt: "" }), " Verified"])
          : el("span", { className: "badge grey" }, ["Needs review"]),
        el("div", { className: "row-actions" }, [
          el("a", { href: "tel:" + c.phone, className: "icon-btn", title: "Call", "aria-label": "Call " + c.name }, [el("i", { dataset: { lucide: "phone" } })]),
          smallButton("Move up", "chevron-up", function () { move(c, "up"); }, c.position === 1),
          smallButton("Move down", "chevron-down", function () { move(c, "down"); }, c.position === state.total),
          smallButton("Edit", "pencil", function () { openEdit(c); }),
          smallButton("Delete", "trash-2", function () { remove(c); }),
        ]),
      ]));
    });
    if (window.lucide) lucide.createIcons();
  }

  var timer;
  $("search").addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = $("search").value.trim(); load(); }, 300);
  });
  $("search-form").addEventListener("submit", function (e) {
    e.preventDefault();
    state.q = $("search").value.trim();
    load();
  });
  document.querySelectorAll("#filters [data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.filter = btn.getAttribute("data-filter");
      load();
    });
  });

  function move(c, direction) {
    InCase.api("POST", "/api/contacts/" + c.id + "/move", { direction: direction }).then(function () {
      message("Call order updated.");
      load();
    }).catch(function (err) { message(err.message); });
  }

  function remove(c) {
    if (!confirm("Remove " + c.name + " from your contacts?")) return;
    InCase.api("DELETE", "/api/contacts/" + c.id).then(function () {
      message(c.name + " removed.");
      load();
    }).catch(function (err) { message(err.message); });
  }

  function resetForm(c) {
    state.editing = c ? c.id : null;
    $("drawer-title").textContent = c ? "Edit contact" : "Add contact";
    fields.name.value = c ? c.name : "";
    fields.phone.value = c ? V.formatPhone(c.phone) : "";
    fields.label.value = c ? c.label : "";
    fields.note.value = c ? c.note : "";
    $("c-verified").checked = c ? c.verified : false;
    var rel = form.querySelector('input[name=rel][value="' + (c ? c.relationship : "family") + '"]');
    if (rel) rel.checked = true;
    Object.keys(fields).forEach(function (k) { InCase.showFieldError(fields[k], null); });
    InCase.flash($("drawer-error"), "", true);
  }

  function openEdit(c) {
    resetForm(c);
    drawer.classList.add("open");
    fields.name.focus();
  }

  $("open-drawer").addEventListener("click", function () {
    resetForm(null);
    setTimeout(function () { fields.name.focus(); }, 50);
  });

  var rules = { name: V.name, phone: V.phone, label: V.label, note: V.note };
  Object.keys(rules).forEach(function (k) {
    fields[k].addEventListener("blur", function () {
      if (fields[k].value) InCase.showFieldError(fields[k], rules[k](fields[k].value));
    });
    fields[k].addEventListener("input", function () {
      if (fields[k].classList.contains("invalid")) InCase.showFieldError(fields[k], rules[k](fields[k].value));
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = null;
    Object.keys(rules).forEach(function (k) {
      var msg = rules[k](fields[k].value);
      InCase.showFieldError(fields[k], msg);
      if (msg && !bad) bad = fields[k];
    });
    if (bad) return bad.focus();

    var data = {
      name: fields.name.value,
      phone: fields.phone.value,
      label: fields.label.value,
      note: fields.note.value,
      relationship: form.querySelector("input[name=rel]:checked").value,
      verified: $("c-verified").checked,
    };
    var request = state.editing
      ? InCase.api("PUT", "/api/contacts/" + state.editing, data)
      : InCase.api("POST", "/api/contacts", data);

    request.then(function () {
      drawer.classList.remove("open");
      message(state.editing ? "Contact updated." : "Contact saved.");
      load();
    }).catch(function (err) {
      Object.keys(fields).forEach(function (k) { InCase.showFieldError(fields[k], err.fields[k]); });
      InCase.flash($("drawer-error"), Object.keys(err.fields).length ? "" : err.message, true);
    });
  });

  load();
})();
