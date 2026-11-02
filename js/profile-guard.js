/* =========================================
   GROVE — PROFILE ACCESS CONTROL
   File: js/profile-guard.js
========================================= */

import { supabase } from "./supabase.js";

async function protectProfile() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (!data.session) {
      window.location.replace("/login.html");
      return;
    }

    // Make the authenticated user available to profile scripts.
    window.GroveSession = {
      user: data.session.user,
      session: data.session
    };

    window.dispatchEvent(
      new CustomEvent("grove-profile-authorized", {
        detail: window.GroveSession
      })
    );

    console.log("Grove: Profile access authorized.");

  } catch (error) {
    console.error("Grove profile access error:", error);
    window.location.replace("/login.html");
  }
}

protectProfile();
