import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const MAX_PINS = 3;
  const POST_MEDIA_BUCKET = "post-media-private";

  const $ = selector => document.querySelector(selector);

  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let pinnedIds = new Set();
  let pinnedCount = 0;
  let observer = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function setStatus(message, error = false) {
    const node = $("#action-status");

    if (!node) return;

    node.textContent = message || "";
    node.style.color = error ? "#ff8585" : "";
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

  async function resolveProfile() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user || null;

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    if (!requestedId && !requestedUsername) {
      if (!currentUser) return false;

      profile = {
        id: currentUser.id,
        is_private: false
      };

      isOwner = true;
      return true;
    }

    let query = supabase
      .from("profile_directory")
      .select("id,username,is_private");

    query = requestedId
      ? query.eq("id", requestedId)
      : query.eq("username", requestedUsername.toLowerCase());

    const { data: found, error: profileError } =
      await query.maybeSingle();

    if (profileError) throw profileError;
    if (!found) return false;

    profile = found;
    isOwner = Boolean(
      currentUser && currentUser.id === profile.id
    );

    return true;
  }

  async function canViewProfilePosts() {
    if (!profile) return false;
    if (isOwner || !profile.is_private) return true;
    if (!currentUser) return false;

    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .eq("status", "accepted")
      .maybeSingle();

    if (error) throw error;

    return Boolean(data);
  }

  async function loadPinnedPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select(
        "id,author_id,body,media_urls,visibility,created_at,pinned_at"
      )
      .eq("author_id", profile.id)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: false })
      .limit(MAX_PINS);

    if (error) throw error;

    return data || [];
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

  function renderPinnedPost(post, signedUrls) {
    const card = element(
      "article",
      "profile-post profile-pinned-post"
    );

    card.dataset.postId = post.id;

    const badge = element(
      "div",
      "profile-pin-badge",
      "📌 Pinned post"
    );

    card.append(badge);

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
          : signedUrls.get(value);

        if (!url) continue;

        const link = element("a", "profile-post-media-link");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const image = element("img", "profile-post-image");
        image.src = url;
        image.alt = "Pinned post image";
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
      const time = element(
        "time",
        "muted",
        date.toLocaleString()
      );

      time.dateTime = post.created_at;
      footer.append(time);
    }

    if (isOwner) {
      const unpin = element(
        "button",
        "button secondary profile-pin-action",
        "Unpin"
      );

      unpin.type = "button";

      unpin.addEventListener("click", () => {
        changePin(post.id, false, unpin);
      });

      footer.append(unpin);
    }

    card.append(footer);

    return card;
  }

  function createPinnedSection() {
    let section = $("#profile-pinned-section");

    if (section) return section;

    section = element(
      "section",
      "content-section profile-pinned-section"
    );

    section.id = "profile-pinned-section";

    const heading = element("h2", "", "📌 Pinned posts");
    const list = element("div", "profile-pinned-list");

    list.id = "profile-pinned-list";

    section.append(heading, list);

    const postsSection = $("#posts-section");

    if (postsSection) {
      postsSection.insertAdjacentElement("beforebegin", section);
    }

    return section;
  }

  async function renderPinnedPosts(posts) {
    const section = createPinnedSection();
    const list = $("#profile-pinned-list");

    if (!list) return;

    if (!posts.length) {
      section.hidden = true;
      return;
    }

    const signedUrls = await createSignedUrlMap(posts);

    pinnedIds = new Set(posts.map(post => post.id));
    pinnedCount = posts.length;

    list.replaceChildren();

    for (const post of posts) {
      list.append(
        renderPinnedPost(post, signedUrls)
      );
    }

    section.hidden = false;
  }

  async function changePin(postId, shouldPin, button) {
    if (!isOwner || !currentUser || !profile) return;

    if (shouldPin && pinnedCount >= MAX_PINS) {
      setStatus("You can pin up to 3 posts.", true);
      return;
    }

    if (button) button.disabled = true;

    setStatus(
      shouldPin ? "Pinning post..." : "Removing pin..."
    );

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
          "The post could not be updated. Refresh and try again."
        );
      }

      setStatus(
        shouldPin ? "Post pinned." : "Post unpinned."
      );

      window.location.reload();

    } catch (error) {
      console.error("Profile pin update failed:", error);

      setStatus(
        error.message || "Could not update the post pin.",
        true
      );

      if (button) button.disabled = false;
    }
  }

  function addPinControls() {
    const container = $("#posts-list");

    if (!container || !isOwner) return;

    const cards = container.querySelectorAll(
      ".profile-post[data-post-id]"
    );

    for (const card of cards) {
      const postId = card.dataset.postId;

      if (!postId) continue;

      if (pinnedIds.has(postId)) {
        card.remove();
        continue;
      }

      if (card.querySelector(".profile-pin-action")) {
        continue;
      }

      const footer = card.querySelector(".profile-post-footer");

      if (!footer) continue;

      const button = element(
        "button",
        "button secondary profile-pin-action",
        pinnedCount >= MAX_PINS
          ? "Pin limit reached"
          : "Pin post"
      );

      button.type = "button";
      button.disabled = pinnedCount >= MAX_PINS;

      button.addEventListener("click", () => {
        changePin(postId, true, button);
      });

      footer.append(button);
    }
  }

  function watchProfilePosts() {
    const container = $("#posts-list");

    if (!container || !isOwner) return;

    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      addPinControls();
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    addPinControls();
  }

  async function initialize() {
    try {
      const found = await resolveProfile();

      if (!found) return;

      const authorized = await canViewProfilePosts();

      if (!authorized) return;

      const posts = await loadPinnedPosts();

      await renderPinnedPosts(posts);

      watchProfilePosts();

    } catch (error) {
      console.error("Pinned posts initialization failed:", error);

      setStatus(
        error.message || "Pinned posts could not be loaded.",
        true
      );
    }
  }

  initialize();
})();
