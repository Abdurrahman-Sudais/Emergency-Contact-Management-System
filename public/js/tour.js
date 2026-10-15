(function () {
  "use strict";

  var screen = document.getElementById("tour-screen");
  var track = document.getElementById("tour-track");
  var slider = document.getElementById("tour-slider");
  var dots = document.querySelectorAll("#tour-dots span");
  if (!screen || !track || !slider) return;

  var totalSteps = 3;
  var currentStep = parseInt(screen.getAttribute("data-step") || "0", 10);
  if (isNaN(currentStep) || currentStep < 0 || currentStep >= totalSteps) currentStep = 0;

  function updateDots(step) {
    dots.forEach(function (dot, i) {
      dot.classList.toggle("on", i === step);
      if (i === step) {
        dot.setAttribute("aria-current", "step");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function goToStep(step, animate) {
    if (step < 0) step = 0;
    if (step >= totalSteps) {
      location.href = "step4.html";
      return;
    }
    currentStep = step;
    screen.setAttribute("data-step", String(step));

    if (animate) {
      track.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
    } else {
      track.style.transition = "none";
    }
    track.style.transform = "translateX(" + (-step * 100) + "%)";
    updateDots(step);

    var targetUrl = "step" + (step + 1) + ".html";
    if (location.pathname.indexOf(targetUrl) === -1) {
      try {
        history.pushState({ step: step }, "", targetUrl);
      } catch (e) {}
    }
  }

  // Next buttons inside slides
  document.querySelectorAll(".next-tour-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      goToStep(currentStep + 1, true);
    });
  });

  // Dots click navigation
  dots.forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      goToStep(i, true);
    });
  });

  // Keyboard navigation
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") {
      goToStep(currentStep + 1, true);
    } else if (e.key === "ArrowLeft") {
      goToStep(currentStep - 1, true);
    }
  });

  // Browser back / forward buttons
  window.addEventListener("popstate", function (e) {
    if (e.state && typeof e.state.step === "number") {
      goToStep(e.state.step, true);
    } else {
      var match = location.pathname.match(/step([1-3])\.html/);
      if (match) {
        goToStep(parseInt(match[1], 10) - 1, true);
      }
    }
  });

  // Touch swipe support
  var startX = 0;
  var startY = 0;
  var deltaX = 0;
  var deltaY = 0;
  var isSwiping = false;
  var isHorizontal = null;

  slider.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    deltaX = 0;
    deltaY = 0;
    isSwiping = true;
    isHorizontal = null;
    track.style.transition = "none";
  }, { passive: true });

  slider.addEventListener("touchmove", function (e) {
    if (!isSwiping || e.touches.length !== 1) return;
    deltaX = e.touches[0].clientX - startX;
    deltaY = e.touches[0].clientY - startY;

    if (isHorizontal === null) {
      isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8;
    }

    if (isHorizontal) {
      if (e.cancelable) e.preventDefault();
      var resistance = 1;
      if ((currentStep === 0 && deltaX > 0) || (currentStep === totalSteps - 1 && deltaX < 0)) {
        resistance = 0.3;
      }
      var percentOffset = -currentStep * 100;
      track.style.transform = "translateX(calc(" + percentOffset + "% + " + (deltaX * resistance) + "px))";
    }
  }, { passive: false });

  slider.addEventListener("touchend", function () {
    if (!isSwiping) return;
    isSwiping = false;
    var threshold = 45;
    if (isHorizontal && deltaX < -threshold) {
      goToStep(currentStep + 1, true);
    } else if (isHorizontal && deltaX > threshold) {
      goToStep(currentStep - 1, true);
    } else {
      goToStep(currentStep, true);
    }
  });

  // Mouse drag support for desktop testing
  var isMouseDown = false;
  var mouseStartX = 0;
  var mouseDeltaX = 0;

  slider.addEventListener("mousedown", function (e) {
    if (e.target.closest("a, button")) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    mouseDeltaX = 0;
    slider.classList.add("dragging");
    track.style.transition = "none";
  });

  window.addEventListener("mousemove", function (e) {
    if (!isMouseDown) return;
    mouseDeltaX = e.clientX - mouseStartX;
    var resistance = 1;
    if ((currentStep === 0 && mouseDeltaX > 0) || (currentStep === totalSteps - 1 && mouseDeltaX < 0)) {
      resistance = 0.3;
    }
    var percentOffset = -currentStep * 100;
    track.style.transform = "translateX(calc(" + percentOffset + "% + " + (mouseDeltaX * resistance) + "px))";
  });

  window.addEventListener("mouseup", function () {
    if (!isMouseDown) return;
    isMouseDown = false;
    slider.classList.remove("dragging");
    var threshold = 50;
    if (mouseDeltaX < -threshold) {
      goToStep(currentStep + 1, true);
    } else if (mouseDeltaX > threshold) {
      goToStep(currentStep - 1, true);
    } else {
      goToStep(currentStep, true);
    }
  });

  // Initial setup without animation
  goToStep(currentStep, false);
})();
