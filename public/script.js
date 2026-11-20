const drawer = document.getElementById("drawer");
const openBtn = document.getElementById("open-drawer");
const cancelBtns = document.querySelectorAll(".close-drawer");

openBtn.addEventListener("click", function () {
  drawer.classList.add("open");
});

cancelBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    drawer.classList.remove("open");
  });
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") drawer.classList.remove("open");
});
