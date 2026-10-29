(() => {
  "use strict";

  const API = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

  const $ = (selector) => document.querySelector(selector);

  const title = $("#auth-title");
  const subtitle = $("#auth-subtitle");
  const notice = $("#auth-notice");
  const tabs = $("#auth-tabs");
  const form = $("#auth-form");
  const displayNameField = $("#display-name-field");
  const displayName = $("#display-name");
  const emailInput = $("#email");
  const passwordInput = $("#password");
  const confirmPasswordInput = $("#confirm-password");
  const confirmPasswordField = $("#confirm-password-field");
  const passwordField = $("#password-field");
  const forgotRow = $("#forgot-password-row");
  const submitButton = $("#submit-button");
  const verificationPanel = $("#verification-panel");
  const recoveryPanel = $("#recovery-panel");
  const resendButton = $("#resend-confirmation");
  const backToLogin = $("#back-to-login");
  const recoveryForm = $("#recovery-form");

  let mode = "login";
  let pendingConfirmationEmail = "";
  let busy = false;
  let recoveryMode = false;

  const profileUrl = () => `${window.location.origin}/profile.html`;
  const homeUrl = () => `${window.location.origin}/`;

  function setNotice(message, kind = "info") {
    notice.textContent = message;
    notice.dataset.kind = kind;
  }

  function clearNotice() {
    notice.textContent = "";
    delete notice.dataset.kind;
  }

  function setBusy(value, button = submitButton) {
    busy = value;
    button.disabled = value;
    button.setAttribute("aria-busy", String(value));
  }

  function showPanel(panel) {
    form.hidden = panel !== "form";
    tabs.hidden = panel !== "form" || recoveryMode;
    verificationPanel.hidden = panel !== "verification";
    recoveryPanel.hidden = panel !== "recovery";
    forgotRow.hidden = panel !== "form" || mode !== "login";
    displayNameField.hidden = panel !== "form" || mode !== "signup";
    confirmPasswordField.hidden = panel !== "form" || mode !== "signup";
    passwordField.hidden = panel !== "form";
  }

  function setMode(nextMode, { clearMessage = true } = {}) {
    mode = nextMode;
    recoveryMode = false;

    showPanel("form");

    $("#login-tab").setAttribute("aria-selected", String(mode === "login"));
    $("#signup-tab").setAttribute("aria-selected", String(mode === "signup"));

    passwordInput.autocomplete =
      mode === "signup" ? "new-password" : "current-password";

    passwordInput.required = true;
    confirmPasswordInput.required = mode === "signup";
    displayName.required = false;

    if (mode === "signup") {
      title.textContent = "Join Grove";
      subtitle.textContent =
        "Create your account and connect with the community.";
      submitButton.textContent = "Create Account";
    } else {
      title.textContent = "Welcome Back";
      subtitle.textContent = "Sign in to continue to Grove.";
      submitButton.textContent = "Log In";
    }

    if (clearMessage) clearNotice();
  }

  function showVerification(email, message) {
    pendingConfirmationEmail = email;
    recoveryMode = false;
    title.textContent = "Check Your Email";
    subtitle.textContent = "One more step to enter Grove.";
    showPanel("verification");
    setNotice(message, "success");
  }

  function showRecovery() {
    recoveryMode = true;
    title.textContent = "Reset Password";
    subtitle.textContent =
      "Enter your email to receive a secure password-reset link.";

    showPanel("form");
    tabs.hidden = true;
    displayNameField.hidden = true;
    confirmPasswordField.hidden = true;
    forgotRow.hidden = true;
    passwordField.hidden = true;

    passwordInput.required = false;
    confirmPasswordInput.required = false;
    submitButton.textContent = "Send Reset Link";

    clearNotice();
  }

  function friendlyError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (message.includes("invalid login credentials")) {
      return "The email or password is incorrect.";
    }

    if (message.includes("email not confirmed")) {
      return "Please verify your email before logging in. You can request another confirmation email.";
    }

    if (message.includes("password should be at least")) {
      return "Your password must be at least 8 characters.";
    }

    if (message.includes("rate limit") || message.includes("too many requests")) {
      return "Too many attempts. Please wait a little while before trying again.";
    }

    if (message.includes("user already registered")) {
      return "An account with this email may already exist. Try logging in or requesting a password reset.";
    }

    if (message.includes("failed to fetch") || message.includes("network")) {
      return "Couldn't reach Grove right now. Check your connection and try again.";
    }

    return error?.message || "Something went wrong. Please try again.";
  }

  async function handleSignup() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const passwordConfirmation = confirmPasswordInput.value;
    const name = displayName.value.trim();

    if (password.length < 8) {
      setNotice("Use a password with at least 8 characters.", "error");
      return;
    }

    if (password !== passwordConfirmation) {
      setNotice("Your passwords do not match.", "error");
      confirmPasswordInput.focus();
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await window.groveSupabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: homeUrl(),
          data: { display_name: name }
        }
      });

      if (error) throw error;

      if (data.session) {
        setNotice(
          "Your account was created and you are signed in. Opening your profile…",
          "success"
        );

        window.setTimeout(() => {
          window.location.assign(profileUrl());
        }, 700);

        return;
      }

      showVerification(
        email,
        `Your account has been created. We requested a confirmation email for ${email}. Open the link in that email to verify your account before logging in.`
      );
    } catch (error) {
      setNotice(friendlyError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    setBusy(true);

    try {
      const { data, error } =
        await window.groveSupabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        if (String(error.message || "").toLowerCase().includes("email not confirmed")) {
          pendingConfirmationEmail = email;
          showPanel("verification");
          title.textContent = "Verify Your Email";
          subtitle.textContent = "Confirm your email before entering Grove.";
          resendButton.hidden = false;

          setNotice(
            "This account hasn't verified its email yet. Request another confirmation email below.",
            "error"
          );

          return;
        }

        throw error;
      }

      if (data.session) {
        setNotice("Login successful. Opening your profile…", "success");
        window.location.assign(profileUrl());
      }
    } catch (error) {
      setNotice(friendlyError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordResetRequest() {
    const email = emailInput.value.trim();

    if (!email) {
      setNotice("Enter your email address first.", "error");
      emailInput.focus();
      return;
    }

    setBusy(true);

    try {
      const { error } =
        await window.groveSupabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth.html?mode=reset`
        });

      if (error) throw error;

      setNotice(
        "If an account exists for that address, a password-reset email has been requested. Check your inbox and spam folder.",
        "success"
      );
    } catch (error) {
      setNotice(friendlyError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    const email = pendingConfirmationEmail || emailInput.value.trim();

    if (!email) {
      setNotice("Enter your email address first.", "error");
      emailInput.focus();
      return;
    }

    setBusy(true, resendButton);

    try {
      const { error } = await window.groveSupabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: homeUrl() }
      });

      if (error) throw error;

      pendingConfirmationEmail = email;

      setNotice(
        `A confirmation email has been requested for ${email}. Check your inbox and spam folder.`,
        "success"
      );
    } catch (error) {
      setNotice(friendlyError(error), "error");
    } finally {
      setBusy(false, resendButton);
    }
  }

  async function handleRecoverySubmit(event) {
    event.preventDefault();

    const newPassword = $("#new-password").value;
    const confirmNewPassword = $("#new-password-confirm").value;

    if (newPassword.length < 8) {
      setNotice("Use a password with at least 8 characters.", "error");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setNotice("Your passwords do not match.", "error");
      return;
    }

    const recoverySubmit = recoveryForm.querySelector("button[type='submit']");
    setBusy(true, recoverySubmit);

    try {
      const { error } = await window.groveSupabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      recoveryMode = false;
      setMode("login");
      showPanel("form");

      setNotice(
        "Your password has been updated. You can now log in.",
        "success"
      );
    } catch (error) {
      setNotice(friendlyError(error), "error");
    } finally {
      setBusy(false, recoverySubmit);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy) return;

    clearNotice();

    if (recoveryMode) {
      await handlePasswordResetRequest();
      return;
    }

    if (mode === "signup") {
      await handleSignup();
    } else {
      await handleLogin();
    }
  }

  function handleAuthState() {
    // The login handler owns redirects to avoid redirect loops.
  }

  async function initialize() {
    if (!window.supabase?.createClient) {
      setNotice(
        "Grove's authentication library could not load. Refresh the page or try again later.",
        "error"
      );
      submitButton.disabled = true;
      return;
    }

    window.groveSupabase = window.supabase.createClient(API, KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    form.addEventListener("submit", handleSubmit);
    recoveryForm.addEventListener("submit", handleRecoverySubmit);

    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button || busy) return;
      setMode(button.dataset.mode);
    });

    $("#forgot-password").addEventListener("click", showRecovery);
    resendButton.addEventListener("click", handleResendConfirmation);

    backToLogin.addEventListener("click", () => {
      setMode("login");
      showPanel("form");
    });

    window.groveSupabase.auth.onAuthStateChange(handleAuthState);

    const params = new URLSearchParams(window.location.search);

    if (params.get("mode") === "reset") {
      showRecovery();
    } else {
      setMode(params.get("mode") === "signup" ? "signup" : "login");
    }

    const { data, error } = await window.groveSupabase.auth.getSession();

    if (error) {
      setNotice(friendlyError(error), "error");
      return;
    }

    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );

    const authError = hashParams.get("error_description");

    if (authError) {
      setNotice(authError, "error");
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );
      return;
    }

    if (hashParams.get("type") === "recovery" && data.session) {
      recoveryMode = true;
      showPanel("recovery");
    } else if (hashParams.has("access_token") && data.session) {
      setNotice(
        "Your email link was accepted. You can now log in to Grove.",
        "success"
      );

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );
    }
  }

  initialize().catch((error) => {
    console.error("Grove authentication initialization:", error);

    setNotice(
      "Grove authentication couldn't initialize. Refresh the page and try again.",
      "error"
    );
  });
})();
