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
    "organization"
  ]);

  if (
    !loginForm ||
    !registerForm ||
    !loginPanel ||
    !registerPanel ||
    !message ||
    !showRegister ||
    !showLogin
  ) {
    console.error("Grove: Essential account page elements are missing.");
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
      console.error("Grove remember setting:", error);
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
    if (!accountType || !accountNote) return;

    const notes = {
      creator: "For members publishing creative work and building an audience.",
      professional: "For professional identity, networking, and career activity.",
      business: "For businesses and commercial profiles.",
      organization: "For organizations and community groups.",
      personal: "For individual members using Grove."
    };

    accountNote.textContent =
      notes[accountType.value] || notes.personal;
  }

  if (accountType) {
    accountType.addEventListener("change", updateAccountTypeNote);
  }

  showRegister.addEventListener("click", () => {
    showPanel("register");
  });

  showLogin.addEventListener("click", () => {
    showPanel("login");
  });

  const loginRemember = $("login-remember");
  const registerRemember = $("register-remember");

  if (loginRemember) {
    loginRemember.checked = loadRememberChoice();
  }

  if (registerRemember) {
    registerRemember.checked = loadRememberChoice();
  }

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

        showMessage(
          "You are already signed in. Open your profile or sign in to another account."
        );
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
    const remember = loginRemember?.checked || false;

    if (!email || !password) {
      showMessage("Enter your email and password.", true);
      return;
    }

    saveRememberChoice(remember);

    setLoading(loginForm, true);
    showMessage("Checking your Grove account...");

    try {
      const { data: existing, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

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
        throw new Error("Authentication failed. Please try again.");
      }

      showMessage("Welcome back. Opening Grove...");
      window.location.replace("/profile.html");

    } catch (error) {
      console.error("Grove login:", error);

      const errorMessage = error.message || "";

      if (
        errorMessage.toLowerCase().includes("invalid login credentials")
      ) {
        showMessage(
          "Incorrect email or password. Check your details and try again.",
          true
        );
      } else if (
        errorMessage.toLowerCase().includes("email not confirmed")
      ) {
        showMessage(
          "Please verify your email address before logging in.",
          true
        );
      } else if (
        errorMessage.toLowerCase().includes("fetch")
      ) {
        showMessage(
          "Unable to reach Grove authentication. Check your connection and try again.",
          true
        );
      } else {
        showMessage(
          errorMessage || "Unable to sign in. Please try again.",
          true
        );
      }

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
    const remember = registerRemember?.checked || false;

    const selectedAccountType = accountType?.value || "personal";

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
      const { data: existing, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

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
        "Account created. Check your email to verify your address before logging in."
      );

      registerForm.reset();

      if (registerRemember) {
        registerRemember.checked = remember;
      }

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

  console.info("Grove account access initialized successfully.");

})();
