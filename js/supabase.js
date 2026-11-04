import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { installGroveShell } from "./grove-shell.js";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

const REMEMBER_KEY = "grove:remember-session";

function shouldRememberSession() {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "true";
  } catch {
    return false;
  }
}

const groveAuthStorage = {
  getItem(key) {
    try {
      if (shouldRememberSession()) {
        return (
          localStorage.getItem(key) ??
          sessionStorage.getItem(key)
        );
      }

      localStorage.removeItem(key);
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error("Grove session storage error:", error);
      return null;
    }
  },

  setItem(key, value) {
    try {
      if (shouldRememberSession()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("Grove could not save the session:", error);
      throw error;
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error("Grove could not clear the session:", error);
    }
  }
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: groveAuthStorage
    }
  }
);

window.groveClient = supabase;

installGroveShell(supabase);

console.info("Grove.Sandbox connected.");
