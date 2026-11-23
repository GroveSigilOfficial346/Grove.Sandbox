import { supabase, OWNER_EMAIL } from "./supabase.js";

const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authMessage = document.getElementById("authMessage");

const showSignup = document.getElementById("showSignup");
const showLogin = document.getElementById("showLogin");
const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

function message(text) {
  authMessage.textContent = text;
}

function showLoginScreen() {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function showDashboard(user) {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  document.getElementById("ownerLabel").textContent = user.email;
  document.getElementById("settingsEmail").textContent = user.email;
}

function isOwner(user) {
  return user?.email?.toLowerCase() === OWNER_EMAIL;
}

async function rejectNonOwner() {
  await supabase.auth.signOut();
  showLoginScreen();
  message("This account is not authorized for Grove Headquarters.");
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginButton.disabled = true;
  message("Signing in...");

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  if (email !== OWNER_EMAIL) {
    message("That email is not authorized.");
    loginButton.disabled = false;
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  loginButton.disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  if (!isOwner(data.user)) {
    await rejectNonOwner();
    return;
  }

  message("");
  showDashboard(data.user);
});

signupForm.addEventListener("submit", async event => {
  event.preventDefault();
  signupButton.disabled = true;
  message("Creating your owner account...");

  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;

  if (email !== OWNER_EMAIL) {
    message("Only the owner email can create an account.");
    signupButton.disabled = false;
    return;
  }

  if (password.length < 8) {
    message("Use a password with at least 8 characters.");
    signupButton.disabled = false;
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  signupButton.disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  if (data.session && isOwner(data.user)) {
    message("");
    showDashboard(data.user);
    return;
  }

  message("Account created. Check your email to confirm it, then return here and sign in.");
});

showSignup.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  showSignup.classList.add("hidden");
  showLogin.classList.remove("hidden");
  message("");
});

showLogin.addEventListener("click", () => {
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  showLogin.classList.add("hidden");
  showSignup.classList.remove("hidden");
  message("");
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    message("Sign out failed: " + error.message);
    return;
  }

  showLoginScreen();
  message("You have signed out.");
});

const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

if (sessionError) {
  showLoginScreen();
  message("Could not restore your session. Please sign in again.");
} else if (sessionData.session?.user) {
  if (isOwner(sessionData.session.user)) {
    showDashboard(sessionData.session.user);
  } else {
    await rejectNonOwner();
  }
} else {
  showLoginScreen();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    showLoginScreen();
    return;
  }

  if (isOwner(session.user)) {
    showDashboard(session.user);
  } else {
    rejectNonOwner();
  }
});
