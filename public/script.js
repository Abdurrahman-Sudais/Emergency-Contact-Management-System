// Contact drawer script

const drawer = document.getElementById("drawer");
const openBtn = document.getElementById("open-drawer");
const cancelBtn = document.querySelector(".close-drawer");

openBtn.addEventListener("click", function () {
  drawer.classList.add("open");
});

cancelBtn.addEventListener("click", function () {
  drawer.classList.remove("open");
});