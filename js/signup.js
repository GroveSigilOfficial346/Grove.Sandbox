(() => {
  "use strict";

  const button = document.getElementById("signup");
  const emailInput = document.getElementById("email");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("message");

  if (!button || !emailInput || !usernameInput ||
      !passwordInput || !message) {
    console.error("Grove signup: required HTML elements are missing.");
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
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !username || !password) {
      showMessage("Enter your email, username, and password.", true);
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      showMessage(
        "Username must be 3–30 characters: lowercase letters, numbers, or underscores.",
        true
      );
      return;
    }

    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      showMessage(
        "Use at least 8 characters, including uppercase, lowercase, and a number.",
        true
      );
      return;
    }

    button.disabled = true;
    showMessage("Creating your Grove account...");

    try {
      const { data, error } = await window.groveClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username
          },
          emailRedirectTo: `${window.location.origin}/complete-profile.html`
        }
      });

      if (error) throw error;

      if (data.session) {
        window.location.assign("complete-profile.html");
        return;
      }

      showMessage(
        "Account created. Check your email to confirm your address before logging in."
      );
      passwordInput.value = "";
    } catch (error) {
      console.error("Grove signup failed:", error);
      showMessage(error.message || "Signup failed. Please try again.", true);
    } finally {
      button.disabled = false;
    }
  });
})();
