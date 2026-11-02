(() => {
  "use strict";

  const SUPABASE_URL = "https://wmkujovlsfvahycjcmkj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWIiLCJyZWYiOiJ3bWt1am92bHNmdmhheWNqY21raiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkyNTk4NjAxLCJleHAiOjIxMDgxNzQ2MDF9.YgR5GG_RJWgWjczh3J4TKoTTpT4ZzRuomPsBmuakY8k";

  const MEDIA_BUCKET = "grove-media";
  const $ = (selector) => document.querySelector(selector);

  let client;
  let currentUser = null;
  let profile = null;
  let preferences = {};
  let isOwner = false;
  let isFollowing = false;
  let followRequestPending = false;
  let acceptedFollower = false;

  const themes = {
    "midnight-violet": {
      background: "#110b27",
      accent: "#851eff",
      secondary: "#eb36ed",
      text: "#f7f5ff"
    },
    "neon-grove": {
      background: "#071522",
      accent: "#05c9f4",
      secondary: "#851eff",
      text: "#f7f5ff"
    },
    "rose-galaxy": {
      background: "#260d27",
      accent: "#eb36ed",
      secondary: "#851eff",
      text: "#fff3ff"
    },
    "ocean-light": {
      background: "#102536",
      accent: "#05c9f4",
      secondary: "#6eabff",
      text: "#f7f5ff"
    },
    "forest-night": {
      background: "#0a211b",
      accent: "#45d49a",
      secondary: "#05c9f4",
      text: "#f2fff8"
    }
  };

  function status(message, error = false) {
    const element = $("#status");
    if (!element) return;
    element.textContent = message;
    element.style.color = error ? "#ff8585" : "";
  }

  function actionStatus(message, error = false) {
    const element = $("#action-status");
    if (!element) return;
    element.textContent = message;
    element.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function safeText(element, value) {
    if (element) element.textContent = value || "";
  }

  function initial(value) {
    return String(value || "G").trim().charAt(0).toUpperCase();
  }

  function mediaUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;

    const { data } = client.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return data?.publicUrl || "";
  }

  function setBackground(element, url) {
    if (!element) return;

    element.style.backgroundImage = url
      ? `url("${url.replace(/["\\]/g, "")}")`
      : "";

    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
  }

  function applyTheme() {
    const theme = themes[preferences.theme_id] || themes["midnight-violet"];
    const root = document.documentElement;

    root.style.setProperty("--profile-panel", theme.background);
    root.style.setProperty("--profile-accent", theme.accent);
    root.style.setProperty("--profile-secondary", theme.secondary);
    root.style.setProperty("--profile-text", theme.text);

    document.body.style.color = theme.text;

    const card = $(".profile-card");
    const sections = document.querySelectorAll(".content-section");

    if (card) card.style.backgroundColor = theme.background;

    sections.forEach((section) => {
      section.style.backgroundColor = theme.background;
    });

    if (preferences.background_mode === "custom" &&
        preferences.custom_background_url) {
      document.body.style.backgroundImage =
        `linear-gradient(rgba(5,0,25,.82), rgba(5,0,25,.9)), url("${mediaUrl(preferences.custom_background_url)}")`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundPosition = "center";
    } else {
      document.body.style.backgroundImage = "";
    }
  }

  async function loadPreferences() {
    const { data, error } = await client
      .from("user_preferences")
      .select("theme_id, background_mode, custom_background_url")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (error) {
      console.warn("Profile preferences unavailable:", error.message);
      preferences = {};
      return;
    }

    preferences = data || {};
    applyTheme();
  }

  function renderProfile() {
    if (!profile) return;

    const name = profile.display_name || profile.username || "Grove Member";

    safeText($("#display-name"), name);
    safeText($("#username"), profile.username ? `@${profile.username}` : "");
    safeText($("#bio"), profile.bio || "No bio yet.");

    const avatar = $("#avatar");
    if (avatar) {
      setBackground(avatar, mediaUrl(profile.avatar_url));
      avatar.textContent = profile.avatar_url ? "" : initial(name);
    }

    setBackground($("#cover"), mediaUrl(profile.cover_url));

    const editButton = $("#edit-profile-button");
    const uploadActions = $("#profile-upload-actions");

    if (editButton) editButton.hidden = !isOwner;
    if (uploadActions) uploadActions.hidden = !isOwner;

    document.title = `${name} | Grove`;
  }

  async function loadFollowState() {
    if (!currentUser || !profile || isOwner) return;

    const { data: follow, error: followError } = await client
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (followError) {
      console.warn("Follow status:", followError.message);
    } else {
      isFollowing = Boolean(follow);
    }

    if (isFollowing) {
      acceptedFollower = true;
      return;
    }

    const { data: request, error: requestError } = await client
      .from("follow_requests")
      .select("*")
      .eq("requester_id", currentUser.id)
      .eq("target_id", profile.id)
      .maybeSingle();

    if (!requestError && request) {
      followRequestPending = true;
    }
  }

  async function sendFollowRequest() {
    if (!currentUser || !profile || isOwner) return;

    actionStatus("Sending follow request...");

    try {
      const { error } = await client
        .from("follow_requests")
        .insert({
          requester_id: currentUser.id,
          target_id: profile.id
        });

      if (error) throw error;

      followRequestPending = true;
      updateFollowButton();
      actionStatus("Follow request sent.");
    } catch (error) {
      console.error(error);
      actionStatus("Could not send follow request. Check the follow request table policies.", true);
    }
  }

  async function followPublicProfile() {
    if (!currentUser || !profile || isOwner) return;

    actionStatus("Following...");

    try {
      const { error } = await client
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: profile.id
        });

      if (error) throw error;

      isFollowing = true;
      updateFollowButton();
      actionStatus("You are now following this member.");
    } catch (error) {
      console.error(error);
      actionStatus("Could not follow this member.", true);
    }
  }

  async function unfollowProfile() {
    if (!currentUser || !profile) return;

    actionStatus("Updating follow...");

    try {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", profile.id);

      if (error) throw error;

      isFollowing = false;
      acceptedFollower = false;
      updateFollowButton();
      actionStatus("You unfollowed this member.");
    } catch (error) {
      console.error(error);
      actionStatus("Could not unfollow this member.", true);
    }
  }

  async function updateFollowButton() {
    const button = $("#follow-button");
    const messageButton = $("#message-button");

    if (button) {
      button.hidden = isOwner || !currentUser;

      if (isFollowing) {
        button.textContent = "Following";
      } else if (followRequestPending) {
        button.textContent = "Requested";
      } else {
        button.textContent = profile?.is_private ? "Request to follow" : "Follow";
      }
    }

    if (messageButton) {
      messageButton.hidden = isOwner || !currentUser;
    }
  }

  async function handleFollowClick() {
    if (isFollowing) {
      await unfollowProfile();
    } else if (followRequestPending) {
      actionStatus("Your follow request is awaiting approval.");
    } else if (profile.is_private) {
      await sendFollowRequest();
    } else {
      await followPublicProfile();
    }
  }

  async function loadMusic() {
    const section = $("#music-section");
    const content = $("#music-content");

    if (!section || !content) return;

    if (!profile.profile_music_enabled || !profile.profile_music_url) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    content.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = profile.profile_music_title || "Profile music";

    const artist = document.createElement("p");
    artist.textContent = profile.profile_music_artist || "";

    const player = document.createElement("audio");
    player.controls = true;
    player.preload = "none";
    player.src = profile.profile_music_url;

    content.append(title, artist, player);
  }

  async function loadCounts() {
    const [followers, following] = await Promise.all([
      client.from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", profile.id),

      client.from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", profile.id)
    ]);

    const details = $("#details");
    if (!details) return;

    const followerCount = followers.count ?? 0;
    const followingCount = following.count ?? 0;

    details.textContent =
      `${followerCount} followers · ${followingCount} following`;
  }

  async function loadPosts() {
    const section = $("#posts-section");
    const list = $("#posts-list");

    if (!section || !list) return;

    list.replaceChildren();

    if (profile.is_private && !isOwner && !acceptedFollower) {
      const message = document.createElement("p");
      message.textContent = "This account is private. Follow to see posts.";
      list.append(message);
      return;
    }

    const { data, error } = await client
      .from("posts")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.warn("Posts could not be loaded:", error.message);
      const message = document.createElement("p");
      message.textContent = "Posts are currently unavailable.";
      list.append(message);
      return;
    }

    if (!data?.length) {
      const empty = document.createElement("p");
      empty.textContent = "No posts yet.";
      list.append(empty);
      return;
    }

    for (const post of data) {
      const article = document.createElement("article");
      article.className = "profile-post";

      const text = document.createElement("p");
      text.textContent = post.content || post.body || "";
      article.append(text);

      const media = post.media_url || post.image_url;

      if (media) {
        const image = document.createElement("img");
        image.src = mediaUrl(media);
        image.alt = "Post media";
        image.loading = "lazy";
        image.style.maxWidth = "100%";
        image.style.borderRadius = "12px";
        article.append(image);
      }

      const date = document.createElement("small");
      date.textContent = post.created_at
        ? new Date(post.created_at).toLocaleString()
        : "";

      article.append(date);
      list.append(article);
    }
  }

  function connectUploads() {
    const controls = [
      ["#avatar-upload-button", "#avatar-file", "avatar_url", "avatar"],
      ["#cover-upload-button", "#cover-file", "cover_url", "cover"]
    ];

    for (const [buttonSelector, inputSelector, column, prefix] of controls) {
      const button = $(buttonSelector);
      const input = $(inputSelector);

      if (!button || !input || !isOwner) continue;

      button.addEventListener("click", () => input.click());

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          actionStatus("Choose an image smaller than 5 MB.", true);
          input.value = "";
          return;
        }

        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${currentUser.id}/${prefix}-${Date.now()}.${extension}`;

        actionStatus("Uploading image...");

        const { error: uploadError } = await client.storage
          .from(MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type });

        if (uploadError) {
          actionStatus(uploadError.message, true);
          input.value = "";
          return;
        }

        const { error: updateError } = await client
          .from("profiles")
          .update({ [column]: path })
          .eq("id", currentUser.id);

        if (updateError) {
          actionStatus(updateError.message, true);
          input.value = "";
          return;
        }

        profile[column] = path;
        renderProfile();
        actionStatus("Image updated.");
        input.value = "";
      });
    }
  }

  function connectButtons() {
    $("#follow-button")?.addEventListener("click", handleFollowClick);

    $("#edit-profile-button")?.addEventListener("click", () => {
      window.location.href = "/edit-profile.html";
    });

    $("#message-button")?.addEventListener("click", () => {
      window.location.href = `/messages.html?user=${encodeURIComponent(profile.id)}`;
    });

    connectUploads();
  }

  async function initialize() {
    try {
      if (!window.supabase?.createClient) {
        status("Grove could not load its connection. Refresh the page.", true);
        return;
      }

      client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      currentUser = data.session?.user || null;

      const params = new URLSearchParams(location.search);
      const requestedId = params.get("id");
      const requestedUsername = params.get("username");

      let query = client
        .from("profiles")
        .select(`
          id,
          username,
          display_name,
          bio,
          avatar_url,
          cover_url,
          is_private,
          profile_music_url,
          profile_music_title,
          profile_music_artist,
          profile_music_enabled
        `)
        .limit(1);

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.eq("username", requestedUsername);
      } else if (currentUser) {
        query = query.eq("id", currentUser.id);
      } else {
        status("Sign in to view your profile.", true);
        return;
      }

      const { data: loadedProfile, error: profileError } =
        await query.maybeSingle();

      if (profileError) throw profileError;
      if (!loadedProfile) {
        status("Profile not found.", true);
        return;
      }

      profile = loadedProfile;
      isOwner = Boolean(currentUser && currentUser.id === profile.id);

      renderProfile();
      connectButtons();

      await loadPreferences();
      await loadFollowState();

      acceptedFollower = isFollowing;
      await updateFollowButton();

      await Promise.all([
        loadMusic(),
        loadCounts(),
        loadPosts()
      ]);

      status("");
    } catch (error) {
      console.error("Profile initialization error:", error);
      status(error.message || "Unable to load profile.", true);
    }
  }

  initialize();
})();
