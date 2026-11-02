import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const MEDIA_BUCKET = "grove-media";

let currentUser = null;
let profile = null;
let isOwner = false;
let isFollowing = false;
let requestPending = false;
let canViewPrivateContent = false;
let preferences = {};

const themes = {
  "midnight-violet": ["#110b27", "#851eff", "#eb36ed", "#f7f5ff"],
  "neon-grove": ["#071522", "#05c9f4", "#851eff", "#f7f5ff"],
  "rose-galaxy": ["#260d27", "#eb36ed", "#851eff", "#fff3ff"],
  "ocean-light": ["#102536", "#05c9f4", "#6eabff", "#f7f5ff"],
  "forest-night": ["#0a211b", "#45d49a", "#05c9f4", "#f2fff8"]
};

function setStatus(message, error = false) {
  const node = $("#status");
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? "#ff8585" : "";
}

function setActionStatus(message, error = false) {
  const node = $("#action-status");
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? "#ff8585" : "#05c9f4";
}

function publicUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  return supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function applyBackground(node, path) {
  if (!node) return;

  const url = publicUrl(path);

  node.style.backgroundImage = url
    ? `url("${url.replace(/["\\]/g, "")}")`
    : "";

  node.style.backgroundSize = "cover";
  node.style.backgroundPosition = "center";
}

function applyTheme() {
  const [background, accent, secondary, foreground] =
    themes[preferences.theme_id] || themes["midnight-violet"];

  const root = document.documentElement;

  root.style.setProperty("--profile-panel", background);
  root.style.setProperty("--profile-accent", accent);
  root.style.setProperty("--profile-secondary", secondary);
  root.style.setProperty("--profile-text", foreground);

  document.body.style.color = foreground;

  const custom =
    preferences.background_mode === "custom"
      ? publicUrl(preferences.custom_background_url)
      : "";

  document.body.style.backgroundImage = custom
    ? `linear-gradient(rgba(5,0,25,.82),rgba(5,0,25,.90)),url("${custom.replace(/["\\]/g, "")}")`
    : "";

  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundAttachment = "fixed";
  document.body.style.backgroundPosition = "center";
}

async function loadPreferences() {
  if (!canViewPrivateContent) return;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("theme_id,background_mode,custom_background_url")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (error) {
    console.warn("Could not load profile preferences:", error.message);
    return;
  }

  preferences = data || {};
  applyTheme();
}

function renderProfile() {
  const displayName =
    profile.display_name || profile.username || "Grove Member";

  const nameNode = $("#display-name");
  const usernameNode = $("#username");
  const bioNode = $("#bio");

  if (nameNode) nameNode.textContent = displayName;

  if (usernameNode) {
    usernameNode.textContent = profile.username
      ? `@${profile.username}`
      : "";
  }

  if (bioNode) {
    bioNode.textContent = profile.bio || "No bio yet.";
  }

  const avatar = $("#avatar");

  if (avatar) {
    applyBackground(avatar, profile.avatar_url);

    avatar.textContent = profile.avatar_url
      ? ""
      : displayName.trim().charAt(0).toUpperCase();
  }

  applyBackground($("#cover"), profile.cover_url);

  if ($("#edit-profile-button")) {
    $("#edit-profile-button").hidden = !isOwner;
  }

  if ($("#profile-upload-actions")) {
    $("#profile-upload-actions").hidden = !isOwner;
  }

  document.title = `${displayName} | Grove`;
}

async function loadRelationship() {
  if (isOwner) {
    canViewPrivateContent = true;
    return;
  }

  if (!currentUser) {
    canViewPrivateContent = !profile.is_private;
    return;
  }

  const { data: follow, error: followError } = await supabase
    .from("follows")
    .select("follower_id,status")
    .eq("follower_id", currentUser.id)
    .eq("following_id", profile.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (followError) {
    console.warn(followError.message);
  }

  isFollowing = Boolean(follow);

  canViewPrivateContent =
    !profile.is_private || isFollowing;

  if (!isFollowing) {
    const { data: request, error } = await supabase
      .from("follow_requests")
      .select("id,status")
      .eq("requester_id", currentUser.id)
      .eq("target_id", profile.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!error) {
      requestPending = Boolean(request);
    }
  }
}

function updateButtons() {
  const follow = $("#follow-button");
  const message = $("#message-button");

  if (follow) {
    follow.hidden = isOwner || !currentUser;

    follow.textContent = isFollowing
      ? "Following"
      : requestPending
        ? "Requested"
        : profile.is_private
          ? "Request to follow"
          : "Follow";
  }

  if (message) {
    message.hidden = isOwner || !currentUser;
  }
}

async function followAction() {
  if (!currentUser || isOwner) return;

  if (isFollowing) {
    setActionStatus("Unfollowing...");

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id);

    if (error) {
      return setActionStatus(error.message, true);
    }

    isFollowing = false;
    canViewPrivateContent = !profile.is_private;

    await refreshPrivateSections();
    updateButtons();

    return setActionStatus("You unfollowed this member.");
  }

  if (requestPending) {
    return setActionStatus(
      "Your request is awaiting approval."
    );
  }

  setActionStatus(
    profile.is_private
      ? "Sending request..."
      : "Following..."
  );

  const result = profile.is_private
    ? await supabase.from("follow_requests").insert({
        requester_id: currentUser.id,
        target_id: profile.id
      })
    : await supabase.from("follows").insert({
        follower_id: currentUser.id,
        following_id: profile.id,
        status: "accepted"
      });

  if (result.error) {
    return setActionStatus(result.error.message, true);
  }

  if (profile.is_private) {
    requestPending = true;
    setActionStatus("Follow request sent.");
  } else {
    isFollowing = true;
    canViewPrivateContent = true;

    setActionStatus("You are now following this member.");

    await refreshPrivateSections();
  }

  updateButtons();
}

async function loadMusic() {
  const section = $("#music-section");
  const content = $("#music-content");

  if (!section || !content) return;

  if (
    !canViewPrivateContent ||
    !profile.profile_music_enabled ||
    !profile.profile_music_url
  ) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  content.replaceChildren();

  const title = document.createElement("h3");
  title.textContent =
    profile.profile_music_title || "Profile music";

  const artist = document.createElement("p");
  artist.textContent =
    profile.profile_music_artist || "";

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.src = profile.profile_music_url;

  content.append(title, artist, player);
}

async function loadCounts() {
  const [followers, following] = await Promise.all([
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
      .eq("status", "accepted")
  ]);

  const node = $("#details");

  if (node) {
    node.textContent =
      `${followers.count ?? 0} followers · ${following.count ?? 0} following`;
  }
}

async function loadPosts() {
  const list = $("#posts-list");

  if (!list) return;

  list.replaceChildren();

  if (!canViewPrivateContent) {
    const note = document.createElement("p");
    note.textContent =
      "This account is private. Request to follow to see posts.";

    list.append(note);
    return;
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id,author_id,body,media_urls,visibility,created_at"
    )
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);

    const note = document.createElement("p");
    note.textContent = "Posts are unavailable right now.";

    list.append(note);
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

    const body = document.createElement("p");
    body.textContent = post.body || "";

    article.append(body);

    for (const path of post.media_urls || []) {
      const image = document.createElement("img");

      image.src = publicUrl(path);
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

async function loadIncomingRequests() {
  if (!isOwner) return;

  let panel = $("#follow-requests");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "follow-requests";
    panel.className = "content-section";

    $("#posts-section")?.before(panel);
  }

  if (!panel) return;

  const { data, error } = await supabase
    .from("follow_requests")
    .select("id,requester_id,created_at")
    .eq("target_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  panel.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Follow requests";

  panel.append(heading);

  if (error) {
    const p = document.createElement("p");
    p.textContent = error.message;
    panel.append(p);
    return;
  }

  if (!data?.length) {
    const p = document.createElement("p");
    p.textContent = "No pending requests.";
    panel.append(p);
    return;
  }

  for (const request of data) {
    const row = document.createElement("div");
    row.className = "follow-request-row";

    const label = document.createElement("span");
    label.textContent =
      `Member ${request.requester_id.slice(0, 8)}`;

    const approve = document.createElement("button");
    approve.textContent = "Approve";

    approve.addEventListener("click", async () => {
      const { error: updateError } = await supabase
        .from("follow_requests")
        .update({ status: "accepted" })
        .eq("id", request.id);

      if (updateError) {
        return setActionStatus(updateError.message, true);
      }

      await loadIncomingRequests();
      await loadCounts();
    });

    const decline = document.createElement("button");
    decline.textContent = "Decline";

    decline.addEventListener("click", async () => {
      const { error: updateError } = await supabase
        .from("follow_requests")
        .update({ status: "declined" })
        .eq("id", request.id);

      if (updateError) {
        return setActionStatus(updateError.message, true);
      }

      await loadIncomingRequests();
    });

    row.append(label, approve, decline);
    panel.append(row);
  }
}

async function refreshPrivateSections() {
  await Promise.all([
    loadPreferences(),
    loadMusic(),
    loadPosts()
  ]);
}

function connectUploads() {
  if (!isOwner) return;

  const mappings = [
    [
      "#avatar-upload-button",
      "#avatar-file",
      "avatar_url",
      "avatar"
    ],
    [
      "#cover-upload-button",
      "#cover-file",
      "cover_url",
      "cover"
    ]
  ];

  for (const [
    buttonSelector,
    inputSelector,
    column,
    prefix
  ] of mappings) {
    const button = $(buttonSelector);
    const input = $(inputSelector);

    if (!button || !input) continue;

    button.addEventListener("click", () => input.click());

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) return;

      if (
        !file.type.startsWith("image/") ||
        file.size > 5 * 1024 * 1024
      ) {
        setActionStatus(
          "Choose an image under 5 MB.",
          true
        );

        input.value = "";
        return;
      }

      const ext =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const path =
        `${currentUser.id}/${prefix}-${Date.now()}.${ext}`;

      setActionStatus("Uploading image...");

      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, {
          contentType: file.type
        });

      if (uploadError) {
        setActionStatus(uploadError.message, true);
        input.value = "";
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [column]: path })
        .eq("id", currentUser.id);

      if (updateError) {
        setActionStatus(updateError.message, true);
        input.value = "";
        return;
      }

      profile[column] = path;

      renderProfile();

      setActionStatus("Image updated.");
      input.value = "";
    });
  }
}

async function initialize() {
  try {
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

    isOwner = Boolean(
      currentUser &&
      (!id && !username || id === currentUser.id)
    );

    if (isOwner) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) throw error;

      profile = data;
    } else {
      let directoryQuery = supabase
        .from("profile_directory")
        .select(
          "id,username,display_name,bio,avatar_url,cover_url,is_private"
        );

      directoryQuery = id
        ? directoryQuery.eq("id", id)
        : directoryQuery.eq("username", username);

      const {
        data: directoryProfile,
        error: directoryError
      } = await directoryQuery.maybeSingle();

      if (directoryError) throw directoryError;

      if (!directoryProfile) {
        setStatus("Profile not found.", true);
        return;
      }

      const { data: fullProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", directoryProfile.id)
        .maybeSingle();

      profile = fullProfile || directoryProfile;
    }

    if (!profile) {
      setStatus("Profile not found.", true);
      return;
    }

    await loadRelationship();

    renderProfile();
    updateButtons();

    $("#follow-button")?.addEventListener(
      "click",
      followAction
    );

    $("#edit-profile-button")?.addEventListener(
      "click",
      () => {
        location.href = "/edit-profile.html";
      }
    );

    $("#message-button")?.addEventListener(
      "click",
      () => {
        location.href =
          `/messages.html?user=${encodeURIComponent(profile.id)}`;
      }
    );

    connectUploads();

    await Promise.all([
      loadPreferences(),
      loadMusic(),
      loadCounts(),
      loadPosts(),
      loadIncomingRequests()
    ]);

    setStatus("");
  } catch (error) {
    console.error("Profile load failed:", error);

    setStatus(
      error.message || "Unable to load profile.",
      true
    );
  }
}

initialize();
