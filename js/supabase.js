import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { installGroveShell } from "./grove-shell.js";
import { installGroveNotifications } from "./grove-notifications.js";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJub3RzZWFjcmV0IiwicmVmIjoiZnBrcmd2Y3BibnJ1c2JmbWhpbmoifQ.replace-with-your-existing-anon-key";

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
installGroveNotifications(supabase);

console.info("Grove.Sandbox connected.");
