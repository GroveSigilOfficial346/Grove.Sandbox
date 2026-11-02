(() => {
  "use strict";

  const usernameInput = document.getElementById("username");
  const finishButton = document.getElementById("finish");
  const message = document.getElementById("message");

  if (!usernameInput || !finishButton || !message) {
    console.error("Grove profile setup: required HTML elements are missing.");
    return;
  }

  const client = window.groveClient;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff8585" : "#05c9f4";
  }

  async function getCurrentUser() {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;
    if (!data.user) {
      window.location.replace("login.html");
      return null;
    }

    return data.user;
  }

  async function loadProfile() {
    if (!client) {
      showMessage("Grove connection unavailable. Reload the page.", true);
      finishButton.disabled = true;
      return;
    }

    try {
      const user = await getCurrentUser();
      if (!user) return;

      const { data: profile, error } = await client
        .from("profiles")
        .select("username, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (profile?.username) {
        usernameInput.value = profile.username;
      }
    } catch (error) {
      console.error("Profile loading failed:", error);
      showMessage(error.message || "Could not load your profile.", true);
    }
  }

  finishButton.addEventListener("click", async () => {
    if (!client) {
      showMessage("Grove connection unavailable. Reload the page.", true);
      return;
    }

    const username = usernameInput.value.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      showMessage(
        "Use 3–30 characters: lowercase letters, numbers, or underscores.",
        true
      );
      return;
    }

    finishButton.disabled = true;
    showMessage("Checking username...");

    try {
      const user = await getCurrentUser();
      if (!user) return;

      const { data: existing, error: lookupError } = await client
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        showMessage("That username is already taken.", true);
        return;
      }

      const { error: updateError } = await client
        .from("profiles")
        .update({
          username,
          display_name: username
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      showMessage("Profile complete. Opening Grove...");
      window.location.assign("user-dashboard.html");

    } catch (error) {
      console.error("Profile completion failed:", error);
      showMessage(error.message || "Could not save your profile.", true);

    } finally {
      finishButton.disabled = false;
    }
  });

  loadProfile();
})();
