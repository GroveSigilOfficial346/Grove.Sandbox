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
