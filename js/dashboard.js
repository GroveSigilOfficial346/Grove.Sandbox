import { supabase } from "./supabase.js";
import {
  GROVE_ENVIRONMENT,
  GROVE_OWNER_ID
} from "./config.js";
import { installInactivityLock } from "./session-lock.js";

const $ = (id) => document.getElementById(id);

$("environment").textContent = GROVE_ENVIRONMENT;

function returnToLogin() {
  window.location.replace("/admin/");
}

installInactivityLock(supabase, {
  timeoutMs: 15 * 60 * 1000,
  onLock: returnToLogin
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    returnToLogin();
  }
});

const { data, error } = await supabase.auth.getUser();

if (
  error ||
  !data.user ||
  data.user.id !== GROVE_OWNER_ID
) {
  await supabase.auth.signOut({ scope: "local" });
  returnToLogin();
} else {
  document.body.hidden = false;
}

const navigation = document.querySelectorAll("[data-section]");
const views = document.querySelectorAll("[data-view]");

for (const button of navigation) {
  button.addEventListener("click", () => {
    const selected = button.dataset.section;

    for (const item of navigation) {
      item.classList.toggle("active", item === button);
    }

    for (const view of views) {
      view.hidden = view.dataset.view !== selected;
    }
  });
}

$("signout-button").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  returnToLogin();
});
