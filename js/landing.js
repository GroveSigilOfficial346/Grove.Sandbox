(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);

  async function initializeLanding() {
    byId("year").textContent = String(new Date().getFullYear());

    const signupLink = byId("signup-link");
    const heroJoin = byId("hero-join");
    const closingJoin = byId("closing-join");
    const loginLink = byId("login-link");
    const profileLink = byId("profile-link");
    const logoutButton = byId("logout-button");
    const heroCommunity = byId("hero-community");
    const status = byId("account-status");

    try {
      if (!window.GROVE_AUTH || !window.supabaseClient) {
        throw new Error("Grove connection is not available.");
      }

      const session = await window.GROVE_AUTH.checkSession();

      if (session) {
        signupLink.hidden = true;
        heroJoin.hidden = true;
        closingJoin.hidden = true;
        loginLink.hidden = true;

        profileLink.hidden = false;
        logoutButton.hidden = false;

        heroCommunity.textContent = "OPEN COMMUNITY";
        status.textContent = "You're connected. Your Grove is ready.";
      }
    } catch (error) {
      status.textContent =
        "Grove connection is temporarily unavailable. You can still explore the site.";

      console.error(
        "Grove landing session check failed:",
        error
      );
    }

    logoutButton.addEventListener("click", async function () {
      logoutButton.disabled = true;
      logoutButton.textContent = "SIGNING OUT...";

      try {
        await window.GROVE_AUTH.signOut();
        window.location.reload();
      } catch (error) {
        status.textContent =
          error.message || "Unable to log out. Please try again.";

        logoutButton.disabled = false;
        logoutButton.textContent = "LOG OUT";
      }
    });
  }

  document.addEventListener(
    "DOMContentLoaded",
    initializeLanding
  );
})();
