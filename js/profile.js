(function () {
  const form = document.getElementById("profile-form");
  const status = document.getElementById("profile-status");
  const mediaStatus = document.getElementById("media-status");

  const saveButton = document.getElementById("save-button");
  const avatarUpload = document.getElementById("avatar-upload");
  const coverUpload = document.getElementById("cover-upload");
  const logoutButton = document.getElementById("logout-button");

  const avatarFile = document.getElementById("avatar-file");
  const coverFile = document.getElementById("cover-file");

  const nameInput = document.getElementById("name-input");
  const bioInput = document.getElementById("bio-input");

  const displayName = document.getElementById("display-name");
  const username = document.getElementById("username");
  const avatar = document.getElementById("avatar");

  const coverImage = document.getElementById("cover-image");
  const coverPlaceholder = document.getElementById("cover-placeholder");
  const memberSince = document.getElementById("member-since");

  const BUCKET = "profile-media";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  let currentUser = null;
  let profile = null;

  function showStatus(element, message, type) {
    element.textContent = message;
    element.dataset.type = type || "info";
  }

  function setButtonBusy(button, busy, normalText) {
    button.disabled = busy;
    button.textContent = busy ? "PLEASE WAIT..." : normalText;
  }

  function initials() {
    return (
      nameInput.value.trim() ||
      (profile && profile.username) ||
      "G"
    ).charAt(0).toUpperCase();
  }

  function showAvatar(url) {
    if (!url) {
      avatar.textContent = initials();
      return;
    }

    const image = document.createElement("img");
    image.src = url;
    image.alt = "Profile photo";

    image.onerror = function () {
      avatar.textContent = initials();
    };

    avatar.replaceChildren(image);
  }

  function showCover(url) {
    if (!url) {
      coverImage.hidden = true;
      coverImage.removeAttribute("src");
      coverPlaceholder.hidden = false;
      return;
    }

    coverImage.onload = function () {
      coverImage.hidden = false;
      coverPlaceholder.hidden = true;
    };

    coverImage.onerror = function () {
      coverImage.hidden = true;
      coverPlaceholder.hidden = false;
    };

    coverImage.src = url;
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
          "id, username, display_name, bio, avatar_url, cover_url, created_at"
        )
        .eq("id", currentUser.id)
        .single();

      if (error) throw error;

      profile = data;

      displayName.textContent =
        data.display_name || data.username || "Grove Member";

      username.textContent = data.username
        ? "@" + data.username
        : "";

      nameInput.value = data.display_name || "";
      bioInput.value = data.bio || "";

      showAvatar(data.avatar_url);
      showCover(data.cover_url);

      if (data.created_at) {
        const date = new Date(data.created_at);

        memberSince.textContent =
          "Member since " +
          date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long"
          });
      }

      showStatus(status, "Profile loaded.", "success");
    } catch (error) {
      console.error("Grove profile error:", error);

      showStatus(
        status,
        error.message || "Could not load your profile.",
        "error"
      );
    }
  }

  async function uploadImage(file, kind, button) {
    if (!currentUser) {
      showStatus(mediaStatus, "Log in before uploading images.", "error");
      return;
    }

    if (!file) {
      showStatus(mediaStatus, "Choose an image first.", "error");
      return;
    }

    const extension = ALLOWED_TYPES[file.type];

    if (!extension) {
      showStatus(
        mediaStatus,
        "Use a JPG, PNG, WebP, or GIF image.",
        "error"
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showStatus(mediaStatus, "Images must be 5 MB or smaller.", "error");
      return;
    }

    const normalText = kind === "avatar"
      ? "UPLOAD PROFILE PHOTO"
      : "UPLOAD COVER IMAGE";

    setButtonBusy(button, true, normalText);
    showStatus(mediaStatus, "Uploading image...", "info");

    try {
      const filePath =
        currentUser.id + "/" + kind + "." + extension;

      const { error: uploadError } = await window.supabaseClient
        .storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = window.supabaseClient
        .storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      const imageUrl =
        publicData.publicUrl + "?updated=" + Date.now();

      const column = kind === "avatar"
        ? "avatar_url"
        : "cover_url";

      const { data: updatedProfile, error: updateError } =
        await window.supabaseClient
          .from("profiles")
          .update({
            [column]: publicData.publicUrl,
            updated_at: new Date().toISOString()
          })
          .eq("id", currentUser.id)
          .select("id")
          .single();

      if (updateError) throw updateError;
      if (!updatedProfile) {
        throw new Error("The profile image was uploaded, but the profile did not update.");
      }

      if (kind === "avatar") {
        profile.avatar_url = publicData.publicUrl;
        showAvatar(imageUrl);
      } else {
        profile.cover_url = publicData.publicUrl;
        showCover(imageUrl);
      }

      showStatus(mediaStatus, "Image uploaded successfully.", "success");
    } catch (error) {
      console.error("Grove image upload error:", error);

      showStatus(
        mediaStatus,
        error.message || "Image upload failed.",
        "error"
      );
    } finally {
      setButtonBusy(button, false, normalText);
    }
  }

  avatarUpload.addEventListener("click", function () {
    uploadImage(avatarFile.files[0], "avatar", avatarUpload);
  });

  coverUpload.addEventListener("click", function () {
    uploadImage(coverFile.files[0], "cover", coverUpload);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!currentUser) {
      showStatus(status, "You must be logged in to save your profile.", "error");
      return;
    }

    const cleanName = nameInput.value.trim();
    const cleanBio = bioInput.value.trim();

    if (cleanName.length > 40 || cleanBio.length > 300) {
      showStatus(status, "Your profile text is too long.", "error");
      return;
    }

    setButtonBusy(saveButton, true, "SAVE PROFILE");
    showStatus(status, "", "info");

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

      profile.display_name = cleanName;
      profile.bio = cleanBio;

      displayName.textContent =
        cleanName || profile.username || "Grove Member";

      if (!profile.avatar_url) {
        showAvatar(null);
      }

      showStatus(status, "Profile saved successfully.", "success");
    } catch (error) {
      console.error("Grove profile save error:", error);

      showStatus(
        status,
        error.message || "Could not save your profile.",
        "error"
      );
    } finally {
      setButtonBusy(saveButton, false, "SAVE PROFILE");
    }
  });

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      showStatus(status, error.message || "Logout failed.", "error");
      logoutButton.disabled = false;
    }
  });

  loadProfile();
})();
