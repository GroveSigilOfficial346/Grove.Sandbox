import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  profile: null
};

function message(text, type = "info") {
  const el = $("message");
  if (!el) return;

  el.textContent = text;
  el.dataset.type = type;
}

function show(id, visible) {
  const el = $(id);
  if (el) el.hidden = !visible;
}

async function loadProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    state.profile = data;
    return data;
  }

  const username =
    user.user_metadata?.username ||
    `member_${user.id.replaceAll("-", "").slice(0, 12)}`;

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      username,
      display_name:
        user.user_metadata?.display_name || username
    })
    .select()
    .single();

  if (createError) throw createError;

  state.profile = created;
  return created;
}

function render() {
  const loggedIn = Boolean(state.user);

  show("auth", !loggedIn);
  show("dashboard", loggedIn);

  if (state.profile) {
    const name =
      state.profile.display_name ||
      state.profile.username;

    if ($("displayName")) {
      $("displayName").textContent = name;
    }

    if ($("username")) {
      $("username").textContent =
        `@${state.profile.username}`;
    }
  }
}

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  state.user = data.session?.user || null;

  if (state.user) {
    await loadProfile(state.user);
  } else {
    state.profile = null;
  }

  render();
}

async function signUp(event) {
  event?.preventDefault();

  const email = $("signupEmail")?.value.trim();
  const password = $("signupPassword")?.value;
  const username = $("signupUsername")?.value.trim().toLowerCase();
  const displayName = $("signupName")?.value.trim() || username;

  if (!email || !password || !username) {
    return message("Complete all required fields.", "error");
  }

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return message(
      "Username must be 3–24 characters: letters, numbers, underscores.",
      "error"
    );
  }

  message("Creating account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName
      }
    }
  });

  if (error) return message(error.message, "error");

  if (data.session) {
    state.user = data.session.user;
    await loadProfile(state.user);
    render();
    return message("Account created.", "success");
  }

  message(
    "Account created. Check your email to confirm your address.",
    "success"
  );
}

async function signIn(event) {
  event?.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    return message("Enter your email and password.", "error");
  }

  message("Signing in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) return message(error.message, "error");

  state.user = data.user;
  await loadProfile(state.user);
  render();

  message("Signed in successfully.", "success");
}

async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) return message(error.message, "error");

  state.user = null;
  state.profile = null;
  render();

  message("Signed out.", "success");
}

function bind(id, handler) {
  const el = $(id);
  if (!el) return;

  el.addEventListener("click", handler);
}

function bindForm(id, handler) {
  const el = $(id);
  if (!el) return;

  el.addEventListener("submit", handler);
}

bindForm("signupForm", signUp);
bindForm("loginForm", signIn);

bind("signupButton", signUp);
bind("loginButton", signIn);
bind("logoutButton", signOut);

supabase.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user || null;

  if (!state.user) {
    state.profile = null;
    render();
    return;
  }

  setTimeout(async () => {
    try {
      await loadProfile(state.user);
      render();
    } catch (error) {
      message(error.message, "error");
    }
  }, 0);
});

refreshSession().catch((error) => {
  message(error.message, "error");
});
