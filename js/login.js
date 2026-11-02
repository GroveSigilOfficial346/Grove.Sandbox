import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  const loginPanel = document.getElementById("login-panel");
  const registerPanel = document.getElementById("register-panel");

  const showRegister = document.getElementById("show-register");
  const showLogin = document.getElementById("show-login");
  const message = document.getElementById("auth-message");

  if (
    !loginForm ||
    !registerForm ||
    !loginPanel ||
    !registerPanel ||
    !showRegister ||
    !showLogin ||
    !message
  ) {
    console.error("Grove login: required HTML elements are missing.");
    return;
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff8585" : "#05c9f4";
  }

  function setLoading(form, loading) {
    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = loading;
    }
  }

  showRegister.addEventListener("click", () => {
    loginPanel.hidden = true;
    registerPanel.hidden = false;
    showMessage("");
  });

  showLogin.addEventListener("click", () => {
    registerPanel.hidden = true;
    loginPanel.hidden = false;
    showMessage("");
  });

  // LOGIN
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    setLoading(loginForm, true);
    showMessage("Signing in...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data.user) throw new Error("Authentication failed.");

      showMessage("Signed in. Opening Grove...");
      window.location.assign("/profile.html");

    } catch (error) {
      console.error("Grove login failed:", error);
      showMessage(error.message || "Login failed.", true);

    } finally {
      setLoading(loginForm, false);
    }
  });

  // REGISTRATION
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      showMessage(
        "Use at least 8 characters, including uppercase, lowercase, and a number.",
        true
      );
      return;
    }

    setLoading(registerForm, true);
    showMessage("Creating your account...");

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/profile.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        showMessage("Account created. Opening Grove...");
        window.location.assign("/profile.html");
        return;
      }

      showMessage(
        "Account created. Check your email to verify your address before logging in."
      );

      registerForm.reset();

    } catch (error) {
      console.error("Grove registration failed:", error);
      showMessage(error.message || "Registration failed.", true);

    } finally {
      setLoading(registerForm, false);
    }
  });

  console.info("Grove account access initialized.");
})();
