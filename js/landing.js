/* =========================================
   GROVE — HOMEPAGE CONTROLS
   File: js/landing.js
========================================= */

(() => {
  "use strict";

  const loginButton = document.getElementById("login-button");
  const joinButton = document.getElementById("join-button");

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }

  if (joinButton) {
    joinButton.addEventListener("click", () => {
      window.location.href = "/login.html#register";
    });
  }

})();
