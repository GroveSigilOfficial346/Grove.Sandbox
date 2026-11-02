/* =========================================
   GROVE — LOGIN PAGE CONTROLS
   File: js/login.js
========================================= */

import "./auth.js";

const loginPanel = document.getElementById("login-panel");
const registerPanel = document.getElementById("register-panel");
const message = document.getElementById("auth-message");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

function showLogin() {
  loginPanel.hidden = false;
  registerPanel.hidden = true;
  message.textContent = "";
}

function showRegister() {
  loginPanel.hidden = true;
  registerPanel.hidden = false;
  message.textContent = "";
}

// HOMEPAGE JOIN BUTTON SUPPORT
if (window.location.hash === "#register") {
  showRegister();
} else {
  showLogin();
}

// PANEL SWITCHING
document
  .getElementById("show-register")
  .addEventListener("click", showRegister);

document
  .getElementById("show-login")
  .addEventListener("click", showLogin);

// LOGIN SUBMISSION
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const button = loginForm.querySelector("button");

  button.disabled = true;
  button.textContent = "Signing In...";

  try {
    await window.GroveAuth.login(email, password);
  } finally {
    button.disabled = false;
    button.textContent = "Log In";
  }
});

// REGISTRATION SUBMISSION
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const button = registerForm.querySelector("button");

  button.disabled = true;
  button.textContent = "Creating Account...";

  try {
    await window.GroveAuth.register(email, password);
  } finally {
    button.disabled = false;
    button.textContent = "Join Grove";
  }
});

console.log("Grove: Login page initialized.");
