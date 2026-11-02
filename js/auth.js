/* =========================================
   GROVE — AUTHENTICATION CONTROLLER
   File: js/auth.js
========================================= */

(() => {
  "use strict";

  const supabase = window.supabaseClient;

  if (!supabase) {
    console.error("Grove: Supabase client not found.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  const showMessage = (message, type = "error") => {
    const output = $("auth-message");

    if (!output) {
      console.log(message);
      return;
    }

    output.textContent = message;
    output.dataset.type = type;
  };

  // REGISTER
  async function register(email, password) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + "/"
        }
      });

      if (error) throw error;

      showMessage(
        "Check your email to verify your Grove account.",
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
      const { data, error } =
        await supabase.auth.signInWithPassword({
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
    const { error } = await supabase.auth.signOut();

    if (error) {
      showMessage(error.message);
      return;
    }

    window.location.href = "/";
  }

  // SESSION CHECK
  async function getSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Grove session error:", error.message);
      return null;
    }

    return data.session;
  }

  // AUTH STATE CHANGES
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Grove auth event:", event);

    window.dispatchEvent(
      new CustomEvent("grove-auth-change", {
        detail: { event, session }
      })
    );
  });

  // PUBLIC AUTH METHODS
  window.GroveAuth = {
    register,
    login,
    logout,
    getSession
  };

})();
