import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#edit-profile-form");
  const status = $("#edit-status");
  const saveButton = $("#save-profile");

  let currentUser = null;
  let currentBackgroundPath = null;
  let previewObjectUrl = null;

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

  function showStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function validHttpUrl(value) {
    if (!value) return true;

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function previewMusic() {
    const url = fields.musicUrl.value.trim();

    if (!url || !validHttpUrl(url)) {
      fields.musicPreview.removeAttribute("src");
      fields.musicPreview.hidden = true;
      return;
    }

    fields.musicPreview.src = url;
    fields.musicPreview.hidden = false;
    fields.musicPreview.load();
  }

  function showBackgroundPreview(url) {
    if (!fields.backgroundPreview) return;

    fields.backgroundPreview.style.backgroundImage = url
      ? `url("${url.replace(/["\\]/g, "")}")`
      : "linear-gradient(120deg, #180b3c, #30105a, #071b3c)";

    fields.backgroundPreview.textContent = url
      ? ""
      : "Theme background";
  }

  async function loadProfile() {
    showStatus("Loading your settings...");

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      window.location.href = "/login.html";
      return;
    }

    currentUser = authData.user;

    const [profileResult, preferencesResult] = await Promise.all([
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
      console.error(profileResult.error);
      showStatus("Could not load your profile settings.", true);
      return;
    }

    if (!profileResult.data) {
      showStatus("Your profile record was not found.", true);
      return;
    }

    const profile = profileResult.data;
    const preferences = preferencesResult.data || {};

    fields.username.value = profile.username || "";
    fields.displayName.value = profile.display_name || "";
    fields.bio.value = profile.bio || "";
    fields.location.value = profile.location || "";
    fields.website.value = profile.website || "";
    fields.pronouns.value = profile.pronouns || "";
    fields.isPrivate.checked = Boolean(profile.is_private);
    fields.commentPrivacy.value = profile.comment_privacy || "everyone";

    fields.musicTitle.value = profile.profile_music_title || "";
    fields.musicArtist.value = profile.profile_music_artist || "";
    fields.musicUrl.value = profile.profile_music_url || "";
    fields.musicEnabled.checked = Boolean(profile.profile_music_enabled);

    fields.theme.value = preferences.theme_id || "midnight-violet";
    fields.backgroundMode.value = preferences.background_mode || "preset";
    currentBackgroundPath = preferences.custom_background_url || null;

    if (currentBackgroundPath) {
      const { data } = supabase.storage
        .from("grove-media")
        .getPublicUrl(currentBackgroundPath);

      showBackgroundPreview(data?.publicUrl || "");
    } else {
      showBackgroundPreview("");
    }

    previewMusic();
    showStatus("");
  }

  async function uploadBackground() {
    const file = fields.backgroundFile.files?.[0];
    if (!file) return null;

    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Background images must be 5 MB or smaller.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${currentUser.id}/profile-background-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("grove-media")
      .upload(path, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    currentBackgroundPath = path;

    const { data } = supabase.storage
      .from("grove-media")
      .getPublicUrl(path);

    showBackgroundPreview(data?.publicUrl || "");

    return path;
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!currentUser) {
      showStatus("Please sign in again.", true);
      return;
    }

    const username = fields.username.value
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    const displayName = fields.displayName.value.trim();
    const bio = fields.bio.value.trim();
    const location = fields.location.value.trim();
    const website = fields.website.value.trim();
    const pronouns = fields.pronouns.value.trim();
    const musicUrl = fields.musicUrl.value.trim();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      showStatus(
        "Username must be 3–24 characters using letters, numbers, or underscores.",
        true
      );
      return;
    }

    if (displayName.length > 50 || bio.length > 300) {
      showStatus("Check your display name and bio lengths.", true);
      return;
    }

    if (!validHttpUrl(website) || !validHttpUrl(musicUrl)) {
      showStatus("Website and music URL must be valid HTTP or HTTPS links.", true);
      return;
    }

    saveButton.disabled = true;
    showStatus("Saving your profile...");

    try {
      const profileUpdate = {
        username,
        display_name: displayName,
        bio,
        location,
        website: website || null,
        pronouns,
        is_private: fields.isPrivate.checked,
        comment_privacy: fields.commentPrivacy.value,
        profile_music_url: musicUrl || null,
        profile_music_title: fields.musicTitle.value.trim() || null,
        profile_music_artist: fields.musicArtist.value.trim() || null,
        profile_music_enabled:
          fields.musicEnabled.checked && Boolean(musicUrl),
        updated_at: new Date().toISOString()
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", currentUser.id);

      if (profileError) throw profileError;

      const uploadedPath = await uploadBackground();

      const preferences = {
        user_id: currentUser.id,
        theme_id: fields.theme.value,
        background_mode: fields.backgroundMode.value,
        custom_background_url:
          fields.backgroundMode.value === "custom"
            ? (uploadedPath || currentBackgroundPath)
            : null,
        updated_at: new Date().toISOString()
      };

      const { error: preferencesError } = await supabase
        .from("user_preferences")
        .upsert(preferences, { onConflict: "user_id" });

      if (preferencesError) throw preferencesError;

      showStatus("Profile settings saved.");

      window.setTimeout(() => {
        window.location.href = "/profile.html";
      }, 800);

    } catch (error) {
      console.error("Profile save failed:", error);

      if (error.code === "23505") {
        showStatus("That username is already taken.", true);
      } else {
        showStatus(error.message || "Unable to save your settings.", true);
      }
    } finally {
      saveButton.disabled = false;
    }
  }

  fields.musicUrl.addEventListener("input", previewMusic);

  fields.backgroundFile.addEventListener("change", () => {
    const file = fields.backgroundFile.files?.[0];
    if (!file) return;

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);

    showBackgroundPreview(previewObjectUrl);
    fields.backgroundMode.value = "custom";
  });

  fields.backgroundMode.addEventListener("change", () => {
    if (fields.backgroundMode.value === "preset") {
      showBackgroundPreview("");
    } else if (currentBackgroundPath) {
      const { data } = supabase.storage
        .from("grove-media")
        .getPublicUrl(currentBackgroundPath);

      showBackgroundPreview(data?.publicUrl || "");
    }
  });

  form.addEventListener("submit", saveProfile);

  loadProfile().catch((error) => {
    console.error(error);
    showStatus("Unable to load the profile editor.", true);
  });
})();
