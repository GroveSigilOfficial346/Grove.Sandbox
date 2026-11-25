const supabase = window.groveSupabase;

if (!supabase) {
  throw new Error("Grove Supabase client is unavailable.");
}

const loginPanel = document.getElementById("login-panel");
const recoveryPanel = document.getElementById("recovery-panel");
const sessionPanel = document.getElementById("session-panel");
const message = document.getElementById("auth-message");

const loginForm = document.getElementById("login-form");
const recoveryForm = document.getElementById("recovery-form");

function showMessage(text) {
  message.textContent = text;
}

function showPanel(panel) {
  loginPanel.hidden = panel !== "login";
  recoveryPanel.hidden = panel !== "recovery";
  sessionPanel.hidden = panel !== "session";
}

function setBusy(form, busy) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = busy;
}

function showError(error) {
  showMessage(error.message || "Something went wrong.");
}

// OWNER LOGIN
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(loginForm, true);
  showMessage("Signing in...");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  setBusy(loginForm, false);

  if (error) {
    showError(error);
    return;
  }

  showPanel("session");
  showMessage("You are signed in.");
});

// PASSWORD RECOVERY EMAIL
document.getElementById("forgot-button").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();

  if (!email) {
    showMessage("Enter your email address first.");
    return;
  }

  showMessage("Sending recovery email...");

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    showError(error);
    return;
  }

  showMessage("If the account exists, a recovery email has been sent.");
});

// PASSWORD RECOVERY CALLBACK
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    showPanel("recovery");
    showMessage("Choose a new password.");
  }
});

// SAVE NEW PASSWORD
recoveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("new-password").value;
  const confirmation = document.getElementById("confirm-password").value;

  if (password.length < 8) {
    showMessage("Password must contain at least 8 characters.");
    return;
  }

  if (password !== confirmation) {
    showMessage("The passwords do not match.");
    return;
  }

  setBusy(recoveryForm, true);
  showMessage("Updating password...");

  const { error } = await supabase.auth.updateUser({
    password
  });

  setBusy(recoveryForm, false);

  if (error) {
    showError(error);
    return;
  }

  recoveryForm.reset();
  showPanel("session");
  showMessage("Password updated successfully.");
});

// SIGN OUT
document.getElementById("signout-button").addEventListener("click", async () => {
  showMessage("Signing out...");

  const { error } = await supabase.auth.signOut();

  if (error) {
    showError(error);
    return;
  }

  loginForm.reset();
  showPanel("login");
  showMessage("You have signed out.");
});

// RESTORE EXISTING SESSION
const { data, error } = await supabase.auth.getSession();

if (error) {
  showError(error);
} else if (data.session) {
  showPanel("session");
  showMessage("You are signed in.");
} else {
  showPanel("login");
}
