(function () {
  "use strict";

  const client = window.supabaseClient;

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
  const bioDisplay = document.getElementById("bio-display");

  const coverImage = document.getElementById("cover-image");
  const coverPlaceholder = document.getElementById("cover-placeholder");
  const memberSince = document.getElementById("member-since");

  const relationshipStatus = document.getElementById("relationship-status");
  const relationshipSince = document.getElementById("relationship-since");
  const relationshipDisplay = document.getElementById("relationship-display");

  const partnerSearch = document.getElementById("partner-search");
  const partnerSearchButton = document.getElementById("partner-search-button");
  const partnerResults = document.getElementById("partner-results");
  const selectedPartner = document.getElementById("selected-partner");
  const clearPartnerButton = document.getElementById("clear-partner");

  const BUCKET = "profile-media";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  const STATUS_LABELS = {
    single: "Single",
    in_relationship: "In a relationship",
    engaged: "Engaged",
    married: "Married",
    complicated: "It's complicated",
    separated: "Separated",
    divorced: "Divorced",
    widowed: "Widowed"
  };

  let currentUser = null;
  let profile = null;
  let selectedPartnerId = null;
  let selectedPartnerLabel = "";

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

  function showBio(value) {
    const cleanBio = String(value || "").trim();

    if (!cleanBio) {
      bioDisplay.textContent = "No bio added yet.";
      bioDisplay.classList.add("empty");
      return;
    }

    bioDisplay.textContent = cleanBio;
    bioDisplay.classList.remove("empty");
  }

  function showSelectedPartner() {
    if (!selectedPartnerId) {
      selectedPartner.textContent = "No partner selected.";
      return;
    }

    selectedPartner.textContent =
      "Selected partner: " + selectedPartnerLabel;
  }

  function showRelationship() {
    const value = relationshipStatus.value;
    const label = STATUS_LABELS[value] || "Not set";

    const parts = [label];

    if (relationshipSince.value) {
      const date = new Date(
        relationshipSince.value + "T00:00:00"
      );

      parts.push(
        "since " + date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric"
        })
      );
    }

    if (selectedPartnerId && selectedPartnerLabel) {
      parts.push("with " + selectedPartnerLabel);
    }

    relationshipDisplay.textContent = parts.join(" ");
    relationshipDisplay.classList.remove("empty");
  }

  async function loadPartnerLabel(partnerId) {
    if (!partnerId) return;

    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", partnerId)
      .maybeSingle();

    if (error) {
      console.warn("Could not load partner profile:", error.message);
      return;
    }

    if (!data) {
      selectedPartnerLabel = "Profile unavailable";
      showSelectedPartner();
      return;
    }

    selectedPartnerLabel =
      (data.display_name || data.username || "Grove member") +
      (data.username ? " (@" + data.username + ")" : "");

    showSelectedPartner();
  }

  async function loadProfile() {
    try {
      const { data: userData, error: userError } =
        await client.auth.getUser();

      if (userError) throw userError;

      currentUser = userData.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      const { data, error } = await client
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, created_at, relationship_status, relationship_since, relationship_partner_id"
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

      relationshipStatus.value =
        data.relationship_status || "single";

      relationshipSince.value =
        data.relationship_since || "";

      selectedPartnerId = data.relationship_partner_id || null;

      showAvatar(data.avatar_url);
      showCover(data.cover_url);
      showBio(data.bio);

      if (data.created_at) {
        const date = new Date(data.created_at);

        memberSince.textContent =
          "Member since " +
          date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long"
          });
      }

      await loadPartnerLabel(selectedPartnerId);
      showSelectedPartner();
      showRelationship();

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

      const { error: uploadError } = await client
        .storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = client
        .storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      const column = kind === "avatar"
        ? "avatar_url"
        : "cover_url";

      const { data: updatedProfile, error: updateError } = await client
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
        throw new Error(
          "The image uploaded, but the profile did not update."
        );
      }

      const displayUrl =
        publicData.publicUrl + "?updated=" + Date.now();

      if (kind === "avatar") {
        profile.avatar_url = publicData.publicUrl;
        showAvatar(displayUrl);
      } else {
        profile.cover_url = publicData.publicUrl;
        showCover(displayUrl);
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

  async function searchPartners() {
    const term = partnerSearch.value.trim().replace(/^@/, "");

    partnerResults.replaceChildren();

    if (term.length < 2) {
      showStatus(
        status,
        "Enter at least two username characters.",
        "error"
      );
      return;
    }

    setButtonBusy(partnerSearchButton, true, "SEARCH");

    try {
      const { data, error } = await client
        .from("profiles")
        .select("id, username, display_name")
        .ilike("username", "%" + term + "%")
        .neq("id", currentUser.id)
        .limit(8);

      if (error) throw error;

      if (!data || data.length === 0) {
        const empty = document.createElement("p");
        empty.className = "field-note";
        empty.textContent = "No visible matching profiles found.";
        partnerResults.appendChild(empty);
        return;
      }

      data.forEach(function (person) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "partner-result";

        const name = document.createElement("strong");
        name.textContent =
          person.display_name || person.username || "Grove member";

        const handle = document.createElement("span");
        handle.textContent = person.username
          ? "@" + person.username
          : "";

        button.append(name, handle);

        button.addEventListener("click", function () {
          selectedPartnerId = person.id;
          selectedPartnerLabel =
            (person.display_name || person.username || "Grove member") +
            (person.username ? " (@" + person.username + ")" : "");

          showSelectedPartner();
          showRelationship();
          partnerResults.replaceChildren();
          showStatus(status, "Partner selected. Save your profile.", "info");
        });

        partnerResults.appendChild(button);
      });
    } catch (error) {
      console.error("Grove partner search error:", error);

      showStatus(
        status,
        error.message || "Partner search failed.",
        "error"
      );
    } finally {
      setButtonBusy(partnerSearchButton, false, "SEARCH");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!currentUser) {
      showStatus(
        status,
        "You must be logged in to save your profile.",
        "error"
      );
      return;
    }

    const cleanName = nameInput.value.trim();
    const cleanBio = bioInput.value.trim();
    const relationshipValue = relationshipStatus.value;
    const relationshipDate = relationshipSince.value || null;

    if (cleanName.length > 40 || cleanBio.length > 300) {
      showStatus(status, "Your profile text is too long.", "error");
      return;
    }

    if (relationshipDate) {
      const selectedDate = new Date(
        relationshipDate + "T00:00:00"
      );

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (selectedDate > today) {
        showStatus(
          status,
          "The relationship date cannot be in the future.",
          "error"
        );
        return;
      }
    }

    const isSingle = relationshipValue === "single";

    const updateValues = {
      display_name: cleanName,
      bio: cleanBio,
      relationship_status: relationshipValue,
      relationship_since: isSingle ? null : relationshipDate,
      relationship_partner_id: isSingle ? null : selectedPartnerId,
      updated_at: new Date().toISOString()
    };

    setButtonBusy(saveButton, true, "SAVE PROFILE");
    showStatus(status, "Saving profile...", "info");

    try {
      const { data, error } = await client
        .from("profiles")
        .update(updateValues)
        .eq("id", currentUser.id)
        .select("id")
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error("No profile row was updated.");
      }

      profile.display_name = cleanName;
      profile.bio = cleanBio;
      profile.relationship_status = updateValues.relationship_status;
      profile.relationship_since = updateValues.relationship_since;
      profile.relationship_partner_id =
        updateValues.relationship_partner_id;

      displayName.textContent =
        cleanName || profile.username || "Grove Member";

      showBio(cleanBio);

      if (!profile.avatar_url) {
        showAvatar(null);
      }

      showRelationship();

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
  }

  avatarUpload.addEventListener("click", function () {
    uploadImage(avatarFile.files[0], "avatar", avatarUpload);
  });

  coverUpload.addEventListener("click", function () {
    uploadImage(coverFile.files[0], "cover", coverUpload);
  });

  partnerSearchButton.addEventListener("click", searchPartners);

  partnerSearch.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPartners();
    }
  });

  clearPartnerButton.addEventListener("click", function () {
    selectedPartnerId = null;
    selectedPartnerLabel = "";
    showSelectedPartner();
    showRelationship();
    showStatus(status, "Partner selection cleared. Save your profile.", "info");
  });

  relationshipStatus.addEventListener("change", showRelationship);
  relationshipSince.addEventListener("change", showRelationship);

  form.addEventListener("submit", saveProfile);

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

  if (!client) {
    showStatus(status, "Supabase is not connected.", "error");
    return;
  }

  loadProfile();
})();
