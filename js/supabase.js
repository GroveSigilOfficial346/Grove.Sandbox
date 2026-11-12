import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { installGroveShell } from "./grove-shell.js";
import { installGroveCompactUI } from "./grove-compact-ui.js";
import { installGroveNotifications } from "./grove-notifications.js";
import { installGroveActivityTab } from "./grove-activity-tab.js";
import { installGroveSanctionStatus } from "./grove-sanction-status.js";
import { installGroveButtonTheme } from "./grove-button-theme.js";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

// Active Grove.Sandbox publishable key.
// Never place a service-role key in browser code.
const SUPABASE_ANON_KEY =
  "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

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
installGroveCompactUI();
installGroveSanctionStatus(supabase);
installGroveButtonTheme(supabase);

const isLandingPage = Boolean(
  document.querySelector("main .account-navigation")
);

if (!isLandingPage) {
  installGroveNotifications(supabase);
  installGroveActivityTab(supabase);
}

console.info("Grove.Sandbox connected.");
