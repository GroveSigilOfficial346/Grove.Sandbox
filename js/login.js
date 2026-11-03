import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const loginForm = $("login-form");
  const registerForm = $("register-form");
  const loginPanel = $("login-panel");
  const registerPanel = $("register-panel");
  const message = $("auth-message");
  const showRegister = $("show-register");
  const showLogin = $("show-login");

  if (
    !loginForm || !registerForm ||
    !loginPanel || !registerPanel ||
    !message || !showRegister || !showLogin
  ) {
    console.error("Grove: Account page elements are missing.");
    return;
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff8585" : "#05c9f4";
  }

  function setLoading(form, loading) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = loading;
  }

  function showPanel(panel) {
    const register = panel === "register";

    loginPanel.hidden = register;
    registerPanel.hidden = !register;
    showMessage("");

    if (register) {
      history.replaceState(null, "", "#register");
    } else {
      history.replaceState(null, "", location.pathname);
    }
  }

  function validUsername(username) {
    return /^[a-z0-9_]{3,30}$/.test(username);
  }

  function validPassword(password) {
    return (
      password.length >= 8 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password)
    );
  }

  showRegister.addEventListener("click", () => {
    showPanel("register");
  });

  showLogin.addEventListener("click", () => {
    showPanel("login");
  });

  // Open the correct panel when arriving through a homepage link.
  if (location.hash === "#register") {
    showPanel("register");
  }

  // LOGIN
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("login-email").value.trim();
    const password = $("login-password").value;

    setLoading(loginForm, true);
    showMessage("Signing in...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data.user) throw new Error("Authentication failed.");

      showMessage("Welcome back. Opening Grove...");
      window.location.replace("/profile.html");

    } catch (error) {
      console.error("Grove login:", error);
      showMessage(error.message || "Unable to sign in.", true);

    } finally {
      setLoading(loginForm, false);
    }
  });

  // REGISTRATION
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = $("register-username").value.trim().toLowerCase();
    const email = $("register-email").value.trim();
    const password = $("register-password").value;

    if (!validUsername(username)) {
      showMessage(
        "Username must be 3–30 characters using lowercase letters, numbers, or underscores.",
        true
      );
      return;
    }

    if (!validPassword(password)) {
      showMessage(
        "Password needs at least 8 characters, including uppercase, lowercase, and a number.",
        true
      );
      return;
    }

    setLoading(registerForm, true);
    showMessage("Creating your Grove account...");

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username
          },
          emailRedirectTo: `${window.location.origin}/profile.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        showMessage("Account created. Opening Grove...");
        window.location.replace("/profile.html");
        return;
      }

      showMessage(
        "Account created. Check your email to verify your address. You can log in after confirmation."
      );

      registerForm.reset();

    } catch (error) {
      console.error("Grove registration:", error);
      showMessage(error.message || "Unable to create your account.", true);

    } finally {
      setLoading(registerForm, false);
    }
  });

  // Existing authenticated session
  (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data.session) {
        window.location.replace("/profile.html");
      }
    } catch (error) {
      console.error("Grove session check:", error);
    }
  })();

  console.info("Grove account access initialized.");
})();
