(function () {
  "use strict";

  var screen = document.querySelector(".screen.tour");
  if (!screen) return;

  // Which page are we on? (1, 2, or 3)
  var page = parseInt(screen.getAttribute("data-tour-page") || "1", 10);
  var PREV = { 2: "step1.html", 3: "step2.html" };
  var NEXT = { 1: "step2.html", 2: "step3.html", 3: "step4.html" };

  function goNext() { if (NEXT[page]) location.href = NEXT[page]; }
  function goPrev() { if (PREV[page]) location.href = PREV[page]; }

  // Keyboard nav
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
  });

  // Dot navigation
  document.querySelectorAll(".dots span").forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      var target = "step" + (i + 1) + ".html";
      if (i + 1 !== page) location.href = target;
    });
  });

  // Touch swipe
  var startX = 0, startY = 0, moved = false;

  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    moved = true;
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (!moved) return;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    // Only count horizontal swipes that are more horizontal than vertical
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }, { passive: true });
})();
