import { supabase, OWNER_EMAIL } from "./supabase.js";

const $ = id => document.getElementById(id);

const loginScreen = $("loginScreen");
const appShell = $("appShell");

let recoveryMode = false;

function message(text) {
  $("authMessage").textContent = text;
}

function showForm(formId) {
  ["loginForm", "signupForm", "forgotForm", "resetForm"].forEach(id => {
    $(id).classList.toggle("hidden", id !== formId);
  });

  $("showSignup").classList.toggle("hidden", formId !== "loginForm");
  $("showForgot").classList.toggle("hidden", formId !== "loginForm");
  $("showLogin").classList.toggle("hidden", formId === "loginForm");

  message("");
}

function showLoginScreen() {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function isOwner(user) {
  return user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
}

function showDashboard(user) {
  if (!isOwner(user)) return;

  recoveryMode = false;

  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  $("ownerLabel").textContent = user.email;
  $("settingsEmail").textContent = user.email;
}

function showRecoveryScreen() {
  recoveryMode = true;
  showLoginScreen();
  showForm("resetForm");
  message("Recovery link detected. Enter your new password below.");
}

async function rejectNonOwner() {
  await supabase.auth.signOut();
  showLoginScreen();
  showForm("loginForm");
  message("This account is not authorized.");
}

// AUTH SESSION LISTENER
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showRecoveryScreen();
    return;
  }

  if (event === "SIGNED_OUT") {
    recoveryMode = false;
    showLoginScreen();
    return;
  }

  if (session?.user && !recoveryMode) {
    if (isOwner(session.user)) {
      showDashboard(session.user);
    } else {
      rejectNonOwner();
    }
  }
});

// SIGN IN
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  if (email !== OWNER_EMAIL.toLowerCase()) {
    message("That email is not authorized.");
    return;
  }

  $("loginButton").disabled = true;
  message("Signing in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  $("loginButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  if (!isOwner(data.user)) {
    await rejectNonOwner();
    return;
  }

  showDashboard(data.user);
});

// CREATE OWNER ACCOUNT
$("signupForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;

  if (email !== OWNER_EMAIL.toLowerCase()) {
    message("Only the owner email can register.");
    return;
  }

  if (password.length < 8) {
    message("Password must contain at least 8 characters.");
    return;
  }

  $("signupButton").disabled = true;
  message("Creating account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://grovesandbox.vercel.app/"
    }
  });

  $("signupButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  if (data.session && isOwner(data.user)) {
    showDashboard(data.user);
  } else {
    showForm("loginForm");
    message("Account created. Check your email to confirm your account.");
  }
});

// REQUEST PASSWORD RESET
$("forgotForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("forgotEmail").value.trim().toLowerCase();

  if (email !== OWNER_EMAIL.toLowerCase()) {
    message("That email is not authorized.");
    return;
  }

  $("forgotButton").disabled = true;
  message("Sending recovery email...");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://grovesandbox.vercel.app/"
  });

  $("forgotButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  message("Recovery email sent. Open the newest email and follow its link.");
});

// SAVE NEW PASSWORD
$("resetForm").addEventListener("submit", async event => {
  event.preventDefault();

  const password = $("newPassword").value;
  const confirmation = $("confirmPassword").value;

  if (password.length < 8) {
    message("Password must contain at least 8 characters.");
    return;
  }

  if (password !== confirmation) {
    message("Your passwords do not match.");
    return;
  }

  $("resetButton").disabled = true;
  message("Saving your new password...");

  const { data, error } = await supabase.auth.updateUser({
    password
  });

  $("resetButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  $("newPassword").value = "";
  $("confirmPassword").value = "";

  recoveryMode = false;

  if (isOwner(data.user)) {
    showDashboard(data.user);
    message("Your new password has been saved.");
  } else {
    await supabase.auth.signOut();
    showLoginScreen();
    showForm("loginForm");
    message("Password updated. Sign in with your owner account.");
  }
});

// LOGIN SCREEN NAVIGATION
$("showSignup").addEventListener("click", () => {
  showForm("signupForm");
});

$("showLogin").addEventListener("click", () => {
  recoveryMode = false;
  showForm("loginForm");
});

$("showForgot").addEventListener("click", () => {
  $("forgotEmail").value = $("loginEmail").value || OWNER_EMAIL;
  showForm("forgotForm");
});

// SIGN OUT
$("logoutButton").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    message("Sign out failed: " + error.message);
    return;
  }

  recoveryMode = false;
  showLoginScreen();
  showForm("loginForm");
  message("Signed out.");
});

// RESTORE SESSION AND DETECT RECOVERY LINKS
async function initializeAuth() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  const recoveryInHash = hash.get("type") === "recovery";
  const recoveryInPkce = url.searchParams.has("code");

  if (recoveryInHash || recoveryInPkce) {
    showRecoveryScreen();
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showLoginScreen();

    if (recoveryMode) {
      showForm("resetForm");
      message("The recovery link could not be verified. Request a fresh link.");
    } else {
      showForm("loginForm");
      message("Session error: " + error.message);
    }

    return;
  }

  if (recoveryMode) {
    if (!data.session?.user) {
      message("The recovery link did not create a valid session. Request a fresh recovery email.");
    }

    return;
  }

  if (data.session?.user) {
    if (isOwner(data.session.user)) {
      showDashboard(data.session.user);
    } else {
      await rejectNonOwner();
    }
  } else {
    showLoginScreen();
    showForm("loginForm");
  }
}

initializeAuth();
