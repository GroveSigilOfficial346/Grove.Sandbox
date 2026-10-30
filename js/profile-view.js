(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const MEDIA_BUCKET = "grove-media";
  const PRIVATE_BUCKET = "grove-private";

  const $ = (selector) => document.querySelector(selector);
  let client;
  let currentUser;
  let profile;
  let isOwner = false;
  let isAcceptedFollower = false;

  function setActionStatus(message, isError = false) {
    const el = $("#action-status");
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "#ff9caa" : "#45e5ff";
  }

  function showError(message) {
    const status = $("#status");
    status.textContent = message;
    status.hidden = false;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  function initial(value) {
    return (value || "G").trim().charAt(0).toUpperCase() || "G";
  }

  async function resolveMedia(value) {
    if (!value) return null;

    if (value.startsWith("private:")) {
      const path = value.slice("private:".length);
      const { data, error } = await client.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(path, 3600);

      if (error) {
        console.warn("Private media unavailable:", error.message);
        return null;
      }

      return data?.signedUrl || null;
    }

    if (value.startsWith("public:")) {
      const path = value.slice("public:".length);
      const { data } = client.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(path);

      return data?.publicUrl || null;
    }

    return safeUrl(value)?.href || null;
  }

  async function renderProfile(data) {
    $("#display-name").textContent = data.display_name || "Grove Member";
    $("#username").textContent = data.username ? `@${data.username}` : "";

    if (data.bio?.trim()) {
      $("#bio").textContent = data.bio;
      $("#bio").hidden = false;
    } else {
      $("#bio").hidden = true;
    }

    const avatar = $("#avatar");
    avatar.replaceChildren();

    const avatarUrl = await resolveMedia(data.avatar_url);

    if (avatarUrl) {
      const image = document.createElement("img");
      image.src = avatarUrl;
      image.alt = `${data.display_name || "Member"}'s profile picture`;
      image.loading = "lazy";
      avatar.appendChild(image);
    } else {
      avatar.textContent = initial(data.display_name);
    }

    const cover = $("#cover");
    cover.style.backgroundImage = "";

    const coverUrl = await resolveMedia(data.cover_url);

    if (coverUrl) {
      cover.style.backgroundImage =
        `url("${coverUrl.replace(/["\\]/g, "\\$&")}")`;
    }

    const details = $("#details");
    details.replaceChildren();

    if (data.location) {
      const item = document.createElement("span");
      item.textContent = `📍 ${data.location}`;
      details.appendChild(item);
    }

    if (data.pronouns) {
      const item = document.createElement("span");
      item.textContent = data.pronouns;
      details.appendChild(item);
    }

    if (data.website) {
      let value = data.website.trim();

      if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
      }

      const url = safeUrl(value);

      if (url) {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Website";
        details.appendChild(link);
      }
    }
  }

  async function checkFollowState() {
    if (!currentUser || isOwner) return;

    const { data: follow, error } = await client
      .from("follows")
      .select("status")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (error) {
      console.warn("Follow status unavailable:", error.message);
    }

    isAcceptedFollower = follow?.status === "accepted";

    const button = $("#follow-button");

    if (isAcceptedFollower) {
      button.textContent = "Following";
      button.dataset.pending = "false";
      return;
    }

    if (profile.is_private) {
      const { data: request, error: requestError } = await client
        .from("follow_requests")
        .select("id,status")
        .eq("requester_id", currentUser.id)
        .eq("target_id", profile.id)
        .eq("status", "pending")
        .maybeSingle();

      if (requestError) {
        console.warn("Follow request status unavailable:", requestError.message);
      }

      button.textContent = request ? "Requested" : "Request to follow";
      button.dataset.pending = request ? "true" : "false";
    } else {
      button.textContent = "Follow";
      button.dataset.pending = "false";
    }
  }

  async function handleFollow() {
    if (!currentUser || isOwner) return;

    const button = $("#follow-button");
    button.disabled = true;

    try {
      if (isAcceptedFollower) {
        const { error } = await client
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (error) throw error;

        isAcceptedFollower = false;
        button.dataset.pending = "false";
        button.textContent = profile.is_private
          ? "Request to follow"
          : "Follow";

        setActionStatus("You unfollowed this member.");
        return;
      }

      if (profile.is_private) {
        if (button.dataset.pending === "true") {
          setActionStatus("Your follow request is already pending.");
          return;
        }

        const { error } = await client
          .from("follow_requests")
          .insert({
            requester_id: currentUser.id,
            target_id: profile.id,
            status: "pending"
          });

        if (error) throw error;

        button.dataset.pending = "true";
        button.textContent = "Requested";
        setActionStatus("Follow request sent.");
      } else {
        const { error } = await client
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.id,
            status: "accepted"
          });

        if (error) throw error;

        isAcceptedFollower = true;
        button.textContent = "Following";
        setActionStatus("You are now following this member.");
      }
    } catch (error) {
      console.error("Follow action failed:", error);
      setActionStatus(error.message || "Could not update follow status.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function uploadProfileImage(kind, file) {
    if (!isOwner || !file) return;

    if (!file.type.startsWith("image/")) {
      setActionStatus("Choose an image file.", true);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setActionStatus("Images must be 8 MB or smaller.", true);
      return;
    }

    const button = kind === "avatar"
      ? $("#avatar-upload-button")
      : $("#cover-upload-button");

    button.disabled = true;
    setActionStatus("Uploading image…");

    try {
      const extension = (file.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";

      const path =
        `${currentUser.id}/profile/${kind}-${crypto.randomUUID()}.${extension}`;

      const bucket = profile.is_private
        ? PRIVATE_BUCKET
        : MEDIA_BUCKET;

      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const storedValue = bucket === PRIVATE_BUCKET
        ? `private:${path}`
        : `public:${path}`;

      const column = kind === "avatar"
        ? "avatar_url"
        : "cover_url";

      const { error: updateError } = await client
        .from("profiles")
        .update({
          [column]: storedValue,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id);

      if (updateError) {
        await client.storage.from(bucket).remove([path]);
        throw updateError;
      }

      profile[column] = storedValue;
      await renderProfile(profile);

      setActionStatus(
        kind === "avatar"
          ? "Profile photo updated."
          : "Cover photo updated."
      );
    } catch (error) {
      console.error("Profile image upload failed:", error);
      setActionStatus(error.message || "Image upload failed.", true);
    } finally {
      button.disabled = false;
    }
  }

  function bindImageButtons() {
    $("#avatar-upload-button").addEventListener("click", () => {
      $("#avatar-file").click();
    });

    $("#cover-upload-button").addEventListener("click", () => {
      $("#cover-file").click();
    });

    $("#avatar-file").addEventListener("change", (event) => {
      uploadProfileImage("avatar", event.target.files?.[0]);
      event.target.value = "";
    });

    $("#cover-file").addEventListener("change", (event) => {
      uploadProfileImage("cover", event.target.files?.[0]);
      event.target.value = "";
    });
  }

  async function loadMusic() {
    const section = $("#music-section");
    const content = $("#music-content");

    content.replaceChildren();

    if (!profile.profile_music_enabled) {
      section.hidden = true;
      return;
    }

    let track = null;

    const { data: tracks, error } = await client
      .from("audio_tracks")
      .select("id,title,artist,storage_path,mime_type,allow_download")
      .eq("owner_id", profile.id)
      .eq("is_profile_track", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("Profile track lookup failed:", error.message);
    }

    if (tracks?.length) {
      track = tracks[0];
    }

    let audioUrl = null;
    let canDownload = false;

    // First use the URL saved by Profile Settings.
    // This works even if the audio_tracks flag is missing or outdated.
    if (profile.profile_music_url) {
      audioUrl = await resolveMedia(profile.profile_music_url);
      canDownload = Boolean(
        profile.allow_music_downloads && audioUrl
      );
    }

    // If the saved URL could not be resolved, fall back to the selected track.
    if (!audioUrl && track?.storage_path) {
      const { data: privateData, error: privateError } = await client.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(track.storage_path, 3600);

      if (!privateError) {
        audioUrl = privateData?.signedUrl || null;
      }

      if (!audioUrl) {
        const { data: publicData } = client.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(track.storage_path);

        audioUrl = publicData?.publicUrl || null;
      }

      canDownload = Boolean(
        profile.allow_music_downloads &&
        track.allow_download &&
        audioUrl
      );
    }

    if (!audioUrl) {
      section.hidden = true;
      console.warn("Profile music is enabled, but no playable URL resolved.");
      return;
    }

    section.hidden = false;

    const player = document.createElement("div");
    player.className = "music-player";

    const title = document.createElement("p");
    title.className = "music-title";
    title.textContent =
      track?.title ||
      profile.profile_music_title ||
      "Profile track";

    const artist = document.createElement("p");
    artist.className = "music-artist";
    artist.textContent =
      track?.artist ||
      profile.profile_music_artist ||
      "";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = audioUrl;
    audio.setAttribute("aria-label", `Play ${title.textContent}`);

    audio.addEventListener("error", () => {
      console.warn("The browser could not play the saved profile music URL.");
      setActionStatus(
        "Music is saved, but the audio file could not be played. Check its storage access and format.",
        true
      );
    });

    player.append(title, artist, audio);

    if (canDownload) {
      const download = document.createElement("a");
      download.className = "music-download";
      download.href = audioUrl;
      download.download = `${title.textContent}.mp3`;
      download.textContent = "Download track";
      player.appendChild(download);
    }

    content.appendChild(player);
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function addPostStyles() {
    if ($("#grove-profile-post-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-profile-post-styles";
    style.textContent = `
      .grove-profile-post {
        padding: 20px;
        border: 1px solid #851eff44;
        border-radius: 14px;
        background: #08051a;
        overflow-wrap: anywhere;
      }
      .grove-profile-post-date {
        margin: 0 0 12px;
        color: #a99bc9;
        font-size: 12px;
      }
      .grove-profile-post-body {
        margin: 0;
        color: #f7f5ff;
        line-height: 1.7;
        white-space: pre-wrap;
      }
      .grove-profile-post-image {
        display: block;
        width: 100%;
        max-height: 500px;
        margin-top: 14px;
        border-radius: 10px;
        object-fit: contain;
        background: #050019;
      }
      .grove-profile-comments {
        display: grid;
        gap: 10px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid #851eff33;
      }
      .grove-profile-comments-title {
        margin: 0 0 2px;
        color: #45e5ff;
        font-size: 13px;
      }
      .grove-profile-comment {
        padding: 10px 12px;
        border-radius: 9px;
        background: #111025;
        color: #d9d0ed;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
      }
      .grove-profile-comment-author {
        display: block;
        margin-bottom: 3px;
        color: #45e5ff;
        font-weight: 700;
      }
      .grove-profile-no-comments {
        color: #a99bc9;
        font-size: 13px;
      }
    `;

    document.head.appendChild(style);
  }

  async function loadPosts() {
    const section = $("#posts-section");
    const list = $("#posts-list");

    section.hidden = false;
    list.replaceChildren();

    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Loading posts and comments…";
    list.appendChild(loading);

    const { data: posts, error } = await client
      .from("posts")
      .select("id,author_id,body,media_urls,visibility,created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Posts could not load:", error);

      list.replaceChildren();

      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent =
        "Posts couldn't be loaded. This may be a privacy restriction.";

      list.appendChild(message);
      return;
    }

    if (!posts?.length) {
      list.replaceChildren();

      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "This member hasn't posted anything yet.";

      list.appendChild(empty);
      return;
    }

    const postIds = posts.map((post) => post.id);

    const { data: comments, error: commentError } = await client
      .from("comments")
      .select("id,post_id,author_id,body,created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentError) {
      console.warn("Comments could not load:", commentError);
    }

    const safeComments = commentError ? [] : (comments || []);
    const authorIds = [
      ...new Set(safeComments.map((comment) => comment.author_id))
    ];

    let authors = new Map();

    if (authorIds.length) {
      const { data } = await client
        .from("profiles")
        .select("id,username,display_name")
        .in("id", authorIds);

      authors = new Map(
        (data || []).map((item) => [item.id, item])
      );
    }

    const byPost = new Map();

    safeComments.forEach((comment) => {
      if (!byPost.has(comment.post_id)) {
        byPost.set(comment.post_id, []);
      }

      byPost.get(comment.post_id).push(comment);
    });

    addPostStyles();
    list.replaceChildren();

    for (const post of posts) {
      const article = document.createElement("article");
      article.className = "grove-profile-post";

      const date = document.createElement("p");
      date.className = "grove-profile-post-date";
      date.textContent = formatDate(post.created_at);
      article.appendChild(date);

      if (post.body?.trim()) {
        const body = document.createElement("p");
        body.className = "grove-profile-post-body";
        body.textContent = post.body;
        article.appendChild(body);
      }

      for (const media of (
        Array.isArray(post.media_urls) ? post.media_urls : []
      )) {
        const url = await resolveMedia(media);

        if (!url) continue;

        const image = document.createElement("img");
        image.className = "grove-profile-post-image";
        image.src = url;
        image.alt = "Post image";
        image.loading = "lazy";
        article.appendChild(image);
      }

      const postComments = byPost.get(post.id) || [];
      const commentsBox = document.createElement("section");
      commentsBox.className = "grove-profile-comments";

      const heading = document.createElement("h3");
      heading.className = "grove-profile-comments-title";
      heading.textContent = `Comments (${postComments.length})`;
      commentsBox.appendChild(heading);

      if (!postComments.length) {
        const empty = document.createElement("p");
        empty.className = "grove-profile-no-comments";
        empty.textContent = "No comments yet.";
        commentsBox.appendChild(empty);
      } else {
        postComments.forEach((comment) => {
          const row = document.createElement("div");
          row.className = "grove-profile-comment";

          const author = document.createElement("span");
          author.className = "grove-profile-comment-author";

          const authorProfile = authors.get(comment.author_id);

          author.textContent =
            authorProfile?.display_name ||
            (authorProfile?.username
              ? `@${authorProfile.username}`
              : "Grove Member");

          const text = document.createElement("span");
          text.textContent = comment.body;

          row.append(author, text);
          commentsBox.appendChild(row);
        });
      }

      article.appendChild(commentsBox);
      list.appendChild(article);
    }
  }

  async function initialize() {
    if (!window.supabase?.createClient) {
      showError("Grove couldn't load. Please refresh.");
      return;
    }

    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    try {
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      currentUser = sessionData.session?.user || null;

      const params = new URLSearchParams(window.location.search);
      const requestedUsername = params.get("username")?.trim();
      const requestedId = params.get("id")?.trim();

      let query = client
        .from("profiles")
        .select(
          "id,username,display_name,bio,avatar_url,cover_url,location,website,pronouns,is_private,pr
