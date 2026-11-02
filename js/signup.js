console.log("Grove signup controller loaded");

const signupButton = document.getElementById("signup");
const emailInput = document.getElementById("email");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

function showMessage(text, color = "#8f9893") {
  message.textContent = text;
  message.style.color = color;
}

signupButton.addEventListener("click", async () => {
  if (!window.groveClient) {
    showMessage("Grove could not connect to its database.", "#ff7777");
    return;
  }

  const email = emailInput.value.trim();
  const username = usernameInput.value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const password = passwordInput.value;

  if (!email || !username || !password) {
    showMessage("Enter your email, username, and password.", "#ff7777");
    return;
  }

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    showMessage(
      "Username must be 3–30 characters: lowercase letters, numbers, or underscores.",
      "#ff7777"
    );
    return;
  }

  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    showMessage(
      "Use at least 8 characters, including uppercase, lowercase, and a number.",
      "#ff7777"
    );
    return;
  }

  signupButton.disabled = true;
  showMessage("Creating your Grove account...");

  try {
    const { data, error } =
      await window.groveClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username
          }
        }
      });

    if (error) throw error;

    if (data.session && data.user) {
      showMessage("Account created. Preparing your profile...");
      window.location.replace("complete-profile.html");
      return;
    }

    showMessage(
      "Account created. Check your email to confirm it, then sign in. Your profile is created automatically.",
      "#7bd7a2"
    );

    emailInput.value = "";
    usernameInput.value = "";
    passwordInput.value = "";

  } catch (error) {
    console.error("Grove signup:", error);
    showMessage(
      error.message || "Unable to create your account.",
      "#ff7777"
    );
  } finally {
    signupButton.disabled = false;
  }
});
