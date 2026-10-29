(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const $ = (selector) => document.querySelector(selector);

  async function initialize() {
    const status = $("#status");

    if (!window.supabase?.createClient) {
      status.textContent = "Grove couldn't load. Please refresh.";
      return;
    }

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    try {
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user;

      if (!user) {
        window.location.replace("auth.html?mode=login");
        return;
      }

      const { data: profile, error } = await client
        .from("profiles")
        .select(
          "username, display_name, bio, avatar_url, cover_url, location, website, pronouns"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!profile) {
        throw new Error("Your profile couldn't be found.");
      }

      $("#display-name").textContent =
        profile.display_name || "Grove Member";

      $("#username").textContent =
        profile.username ? `@${profile.username}` : "";

      const bio = $("#bio");
      if (profile.bio?.trim()) {
        bio.textContent = profile.bio;
        bio.hidden = false;
      }

      const avatar = $("#avatar");

      if (profile.avatar_url) {
        const image = document.createElement("img");
        image.src = profile.avatar_url;
        image.alt = "Profile picture";
        avatar.appendChild(image);
      } else {
        avatar.textContent =
          (profile.display_name || "G").trim().charAt(0).toUpperCase();
      }

      if (profile.cover_url) {
        $("#cover").style.backgroundImage =
          `url("${profile.cover_url.replace(/["\\]/g, "")}")`;
      }

      const details = $("#details");

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
        try {
          const url = new URL(profile.website);

          if (["https:", "http:"].includes(url.protocol)) {
            const link = document.createElement("a");
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Website";
            details.appendChild(link);
          }
        } catch {
          // Ignore invalid website URLs.
        }
      }

      $("#profile-card").hidden = false;
      $("#posts-section").hidden = false;
      status.hidden = true;

    } catch (error) {
      console.error("Grove profile display error:", error);
      status.textContent =
        error.message || "Couldn't load your profile.";
    }
  }

  initialize();
})();
