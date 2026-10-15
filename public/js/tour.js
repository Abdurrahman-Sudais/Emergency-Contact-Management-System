(function () {
  "use strict";

  var screen = document.querySelector(".screen.tour");
  if (!screen) return;

  var steps = Array.prototype.slice.call(document.querySelectorAll(".tour-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".dots span"));
  if (!steps.length) return;

  var currentStep = parseInt(screen.getAttribute("data-tour-page") || "1", 10);
  if (isNaN(currentStep) || currentStep < 1 || currentStep > steps.length) {
    currentStep = 1;
  }

  var isTransitioning = false;

  function updateDots(step) {
    dots.forEach(function (dot, i) {
      var active = i + 1 === step;
      dot.classList.toggle("on", active);
      if (active) {
        dot.setAttribute("aria-current", "step");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function goToStep(targetStep, direction) {
    if (targetStep < 1) targetStep = 1;
    if (targetStep > steps.length) {
      location.href = "step4.html";
      return;
    }
    if (targetStep === currentStep || isTransitioning) return;

    isTransitioning = true;
    var fromStep = currentStep;
    var toStep = targetStep;
    currentStep = targetStep;

    var fromEl = steps[fromStep - 1];
    var toEl = steps[toStep - 1];

    if (!direction) {
      direction = toStep > fromStep ? "forward" : "back";
    }

    updateDots(currentStep);

    try {
      history.pushState({ step: currentStep }, "", "step" + currentStep + ".html");
    } catch (e) {}

    // Set initial position of entering element before animation
    toEl.classList.remove("fading-out-left", "fading-out-right");
    toEl.classList.add(direction === "forward" ? "entering-from-right" : "entering-from-left");

    // Force browser style calculation
    void toEl.offsetWidth;

    // Transition out previous step
    fromEl.classList.remove("active");
    fromEl.classList.add(direction === "forward" ? "fading-out-left" : "fading-out-right");

    // Transition in target step
    toEl.classList.remove("entering-from-right", "entering-from-left");
    toEl.classList.add("active");

    setTimeout(function () {
      fromEl.classList.remove("fading-out-left", "fading-out-right");
      isTransitioning = false;
    }, 300);
  }

  // Intercept Next buttons for step 1 & 2
  document.querySelectorAll(".tour-next-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      goToStep(currentStep + 1, "forward");
    });
  });

  // Dots click navigation
  dots.forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      var target = i + 1;
      if (target !== currentStep) {
        goToStep(target, target > currentStep ? "forward" : "back");
      }
    });
  });

  // Keyboard navigation
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") {
      goToStep(currentStep + 1, "forward");
    } else if (e.key === "ArrowLeft") {
      goToStep(currentStep - 1, "back");
    }
  });

  // Handle browser back and forward
  window.addEventListener("popstate", function (e) {
    var match = location.pathname.match(/step([1-3])\.html/);
    var target = match ? parseInt(match[1], 10) : (e.state && e.state.step ? e.state.step : 1);
    if (target !== currentStep) {
      goToStep(target, target > currentStep ? "forward" : "back");
    }
  });

  // Smooth swipe gestures on mobile
  var startX = 0;
  var startY = 0;
  var isSwiping = false;

  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (!isSwiping || e.changedTouches.length !== 1) return;
    isSwiping = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;

    // Must be predominantly horizontal swipe with at least 45px distance
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
      if (dx < 0) {
        goToStep(currentStep + 1, "forward");
      } else {
        goToStep(currentStep - 1, "back");
      }
    }
  }, { passive: true });
})();
