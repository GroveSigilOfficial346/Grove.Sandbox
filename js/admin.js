import { supabase } from "./supabase.js";
import {
  GROVE_ENVIRONMENT,
  GROVE_OWNER_ID
} from "./config.js";
import { installInactivityLock } from "./session-lock.js";

const $ = (id) => document.getElementById(id);

const loginPanel = $("login-panel");
const recoveryPanel = $("recovery-panel");
const sessionPanel = $("session-panel");
const notice = $("notice");

let recoveryMode = false;

$("environment").textContent = GROVE_ENVIRONMENT;

function showPanel(panel) {
  loginPanel.hidden = panel !== loginPanel;
  recoveryPanel.hidden = panel !== recoveryPanel;
  sessionPanel.hidden = panel !== sessionPanel;
}

function message(text) {
  notice.textContent = text;
}

async function enterDashboard() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || data.user.id !== GROVE_OWNER_ID) {
    await supabase.auth.signOut({ scope: "local" });
    showPanel(loginPanel);
    message("OWNER ACCESS COULD NOT BE VERIFIED.");
    return;
  }

  window.location.replace("/dashboard/");
}

installInactivityLock(supabase, {
  timeoutMs: 15 * 60 * 1000,

  onLock: () => {
    recoveryMode = false;
    showPanel(loginPanel);

    message(
      "SESSION LOCKED AFTER 15 MINUTES OF INACTIVITY. SIGN IN AGAIN."
    );
  }
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("login-form").querySelector("button");

  button.disabled = true;
  message("SIGNING IN...");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  button.disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  await enterDashboard();
});

$("forgot-button").addEventListener("click", async () => {
  const email = $("email").value.trim();

  if (!email) {
    message("ENTER YOUR OWNER EMAIL FIRST.");
    $("email").focus();
    return;
  }

  message("SENDING RECOVERY EMAIL...");

  const redirectTo =
    new URL("/admin/", window.location.origin).toString();

  const { error } =
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

  message(
    error
      ? error.message
      : "IF THE ACCOUNT EXISTS, A RECOVERY EMAIL HAS BEEN SENT."
  );
});

$("recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = $("new-password").value;
  const confirmation = $("confirm-password").value;

  if (password.length < 8) {
    message("PASSWORD MUST BE AT LEAST 8 CHARACTERS.");
    return;
  }

  if (password !== confirmation) {
    message("PASSWORDS DO NOT MATCH.");
    return;
  }

  const button = $("recovery-form").querySelector("button");

  button.disabled = true;
  message("UPDATING PASSWORD...");

  const { error } = await supabase.auth.updateUser({
    password
  });

  button.disabled = false;

  if (error) {
    message(error.message);
    return;
  }

  recoveryMode = false;
  await enterDashboard();
});

$("signout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut({
    scope: "local"
  });

  if (error) {
    message(error.message);
    return;
  }

  showPanel(loginPanel);
  message("SIGNED OUT OF THIS DEVICE.");
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    showPanel(recoveryPanel);
    message("SET A NEW OWNER PASSWORD.");
  }

  if (event === "SIGNED_OUT") {
    recoveryMode = false;
    showPanel(loginPanel);
    message("SIGNED OUT.");
  }
});

const { data, error } = await supabase.auth.getSession();

if (error) {
  message(error.message);
} else if (data.session && !recoveryMode) {
  await enterDashboard();
}
