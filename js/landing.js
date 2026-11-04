(() => {
  "use strict";

  const loginButton = document.getElementById("login-button");
  const joinButton = document.getElementById("join-button");

  loginButton?.addEventListener("click", () => {
    window.location.href = "/login.html";
  });

  joinButton?.addEventListener("click", () => {
    window.location.href = "/login.html#register";
  });
})();
