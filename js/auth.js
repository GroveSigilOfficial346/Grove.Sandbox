import { supabase, OWNER_EMAIL } from "./supabase.js";

const $ = id => document.getElementById(id);

const loginScreen = $("loginScreen");
const appShell = $("appShell");
const forms = ["loginForm", "signupForm", "forgotForm", "resetForm"];

let recoveryMode = false;

function message(text) {
  $("authMessage").textContent = text;
}

function showForm(name) {
  forms.forEach(id => $(id).classList.toggle("hidden", id !== name));

  $("showSignup").classList.toggle("hidden", name !== "loginForm");
  $("showForgot").classList.toggle("hidden", name !== "loginForm");
  $("showLogin").classList.toggle("hidden", name === "loginForm");

  message("");
}

function showLoginScreen() {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function isOwner(user) {
  return user?.email?.toLowerCase() === OWNER_EMAIL;
}

function showDashboard(user) {
  if (!isOwner(user)) return;
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  $("ownerLabel").textContent = user.email;
  $("settingsEmail").textContent = user.email;
}

async function rejectNonOwner() {
  await supabase.auth.signOut();
  showLoginScreen();
  showForm("loginForm");
  message("This account is not authorized.");
}

// SIGN IN
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  if (email !== OWNER_EMAIL) {
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

// FIRST-TIME OWNER SIGNUP
$("signupForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;

  if (email !== OWNER_EMAIL) {
    message("Only the owner email can register.");
    return;
  }

  $("signupButton").disabled = true;
  message("Creating your account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + "/"
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
    message("Account created. Confirm your email using the link Supabase sent, then sign in.");
  }
});

// REQUEST PASSWORD RESET
$("forgotForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("forgotEmail").value.trim().toLowerCase();

  if (email !== OWNER_EMAIL) {
    message("That email is not authorized.");
    return;
  }

  $("forgotButton").disabled = true;
  message("Sending password reset email...");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/"
  });

  $("forgotButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  message("Password reset email sent. Open the link in that email to return here and choose a new password.");
});

// SAVE NEW PASSWORD AFTER OPENING EMAIL LINK
$("resetForm").addEventListener("submit", async event => {
  event.preventDefault();

  const password = $("newPassword").value;
  const confirm = $("confirmPassword").value;

  if (password.length < 8) {
    message("Your password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    message("The passwords do not match.");
    return;
  }

  $("resetButton").disabled = true;
  message("Updating your password...");

  const { data, error } = await supabase.auth.updateUser({
    password
  });

  $("resetButton").disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  recoveryMode = false;
  $("newPassword").value = "";
  $("confirmPassword").value = "";

  if (isOwner(data.user)) {
    showDashboard(data.user);
  } else {
    await supabase.auth.signOut();
    showLoginScreen();
    showForm("loginForm");
    message("Password updated. Sign in with your owner account.");
  }
});

// LOGIN SCREEN NAVIGATION
$("showSignup").addEventListener("click", () => showForm("signupForm"));
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
  message("You have signed out.");
});

// HANDLE SUPABASE EMAIL LINKS AND RESTORED SESSIONS
const hash = window.location.hash;
const isRecoveryLink = hash.includes("type=recovery");

if (isRecoveryLink) {
  recoveryMode = true;
  showLoginScreen();
  showForm("resetForm");
  message("Choose your new password.");
} else {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showLoginScreen();
    showForm("loginForm");
    message("Could not restore your session. Please sign in.");
  } else if (data.session?.user) {
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

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    showLoginScreen();
    showForm("resetForm");
    message("Choose your new password.");
    return;
  }

  if (!session) {
    if (!recoveryMode) showLoginScreen();
    return;
  }

  if (isOwner(session.user) && !recoveryMode) {
    showDashboard(session.user);
  }
});
