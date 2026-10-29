(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const $ = (selector) => document.querySelector(selector);

  function isSafeWebUrl(value) {
    try {
      const url = new URL(value);

      if (!["https:", "http:"].includes(url.protocol)) {
        return null;
      }

      return url;
    } catch {
      return null;
    }
  }

  function showError(message) {
    const status = $("#status");
    status.textContent = message;
    status.hidden = false;
  }

  function getInitial(name) {
    return (name || "G").trim().charAt(0).toUpperCase() || "G";
  }

  function renderProfile(profile) {
    $("#display-name").textContent =
      profile.display_name || "Grove Member";

    $("#username").textContent =
      profile.username ? `@${profile.username}` : "";

    // Biography
    const bio = $("#bio");

    if (profile.bio?.trim()) {
      bio.textContent = profile.bio;
      bio.hidden = false;
    } else {
      bio.hidden = true;
    }

    // Profile picture
    const avatar = $("#avatar");
    avatar.replaceChildren();

    const avatarUrl = profile.avatar_url
      ? isSafeWebUrl(profile.avatar_url)
      : null;

    if (avatarUrl) {
      const image = document.createElement("img");
      image.src = avatarUrl.href;
      image.alt = `${profile.display_name || "Member"}'s profile picture`;
      image.loading = "lazy";
      avatar.appendChild(image);
    } else {
      avatar.textContent = getInitial(profile.display_name);
    }

    // Cover photo
    const cover = $("#cover");
    cover.style.backgroundImage = "";

    const coverUrl = profile.cover_url
      ? isSafeWebUrl(profile.cover_url)
      : null;

    if (coverUrl) {
      cover.style.backgroundImage =
        `url("${coverUrl.href.replace(/["\\]/g, "\\$&")}")`;
    }

    // Profile details
    const details = $("#details");
    details.replaceChildren();

    if (profile.location) {
      const location = document.createElement("span");
      location.textContent = `📍 ${profile.location}`;
      details.appendChild(location);
    }

    if (profile.pronouns) {
      const pronouns = document.createElement("span");
      pronouns.textContent = profile.pronouns;
      details.appendChild(pronouns);
    }

    if (profile.website) {
      let websiteValue = profile.website.trim();

      if (!/^https?:\/\//i.test(websiteValue)) {
        websiteValue = `https://${websiteValue}`;
      }

      const websiteUrl = isSafeWebUrl(websiteValue);

      if (websiteUrl) {
        const link = document.createElement("a");
        link.href = websiteUrl.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Website";
        details.appendChild(link);
      }
    }
  }

  async function initialize() {
    const status = $("#status");

    if (!window.supabase?.createClient) {
      showError("Grove couldn't load. Please refresh.");
      return;
    }

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    try {
      // A visitor may have no session, so authentication is optional.
      const {
        data: sessionData,
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) throw sessionError;

      const currentUser = sessionData.session?.user || null;

      // Determine which profile to display.
      const params = new URLSearchParams(window.location.search);
      const requestedUsername = params.get("username")?.trim();
      const requestedId = params.get("id")?.trim();

      let query = client
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, location, website, pronouns"
        );

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.ilike("username", requestedUsername);
      } else if (currentUser) {
        query = query.eq("id", currentUser.id);
      } else {
        throw new Error(
          "Choose a member profile to view, or sign in to see your own."
        );
      }

      const { data: profile, error } = await query.maybeSingle();

      if (error) throw error;

      if (!profile) {
        throw new Error("This Grove profile couldn't be found.");
      }

      // Determine whether the visitor owns this profile.
      const isOwner =
        Boolean(currentUser) && currentUser.id === profile.id;

      // Only owners receive editing and account settings links.
      const editLink = $("#edit-profile-link");
      const settingsLink = $("#settings-link");

      editLink.hidden = !isOwner;
      settingsLink.hidden = !isOwner;

      // Display profile.
      renderProfile(profile);

      // Reveal the profile and posts area.
      $("#profile-card").hidden = false;
      $("#posts-section").hidden = false;
      status.hidden = true;

    } catch (error) {
      console.error("Grove profile display error:", error);

      showError(
        error.message || "Couldn't load this profile."
      );
    }
  }

  initialize();
})();
