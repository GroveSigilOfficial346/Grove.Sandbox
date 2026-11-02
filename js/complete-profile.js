console.log("Grove profile setup loaded");

const usernameInput = document.getElementById("username");
const finishButton = document.getElementById("finish");
const message = document.getElementById("message");

let currentUser = null;

function showMessage(text, color = "#8f9893") {
  message.textContent = text;
  message.style.color = color;
}

async function initializeProfileSetup() {
  const { data, error } =
    await window.groveClient.auth.getSession();

  if (error || !data.session) {
    window.location.replace("login.html");
    return;
  }

  currentUser = data.session.user;

  const { data: profile, error: profileError } =
    await window.groveClient
      .from("profiles")
      .select("id, username")
      .eq("id", currentUser.id)
      .maybeSingle();

  if (profileError) {
    console.error("Profile lookup:", profileError);
    showMessage(profileError.message, "#ff7777");
    return;
  }

  if (profile?.username) {
    window.location.replace("user-dashboard.html");
    return;
  }

  usernameInput.value =
    currentUser.user_metadata?.username || "";
}

finishButton.addEventListener("click", async () => {
  if (!currentUser) {
    showMessage(
      "Your session expired. Please sign in again.",
      "#ff7777"
    );
    return;
  }

  const username = usernameInput.value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    showMessage(
      "Username must be 3–30 characters: lowercase letters, numbers, or underscores.",
      "#ff7777"
    );
    return;
  }

  finishButton.disabled = true;
  showMessage("Saving your username...");

  try {
    const { data: existing, error: lookupError } =
      await window.groveClient
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", currentUser.id)
        .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing) {
      throw new Error("That username is already taken.");
    }

    const { error } =
      await window.groveClient
        .from("profiles")
        .update({
          username,
          display_name: username,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id);

    if (error) throw error;

    showMessage(
      "Profile saved. Entering Grove...",
      "#7bd7a2"
    );

    window.location.replace("user-dashboard.html");

  } catch (error) {
    console.error("Profile setup:", error);

    showMessage(
      error.message || "Could not save your profile.",
      "#ff7777"
    );

    finishButton.disabled = false;
  }
});

initializeProfileSetup();
