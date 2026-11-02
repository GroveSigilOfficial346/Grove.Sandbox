(() => {
  "use strict";

  const SUPABASE_URL = "https://wmkujovlsfvahycjcmkj.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indta3Vqb3Zsc2Z2YWh5Y2pjbWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTg2MDEsImV4cCI6MjEwODE3NDYwMX0.YgR5GG_RJWgWjczh3J4TKoTTpT4ZzRuomPsBmuakY8k";

  const MEDIA_BUCKET = "grove-media";

  const $ = (selector) => document.querySelector(selector);

  const status = $("#status");
  const actionStatus = $("#action-status");

  let client;
  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let isFollowing = false;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ff8585" : "";
  }

  function setActionStatus(message, error = false) {
    if (!actionStatus) return;
    actionStatus.textContent = message;
    actionStatus.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function getInitial(name) {
    return String(name || "G").trim().charAt(0).toUpperCase();
  }

  function setImage(element, url, fallbackText) {
    if (!element) return;

    if (url) {
      element.style.backgroundImage = `url("${url.replace(/["\\]/g, "")}")`;
      element.textContent = "";
      element.style.backgroundSize = "cover";
      element.style.backgroundPosition = "center";
    } else {
      element.style.backgroundImage = "none";
      element.textContent = fallbackText || "G";
    }
  }

  function publicMediaUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;

    const { data } = client.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return data?.publicUrl || "";
  }

  async function loadProfile() {
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    let query = client
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url")
      .limit(1);

    if (requestedId) {
      query = query.eq("id", requestedId);
    } else if (requestedUsername) {
      query = query.eq("username", requestedUsername);
    } else if (currentUser) {
      query = query.eq("id", currentUser.id);
    } else {
      setStatus("Sign in to view your profile.", true);
      return;
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("Profile loading error:", error);
      setStatus("Unable to load this profile.", true);
      return;
    }

    if (!data) {
      setStatus("This profile could not be found.", true);
      return;
    }

    profile = data;
    isOwner = Boolean(currentUser && currentUser.id === profile.id);

    renderProfile();
    await loadFollowState();
    updateButtons();

    setStatus("");
  }

  function renderProfile() {
    if (!profile) return;

    const displayName =
      profile.display_name ||
      profile.username ||
      "Grove Member";

    const username = profile.username
      ? `@${profile.username}`
      : "";

    const nameElement = $("#display-name");
    const usernameElement = $("#username");
    const bioElement = $("#bio");
    const avatarElement = $("#avatar");

    if (nameElement) {
      nameElement.textContent = displayName;
    }

    if (usernameElement) {
      usernameElement.textContent = username;
    }

    if (bioElement) {
      bioElement.textContent = profile.bio || "No bio yet.";
    }

    setImage(
      avatarElement,
      publicMediaUrl(profile.avatar_url),
      getInitial(displayName)
    );

    const editButton = $("#edit-profile-button");
    const uploadActions = $("#profile-upload-actions");

    if (editButton) {
      editButton.hidden = !isOwner;
      editButton.addEventListener("click", () => {
        window.location.href = "/edit-profile.html";
      });
    }

    if (uploadActions) {
      uploadActions.hidden = !isOwner;
    }

    const details = $("#details");
    if (details) {
      details.textContent = "";
    }

    document.title = `${displayName} | Grove`;
  }

  async function loadFollowState() {
    if (!currentUser || !profile || isOwner) return;

    const { data, error } = await client
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (error) {
      console.warn("Follow status unavailable:", error.message);
      return;
    }

    isFollowing = Boolean(data);
  }

  function updateButtons() {
    const followButton = $("#follow-button");
    const messageButton = $("#message-button");

    if (followButton) {
      followButton.hidden = isOwner || !currentUser;
      followButton.textContent = isFollowing ? "Following" : "Follow";
      followButton.disabled = !currentUser || isOwner;
    }

    if (messageButton) {
      messageButton.hidden = isOwner || !currentUser;
    }
  }

  async function toggleFollow() {
    if (!currentUser || !profile || isOwner) return;

    const button = $("#follow-button");
    if (button) button.disabled = true;

    try {
      if (isFollowing) {
        const { error } = await client
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (error) throw error;

        isFollowing = false;
      } else {
        const { error } = await client
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.id
          });

        if (error) throw error;

        isFollowing = true;
      }

      updateButtons();
      setActionStatus(isFollowing ? "Following member." : "Unfollowed member.");
    } catch (error) {
      console.error("Follow action failed:", error);
      setActionStatus(
        "Follow could not be updated. Check the follows table and permissions.",
        true
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function uploadProfileImage(file, column, prefix) {
    if (!currentUser || !isOwner || !file) return;

    if (!file.type.startsWith("image/")) {
      setActionStatus("Please select an image file.", true);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setActionStatus("Images must be smaller than 5 MB.", true);
      return;
    }

    setActionStatus("Uploading image...");

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${currentUser.id}/${prefix}-${Date.now()}.${extension}`;

    try {
      const { error: uploadError } = await client.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await client
        .from("profiles")
        .update({ [column]: path })
        .eq("id", currentUser.id);

      if (updateError) throw updateError;

      profile[column] = path;

      if (column === "avatar_url") {
        setImage(
          $("#avatar"),
          publicMediaUrl(path),
          getInitial(profile.display_name || profile.username)
        );
      }

      if (column === "cover_url") {
        setImage($("#cover"), publicMediaUrl(path), "");
      }

      setActionStatus("Image updated successfully.");
    } catch (error) {
      console.error("Image upload failed:", error);
      setActionStatus(
        "Upload failed. Check the storage bucket and its permissions.",
        true
      );
    }
  }

  function connectUpload(buttonSelector, inputSelector, column, prefix) {
    const button = $(buttonSelector);
    const input = $(inputSelector);

    if (!button || !input) return;

    button.hidden = !isOwner;

    button.addEventListener("click", () => input.click());

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (file) {
        await uploadProfileImage(file, column, prefix);
      }
      input.value = "";
    });
  }

  function connectButtons() {
    $("#follow-button")?.addEventListener("click", toggleFollow);

    connectUpload(
      "#avatar-upload-button",
      "#avatar-file",
      "avatar_url",
      "avatar"
    );

    connectUpload(
      "#cover-upload-button",
      "#cover-file",
      "cover"
    );

    const messageButton = $("#message-button");

    if (messageButton) {
      messageButton.addEventListener("click", () => {
        setActionStatus("Messaging will be connected in the messaging build.");
      });
    }
  }

  async function initialize() {
    try {
      if (!window.supabase?.createClient) {
        setStatus("Grove connection could not load. Refresh the page.", true);
        return;
      }

      client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      const { data, error } = await client.auth.getSession();

      if (error) throw error;

      currentUser = data.session?.user || null;

      connectButtons();

      await loadProfile();
    } catch (error) {
      console.error("Grove profile initialization failed:", error);
      setStatus("Something went wrong loading Grove.", true);
    }
  }

  initialize();
})();
