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
    bio: $("#edit-bio")
  };

  let currentUser = null;

  function showStatus(message, error = false) {
    if (!status) return;

    status.textContent = message;
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  async function loadProfile() {
    showStatus("Loading your profile...");

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      window.location.href = "/login.html";
      return;
    }

    currentUser = authData.user;

    const { data, error } = await supabase
      .from("profiles")
      .select("username, display_name, bio")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      showStatus("Unable to load your profile.", true);
      return;
    }

    if (!data) {
      showStatus("Your profile record was not found.", true);
      return;
    }

    fields.username.value = data.username || "";
    fields.displayName.value = data.display_name || "";
    fields.bio.value = data.bio || "";

    showStatus("");
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

    if (!username) {
      showStatus("Username is required.", true);
      return;
    }

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      showStatus(
        "Username must be 3–24 characters using letters, numbers, or underscores.",
        true
      );
      return;
    }

    if (displayName.length > 50) {
      showStatus("Display name must be 50 characters or less.", true);
      return;
    }

    if (bio.length > 300) {
      showStatus("Bio must be 300 characters or less.", true);
      return;
    }

    saveButton.disabled = true;
    showStatus("Saving your profile...");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username,
          display_name: displayName,
          bio,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id);

      if (error) throw error;

      showStatus("Profile saved successfully!");

      setTimeout(() => {
        window.location.href = "/profile.html";
      }, 800);

    } catch (error) {
      console.error("Profile save error:", error);

      if (error.code === "23505") {
        showStatus("That username is already taken.", true);
      } else {
        showStatus(
          error.message || "Unable to save your profile.",
          true
        );
      }
    } finally {
      saveButton.disabled = false;
    }
  }

  if (form) {
    form.addEventListener("submit", saveProfile);
  }

  loadProfile();
})();
