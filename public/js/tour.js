(function () {
  "use strict";

  var screen = document.querySelector(".screen.tour");
  if (!screen) return;

  var steps = Array.prototype.slice.call(document.querySelectorAll(".tour-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".dots span"));
  if (!steps.length) return;

  var DURATION = 300;
  var currentStep = stepFromUrl();
  var cleanupTimer = null;
  var leaving = null;

  function stepFromUrl() {
    var match = location.pathname.match(/step([1-3])(?:\.html)?$/);
    return match ? parseInt(match[1], 10) : 1;
  }

  function show(step) {
    steps.forEach(function (el, i) {
      var active = i + 1 === step;
      el.classList.toggle("active", active);
      el.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dots.forEach(function (dot, i) {
      var active = i + 1 === step;
      dot.classList.toggle("on", active);
      if (active) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
  }

  function finishLeaving() {
    clearTimeout(cleanupTimer);
    if (leaving) leaving.classList.remove("leaving-left", "leaving-right");
    leaving = null;
  }

  function goToStep(target, fromHistory) {
    if (target > steps.length) {
      location.href = "step4.html";
      return;
    }
    if (target < 1 || target === currentStep) return;

    finishLeaving();

    var forward = target > currentStep;
    var fromEl = steps[currentStep - 1];
    var toEl = steps[target - 1];
    currentStep = target;

    if (!fromHistory) {
      history.pushState({ step: target }, "", "step" + target + ".html");
    }

    toEl.classList.add("no-transition", forward ? "enter-from-right" : "enter-from-left");
    void toEl.offsetWidth;
    toEl.classList.remove("no-transition");

    fromEl.classList.add(forward ? "leaving-left" : "leaving-right");
    leaving = fromEl;
    show(target);
    toEl.classList.remove("enter-from-right", "enter-from-left");

    cleanupTimer = setTimeout(finishLeaving, DURATION);
  }

  show(currentStep);
  history.replaceState({ step: currentStep }, "", location.pathname);

  document.querySelectorAll(".tour-next-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      goToStep(currentStep + 1);
    });
  });

  dots.forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      goToStep(i + 1);
    });
    dot.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goToStep(i + 1);
      }
    });
  });

  window.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight") goToStep(currentStep + 1);
    else if (e.key === "ArrowLeft") goToStep(currentStep - 1);
  });

  window.addEventListener("popstate", function () {
    goToStep(stepFromUrl(), true);
  });

  var startX = 0;
  var startY = 0;
  var tracking = false;

  screen.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  screen.addEventListener("touchend", function (e) {
    if (!tracking || e.changedTouches.length !== 1) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
      goToStep(currentStep + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });
})();
