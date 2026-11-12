import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const MEDIA_BUCKET = "grove-media";
  const POST_MEDIA_BUCKET = "post-media-private";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  const PROFILE_TIMEOUTS = {
    auth: 8000,
    profile: 12000,
    relationship: 9000,
    appearance: 7000,
    secondary: 18000
  };

  function withTimeout(task, milliseconds, label) {
    let timer;

    return Promise.race([
      Promise.resolve().then(() => (
        typeof task === "function" ? task() : task
      )),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(label + " timed out. Refresh the page and try again."));
        }, milliseconds);
      })
    ]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  const PROFILE_COLUMNS = [
    "id", "username", "display_name", "bio", "avatar_url", "cover_url",
    "created_at", "updated_at", "location", "website", "pronouns",
    "account_type", "is_private", "profile_music_url",
    "profile_music_title", "profile_music_artist",
    "profile_music_enabled", "allow_image_downloads",
    "allow_image_saves", "allow_music_downloads", "relationship_status"
  ].join(",");

  const DIRECTORY_COLUMNS =
    "id,username,display_name,avatar_url,cover_url,is_private," +
    "theme_id,background_mode,custom_background_path";

  const ALLOWED_THEMES = new Set([
    "midnight-violet",
    "neon-grove",
    "rose-galaxy",
    "ocean-light",
    "forest-night"
  ]);

  const IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let isFollowing = false;
  let isFollowPending = false;
  let canViewPrivateContent = false;
  let incomingRequestsLoading = false;

  function setStatus(message, error = false) {
    const node = $("#status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = error ? "#ff8585" : "";
  }

  function setActionStatus(message, error = false) {
    const node = $("#action-status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = error ? "#ff8585" : "";
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function safeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    try {
      const url = new URL(value.trim());

      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function isHttpUrl(value) {
    return Boolean(safeHttpUrl(value));
  }

  function applyProfileAppearance(preferences = {}) {
    const themeId = ALLOWED_THEMES.has(preferences.theme_id)
      ? preferences.theme_id
      : "midnight-violet";

    document.body.dataset.profileTheme = themeId;

    const customPath =
      preferences.background_mode === "custom" &&
      typeof preferences.custom_background_path === "string" &&
      profile?.id &&
      preferences.custom_background_path.startsWith(profile.id + "/")
        ? preferences.custom_background_path
        : null;

    if (customPath) {
      const { data } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(customPath);

      const backgroundUrl = safeHttpUrl(data?.publicUrl);

      if (backgroundUrl) {
        document.body.style.backgroundImage =
          "linear-gradient(rgba(5, 0, 25, .58), rgba(5, 0, 25, .72)), " +
          "url(" + JSON.stringify(backgroundUrl) + ")";

        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundAttachment = "fixed";
        return;
      }
    }

    document.body.style.removeProperty("background-image");
    document.body.style.removeProperty("background-size");
    document.body.style.removeProperty("background-position");
    document.body.style.removeProperty("background-attachment");
  }

  function profileName() {
    return profile?.display_name?.trim() ||
      (profile?.username ? "@" + profile.username : "Grove Member");
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  async function loadRelationship() {
    isFollowing = false;
    isFollowPending = false;

    if (!profile) {
      canViewPrivateContent = false;
      return;
    }

    if (isOwner) {
      canViewPrivateContent = true;
      return;
    }

    if (!currentUser) {
      canViewPrivateContent = !profile.is_private;
      return;
    }

    const [following, request] = await Promise.all([
      supabase
        .from("follows")
        .select("status")
        .eq("follower_id", currentUser.id)
        .eq("following_id", profile.id)
        .maybeSingle(),

      supabase
        .from("follow_requests")
        .select("id,status")
        .eq("requester_id", currentUser.id)
        .eq("target_id", profile.id)
        .eq("status", "pending")
        .maybeSingle()
    ]);

    if (following.error) throw following.error;
    if (request.error) throw request.error;

    isFollowing = following.data?.status === "accepted";
    isFollowPending = Boolean(request.data);

    canViewPrivateContent = !profile.is_private || isFollowing;
  }

  async function loadFullProfile() {
    if (!canViewPrivateContent) return;

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", profile.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("The profile details could not be accessed.");
    }

    profile = data;
  }

  async function loadOwnerAppearance() {
    if (!isOwner || !currentUser) {
      return {
        theme_id: "midnight-violet",
        background_mode: "preset",
        custom_background_path: null
      };
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("theme_id,background_mode,custom_background_url")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    return {
      theme_id: data?.theme_id || "midnight-violet",
      background_mode: data?.background_mode || "preset",
      custom_background_path: data?.custom_background_url || null
    };
  }

  function renderDetails() {
    const container = $("#details");
    if (!container) return;

    container.replaceChildren();

    const values = [
      ["Location", profile.location],
      ["Pronouns", profile.pronouns],
      ["Account", profile.account_type],
      [
        "Relationship",
        profile.relationship_status &&
        profile.relationship_status !== "not_set"
          ? profile.relationship_status.replaceAll("_", " ")
          : ""
      ]
    ];

    for (const [label, value] of values) {
      if (!value) continue;

      container.append(
        element("span", "profile-detail", label + ": " + value)
      );
    }

    const website = safeHttpUrl(profile.website);

    if (website) {
      const link = element("a", "profile-detail", "Website");
      link.href = website;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
    }
  }

  function renderProfile() {
    const displayName = $("#display-name");
    const username = $("#username");
    const bio = $("#bio");
    const avatar = $("#avatar");
    const cover = $("#cover");
    const uploadActions = $("#profile-upload-actions");

    if (displayName) displayName.textContent = profileName();

    if (username) {
      username.textContent = profile.username
        ? "@" + profile.username
        : "";
    }

    if (bio) {
      bio.textContent = profile.bio?.trim() || "No bio yet.";
    }

    if (avatar) {
      const url = safeHttpUrl(profile.avatar_url);
      avatar.replaceChildren();

      if (url) {
        const image = element("img");
        image.src = url;
        image.alt = profileName() + " profile picture";
        image.loading = "lazy";
        avatar.append(image);
      } else {
        avatar.textContent = profileName().charAt(0).toUpperCase();
      }
    }

    if (cover) {
      const url = safeHttpUrl(profile.cover_url);
      cover.style.backgroundImage = url
        ? "url(" + JSON.stringify(url) + ")"
        : "";
    }

    if (uploadActions) {
      uploadActions.hidden = !isOwner;
    }

    renderDetails();
    renderMusic();
  }

  function updateButtons() {
    const follow = $("#follow-button");
    const message = $("#message-button");
    const edit = $("#edit-profile-button");

    if (follow) {
      follow.hidden = !currentUser || isOwner;
      follow.disabled = !currentUser || isOwner;

      follow.textContent = isFollowing
        ? "Following"
        : isFollowPending
          ? "Cancel request"
          : "Follow";
    }

    if (message) {
      message.hidden = !currentUser || isOwner;
    }

    if (edit) {
      edit.hidden = !isOwner;
    }
  }

  async function followAction() {
    if (!currentUser || !profile || isOwner) return;

    const button = $("#follow-button");
    if (button) button.disabled = true;

    setActionStatus("Updating follow status...");

    let resultMessage = "Follow status updated.";

    try {
      if (isFollowPending) {
        const { error } = await supabase
          .from("follow_requests")
          .delete()
          .eq("requester_id", currentUser.id)
          .eq("target_id", profile.id)
          .eq("status", "pending");

        if (error) throw error;

        resultMessage = "Follow request cancelled.";

      } else if (isFollowing) {
        if (profile.is_private) {
          const { error: requestError } = await supabase
            .from("follow_requests")
            .delete()
            .eq("requester_id", currentUser.id)
            .eq("target_id", profile.id)
            .eq("status", "accepted");

          if (requestError) throw requestError;
        }

        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (error) throw error;

        resultMessage = "You unfollowed this member.";

      } else if (profile.is_private) {
        const { error: clearError } = await supabase
          .from("follow_requests")
          .delete()
          .eq("requester_id", currentUser.id)
          .eq("target_id", profile.id)
          .eq("status", "declined");

        if (clearError) throw clearError;

        const { error } = await supabase
          .from("follow_requests")
          .insert({
            requester_id: currentUser.id,
            target_id: profile.id
          });

        if (error) throw error;

        resultMessage = "Follow request sent.";

      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.id,
            status: "accepted"
          });

        if (error) throw error;

        resultMessage = "You are now following this member.";
      }

      await loadRelationship();
      updateButtons();

      await Promise.all([
        loadCounts(),
        loadPosts()
      ]);

      setActionStatus(resultMessage);

    } catch (error) {
      console.error("Follow action failed:", error);

      setActionStatus(
        error.message || "Could not update follow status.",
        true
      );

      try {
        await loadRelationship();
      } catch (refreshError) {
        console.error("Relationship refresh failed:", refreshError);
      }

    } finally {
      updateButtons();
    }
  }

  function getIncomingRequestPanel() {
    let panel = $("#follow-requests-panel");

    if (panel) return panel;

    panel = element("section", "content-section follow-requests-panel");
    panel.id = "follow-requests-panel";

    const heading = element("h2", "", "Follow requests");
    const list = element("div", "follow-requests-list");
    list.id = "follow-requests-list";

    panel.append(heading, list);

    const actions = $(".profile-actions");

    if (actions) {
      actions.insertAdjacentElement("afterend", panel);
    } else {
      $(".profile-main")?.append(panel);
    }

    return panel;
  }

  async function loadIncomingFollowRequests() {
    if (!isOwner || !currentUser || incomingRequestsLoading) return;

    incomingRequestsLoading = true;

    try {
      const panel = getIncomingRequestPanel();
      const list = $("#follow-requests-list");

      if (!panel || !list) return;

      panel.hidden = false;
      list.replaceChildren(
        element("p", "muted", "Loading requests...")
      );

      const { data: requests, error } = await supabase
        .from("follow_requests")
        .select("id,requester_id,created_at")
        .eq("target_id", currentUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!requests?.length) {
        list.replaceChildren(
          element("p", "muted", "No pending follow requests.")
        );
        return;
      }

      const requesterIds = [
        ...new Set(requests.map(request => request.requester_id))
      ];

      const { data: directoryProfiles, error: profilesError } =
        await supabase
          .from("profile_directory")
          .select("id,username,display_name,avatar_url")
          .in("id", requesterIds);

      if (profilesError) throw profilesError;

      const profilesById = new Map(
        (directoryProfiles || []).map(item => [item.id, item])
      );

      list.replaceChildren();

      for (const request of requests) {
        const requester = profilesById.get(request.requester_id);
        const card = element("article", "follow-request-card");

        const identity = element("div", "follow-request-identity");

        const name = requester?.display_name ||
          (requester?.username ? "@" + requester.username : "Grove Member");

        const link = element("a", "follow-request-name", name);
        link.href =
          "/profile.html?id=" +
          encodeURIComponent(request.requester_id);

        const date = element(
          "p",
          "muted",
          formatDate(request.created_at)
        );

        identity.append(link, date);

        const controls = element("div", "follow-request-actions");

        const accept = element(
          "button",
          "button primary",
          "Accept"
        );
        accept.type = "button";

        const decline = element(
          "button",
          "button secondary",
          "Decline"
        );
        decline.type = "button";

        accept.addEventListener("click", () => {
          decideFollowRequest(request.id, "accepted", accept, decline);
        });

        decline.addEventListener("click", () => {
          decideFollowRequest(request.id, "declined", accept, decline);
        });

        controls.append(accept, decline);
        card.append(identity, controls);
        list.append(card);
      }

    } catch (error) {
      console.error("Incoming follow requests failed:", error);

      const list = $("#follow-requests-list");

      if (list) {
        list.replaceChildren(
          element(
            "p",
            "muted",
            error.message || "Could not load follow requests."
          )
        );
      }

    } finally {
      incomingRequestsLoading = false;
    }
  }

  async function decideFollowRequest(
    requestId,
    decision,
    acceptButton,
    declineButton
  ) {
    if (!isOwner || !currentUser) return;

    acceptButton.disabled = true;
    declineButton.disabled = true;

    setActionStatus(
      decision === "accepted"
        ? "Accepting follow request..."
        : "Declining follow request..."
    );

    try {
      const { data, error } = await supabase
        .from("follow_requests")
        .update({
          status: decision,
          updated_at: new Date().toISOString()
        })
        .eq("id", requestId)
        .eq("target_id", currentUser.id)
        .eq("status", "pending")
        .select("id,status")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "This request is no longer pending. Refresh the request list."
        );
      }

      await loadIncomingFollowRequests();
      await loadCounts();

      setActionStatus(
        decision === "accepted"
          ? "Follow request accepted."
          : "Follow request declined."
      );

    } catch (error) {
      console.error("Follow request decision failed:", error);

      setActionStatus(
        error.message || "Could not update this follow request.",
        true
      );

      acceptButton.disabled = false;
      declineButton.disabled = false;
    }
  }

  async function loadCounts() {
    if (!profile) return;

    const [followers, following, posts] = await Promise.all([
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", profile.id)
        .eq("status", "accepted"),

      supabase
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", profile.id)
        .eq("status", "accepted"),

      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("author_id", profile.id)
    ]);

    const stats = $("#profile-stats");
    if (!stats) return;

    stats.replaceChildren();

    const items = [
      ["Posts", posts.error ? null : posts.count],
      ["Followers", followers.error ? null : followers.count],
      ["Following", following.error ? null : following.count]
    ];

    for (const [label, count] of items) {
      stats.append(
        element(
          "span",
          "profile-stat",
          (count === null ? "—" : String(count ?? 0)) + " " + label
        )
      );
    }

    for (const result of [followers, following, posts]) {
      if (result.error) {
        console.warn("A profile count could not load:", result.error);
      }
    }
  }

  function renderMusic() {
    const section = $("#music-section");
    const container = $("#music-content");

    if (!section || !container) return;

    container.replaceChildren();

    const url = safeHttpUrl(profile?.profile_music_url);

    if (!profile?.profile_music_enabled || !url) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    if (profile.profile_music_title) {
      container.append(
        element("h3", "", profile.profile_music_title)
      );
    }

    if (profile.profile_music_artist) {
      container.append(
        element("p", "muted", profile.profile_music_artist)
      );
    }

    const audio = element("audio", "profile-audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = url;

    container.append(audio);
  }

  async function createPostSignedUrlMap(posts) {
    const paths = [
      ...new Set(
        posts.flatMap(post =>
          (Array.isArray(post.media_urls) ? post.media_urls : [])
            .filter(value =>
              typeof value === "string" &&
              value.trim() &&
              !isHttpUrl(value)
            )
        )
      )
    ];

    const signedUrls = new Map();

    if (!paths.length) return signedUrls;

    const { data, error } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrls(paths, 180);

    if (error) throw error;

    for (const item of data || []) {
      if (item.path && item.signedUrl && !item.error) {
        signedUrls.set(item.path, item.signedUrl);
      }
    }

    return signedUrls;
  }

  function renderPost(post, likesByPost, viewerLikes, signedUrlsByPath) {
    const card = element("article", "profile-post");
    card.dataset.postId = post.id;

    if (post.body) {
      card.append(
        element("p", "profile-post-body", post.body)
      );
    }

    const media = Array.isArray(post.media_urls)
      ? post.media_urls
      : [];

    if (media.length) {
      const gallery = element("div", "profile-post-gallery");

      for (const value of media) {
        if (typeof value !== "string") continue;

        const url = isHttpUrl(value)
          ? safeHttpUrl(value)
          : signedUrlsByPath.get(value);

        if (!url) continue;

        const link = element("a", "profile-post-media-link");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const image = element("img", "profile-post-image");
        image.src = url;
        image.alt = "Post image";
        image.loading = "lazy";

        link.append(image);
        gallery.append(link);
      }

      if (gallery.childElementCount) {
        card.append(gallery);
      }
    }

    const footer = element("div", "profile-post-footer");
    const date = new Date(post.created_at);

    if (!Number.isNaN(date.getTime())) {
      const time = element("time", "muted", date.toLocaleString());
      time.dateTime = post.created_at;
      footer.append(time);
    }

    const count = likesByPost.get(post.id) || 0;
    const liked = viewerLikes.has(post.id);

    footer.append(
      element(
        "span",
        liked ? "profile-post-likes liked" : "profile-post-likes",
        count + (count === 1 ? " like" : " likes")
      )
    );

    card.append(footer);
    return card;
  }

  async function loadPosts() {
    const container = $("#posts-list");
    if (!container || !profile) return;

    if (profile.is_private && !canViewPrivateContent) {
      container.replaceChildren(
        element(
          "p",
          "muted",
          "This profile is private. Follow to request access."
        )
      );
      return;
    }

    container.replaceChildren(
      element("p", "muted", "Loading posts...")
    );

    const { data: posts, error } = await supabase
      .from("posts")
      .select("id,author_id,body,media_urls,visibility,created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!posts?.length) {
      container.replaceChildren(
        element("p", "muted", "No posts yet.")
      );
      return;
    }

    const ids = posts.map(post => post.id);

    const [
      likes,
      mine,
      signedUrlsByPath
    ] = await Promise.all([
      supabase
        .from("post_likes")
        .select("post_id")
        .in("post_id", ids),

      currentUser
        ? supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", currentUser.id)
            .in("post_id", ids)
        : Promise.resolve({ data: [], error: null }),

      createPostSignedUrlMap(posts)
    ]);

    if (likes.error) {
      console.warn("Post likes unavailable:", likes.error);
    }

    if (mine.error) {
      console.warn("Your likes unavailable:", mine.error);
    }

    const likeCounts = new Map();

    for (const row of likes.data || []) {
      likeCounts.set(
        row.post_id,
        (likeCounts.get(row.post_id) || 0) + 1
      );
    }

    const viewerLikes = new Set(
      (mine.data || []).map(row => row.post_id)
    );

    container.replaceChildren();

    for (const post of posts) {
      container.append(
        renderPost(post, likeCounts, viewerLikes, signedUrlsByPath)
      );
    }
  }

  function storagePathFromPublicUrl(value) {
    if (!value || !currentUser) return null;

    try {
      const url = new URL(value);
      const marker =
        "/storage/v1/object/public/" + MEDIA_BUCKET + "/";

      const index = url.pathname.indexOf(marker);
      if (index < 0) return null;

      const path = decodeURIComponent(
        url.pathname.slice(index + marker.length)
      );

      return path.startsWith(currentUser.id + "/")
        ? path
        : null;

    } catch {
      return null;
    }
  }

  async function uploadProfileImage(file, field) {
    if (!currentUser || !isOwner) {
      throw new Error("Only the profile owner can upload profile images.");
    }

    if (!file || !IMAGE_TYPES[file.type]) {
      throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        "Profile images must be larger than 0 bytes and 5 MB or smaller."
      );
    }

    const extension = IMAGE_TYPES[file.type];

    const path =
      currentUser.id +
      "/profile-" +
      field +
      "-" +
      crypto.randomUUID() +
      "." +
      extension;

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    const publicUrl = safeHttpUrl(data?.publicUrl);

    if (!publicUrl) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      throw new Error("Could not create the uploaded image URL.");
    }

    const column = field === "avatar"
      ? "avatar_url"
      : "cover_url";

    const oldPath = storagePathFromPublicUrl(profile[column]);

    try {
      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          [column]: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        throw new Error("The profile image could not be saved.");
      }

      profile[column] = publicUrl;

      if (oldPath && oldPath !== path) {
        const { error: removeError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .remove([oldPath]);

        if (removeError) {
          console.warn(
            "Previous profile image cleanup failed:",
            removeError
          );
        }
      }

      renderProfile();

      setActionStatus(
        field === "avatar"
          ? "Profile picture updated."
          : "Cover image updated."
      );

    } catch (error) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      throw error;
    }
  }

  function connectUploads() {
    const avatarButton = $("#avatar-upload-button");
    const avatarInput = $("#avatar-file");
    const coverButton = $("#cover-upload-button");
    const coverInput = $("#cover-file");

    if (avatarButton && avatarInput) {
      avatarButton.addEventListener("click", () => {
        avatarInput.click();
      });

      avatarInput.addEventListener("change", async () => {
        const file = avatarInput.files?.[0];
        avatarInput.value = "";

        if (!file) return;

        avatarButton.disabled = true;
        setActionStatus("Uploading profile picture...");

        try {
          await uploadProfileImage(file, "avatar");
        } catch (error) {
          console.error("Avatar upload failed:", error);
          setActionStatus(
            error.message || "Profile picture upload failed.",
            true
          );
        } finally {
          avatarButton.disabled = false;
        }
      });
    }

    if (coverButton && coverInput) {
      coverButton.addEventListener("click", () => {
        coverInput.click();
      });

      coverInput.addEventListener("change", async () => {
        const file = coverInput.files?.[0];
        coverInput.value = "";

        if (!file) return;

        coverButton.disabled = true;
        setActionStatus("Uploading cover image...");

        try {
          await uploadProfileImage(file, "cover");
        } catch (error) {
          console.error("Cover upload failed:", error);
          setActionStatus(
            error.message || "Cover image upload failed.",
            true
          );
        } finally {
          coverButton.disabled = false;
        }
      });
    }
  }

  async function initialize() {
    try {
      setStatus("Loading profile...");

      const { data: auth, error: authError } = await withTimeout(
        () => supabase.auth.getUser(),
        PROFILE_TIMEOUTS.auth,
        "Authentication"
      );

      if (authError) throw authError;
      currentUser = auth.user || null;

      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get("id");
      const requestedUsername = params.get("username");

      let directoryAppearance = null;

      if (!requestedId && !requestedUsername && !currentUser) {
        setStatus("Sign in to view your profile.", true);
        return;
      }

      if (!requestedId && !requestedUsername && currentUser) {
        const { data, error } = await withTimeout(
          () => supabase
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .eq("id", currentUser.id)
            .maybeSingle(),
          PROFILE_TIMEOUTS.profile,
          "Your profile lookup"
        );

        if (error) throw error;
        if (!data) throw new Error("Your profile could not be found.");

        profile = data;
        isOwner = true;

      } else {
        let query = supabase
          .from("profile_directory")
          .select(DIRECTORY_COLUMNS);

        query = requestedId
          ? query.eq("id", requestedId)
          : query.eq("username", requestedUsername.toLowerCase());

        const { data, error } = await withTimeout(
          () => query.maybeSingle(),
          PROFILE_TIMEOUTS.profile,
          "Directory profile lookup"
        );

        if (error) throw error;

        if (!data) {
          setStatus("Profile not found.", true);
          return;
        }

        profile = data;
        isOwner = Boolean(
          currentUser && currentUser.id === profile.id
        );

        directoryAppearance = {
          theme_id: data.theme_id,
          background_mode: data.background_mode,
          custom_background_path: data.custom_background_path
        };
      }

      try {
        await withTimeout(
          () => loadRelationship(),
          PROFILE_TIMEOUTS.relationship,
          "Relationship lookup"
        );
      } catch (error) {
        console.warn("Relationship lookup failed:", error);
        isFollowing = false;
        isFollowPending = false;
        // Fail closed for private profiles if access cannot be verified.
        canViewPrivateContent = isOwner || !profile.is_private;
      }

      if (canViewPrivateContent) {
        await withTimeout(
          () => loadFullProfile(),
          PROFILE_TIMEOUTS.profile,
          "Extended profile lookup"
        );
      }

      let appearance = directoryAppearance || {
        theme_id: "midnight-violet",
        background_mode: "preset",
        custom_background_path: null
      };

      if (isOwner) {
        try {
          appearance = await withTimeout(
            () => loadOwnerAppearance(),
            PROFILE_TIMEOUTS.appearance,
            "Profile appearance"
          );
        } catch (error) {
          console.warn("Appearance lookup failed; using defaults:", error);
        }
      }

      applyProfileAppearance(appearance);

      if (profile.is_private && !canViewPrivateContent) {
        setStatus(
          "This profile is private. Follow to request access."
        );
      } else {
        setStatus("");
      }

      renderProfile();
      updateButtons();
      connectUploads();

      $("#follow-button")?.addEventListener(
        "click",
        followAction
      );

      $("#edit-profile-button")?.addEventListener(
        "click",
        () => {
          if (isOwner) {
            window.location.href = "/edit-profile.html";
          }
        }
      );

      $("#message-button")?.addEventListener(
        "click",
        () => {
          if (!currentUser || isOwner) return;

          window.location.href =
            "/messages.html?user=" +
            encodeURIComponent(profile.id);
        }
      );

      const tasks = [
        loadCounts(),
        loadPosts()
      ];

      if (isOwner) {
        tasks.push(loadIncomingFollowRequests());
      }

      const sectionResults = await withTimeout(
        () => Promise.allSettled(tasks),
        PROFILE_TIMEOUTS.secondary,
        "Profile posts and statistics"
      );

      for (const result of sectionResults) {
        if (result.status === "rejected") {
          console.warn("A profile section could not load:", result.reason);
        }
      }

      const postsContainer = $("#posts-list");
      if (
        postsContainer &&
        postsContainer.textContent.includes("Loading posts")
      ) {
        postsContainer.replaceChildren(
          element(
            "p",
            "muted",
            "Posts are taking longer than expected. Refresh to try again."
          )
        );
      }

    } catch (error) {
      console.error("Profile initialization failed:", error);

      setStatus(
        error.message || "Unable to load profile.",
        true
      );
    }
  }

  initialize();
})();
