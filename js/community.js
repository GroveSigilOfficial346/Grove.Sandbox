import { supabase } from "./supabase.js";

const POST_MEDIA_BUCKET = "post-media-private";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 10;
const MAX_PINS = 3;
const FEED_LIMIT = 50;

const elements = {
  status: document.getElementById("community-status"),
  feed: document.getElementById("community-feed"),
  pinnedSection: document.getElementById("pinned-community-section"),
  pinnedFeed: document.getElementById("pinned-community-feed"),
  form: document.getElementById("post-form"),
  body: document.getElementById("post-body"),
  images: document.getElementById("post-images"),
  selectedImages: document.getElementById("selected-images"),
  visibility: document.getElementById("post-visibility"),
  publish: document.getElementById("publish-post"),
  composerStatus: document.getElementById("composer-status"),
  refresh: document.getElementById("refresh-feed"),
  shareGrove: document.getElementById("share-grove")
};

let currentUser = null;
let currentProfile = null;
let feedLoading = false;
let pinnedCount = 0;
let editDialog = null;
let editBody = null;
let editVisibility = null;
let editStatus = null;
let editSaveButton = null;
let activeEditPost = null;

/* ==========================================
   GENERAL HELPERS
   ========================================== */

function setStatus(message, isError = false) {
  if (!elements.status) return;

  elements.status.textContent = message || "";
  elements.status.classList.toggle("error", isError);
}

function setComposerStatus(message, isError = false) {
  if (!elements.composerStatus) return;

  elements.composerStatus.textContent = message || "";
  elements.composerStatus.classList.toggle("error", isError);
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

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

function getFileExtension(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const allowed = ["jpg", "jpeg", "png", "webp", "gif"];

  return allowed.includes(extension) ? extension : null;
}

function validateImages(files) {
  if (files.length > MAX_IMAGES) {
    throw new Error(`Choose no more than ${MAX_IMAGES} images.`);
  }

  for (const file of files) {
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"]
        .includes(file.type)
    ) {
      throw new Error("Use JPG, PNG, WEBP, or GIF images.");
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        "Each image must be larger than 0 bytes and 5 MB or smaller."
      );
    }

    if (!getFileExtension(file)) {
      throw new Error("Use JPG, PNG, WEBP, or GIF images.");
    }
  }
}

function mediaUrlsFromPost(post) {
  return (Array.isArray(post.media_urls) ? post.media_urls : [])
    .filter(value =>
      typeof value === "string" &&
      value.trim() &&
      !isHttpUrl(value)
    );
}

/* ==========================================
   SAFE LINK RENDERING
   Members can paste links from other platforms.
   ========================================== */

function appendTextWithLinks(container, text) {
  const value = String(text || "");
  const expression = /https?:\/\/[^\s<>"']+/gi;

  let cursor = 0;
  let match;

  while ((match = expression.exec(value)) !== null) {
    const rawUrl = match[0];
    let urlText = rawUrl;
    let trailing = "";

    while (/[),.!?;:]$/.test(urlText)) {
      trailing = urlText.slice(-1) + trailing;
      urlText = urlText.slice(0, -1);
    }

    if (match.index > cursor) {
      container.append(
        document.createTextNode(
          value.slice(cursor, match.index)
        )
      );
    }

    const safeUrl = safeHttpUrl(urlText);

    if (safeUrl) {
      const link = createElement("a", "post-external-link", urlText);
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
    } else {
      container.append(document.createTextNode(urlText));
    }

    if (trailing) {
      container.append(document.createTextNode(trailing));
    }

    cursor = match.index + rawUrl.length;
  }

  if (cursor < value.length) {
    container.append(
      document.createTextNode(value.slice(cursor))
    );
  }
}

/* ==========================================
   SHARING
   ========================================== */

async function copyText(value, successMessage) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable.");
    }

    await navigator.clipboard.writeText(value);
    setStatus(successMessage || "Link copied.");
    return true;

  } catch (error) {
    console.warn("Clipboard copy failed:", error);
    setStatus(
      "Could not copy automatically. Select and copy this link: " + value,
      true
    );
    return false;
  }
}

async function shareContent({ title, text, url }) {
  const payload = { title, text, url };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      setStatus("Share sheet opened.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;

      console.warn("Native sharing failed:", error);
    }
  }

  await copyText(url, "Link copied. You can share it anywhere.");
}

async function shareGrove() {
  const url = window.location.origin + "/";
  await shareContent({
    title: "Grove",
    text: "Join me on Grove — connect and share with the community.",
    url
  });
}

function postShareUrl(postId) {
  const url = new URL("/community.html", window.location.origin);

  url.searchParams.set("post", postId);
  url.hash = "post-" + postId;

  return url.href;
}

async function sharePost(post) {
  await shareContent({
    title: "A post on Grove",
    text: "Check out this post on Grove.",
    url: postShareUrl(post.id)
  });
}

/* ==========================================
   POST IMAGE STORAGE
   ========================================== */

async function uploadPostImages(files, postId) {
  const paths = [];
  const uploadedPaths = [];

  try {
    for (const file of files) {
      const extension = getFileExtension(file);
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const path = `${currentUser.id}/${postId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      uploadedPaths.push(path);
      paths.push(path);
    }

    return { paths, uploadedPaths };

  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .remove(uploadedPaths);
    }

    throw error;
  }
}

async function createSignedUrlMap(posts) {
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

/* ==========================================
   EDIT POST DIALOG
   ========================================== */

function createEditDialog() {
  if (editDialog) return;

  editDialog = createElement("dialog", "post-edit-dialog");

  const form = createElement("form", "post-edit-form");
  form.method = "dialog";

  const heading = createElement("h2", "", "Edit post");

  editBody = document.createElement("textarea");
  editBody.maxLength = 5000;
  editBody.rows = 6;
  editBody.required = false;
  editBody.setAttribute("aria-label", "Post text");

  editVisibility = document.createElement("select");
  editVisibility.setAttribute("aria-label", "Post visibility");

  for (const [value, label] of [
    ["public", "Public"],
    ["followers", "Followers"],
    ["private", "Only me"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    editVisibility.append(option);
  }

  editStatus = createElement("p", "status-message");
  editStatus.setAttribute("role", "status");
  editStatus.setAttribute("aria-live", "polite");

  const actions = createElement("div", "post-edit-actions");

  const cancel = createElement(
    "button",
    "button secondary",
    "Cancel"
  );
  cancel.type = "button";
  cancel.addEventListener("click", () => editDialog.close());

  editSaveButton = createElement(
    "button",
    "button primary",
    "Save changes"
  );
  editSaveButton.type = "submit";

  actions.append(cancel, editSaveButton);
  form.append(heading, editBody, editVisibility, editStatus, actions);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!activeEditPost || !currentUser) return;

    const body = editBody.value.trim();
    const visibility = editVisibility.value;

    if (!body && !(activeEditPost.media_urls || []).length) {
      editStatus.textContent =
        "A post must contain text or at least one image.";
      return;
    }

    if (!["public", "followers", "private"].includes(visibility)) {
      editStatus.textContent = "Choose a valid visibility setting.";
      return;
    }

    editSaveButton.disabled = true;
    editStatus.textContent = "Saving changes...";

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("posts")
        .update({
          body,
          visibility,
          updated_at: now,
          edited_at: now
        })
        .eq("id", activeEditPost.id)
        .eq("author_id", currentUser.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("The post could not be updated.");
      }

      editDialog.close();
      activeEditPost = null;

      await loadFeed();
      setStatus("Post updated.");

    } catch (error) {
      console.error("Post edit failed:", error);
      editStatus.textContent =
        error.message || "Could not save post changes.";
    } finally {
      editSaveButton.disabled = false;
    }
  });

  editDialog.append(form);

  editDialog.addEventListener("click", event => {
    if (event.target === editDialog) {
      editDialog.close();
    }
  });

  document.body.append(editDialog);
}

function openEditDialog(post) {
  createEditDialog();

  activeEditPost = post;
  editBody.value = post.body || "";
  editVisibility.value = post.visibility || "public";
  editStatus.textContent = "";

  editDialog.showModal();
  editBody.focus();
}

/* ==========================================
   PIN MANAGEMENT
   ========================================== */

async function changePostPin(postId, shouldPin, button) {
  if (!currentUser) return;

  if (shouldPin && pinnedCount >= MAX_PINS) {
    setStatus(
      "You can pin up to 3 posts. Unpin one first.",
      true
    );
    return;
  }

  button.disabled = true;
  setStatus(shouldPin ? "Pinning post..." : "Unpinning post...");

  try {
    const { data, error } = await supabase
      .from("posts")
      .update({
        pinned_at: shouldPin
          ? new Date().toISOString()
          : null
      })
      .eq("id", postId)
      .eq("author_id", currentUser.id)
      .select("id,pinned_at")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "The post could not be updated. Check your access and refresh."
      );
    }

    await loadFeed();

    setStatus(
      shouldPin
        ? "Post pinned in Community and on your profile."
        : "Post unpinned from Community and your profile."
    );

  } catch (error) {
    console.error("Post pin update failed:", error);

    setStatus(
      error.message || "Could not update this post.",
      true
    );

    button.disabled = false;
  }
}

/* ==========================================
   REPOST MANAGEMENT
   ========================================== */

async function toggleRepost(post, button) {
  if (!currentUser) return;

  button.disabled = true;

  try {
    const { data: existing, error: lookupError } = await supabase
      .from("post_reposts")
      .select("id")
      .eq("post_id", post.id)
      .eq("reposter_id", currentUser.id)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing) {
      const { error } = await supabase
        .from("post_reposts")
        .delete()
        .eq("id", existing.id)
        .eq("reposter_id", currentUser.id);

      if (error) throw error;

      setStatus("Repost removed.");

    } else {
      const { error } = await supabase
        .from("post_reposts")
        .insert({
          post_id: post.id,
          reposter_id: currentUser.id
        });

      if (error) throw error;

      setStatus("Post reposted to your profile.");
    }

    await loadFeed();

  } catch (error) {
    console.error("Repost update failed:", error);

    setStatus(
      error.message || "Could not update repost.",
      true
    );

    button.disabled = false;
  }
}

/* ==========================================
   DELETE POST
   ========================================== */

async function deletePost(post, button) {
  if (!currentUser || post.author_id !== currentUser.id) return;

  if (!window.confirm(
    "Delete this post? This cannot be undone."
  )) {
    return;
  }

  button.disabled = true;
  setStatus("Deleting post...");

  try {
    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", post.id)
      .eq("author_id", currentUser.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("The post could not be deleted.");
    }

    const paths = mediaUrlsFromPost(post);

    if (paths.length) {
      const { error: cleanupError } = await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .remove(paths);

      if (cleanupError) {
        console.warn("Post image cleanup failed:", cleanupError);
      }
    }

    await loadFeed();
    setStatus("Post deleted.");

  } catch (error) {
    console.error("Post deletion failed:", error);

    setStatus(
      error.message || "Could not delete post.",
      true
    );

    button.disabled = false;
  }
}

/* ==========================================
   LIKE MANAGEMENT
   ========================================== */

async function toggleLike(post, likedByMe, button) {
  button.disabled = true;

  try {
    if (likedByMe.has(post.id)) {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUser.id);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("post_likes")
        .insert({
          post_id: post.id,
          user_id: currentUser.id
        });

      if (error) throw error;
    }

    await loadFeed();

  } catch (error) {
    console.error("Like update failed:", error);

    setStatus(
      error.message || "Could not update like.",
      true
    );

    button.disabled = false;
  }
}

/* ==========================================
   COMMENTS
   ========================================== */

function renderComments(post, comments, profiles) {
  const section = createElement("section", "comments");
  section.setAttribute("aria-label", "Comments");

  for (const comment of comments || []) {
    const author = profiles.get(comment.author_id);
    const commentBox = createElement("div", "comment");

    // Stable UUID used by the shared Grove reactions module.
    commentBox.dataset.commentId = comment.id;

    const name = createElement(
      "p",
      "comment-author",
      author?.display_name ||
      (author?.username ? "@" + author.username : "Grove Member")
    );

    const body = createElement("p", "comment-body");
    appendTextWithLinks(body, comment.body);

    commentBox.append(name, body);
    section.append(commentBox);
  }

  const form = createElement("form", "comment-form");
  const input = document.createElement("input");

  input.type = "text";
  input.maxLength = 2000;
  input.required = true;
  input.placeholder = "Write a comment...";
  input.setAttribute("aria-label", "Write a comment");

  const button = createElement(
    "button",
    "button secondary",
    "Comment"
  );
  button.type = "submit";

  form.append(input, button);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const body = input.value.trim();
    if (!body) return;

    button.disabled = true;

    try {
      const { error } = await supabase
        .from("comments")
        .insert({
          post_id: post.id,
          author_id: currentUser.id,
          body
        });

      if (error) throw error;

      await loadFeed();

    } catch (error) {
      console.error("Comment creation failed:", error);

      setStatus(
        error.message || "Could not publish comment.",
        true
      );

      button.disabled = false;
    }
  });

  section.append(form);

  return section;
}

/* ==========================================
   POST CARD
   ========================================== */

function createPostCard(
  post,
  profiles,
  likesByPost,
  likedByMe,
  commentsByPost,
  signedUrlsByPath,
  repostsByPost,
  repostedByMe,
  isPinnedSection = false
) {
  const author = profiles.get(post.author_id);
  const card = createElement("article", "post-card");

  card.id = "post-" + post.id;
  card.dataset.postId = post.id;
  card.dataset.authorId = post.author_id;

  if (post.pinned_at) {
    card.classList.add("post-card-pinned");
  }

  if (isPinnedSection) {
    card.append(
      createElement(
        "div",
        "community-pin-badge",
        "📌 Pinned post"
      )
    );
  }

  const header = createElement("div", "post-header");
  const avatar = createElement("div", "post-avatar");

  const avatarUrl = safeHttpUrl(author?.avatar_url);

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.loading = "lazy";
    avatar.append(image);
  } else {
    avatar.textContent = (
      author?.display_name ||
      author?.username ||
      "G"
    ).charAt(0).toUpperCase();
  }

  const identity = document.createElement("div");

  const authorLink = createElement(
    "a",
    "post-author",
    author?.display_name ||
    (author?.username ? "@" + author.username : "Grove Member")
  );

  authorLink.href =
    "/profile.html?id=" +
    encodeURIComponent(post.author_id);

  const metaText = [
    formatDate(post.created_at),
    post.visibility
  ].filter(Boolean).join(" · ");

  const meta = createElement("p", "post-meta", metaText);

  if (post.edited_at) {
    meta.append(
      document.createTextNode(" · Edited")
    );
  }

  identity.append(authorLink, meta);
  header.append(avatar, identity);
  card.append(header);

  if (post.body) {
    const body = createElement("p", "post-body");
    appendTextWithLinks(body, post.body);
    card.append(body);
  }

  const mediaUrls = Array.isArray(post.media_urls)
    ? post.media_urls
    : [];

  if (mediaUrls.length) {
    const mediaContainer = createElement("div", "post-images");

    for (const value of mediaUrls) {
      if (typeof value !== "string") continue;

      const url = isHttpUrl(value)
        ? safeHttpUrl(value)
        : signedUrlsByPath.get(value);

      if (!url) continue;

      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const image = document.createElement("img");
      image.src = url;
      image.alt = "Post image";
      image.loading = "lazy";

      link.append(image);
      mediaContainer.append(link);
    }

    if (mediaContainer.childElementCount) {
      card.append(mediaContainer);
    }
  }

  const actions = createElement("div", "post-actions");

  const likeCount = likesByPost.get(post.id) || 0;
  const isLiked = likedByMe.has(post.id);

  const likeButton = createElement(
    "button",
    "button secondary",
    `${isLiked ? "♥ Liked" : "♡ Like"} · ${likeCount}`
  );
  likeButton.type = "button";

  if (isLiked) likeButton.classList.add("liked");

  likeButton.addEventListener("click", () => {
    toggleLike(post, likedByMe, likeButton);
  });

  const repostCount = repostsByPost.get(post.id) || 0;
  const hasReposted = repostedByMe.has(post.id);

  const repostButton = createElement(
    "button",
    "button secondary",
    `${hasReposted ? "↻ Reposted" : "↻ Repost"} · ${repostCount}`
  );
  repostButton.type = "button";

  if (hasReposted) repostButton.classList.add("reposted");

  repostButton.addEventListener("click", () => {
    toggleRepost(post, repostButton);
  });

  const shareButton = createElement(
    "button",
    "button secondary",
    "↗ Share"
  );
  shareButton.type = "button";
  shareButton.addEventListener("click", () => sharePost(post));

  actions.append(likeButton, repostButton, shareButton);

  if (post.author_id === currentUser.id) {
    const editButton = createElement(
      "button",
      "button secondary",
      "Edit"
    );
    editButton.type = "button";
    editButton.addEventListener("click", () => openEditDialog(post));

    const pinButton = createElement(
      "button",
      "button secondary",
      post.pinned_at ? "Unpin" : "📌 Pin"
    );
    pinButton.type = "button";

    pinButton.disabled =
      !post.pinned_at && pinnedCount >= MAX_PINS;

    pinButton.title = pinButton.disabled
      ? "Unpin another post before pinning this one."
      : "";

    pinButton.addEventListener("click", () => {
      changePostPin(post.id, !post.pinned_at, pinButton);
    });

    const deleteButton = createElement(
      "button",
      "button danger",
      "Delete"
    );
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      deletePost(post, deleteButton);
    });

    actions.append(editButton, pinButton, deleteButton);
  }

  card.append(actions);

  const comments = commentsByPost.get(post.id) || [];
  card.append(renderComments(post, comments, profiles));

  return card;
}

/* ==========================================
   LOAD FEED
   ========================================== */

async function loadFeed() {
  if (feedLoading || !currentUser) return;

  feedLoading = true;

  if (elements.refresh) {
    elements.refresh.disabled = true;
  }

  setStatus("Loading posts...");

  try {
    const [latestResult, pinnedResult, pinCountResult] =
      await Promise.all([
        supabase
          .from("posts")
          .select(
            "id,author_id,body,media_urls,visibility,created_at,updated_at,edited_at,pinned_at"
          )
          .order("created_at", { ascending: false })
          .limit(FEED_LIMIT),

        supabase
          .from("posts")
          .select(
            "id,author_id,body,media_urls,visibility,created_at,updated_at,edited_at,pinned_at"
          )
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(FEED_LIMIT),

        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", currentUser.id)
          .not("pinned_at", "is", null)
      ]);

    if (latestResult.error) throw latestResult.error;
    if (pinnedResult.error) throw pinnedResult.error;
    if (pinCountResult.error) throw pinCountResult.error;

    const latestPosts = latestResult.data || [];
    const pinnedPosts = pinnedResult.data || [];

    pinnedCount = pinCountResult.count || 0;

    const pinnedIds = new Set(
      pinnedPosts.map(post => post.id)
    );

    const allPostsById = new Map();

    for (const post of [...latestPosts, ...pinnedPosts]) {
      allPostsById.set(post.id, post);
    }

    const allPosts = [...allPostsById.values()];
    const latestUnpinnedPosts = latestPosts.filter(
      post => !pinnedIds.has(post.id)
    );

    if (!allPosts.length) {
      elements.pinnedFeed.replaceChildren();
      elements.pinnedSection.hidden = true;

      elements.feed.replaceChildren(
        createElement(
          "div",
          "empty-state",
          "No posts yet. Be the first to share something with Grove."
        )
      );

      setStatus("");
      return;
    }

    const postIds = allPosts.map(post => post.id);
    const authorIds = [
      ...new Set(allPosts.map(post => post.author_id))
    ];

    const [
      profilesResult,
      likesResult,
      commentsResult,
      repostsResult,
      signedUrlsByPath
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", authorIds),

      supabase
        .from("post_likes")
        .select("post_id,user_id")
        .in("post_id", postIds),

      supabase
        .from("comments")
        .select("id,post_id,author_id,body,created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true }),

      supabase
        .from("post_reposts")
        .select("post_id,reposter_id")
        .in("post_id", postIds),

      createSignedUrlMap(allPosts)
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;

    if (repostsResult.error) {
      console.warn("Repost counts unavailable:", repostsResult.error);
    }

    const profiles = new Map(
      (profilesResult.data || []).map(profile => [
        profile.id,
        profile
      ])
    );

    const likesByPost = new Map();
    const likedByMe = new Set();

    for (const like of likesResult.data || []) {
      likesByPost.set(
        like.post_id,
        (likesByPost.get(like.post_id) || 0) + 1
      );

      if (like.user_id === currentUser.id) {
        likedByMe.add(like.post_id);
      }
    }

    const commentsByPost = new Map();

    for (const comment of commentsResult.data || []) {
      if (!commentsByPost.has(comment.post_id)) {
        commentsByPost.set(comment.post_id, []);
      }

      commentsByPost.get(comment.post_id).push(comment);
    }

    const repostsByPost = new Map();
    const repostedByMe = new Set();

    for (const repost of repostsResult.data || []) {
      repostsByPost.set(
        repost.post_id,
        (repostsByPost.get(post.post_id) || 0) + 1
      );

      if (repost.reposter_id === currentUser.id) {
        repostedByMe.add(repost.post_id);
      }
    }

    elements.pinnedFeed.replaceChildren();

    if (pinnedPosts.length) {
      elements.pinnedSection.hidden = false;

      for (const post of pinnedPosts) {
        elements.pinnedFeed.append(
          createPostCard(
            post,
            profiles,
            likesByPost,
            likedByMe,
            commentsByPost,
            signedUrlsByPath,
            repostsByPost,
            repostedByMe,
            true
          )
        );
      }
    } else {
      elements.pinnedSection.hidden = true;
    }

    elements.feed.replaceChildren();

    if (!latestUnpinnedPosts.length) {
      elements.feed.append(
        createElement(
          "div",
          "empty-state",
          "No additional recent posts."
        )
      );
    } else {
      for (const post of latestUnpinnedPosts) {
        elements.feed.append(
          createPostCard(
            post,
            profiles,
            likesByPost,
            likedByMe,
            commentsByPost,
            signedUrlsByPath,
            repostsByPost,
            repostedByMe,
            false
          )
        );
      }
    }

    setStatus("");

    const params = new URLSearchParams(window.location.search);
    const requestedPost = params.get("post");

    if (requestedPost) {
      const target = document.getElementById("post-" + requestedPost);

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        target.classList.add("post-highlight");
      }
    }

  } catch (error) {
    console.error("Grove feed error:", error);

    setStatus(
      error.message || "Could not load the community feed.",
      true
    );

  } finally {
    feedLoading = false;

    if (elements.refresh) {
      elements.refresh.disabled = false;
    }
  }
}

/* ==========================================
   CREATE POST
   ========================================== */

if (elements.images) {
  elements.images.addEventListener("change", () => {
    const files = Array.from(elements.images.files || []);

    try {
      validateImages(files);

      elements.selectedImages.textContent = files.length
        ? `${files.length} image(s) selected`
        : "";

      setComposerStatus("");

    } catch (error) {
      elements.images.value = "";
      elements.selectedImages.textContent = "";
      setComposerStatus(error.message, true);
    }
  });
}

if (elements.form) {
  elements.form.addEventListener("submit", async event => {
    event.preventDefault();

    const body = elements.body.value.trim();
    const files = Array.from(elements.images.files || []);
    const visibility = elements.visibility.value;

    if (!body && !files.length) {
      setComposerStatus(
        "Write something or choose an image first.",
        true
      );
      return;
    }

    if (body.length > 5000) {
      setComposerStatus(
        "Posts cannot exceed 5,000 characters.",
        true
      );
      return;
    }

    if (!["public", "followers", "private"].includes(visibility)) {
      setComposerStatus(
        "Choose a valid post visibility setting.",
        true
      );
      return;
    }

    try {
      validateImages(files);
    } catch (error) {
      setComposerStatus(error.message, true);
      return;
    }

    elements.publish.disabled = true;
    setComposerStatus("Publishing post...");

    let uploadedPaths = [];

    try {
      const postId = crypto.randomUUID();
      let mediaUrls = [];

      if (files.length) {
        const uploadResult = await uploadPostImages(files, postId);

        mediaUrls = uploadResult.paths;
        uploadedPaths = uploadResult.uploadedPaths;
      }

      const { error } = await supabase
        .from("posts")
        .insert({
          id: postId,
          author_id: currentUser.id,
          body,
          media_urls: mediaUrls,
          visibility
        });

      if (error) throw error;

      elements.form.reset();
      elements.selectedImages.textContent = "";

      setComposerStatus("Post published.");

      await loadFeed();

    } catch (error) {
      console.error("Publish error:", error);

      if (uploadedPaths.length) {
        await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .remove(uploadedPaths);
      }

      setComposerStatus(
        error.message || "Could not publish your post.",
        true
      );

    } finally {
      elements.publish.disabled = false;
    }
  });
}

/* ==========================================
   INITIALIZE
   ========================================== */

if (elements.refresh) {
  elements.refresh.addEventListener("click", loadFeed);
}

if (elements.shareGrove) {
  elements.shareGrove.addEventListener("click", shareGrove);
}

async function initialize() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  currentUser = data.session?.user || null;

  if (!currentUser) {
    window.location.replace("/login.html");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;

  currentProfile = profile;

  await loadFeed();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    window.location.replace("/login.html");
  }
});

initialize().catch(error => {
  console.error("Grove community initialization error:", error);

  setStatus(
    error.message || "Could not open Grove Community.",
    true
  );
});
