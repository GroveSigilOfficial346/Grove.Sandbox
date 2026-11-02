/* =========================================
   GROVE — AUTHENTICATION CONTROLLER
   File: js/auth.js
========================================= */

import { supabase } from "./supabase.js";

const showMessage = (message, type = "error") => {
  const output = document.getElementById("auth-message");

  if (output) {
    output.textContent = message;
    output.dataset.type = type;
  } else {
    console.log("Grove:", message);
  }
};

// REGISTER
async function register(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });

    if (error) throw error;

    showMessage(
      "Account created. Check your email to verify your address.",
      "success"
    );

    return data;
  } catch (error) {
    showMessage(error.message);
    return null;
  }
}

// LOGIN
async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) throw error;

    window.location.href = "/profile.html";
    return data;
  } catch (error) {
    showMessage(error.message);
    return null;
  }
}

// LOGOUT
async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    window.location.href = "/";
  } catch (error) {
    showMessage(error.message);
  }
}

// CURRENT SESSION
async function getSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Grove session error:", error.message);
    return null;
  }

  return data.session;
}

// AUTH STATE LISTENER
supabase.auth.onAuthStateChange((event, session) => {
  window.dispatchEvent(
    new CustomEvent("grove-auth-change", {
      detail: { event, session }
    })
  );
});

// PUBLIC METHODS
window.GroveAuth = Object.freeze({
  register,
  login,
  logout,
  getSession
});

console.log("Grove: Authentication initialized.");
