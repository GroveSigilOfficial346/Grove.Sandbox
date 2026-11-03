import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const PROFILE_COLUMNS = [
    "id",
    "username",
    "display_name",
    "bio",
    "avatar_url",
    "cover_url",
    "created_at",
    "updated_at",
    "location",
    "website",
    "pronouns",
    "account_type",
    "is_private",
    "profile_music_url",
    "profile_music_title",
    "profile_music_artist",
    "profile_music_enabled",
    "allow_image_downloads",
    "allow_image_saves",
    "allow_music_downloads",
    "relationship_status"
  ].join(",");

  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let isFollowing = false;
  let isFollowedBy = false;
  let isFollowPending = false;
  let canViewPrivateContent = false;

  function setStatus(message, error = false) {
    const element = $("#status");
    if (!element) return;

    element.textContent = message;
    element.style.color = error ? "#ff8585" : "";
  }

  function setActionStatus(message, error = false) {
    const element = $("#action-status");
    if (!element) return;

    element.textContent = message;
    element.style.color = error ? "#ff8585" : "";
  }

  function safeHttpUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(value, window.location.origin);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function getProfileName() {
    return (
      profile?.display_name?.trim() ||
      (profile?.username ? `@${profile.username}` : "Grove Member")
    );
  }

  async function loadRelationship() {
    isFollowing = false;
    isFollowedBy = false;
    isFollowPending = false;

    canViewPrivateContent = Boolean(isOwner);

    if (!currentUser || !profile || isOwner) return;

    const [followingResult, followedByResult, requestResult] =
      await Promise.all([
        supabase
          .from("follows")
          .select("status")
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id)
          .maybeSingle(),

        supabase
          .from("follows")
          .select("status")
          .eq("follower_id", profile.id)
          .eq("following_id", currentUser.id)
          .maybeSingle(),

        supabase
          .from("follow_requests")
          .select("id,status")
          .eq("requester_id", currentUser.id)
          .eq("target_id", profile.id)
          .eq("status", "pending")
          .maybeSingle()
      ]);

    if (followingResult.error) throw followingResult.error;
    if (followedByResult.error) throw followedByResult.error;
    if (requestResult.error) throw requestResult.error;

    isFollowing = followingResult.data?.status === "accepted";
    isFollowedBy = followedByResult.data?.status === "accepted";
    isFollowPending = Boolean(requestResult.data);

    canViewPrivateContent =
      !profile.is_private || isFollowing;
  }

  function renderDetails() {
    const container = $("#details");
    if (!container) return;

    container.replaceChildren();

    const details = [];

    if (profile.location) {
      details.push(["Location", profile.location]);
    }

    if (profile.pronouns) {
      details.push(["Pronouns", profile.pronouns]);
    }

    if (profile.account_type) {
      details.push([
        "Account",
        profile.account_type.charAt(0).toUpperCase() +
          profile.account_type.slice(1)
      ]);
    }

    if (profile.relationship_status &&
        profile.relationship_status !== "not_set") {
      details.push([
        "Relationship",
        profile.relationship_status.replaceAll("_", " ")
      ]);
    }

    if (profile.website) {
      const url = safeHttpUrl(profile.website);

      if (url) {
        const link = makeElement("a", "", "Website");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        container.append(link);
      }
    }

    for (const [label, value] of details) {
      const item = makeElement("span", "profile-detail");
      item.textContent = `${label}: ${value}`;
      container.append(item);
    }
  }

  function renderProfile() {
    const displayName = $("#display-name");
    const username = $("#username");
    const bio = $("#bio");
    const avatar = $("#avatar");
    const cover = $("#cover");

    if (displayName) {
      displayName.textContent = getProfileName();
    }

    if (username) {
      username.textContent = profile.username
        ? `@${profile.username}`
        : "";
    }

    if (bio) {
      bio.textContent = profile.bio?.trim() || "No bio yet.";
    }

    if (avatar) {
      const avatarUrl = safeHttpUrl(profile.avatar_url);

      avatar.replaceChildren();

      if (avatarUrl) {
        const image = makeElement("img");
        image.src = avatarUrl;
        image.alt = `${getProfileName()}'s profile picture`;
        image.loading = "lazy";
        avatar.append(image);
      } else {
        avatar.textContent =
          getProfileName().charAt(0).toUpperCase();
      }
    }

    if (cover) {
      const coverUrl = safeHttpUrl(profile.cover_url);

      cover.style.backgroundImage = coverUrl
        ? `url("${coverUrl.replace(/["\\]/g, "")}")`
        : "";
    }

    renderDetails();

    const uploadActions = $("#profile-upload-actions");

    // Current Supabase column UPDATE grants do not include avatar_url
    // or cover_url. Keep upload controls hidden until those grants exist.
    if (uploadActions) uploadActions.hidden = true;
  }

  function updateButtons() {
    const followButton = $("#follow-button");
    const messageButton = $("#message-button");
    const editButton = $("#edit-profile-button");

    if (followButton) {
      followButton.hidden = isOwner || !currentUser;

      if (isFollowing) {
        followButton.textContent = "Following";
      } else if (isFollowPending) {
        followButton.textContent = "Request pending";
      } else {
        followButton.textContent = "Follow";
      }

      followButton.disabled =
        !currentUser || isOwner || isFollowPending;
    }

    if (messageButton) {
      messageButton.hidden = !currentUser || isOwner;
    }

    if (editButton) {
      editButton.hidden = !isOwner;
    }
  }

  async function followAction() {
    if (!currentUser || !profile || isOwner) return;

    const button = $("#follow-button");
    if (button) button.disabled = true;

    setActionStatus("Updating follow status...");

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (error) throw error;

      } else if (profile.is_private) {
        const { error } = await supabase
          .from("follow_requests")
          .insert({
            requester_id: currentUser.id,
            target_id: profile.id
          });

        if (error) throw error;

      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.id,
            status: "accepted"
          });

        if (error) throw error;
      }

      await loadRelationship();
      updateButtons();

      setActionStatus(
        isFollowing
          ? "You are following this member."
          : isFollowPending
            ? "Follow request sent."
            : "Follow status updated."
      );

      await loadCounts();

    } catch (error) {
      console.error("Follow action failed:", error);

      setActionStatus(
        error.message || "Could not update follow status.",
        true
      );

    } finally {
      if (button) button.disabled = false;
      updateButtons();
    }
  }

  async function loadCounts() {
    if (!profile) return;

    const [followersResult, followingResult, postsResult] =
      await Promise.all([
        supabase
          .from("follows")
          .select("follower_id", {
            count: "exact",
            head: true
          })
          .eq("following_id", profile.id)
          .eq("status", "accepted"),

        supabase
          .from("follows")
          .select("following_id", {
            count: "exact",
            head: true
          })
          .eq("follower_id", profile.id)
          .eq("status", "accepted"),

        supabase
          .from("posts")
          .select("id", {
            count: "exact",
            head: true
          })
          .eq("author_id", profile.id)
      ]);

    if (followersResult.error) {
      console.warn("Follower count unavailable:", followersResult.error);
    }

    if (followingResult.error) {
      console.warn("Following count unavailable:", followingResult.error);
    }

    if (postsResult.error) {
      console.warn("Post count unavailable:", postsResult.error);
    }

    const container = $("#details");
    if (!container) return;

    const stats = makeElement("div", "profile-stats");

    const values = [
      ["Posts", postsResult.count],
      ["Followers", followersResult.count],
      ["Following", followingResult.count]
    ];

    for (const [label, count] of values) {
      const item = makeElement("span", "profile-stat");
      item.textContent = `${count ?? "—"} ${label}`;
      stats.append(item);
    }

    container.append(stats);
  }

  function renderMusic() {
    const section = $("#music-section");
    const container = $("#music-content");

    if (!section || !container) return;

    container.replaceChildren();

    const musicUrl = safeHttpUrl(profile?.profile_music_url);

    if (
      !profile?.profile_music_enabled ||
      !musicUrl
    ) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    if (profile.profile_music_title) {
      container.append(
        makeElement("h3", "", profile.profile_music_title)
      );
    }

    if (profile.profile_music_artist) {
      container.append(
        makeElement("p", "muted", profile.profile_music_artist)
      );
    }

    const audio = makeElement("audio", "profile-audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = musicUrl;

    container.append(audio);
  }

  async function loadMusic() {
    renderMusic();
  }

  function renderPost(post, likesByPost, viewerLikes) {
    const article = makeElement("article", "profile-post");
    article.dataset.postId = post.id;

    const body = makeElement(
      "p",
      "profile-post-body",
      post.body || ""
    );

    article.append(body);

    const mediaUrls = Array.isArray(post.media_urls)
      ? post.media_urls
      : [];

    for (const mediaUrl of mediaUrls) {
      const safeUrl = safeHttpUrl(mediaUrl);
      if (!safeUrl) continue;

      const image = makeElement("img", "profile-post-image");
      image.src = safeUrl;
      image.alt = "Post image";
      image.loading = "lazy";

      article.append(image);
    }

    const footer = makeElement("div", "profile-post-footer");

    const date = new Date(post.created_at);

    if (!Number.isNaN(date.getTime())) {
      const time = makeElement(
        "time",
        "muted",
        date.toLocaleString()
      );

      time.dateTime = post.created_at;
      footer.append(time);
    }

    const likeCount = likesByPost.get(post.id) || 0;
    const liked = viewerLikes.has(post.id);

    const likes = makeElement(
      "span",
      "profile-post-likes",
      `${likeCount} ${likeCount === 1 ? "like" : "likes"}`
    );

    if (liked) likes.dataset.liked = "true";

    footer.append(likes);
    article.append(footer);

    return article;
  }

  async function loadPosts() {
    const section = $("#posts-section");
    const container = $("#posts-list");

    if (!section || !container || !profile) return;

    container.replaceChildren(
      makeElement("p", "muted", "Loading posts...")
    );

    if (profile.is_private && !canViewPrivateContent) {
      container.replaceChildren(
        makeElement("p", "muted", "This profile is private.")
      );
      return;
    }

    const { data: posts, error } = await supabase
      .from("posts")
      .select(
        "id,author_id,body,media_urls,visibility,created_at,updated_at,edited_at,show_edit_history"
      )
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!posts?.length) {
      container.replaceChildren(
        makeElement("p", "muted", "No posts yet.")
      );
      return;
    }

    const postIds = posts.map((post) => post.id);

    const [likesResult, viewerLikesResult] = await Promise.all([
      supabase
        .from("post_likes")
        .select("post_id")
        .in("post_id", postIds),

      currentUser
        ? supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", currentUser.id)
            .in("post_id", postIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (likesResult.error) {
      console.warn("Post likes could not be loaded:", likesResult.error);
    }

    if (viewerLikesResult.error) {
      console.warn(
        "Your post likes could not be loaded:",
        viewerLikesResult.error
      );
    }

    const likesByPost = new Map();

    for (const like of likesResult.data || []) {
      likesByPost.set(
        like.post_id,
        (likesByPost.get(like.post_id) || 0) + 1
      );
    }

    const viewerLikes = new Set(
      (viewerLikesResult.data || []).map((like) => like.post_id)
    );

    container.replaceChildren();

    for (const post of posts) {
      container.append(
        renderPost(post, likesByPost, viewerLikes)
      );
    }
  }

  async function loadIncomingRequests() {
    if (!isOwner || !currentUser) return;

    // Requests are queried only for the profile owner.
    // Approval controls are not present in profile.html.
    const { error } = await supabase
      .from("follow_requests")
      .select("id")
      .eq("target_id", currentUser.id)
      .eq("status", "pending");

    if (error) {
      console.warn("Incoming follow requests unavailable:", error);
    }
  }

  async function initialize() {
    try {
      setStatus("Loading profile...");

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      currentUser = authData.user || null;

      const params = new URLSearchParams(location.search);
      const id = params.get("id");
      const username = params.get("username");

      if (!id && !username && !currentUser) {
        setStatus("Sign in to view your profile.", true);
        return;
      }

      if (!id && !username && currentUser) {
        const { data, error } = await supabase
          .from("profiles")
          .select(`${PROFILE_COLUMNS},comment_privacy`)
          .eq("id", currentUser.id)
          .maybeSingle();

        if (error) throw error;

        profile = data;
        isOwner = true;

      } else {
        const directoryQuery = supabase
          .from("profile_directory")
          .select(PROFILE_COLUMNS);

        const { data: directoryProfile, error: directoryError } =
          await (
            id
              ? directoryQuery.eq("id", id)
              : directoryQuery.eq("username", username)
          ).maybeSingle();

        if (directoryError) throw directoryError;

        if (!directoryProfile) {
          setStatus(
            "Profile not found or this profile is not available to you.",
            true
          );
          return;
        }

        profile = directoryProfile;
        isOwner = Boolean(
          currentUser && currentUser.id === directoryProfile.id
        );

        if (isOwner) {
          const { data, error } = await supabase
            .from("profiles")
            .select(`${PROFILE_COLUMNS},comment_privacy`)
            .eq("id", currentUser.id)
            .maybeSingle();

          if (error) throw error;

          if (data) profile = data;
        }
      }

      if (!profile) {
        setStatus("Profile not found.", true);
        return;
      }

      await loadRelationship();

      if (
        !isOwner &&
        profile.is_private &&
        !canViewPrivateContent
      ) {
        setStatus("This profile is private. Follow to request access.");
      } else {
        setStatus("");
      }

      renderProfile();
      updateButtons();

      $("#follow-button")?.addEventListener(
        "click",
        followAction
      );

      $("#edit-profile-button")?.addEventListener(
        "click",
        () => {
          if (isOwner) {
            location.href = "/edit-profile.html";
          }
        }
      );

      $("#message-button")?.addEventListener(
        "click",
        () => {
          if (!currentUser || isOwner) return;

          location.href =
            `/messages.html?user=${encodeURIComponent(profile.id)}`;
        }
      );

      await Promise.all([
        loadMusic(),
        loadCounts(),
        loadPosts(),
        loadIncomingRequests()
      ]);

    } catch (error) {
      console.error("Profile load failed:", error);

      setStatus(
        error?.message || "Unable to load profile.",
        true
      );
    }
  }

  initialize();
})();
