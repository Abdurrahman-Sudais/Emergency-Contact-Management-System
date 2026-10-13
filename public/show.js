const pw = document.getElementById("password");
document.getElementById("toggle").addEventListener("click", () => {
  if (pw.type === "password") {
    pw.type = "text";
  } else {
    pw.type = "password";
  }
});
