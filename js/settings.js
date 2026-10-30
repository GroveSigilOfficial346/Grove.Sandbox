(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const button = document.getElementById("logout");
  const status = document.getElementById("status");

  if (!button || !status) return;

  function showStatus(message, kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  async function start() {
    if (!window.supabase) {
      showStatus("Grove authentication could not load. Refresh and try again.", "error");
      return;
    }

    const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        location.replace("auth.html?mode=login");
        return;
      }
    } catch (error) {
      console.error("Grove settings session:", error);
      showStatus(error.message || "Could not verify your login.", "error");
    }

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Logging out…";
      showStatus("Signing out…");

      try {
        const { error } = await db.auth.signOut({ scope: "local" });
        if (error) throw error;

        showStatus("Signed out. Redirecting…", "success");
        location.replace("auth.html?mode=login");
      } catch (error) {
        console.error("Grove logout:", error);
        showStatus(error.message || "Logout failed. Please try again.", "error");
        button.disabled = false;
        button.textContent = "Log Out";
      }
    });
  }

  start();
})();
