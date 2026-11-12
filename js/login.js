import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const loginForm = $("login-form");
  const registerForm = $("register-form");
  const loginPanel = $("login-panel");
  const registerPanel = $("register-panel");
  const message = $("auth-message");
  const showRegister = $("show-register");
  const showLogin = $("show-login");
  const sessionNotice = $("session-notice");
  const accountType = $("register-account-type");
  const accountNote = $("register-account-note");

  const REMEMBER_KEY = "grove:remember-session";

  const ALLOWED_ACCOUNT_TYPES = new Set([
    "personal",
    "creator",
    "professional",
    "business",
    "organization",
    "adult"
  ]);

  if (
    !loginForm ||
    !registerForm ||
    !loginPanel ||
    !registerPanel ||
    !message ||
    !showRegister ||
    !showLogin ||
    !accountType
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

  function saveRememberChoice(checked) {
    try {
      if (checked) {
        localStorage.setItem(REMEMBER_KEY, "true");
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (error) {
      console.error("Grove could not save Remember me:", error);
    }
  }

  function loadRememberChoice() {
    try {
      return localStorage.getItem(REMEMBER_KEY) === "true";
    } catch {
      return false;
    }
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

  function updateAccountTypeNote() {
    if (!accountNote) return;

    if (accountType.value === "adult") {
      accountNote.textContent =
        "Adult accounts require an authorized age-verification review. Restricted features remain locked until access is verified.";
      return;
    }

    if (accountType.value === "creator") {
      accountNote.textContent =
        "For members publishing creative work and building an audience.";
      return;
    }

    if (accountType.value === "professional") {
      accountNote.textContent =
        "For professional identity, networking, and career activity.";
      return;
    }

    if (accountType.value === "business") {
      accountNote.textContent =
        "For businesses and commercial profiles.";
      return;
    }

    if (accountType.value === "organization") {
      accountNote.textContent =
        "For organizations, associations, and community groups.";
      return;
    }

    accountNote.textContent =
      "For individual members using Grove for everyday community activity.";
  }

  accountType.addEventListener("change", updateAccountTypeNote);

  showRegister.addEventListener("click", () => {
    showPanel("register");
  });

  showLogin.addEventListener("click", () => {
    showPanel("login");
  });

  $("login-remember").checked = loadRememberChoice();
  $("register-remember").checked = loadRememberChoice();

  updateAccountTypeNote();

  if (location.hash === "#register") {
    showPanel("register");
  }

  async function checkExistingSession() {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data.session && sessionNotice) {
        sessionNotice.hidden = false;

        if (location.hash === "#register") {
          showMessage(
            "You are currently signed in. Submitting a new registration will switch away from that account."
          );
        } else {
          showMessage(
            "You are already signed in. You can open your profile or sign in to another account."
          );
        }
      }
    } catch (error) {
      console.error("Grove session check:", error);
    }
  }

  // LOGIN
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    const remember = $("login-remember").checked;

    saveRememberChoice(remember);

    setLoading(loginForm, true);
    showMessage("Signing in...");

    try {
      const { data: existing } = await supabase.auth.getSession();

      if (existing?.session) {
        const { error: signOutError } =
          await supabase.auth.signOut({ scope: "local" });

        if (signOutError) throw signOutError;
      }

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;
      if (!data.user) {
        throw new Error("Authentication failed.");
      }

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
  registerForm.addEventListener("submit", async event => {
    event.preventDefault();

    const username =
      $("register-username").value.trim().toLowerCase();

    const email = $("register-email").value.trim();
    const password = $("register-password").value;
    const remember = $("register-remember").checked;
    const selectedAccountType = accountType.value;

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

    if (!ALLOWED_ACCOUNT_TYPES.has(selectedAccountType)) {
      showMessage("Choose a valid account type.", true);
      return;
    }

    saveRememberChoice(remember);

    setLoading(registerForm, true);
    showMessage("Creating your Grove account...");

    try {
      const { data: existing } = await supabase.auth.getSession();

      if (existing?.session) {
        const { error: signOutError } =
          await supabase.auth.signOut({ scope: "local" });

        if (signOutError) throw signOutError;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username,
            account_type: selectedAccountType
          },
          emailRedirectTo:
            `${window.location.origin}/profile.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        showMessage("Account created. Opening Grove...");
        window.location.replace("/profile.html");
        return;
      }

      showMessage(
        selectedAccountType === "adult"
          ? "Account created. Confirm your email. Adult access will remain restricted while verification is pending."
          : "Account created. Check your email to verify your address. You can log in after confirmation."
      );

      registerForm.reset();
      $("register-remember").checked = remember;
      updateAccountTypeNote();

    } catch (error) {
      console.error("Grove registration:", error);

      showMessage(
        error.message || "Unable to create your account.",
        true
      );

    } finally {
      setLoading(registerForm, false);
    }
  });

  checkExistingSession();

  console.info("Grove account access initialized.");
})();
