import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#edit-profile-form");
  const status = $("#edit-status");
  const saveButton = $("#save-profile");

  const fields = {
    username: $("#edit-username"),
    displayName: $("#edit-display-name"),
    bio: $("#edit-bio"),
    location: $("#edit-location"),
    website: $("#edit-website"),
    pronouns: $("#edit-pronouns"),
    isPrivate: $("#edit-private"),
    commentPrivacy: $("#edit-comment-privacy"),
    musicTitle: $("#edit-music-title"),
    musicArtist: $("#edit-music-artist"),
    musicUrl: $("#edit-music-url"),
    musicEnabled: $("#edit-music-enabled"),
    theme: $("#edit-theme"),
    backgroundMode: $("#edit-background-mode"),
    backgroundFile: $("#edit-background-file"),
    musicPreview: $("#music-preview"),
    backgroundPreview: $("#background-preview")
  };

  let currentUser = null;
  let currentBackgroundPath = null;
  let previewObjectUrl = null;
  let originalProfile = null;
  let originalPreferences = null;

  const BUCKET = "grove-media";
  const MAX_BACKGROUND_SIZE = 5 * 1024 * 1024;

  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ]);

  function showStatus(message, error = false) {
    if (!status) return;

    status.textContent = message;
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function requireElements() {
    const required = [
      ["edit-profile-form", form],
      ["edit-status", status],
      ["save-profile", saveButton],
      ["edit-username", fields.username],
      ["edit-display-name", fields.displayName],
      ["edit-bio", fields.bio],
      ["edit-location", fields.location],
      ["edit-website", fields.website],
      ["edit-pronouns", fields.pronouns],
      ["edit-private", fields.isPrivate],
      ["edit-comment-privacy", fields.commentPrivacy],
      ["edit-music-title", fields.musicTitle],
      ["edit-music-artist", fields.musicArtist],
      ["edit-music-url", fields.musicUrl],
      ["edit-music-enabled", fields.musicEnabled],
      ["edit-theme", fields.theme],
      ["edit-background-mode", fields.backgroundMode],
      ["edit-background-file", fields.backgroundFile]
    ];

    const missing = required
      .filter(([, element]) => !element)
      .map(([id]) => id);

    if (missing.length) {
      throw new Error(
        `The profile editor is missing required HTML elements: ${missing.join(", ")}`
      );
    }
  }

  function validHttpUrl(value) {
    if (!value) return true;

    try {
      const url = new URL(value);

      return (
        url.protocol === "https:" ||
        url.protocol === "http:"
      );
    } catch {
      return false;
    }
  }

  function publicBackgroundUrl(path) {
    if (!path) return "";

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return data?.publicUrl || "";
  }

  function previewMusic() {
    if (!fields.musicPreview || !fields.musicUrl) return;

    const url = fields.musicUrl.value.trim();

    if (!url || !validHttpUrl(url)) {
      fields.musicPreview.pause?.();
      fields.musicPreview.removeAttribute("src");
      fields.musicPreview.hidden = true;
      return;
    }

    fields.musicPreview.src = url;
    fields.musicPreview.hidden = false;
    fields.musicPreview.load?.();
  }

  function showBackgroundPreview(url) {
    if (!fields.backgroundPreview) return;

    if (url) {
      fields.backgroundPreview.style.backgroundImage =
        `url("${url.replace(/["\\]/g, "")}")`;

      fields.backgroundPreview.textContent = "";
    } else {
      fields.backgroundPreview.style.backgroundImage =
        "linear-gradient(120deg, #180b3c, #30105a, #071b3c)";

      fields.backgroundPreview.textContent = "Theme background";
    }
  }

  function revokePreviewObjectUrl() {
    if (!previewObjectUrl) return;

    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  function getSelectedFile() {
    return fields.backgroundFile.files?.[0] || null;
  }

  function validateBackgroundFile(file) {
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error(
        "Choose a JPG, PNG, WebP, or GIF image."
      );
    }

    if (file.size > MAX_BACKGROUND_SIZE) {
      throw new Error(
        "Background images must be 5 MB or smaller."
      );
    }

    if (file.size === 0) {
      throw new Error("The selected image is empty.");
    }
  }

  function getSafeExtension(file) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };

    return extensions[file.type];
  }

  async function loadProfile() {
    showStatus("Loading your settings...");

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!authData?.user) {
      window.location.replace("/login.html");
      return;
    }

    currentUser = authData.user;

    const [profileResult, preferencesResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(`
            username,
            display_name,
            bio,
            location,
            website,
            pronouns,
            is_private,
            comment_privacy,
            profile_music_url,
            profile_music_title,
            profile_music_artist,
            profile_music_enabled
          `)
          .eq("id", currentUser.id)
          .maybeSingle(),

        supabase
          .from("user_preferences")
          .select(`
            theme_id,
            background_mode,
            custom_background_url
          `)
          .eq("user_id", currentUser.id)
          .maybeSingle()
      ]);

    if (profileResult.error) {
      throw profileResult.error;
    }

    if (preferencesResult.error) {
      throw preferencesResult.error;
    }

    if (!profileResult.data) {
      throw new Error(
        "Your profile record was not found. Please contact Grove support."
      );
    }

    originalProfile = { ...profileResult.data };
    originalPreferences = {
      ...(preferencesResult.data || {})
    };

    const profile = originalProfile;
    const preferences = originalPreferences;

    fields.username.value = profile.username || "";
    fields.displayName.value = profile.display_name || "";
    fields.bio.value = profile.bio || "";
    fields.location.value = profile.location || "";
    fields.website.value = profile.website || "";
    fields.pronouns.value = profile.pronouns || "";

    fields.isPrivate.checked = Boolean(profile.is_private);

    fields.commentPrivacy.value =
      profile.comment_privacy || "everyone";

    fields.musicTitle.value =
      profile.profile_music_title || "";

    fields.musicArtist.value =
      profile.profile_music_artist || "";

    fields.musicUrl.value =
      profile.profile_music_url || "";

    fields.musicEnabled.checked =
      Boolean(profile.profile_music_enabled);

    fields.theme.value =
      preferences.theme_id || "midnight-violet";

    fields.backgroundMode.value =
      preferences.background_mode || "preset";

    currentBackgroundPath =
      preferences.custom_background_url || null;

    if (
      fields.backgroundMode.value === "custom" &&
      currentBackgroundPath
    ) {
      showBackgroundPreview(
        publicBackgroundUrl(currentBackgroundPath)
      );
    } else {
      showBackgroundPreview("");
    }

    previewMusic();
    showStatus("");
  }

  async function uploadBackground(file) {
    if (!file) return null;

    validateBackgroundFile(file);

    const extension = getSafeExtension(file);

    if (!extension) {
      throw new Error("Unsupported image format.");
    }

    const path =
      `${currentUser.id}/profile-background-${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600"
      });

    if (error) throw error;

    return path;
  }

  async function removeUploadedBackground(path) {
    if (!path) return;

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      console.warn(
        "Temporary background cleanup failed:",
        error
      );
    }
  }

  async function deleteOldBackground(path) {
    if (!path) return;

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      console.warn(
        "The previous background could not be removed:",
        error
      );
    }
  }

  function collectProfileUpdate() {
    const username = fields.username.value
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    const displayName = fields.displayName.value.trim();
    const bio = fields.bio.value.trim();
    const location = fields.location.value.trim();
    const website = fields.website.value.trim();
    const pronouns = fields.pronouns.value.trim();
    const musicTitle = fields.musicTitle.value.trim();
    const musicArtist = fields.musicArtist.value.trim();
    const musicUrl = fields.musicUrl.value.trim();

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new Error(
        "Username must be 3–30 characters using lowercase letters, numbers, or underscores."
      );
    }

    if (displayName.length > 50) {
      throw new Error(
        "Display name must be 50 characters or fewer."
      );
    }

    if (bio.length > 300) {
      throw new Error(
        "Bio must be 300 characters or fewer."
      );
    }

    if (location.length > 80) {
      throw new Error(
        "Location must be 80 characters or fewer."
      );
    }

    if (pronouns.length > 40) {
      throw new Error(
        "Pronouns must be 40 characters or fewer."
      );
    }

    if (musicTitle.length > 100 || musicArtist.length > 100) {
      throw new Error(
        "Music title and artist must be 100 characters or fewer."
      );
    }

    if (!validHttpUrl(website) || !validHttpUrl(musicUrl)) {
      throw new Error(
        "Website and music URL must be valid HTTP or HTTPS links."
      );
    }

    const commentPrivacy = fields.commentPrivacy.value;

    if (!["everyone", "followers", "nobody"].includes(commentPrivacy)) {
      throw new Error("Choose a valid comment privacy setting.");
    }

    return {
      username,
      display_name: displayName,
      bio,
      location,
      website: website || null,
      pronouns,
      is_private: fields.isPrivate.checked,
      comment_privacy: commentPrivacy,
      profile_music_url: musicUrl || null,
      profile_music_title: musicTitle || null,
      profile_music_artist: musicArtist || null,
      profile_music_enabled:
        fields.musicEnabled.checked && Boolean(musicUrl),
      updated_at: new Date().toISOString()
    };
  }

  function collectPreferencesUpdate(backgroundPath) {
    const themeId = fields.theme.value;
    const backgroundMode = fields.backgroundMode.value;

    if (!themeId) {
      throw new Error("Choose a profile theme.");
    }

    if (!["preset", "custom"].includes(backgroundMode)) {
      throw new Error("Choose a valid background mode.");
    }

    if (backgroundMode === "custom" && !backgroundPath) {
      throw new Error(
        "Choose a background image before selecting a custom background."
      );
    }

    return {
      user_id: currentUser.id,
      theme_id: themeId,
      background_mode: backgroundMode,
      custom_background_url:
        backgroundMode === "custom"
          ? backgroundPath
          : null,
      updated_at: new Date().toISOString()
    };
  }

  async function restoreOriginalProfile() {
    if (!originalProfile || !currentUser) return;

    const { error } = await supabase
      .from("profiles")
      .update(originalProfile)
      .eq("id", currentUser.id);

    if (error) {
      console.error(
        "Could not restore the original profile after a failed save:",
        error
      );
    }
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!currentUser) {
      showStatus("Please sign in again.", true);
      return;
    }

    if (saveButton.disabled) return;

    let uploadedPath = null;
    let profileWasUpdated = false;
    let preferencesWereUpdated = false;

    const oldBackgroundPath =
      originalPreferences?.custom_background_url || null;

    saveButton.disabled = true;

    try {
      showStatus("Checking your settings...");

      const profileUpdate = collectProfileUpdate();
      const selectedFile = getSelectedFile();

      validateBackgroundFile(selectedFile);

      showStatus("Preparing your background...");

      // 1. Upload the new background before changing database records.
      if (selectedFile) {
        uploadedPath = await uploadBackground(selectedFile);
      }

      const backgroundPath =
        fields.backgroundMode.value === "custom"
          ? (uploadedPath || currentBackgroundPath)
          : null;

      const preferencesUpdate =
        collectPreferencesUpdate(backgroundPath);

      // 2. Save profile fields.
      showStatus("Saving profile details...");

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", currentUser.id);

      if (profileError) throw profileError;

      profileWasUpdated = true;

      // 3. Save preferences only after the background upload succeeds.
      showStatus("Saving appearance settings...");

      const { error: preferencesError } = await supabase
        .from("user_preferences")
        .upsert(preferencesUpdate, {
          onConflict: "user_id"
        });

      if (preferencesError) throw preferencesError;

      preferencesWereUpdated = true;

      // 4. Only now is the previous background safe to remove.
      if (
        oldBackgroundPath &&
        oldBackgroundPath !== backgroundPath
      ) {
        await deleteOldBackground(oldBackgroundPath);
      }

      currentBackgroundPath = backgroundPath;
      originalProfile = {
        ...originalProfile,
        ...profileUpdate
      };

      originalPreferences = {
        ...preferencesUpdate
      };

      revokePreviewObjectUrl();

      showStatus("Profile settings saved successfully.");

      window.setTimeout(() => {
        window.location.href = "/profile.html";
      }, 800);

    } catch (error) {
      console.error("Profile save failed:", error);

      // If preferences failed after the profile update,
      // attempt to restore the previous profile values.
      if (profileWasUpdated && !preferencesWereUpdated) {
        await restoreOriginalProfile();
      }

      // Do not leave unused uploaded images in storage.
      if (uploadedPath) {
        await removeUploadedBackground(uploadedPath);
      }

      if (error?.code === "23505") {
        showStatus("That username is already taken.", true);
      } else {
        showStatus(
          error?.message || "Unable to save your settings.",
          true
        );
      }

    } finally {
      saveButton.disabled = false;
    }
  }

  function connectEvents() {
    fields.musicUrl.addEventListener("input", previewMusic);

    fields.backgroundFile.addEventListener("change", () => {
      const file = getSelectedFile();

      if (!file) return;

      try {
        validateBackgroundFile(file);

        revokePreviewObjectUrl();

        previewObjectUrl = URL.createObjectURL(file);

        showBackgroundPreview(previewObjectUrl);

        fields.backgroundMode.value = "custom";
      } catch (error) {
        fields.backgroundFile.value = "";
        showStatus(error.message, true);
      }
    });

    fields.backgroundMode.addEventListener("change", () => {
      if (fields.backgroundMode.value === "preset") {
        showBackgroundPreview("");
        return;
      }

      const selectedFile = getSelectedFile();

      if (selectedFile && previewObjectUrl) {
        showBackgroundPreview(previewObjectUrl);
        return;
      }

      if (currentBackgroundPath) {
        showBackgroundPreview(
          publicBackgroundUrl(currentBackgroundPath)
        );
        return;
      }

      showBackgroundPreview("");
    });

    form.addEventListener("submit", saveProfile);
  }

  async function initialize() {
    try {
      requireElements();
      connectEvents();
      await loadProfile();
    } catch (error) {
      console.error("Profile editor initialization failed:", error);

      showStatus(
        error?.message || "Unable to load the profile editor.",
        true
      );

      if (saveButton) saveButton.disabled = true;
    }
  }

  window.addEventListener("beforeunload", revokePreviewObjectUrl);

  initialize();
})();
