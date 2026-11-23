(function () {
  const form = document.getElementById("profile-form");
  const status = document.getElementById("profile-status");
  const saveButton = document.getElementById("save-button");
  const logoutButton = document.getElementById("logout-button");

  const nameInput = document.getElementById("name-input");
  const bioInput = document.getElementById("bio-input");

  const displayName = document.getElementById("display-name");
  const username = document.getElementById("username");
  const avatar = document.getElementById("avatar");
  const memberSince = document.getElementById("member-since");

  let currentUser = null;

  function showStatus(message, type) {
    status.textContent = message;
    status.dataset.type = type || "info";
  }

  function setSaving(saving) {
    saveButton.disabled = saving;
    saveButton.textContent = saving ? "SAVING..." : "SAVE PROFILE";
  }

  async function loadProfile() {
    try {
      const { data: userData, error: userError } =
        await window.supabaseClient.auth.getUser();

      if (userError) throw userError;

      currentUser = userData.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      const { data, error } = await window.supabaseClient
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, created_at"
        )
        .eq("id", currentUser.id)
        .single();

      if (error) throw error;

      displayName.textContent =
        data.display_name || data.username || "Grove Member";

      username.textContent = data.username
        ? "@" + data.username
        : "";

      nameInput.value = data.display_name || "";
      bioInput.value = data.bio || "";

      if (data.avatar_url) {
        const image = document.createElement("img");
        image.src = data.avatar_url;
        image.alt = "Profile avatar";
        avatar.replaceChildren(image);
      } else {
        avatar.textContent = (
          data.display_name ||
          data.username ||
          "G"
        ).charAt(0).toUpperCase();
      }

      if (data.created_at) {
        const date = new Date(data.created_at);
        memberSince.textContent =
          "Member since " +
          date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long"
          });
      }

      showStatus("Profile loaded.", "success");
    } catch (error) {
      console.error("Grove profile error:", error);
      showStatus(
        error.message || "Could not load your profile.",
        "error"
      );
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!currentUser) {
      showStatus("You must be logged in to save your profile.", "error");
      return;
    }

    const cleanName = nameInput.value.trim();
    const cleanBio = bioInput.value.trim();

    if (cleanName.length > 40 || cleanBio.length > 300) {
      showStatus("Your profile text is too long.", "error");
      return;
    }

    setSaving(true);
    showStatus("", "info");

    try {
      const { error } = await window.supabaseClient
        .from("profiles")
        .update({
          display_name: cleanName,
          bio: cleanBio,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id);

      if (error) throw error;

      displayName.textContent =
        cleanName || username.textContent.replace("@", "") || "Grove Member";

      avatar.textContent = (
        cleanName ||
        username.textContent.replace("@", "") ||
        "G"
      ).charAt(0).toUpperCase();

      showStatus("Profile saved successfully.", "success");
    } catch (error) {
      console.error("Grove profile save error:", error);
      showStatus(
        error.message || "Could not save your profile.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  });

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      showStatus(error.message || "Logout failed.", "error");
      logoutButton.disabled = false;
    }
  });

  loadProfile();
})();
