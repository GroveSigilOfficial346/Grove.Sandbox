(() => {
  "use strict";

  const button = document.getElementById("login");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("message");

  if (!button || !emailInput || !passwordInput || !message) {
    console.error("Grove login: required HTML elements are missing.");
    return;
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff8585" : "#05c9f4";
  }

  button.addEventListener("click", async () => {
    if (!window.groveClient) {
      showMessage("Connection unavailable. Reload and try again.", true);
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Enter your email and password.", true);
      return;
    }

    button.disabled = true;
    showMessage("Signing in...");

    try {
      const { data, error } =
        await window.groveClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;
      if (!data.user) throw new Error("No authenticated user was returned.");

      const { data: profile, error: profileError } =
        await window.groveClient
          .from("profiles")
          .select("id, username")
          .eq("id", data.user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      showMessage("Signed in. Opening Grove...");

      window.location.assign(
        profile?.username ? "user-dashboard.html" : "complete-profile.html"
      );
    } catch (error) {
      console.error("Grove login failed:", error);
      showMessage(
        error.message || "Login failed. Check your credentials.",
        true
      );
    } finally {
      button.disabled = false;
    }
  });
})();
