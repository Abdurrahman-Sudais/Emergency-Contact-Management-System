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

    if (state.filter === "review" && !contacts.length) {
      $("no-results").textContent = "All contacts are verified! Your emergency list is completely up to date.";
    }

    if (state.filter === "review" && contacts.length) {
      list.appendChild(el("div", { className: "filter-hint" }, [
        "Tap \"Call to check\" to ring a number and confirm it works."
      ]));
    }

    var canDrag = !state.q && state.filter === "all" && contacts.length > 1;
    if (contacts.length > 1 && !canDrag) {
      list.appendChild(el("div", { className: "filter-hint" }, [
        "Clear the search and filters to drag contacts into a new order."
      ]));
    }

    var draggedEl = null;
    var touchDraggingEl = null;

    function clearDragStyles() {
      list.querySelectorAll(".list-row").forEach(function (r) {
        r.classList.remove("drag-over-above", "drag-over-below");
      });
    }

    function saveNewOrder() {
      var rows = list.querySelectorAll(".list-row[data-id]");
      var ids = [];
      rows.forEach(function (r, index) {
        var id = parseInt(r.getAttribute("data-id"), 10);
        if (id) ids.push(id);
        var numEl = r.querySelector(".order-col .num");
        if (numEl) numEl.textContent = InCase.pad2(index + 1);
        var up = r.querySelector(".order-btns .order-btn:first-child");
        var down = r.querySelector(".order-btns .order-btn:last-child");
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === rows.length - 1;
      });

      if (ids.length !== state.total) return load();
      InCase.api("POST", "/api/contacts/reorder", { ids: ids }).then(function () {
        message("Call priority order updated.");
      }).catch(function (err) {
        message(err.message);
        load();
      });
    }

    contacts.forEach(function (c) {
      var role = c.label || InCase.RELATIONSHIPS[c.relationship];

      var dragHandle = el("span", {
        className: "drag-handle",
        hidden: !canDrag,
        title: "Drag to reorder call priority",
        "aria-label": "Drag " + c.name + " to reorder",
      }, [
        el("span", { className: "grip-dots" }, [
          el("span", {}), el("span", {}),
          el("span", {}), el("span", {}),
          el("span", {}), el("span", {}),
        ])
      ]);

      var upBtn = el("button", {
        type: "button",
        className: "order-btn",
        title: "Move up (calls earlier in emergency)",
        "aria-label": "Move " + c.name + " up",
        disabled: c.position === 1,
      }, ["▲"]);
      upBtn.addEventListener("click", function () { move(c, "up"); });

      var downBtn = el("button", {
        type: "button",
        className: "order-btn",
        title: "Move down (calls later)",
        "aria-label": "Move " + c.name + " down",
        disabled: c.position === state.total,
      }, ["▼"]);
      downBtn.addEventListener("click", function () { move(c, "down"); });

      var orderCol = el("div", { className: "order-col" }, [
        el("span", { className: "num" }, [InCase.pad2(c.position)]),
        el("div", { className: "order-btns" }, [upBtn, downBtn]),
      ]);

      var verifyEl = c.verified ? InCaseCallCheck.badge(c) : InCaseCallCheck.button(c, function () { drawList(state.contacts); });

      var row = el("div", {
        className: "list-row" + (canDrag ? " draggable-row" : ""),
        draggable: canDrag,
        dataset: { id: String(c.id) },
      }, [
        dragHandle,
        orderCol,
        el("span", { className: "avatar" }, [InCase.initials(c.name)]),
        el("div", { className: "who" }, [
          el("b", {}, [c.name]),
          el("small", {}, [role + " · " + V.formatPhone(c.phone).replace(/ /g, "\u00a0")]),
          c.note ? el("span", { className: "note" }, [c.note]) : null,
        ]),
        verifyEl,
        el("div", { className: "row-actions" }, [
          el("a", { href: "tel:" + c.phone, className: "icon-btn", title: "Call", "aria-label": "Call " + c.name }, [el("i", { dataset: { lucide: "phone" } })]),
          smallButton("Edit", "pencil", function () { openEdit(c); }),
          smallButton("Delete", "trash-2", function () { remove(c); }),
        ]),
      ]);

      if (!c.verified && InCaseCallCheck.isPending(c)) {
        row.appendChild(InCaseCallCheck.prompt(c, {
          done: function (text) { message(text); load(); },
          failed: function () { message("Check the number is right, then save it."); openEdit(c); },
          error: message,
        }));
      }

      if (!canDrag) {
        list.appendChild(row);
        return;
      }

      row.addEventListener("dragstart", function (e) {
        draggedEl = row;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(c.id)); } catch (err) {}
      });

      row.addEventListener("dragend", function () {
        row.classList.remove("dragging");
        clearDragStyles();
        draggedEl = null;
      });

      row.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (!draggedEl || draggedEl === row) return;
        e.dataTransfer.dropEffect = "move";
        var rect = row.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          row.classList.add("drag-over-above");
          row.classList.remove("drag-over-below");
        } else {
          row.classList.add("drag-over-below");
          row.classList.remove("drag-over-above");
        }
      });

      row.addEventListener("dragleave", function () {
        row.classList.remove("drag-over-above", "drag-over-below");
      });

      row.addEventListener("drop", function (e) {
        e.preventDefault();
        if (!draggedEl || draggedEl === row) return;
        var rect = row.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          list.insertBefore(draggedEl, row);
        } else {
          list.insertBefore(draggedEl, row.nextSibling);
        }
        clearDragStyles();
        saveNewOrder();
      });

      dragHandle.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        touchDraggingEl = row;
        row.classList.add("touch-dragging");
      }, { passive: true });

      dragHandle.addEventListener("touchmove", function (e) {
        if (!touchDraggingEl || e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        var clientY = e.touches[0].clientY;
        var element = document.elementFromPoint(e.touches[0].clientX, clientY);
        var targetRow = element ? element.closest(".list-row") : null;
        clearDragStyles();
        if (targetRow && targetRow !== touchDraggingEl) {
          var rect = targetRow.getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) {
            targetRow.classList.add("drag-over-above");
          } else {
            targetRow.classList.add("drag-over-below");
          }
        }
      }, { passive: false });

      dragHandle.addEventListener("touchend", function (e) {
        if (!touchDraggingEl) return;
        var clientY = e.changedTouches[0].clientY;
        var element = document.elementFromPoint(e.changedTouches[0].clientX, clientY);
        var targetRow = element ? element.closest(".list-row") : null;
        if (targetRow && targetRow !== touchDraggingEl) {
          var rect = targetRow.getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) {
            list.insertBefore(touchDraggingEl, targetRow);
          } else {
            list.insertBefore(touchDraggingEl, targetRow.nextSibling);
          }
          saveNewOrder();
        }
        touchDraggingEl.classList.remove("touch-dragging");
        clearDragStyles();
        touchDraggingEl = null;
      }, { passive: true });

      list.appendChild(row);
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
