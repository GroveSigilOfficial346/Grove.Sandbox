console.log("Grove login controller loaded");

const loginButton = document.getElementById("login");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

function showMessage(text, color = "#8f9893") {
  message.textContent = text;
  message.style.color = color;
}

async function redirectAfterLogin(user) {
  const { data: profile, error } =
    await window.groveClient
      .from("profiles")
      .select("id, username")
      .eq("id", user.id)
      .maybeSingle();

  if (error) throw error;

  window.location.replace(
    profile?.username
      ? "user-dashboard.html"
      : "complete-profile.html"
  );
}

loginButton.addEventListener("click", async () => {
  if (!window.groveClient) {
    showMessage(
      "Grove could not connect to its database.",
      "#ff7777"
    );
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Enter your email and password.", "#ff7777");
    return;
  }

  loginButton.disabled = true;
  showMessage("Signing in...");

  try {
    const { data, error } =
      await window.groveClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;
    if (!data.user) {
      throw new Error("Supabase did not return a user.");
    }

    showMessage("Signed in. Loading your profile...");

    await redirectAfterLogin(data.user);

  } catch (error) {
    console.error("Grove login:", error);

    showMessage(
      error.message || "Unable to sign in.",
      "#ff7777"
    );

    loginButton.disabled = false;
  }
});

passwordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    loginButton.click();
  }
});
