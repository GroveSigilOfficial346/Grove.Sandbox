import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const POST_MEDIA_BUCKET = "post-media-private";

  let currentUser = null;
  let profileId = null;
  let editDialog = null;
  let editBody = null;
  let editVisibility = null;
  let editStatus = null;
  let editSaveButton = null;
  let activePostId = null;

  let likedPostIds = new Set();
  let repostedPostIds = new Set();
  let interactionRefreshRunning = false;
  let interactionRefreshQueued = false;
  let refreshSequence = 0;

  const $ = selector => document.querySelector(selector);

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function setStatus(message, error = false) {
    const node = $("#action-status") || $("#status");

    if (!node) return;

    node.textContent = message || "";
    node.style.color = error ? "#ff8585" : "";
  }

  function postUrl(postId) {
    const url = new URL("/community.html", window.location.origin);

    url.searchParams.set("post", postId);
    url.hash = "post-" + postId;

    return url.href;
  }

  async function sharePost(postId) {
    const url = postUrl(postId);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "A post on Grove",
          text: "Check out this post on Grove.",
          url
        });

        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.warn("Native share failed:", error);
      }
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable.");
      }

      await navigator.clipboard.writeText(url);
      setStatus("Post link copied. You can share it anywhere.");
    } catch (error) {
      console.warn("Copy failed:", error);
      window.prompt("Copy this post link:", url);
    }
  }

  /* ==========================================
     PROFILE RESOLUTION
     ========================================== */

  async function resolveProfile() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user || null;

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    if (requestedId) {
      profileId = requestedId;
      return;
    }

    if (requestedUsername) {
      const { data: profile, error: profileError } = await supabase
        .from("profile_directory")
        .select("id")
        .eq("username", requestedUsername.toLowerCase())
        .maybeSingle();

      if (profileError) throw profileError;

      profileId = profile?.id || null;
      return;
    }

    profileId = currentUser?.id || null;
  }

  function isOwnProfile() {
    return Boolean(
      currentUser &&
      profileId &&
      currentUser.id === profileId
    );
  }

  /* ==========================================
     POST EDITOR
     ========================================== */

  function createEditDialog() {
    if (editDialog) return;

    editDialog = element("dialog", "profile-post-edit-dialog");

    const form = element("form", "profile-post-edit-form");
    form.method = "dialog";

    form.append(element("h2", "", "Edit post"));

    editBody = document.createElement("textarea");
    editBody.rows = 6;
    editBody.maxLength = 5000;
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

    editStatus = element("p", "status-message");
    editStatus.setAttribute("role", "status");
    editStatus.setAttribute("aria-live", "polite");

    const actions = element("div", "profile-post-edit-actions");

    const cancel = element("button", "button secondary", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => editDialog.close());

    editSaveButton = element(
      "button",
      "button primary",
      "Save changes"
    );
    editSaveButton.type = "submit";

    actions.append(cancel, editSaveButton);
    form.append(editBody, editVisibility, editStatus, actions);

    form.addEventListener("submit", saveEditedPost);

    editDialog.append(form);

    editDialog.addEventListener("click", event => {
      if (event.target === editDialog) editDialog.close();
    });

    document.body.append(editDialog);
  }

  async function openEditDialog(postId) {
    if (!isOwnProfile() || !currentUser) return;

    createEditDialog();

    activePostId = postId;
    editStatus.textContent = "Loading post...";
    editBody.value = "";
    editVisibility.value = "public";
    editSaveButton.disabled = true;

    editDialog.showModal();

    try {
      const { data: post, error } = await supabase
        .from("posts")
        .select("id,author_id,body,media_urls,visibility")
        .eq("id", postId)
        .eq("author_id", currentUser.id)
        .maybeSingle();

      if (error) throw error;
      if (!post) throw new Error("This post could not be found.");

      editBody.value = post.body || "";
      editVisibility.value = post.visibility || "public";
      editStatus.textContent = "";

      editSaveButton.disabled = false;
      editBody.focus();
    } catch (error) {
      console.error("Could not open post editor:", error);

      editStatus.textContent =
        error.message || "Could not load this post.";

      editStatus.classList.add("error");
    }
  }

  async function saveEditedPost(event) {
    event.preventDefault();

    if (!activePostId || !currentUser || !isOwnProfile()) return;

    const body = editBody.value.trim();
    const visibility = editVisibility.value;

    if (!["public", "followers", "private"].includes(visibility)) {
      editStatus.textContent = "Choose a valid visibility.";
      return;
    }

    editSaveButton.disabled = true;
    editStatus.classList.remove("error");
    editStatus.textContent = "Saving changes...";

    try {
      const { data: existing, error: readError } = await supabase
        .from("posts")
        .select("id,media_urls")
        .eq("id", activePostId)
        .eq("author_id", currentUser.id)
        .maybeSingle();

      if (readError) throw readError;
      if (!existing) throw new Error("This post no longer exists.");

      if (!body && !(existing.media_urls || []).length) {
        throw new Error(
          "A post must contain text or at least one image."
        );
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("posts")
        .update({
          body,
          visibility,
          updated_at: now,
          edited_at: now
        })
        .eq("id", activePostId)
        .eq("author_id", currentUser.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("The post could not be updated.");

      editDialog.close();
      setStatus("Post updated.");
      window.location.reload();
    } catch (error) {
      console.error("Post update failed:", error);

      editStatus.textContent =
        error.message || "Could not save your changes.";

      editStatus.classList.add("error");
      editSaveButton.disabled = false;
    }
  }

  /* ==========================================
     DELETE OWN POSTS
     ========================================== */

  async function deletePost(postId, button) {
    if (!currentUser || !isOwnProfile()) return;

    if (!window.confirm(
      "Delete this post? This cannot be undone."
    )) return;

    button.disabled = true;
    setStatus("Deleting post...");

    try {
      const { data: post, error: readError } = await supabase
        .from("posts")
        .select("id,media_urls")
        .eq("id", postId)
        .eq("author_id", currentUser.id)
        .maybeSingle();

      if (readError) throw readError;
      if (!post) throw new Error("This post could not be found.");

      const { data: deleted, error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", currentUser.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!deleted) throw new Error("The post could not be deleted.");

      const paths = (post.media_urls || []).filter(
        value =>
          typeof value === "string" &&
          value.trim() &&
          !/^https?:\/\//i.test(value)
      );

      if (paths.length) {
        const { error: cleanupError } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .remove(paths);

        if (cleanupError) {
          console.warn("Post image cleanup failed:", cleanupError);
        }
      }

      setStatus("Post deleted.");
      window.location.reload();
    } catch (error) {
      console.error("Post deletion failed:", error);

      setStatus(
        error.message || "Could not delete this post.",
        true
      );

      button.disabled = false;
    }
  }

  /* ==========================================
     LIKE / UNLIKE
     Works on own posts and reposted posts.
     ========================================== */

  async function toggleLike(postId, button) {
    if (!currentUser) {
      window.location.href = "/login.html";
      return;
    }

    button.disabled = true;

    try {
      if (likedPostIds.has(postId)) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id);

        if (error) throw error;

        likedPostIds.delete(postId);
      } else {
        const { error } = await supabase
          .from("post_likes")
          .insert({
            post_id: postId,
            user_id: currentUser.id
          });

        if (error) throw error;

        likedPostIds.add(postId);
      }

      await refreshInteractionState();
    } catch (error) {
      console.error("Profile like update failed:", error);

      setStatus(
        error.message || "Could not update your like.",
        true
      );

      button.disabled = false;
    }
  }

  /* ==========================================
     REPOST / UNREPOST
     Self-reposts are intentionally permitted.
     ========================================== */

  async function toggleRepost(postId, button) {
    if (!currentUser) {
      window.location.href = "/login.html";
      return;
    }

    button.disabled = true;
    setStatus("Updating repost...");

    try {
      const { data: existing, error: lookupError } = await supabase
        .from("post_reposts")
        .select("id")
        .eq("post_id", postId)
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

        repostedPostIds.delete(postId);
        setStatus("Repost removed.");
      } else {
        const { error } = await supabase
          .from("post_reposts")
          .insert({
            post_id: postId,
            reposter_id: currentUser.id
          });

        if (error) throw error;

        repostedPostIds.add(postId);
        setStatus("Post reposted to your profile.");
      }

      await refreshInteractionState();
    } catch (error) {
      console.error("Profile repost failed:", error);

      setStatus(
        error.message || "Could not update repost.",
        true
      );

      button.disabled = false;
    }
  }

  /* ==========================================
     SHARED INTERACTION STATE
     ========================================== */

  async function refreshInteractionState() {
    if (interactionRefreshRunning) {
      interactionRefreshQueued = true;
      return;
    }

    interactionRefreshRunning = true;
    const sequence = ++refreshSequence;

    try {
      const cards = [
        ...document.querySelectorAll(
          ".profile-post[data-post-id], .profile-repost-card[data-post-id]"
        )
      ];

      const ids = [
        ...new Set(
          cards
            .map(card => card.dataset.postId)
            .filter(Boolean)
        )
      ];

      if (!ids.length) return;

      const [likesResult, mineResult, repostsResult] =
        await Promise.all([
          supabase
            .from("post_likes")
            .select("post_id,user_id")
            .in("post_id", ids),

          currentUser
            ? supabase
                .from("post_likes")
                .select("post_id")
                .eq("user_id", currentUser.id)
                .in("post_id", ids)
            : Promise.resolve({ data: [], error: null }),

          currentUser
            ? supabase
                .from("post_reposts")
                .select("post_id")
                .eq("reposter_id", currentUser.id)
                .in("post_id", ids)
            : Promise.resolve({ data: [], error: null })
        ]);

      if (sequence !== refreshSequence) return;

      const counts = new Map();

      for (const like of likesResult.data || []) {
        counts.set(
          like.post_id,
          (counts.get(like.post_id) || 0) + 1
        );
      }

      if (mineResult.error) throw mineResult.error;
      if (repostsResult.error) throw repostsResult.error;

      likedPostIds = new Set(
        (mineResult.data || []).map(row => row.post_id)
      );

      repostedPostIds = new Set(
        (repostsResult.data || []).map(row => row.post_id)
      );

      for (const card of cards) {
        const postId = card.dataset.postId;
        const count = counts.get(postId) || 0;
        const liked = likedPostIds.has(postId);
        const reposted = repostedPostIds.has(postId);

        const countNode = card.querySelector(".profile-post-likes");

        if (countNode) {
          countNode.textContent =
            count + (count === 1 ? " like" : " likes");

          countNode.classList.toggle("liked", liked);
        }

        const likeButton = card.querySelector(
          '[data-profile-action="like"]'
        );

        if (likeButton) {
          likeButton.textContent =
            `${liked ? "♥ Liked" : "♡ Like"} · ${count}`;

          likeButton.classList.toggle("liked", liked);
          likeButton.setAttribute(
            "aria-pressed",
            liked ? "true" : "false"
          );

          likeButton.disabled = false;
        }

        const repostButton = card.querySelector(
          '[data-profile-action="repost"]'
        );

        if (repostButton) {
          repostButton.textContent = reposted
            ? "↻ Reposted"
            : "↻ Repost";

          repostButton.classList.toggle("reposted", reposted);
          repostButton.setAttribute(
            "aria-pressed",
            reposted ? "true" : "false"
          );

          repostButton.disabled = false;
        }
      }
    } catch (error) {
      console.error("Profile interaction refresh failed:", error);
      setStatus(
        error.message || "Could not refresh post interactions.",
        true
      );
    } finally {
      interactionRefreshRunning = false;

      if (interactionRefreshQueued) {
        interactionRefreshQueued = false;
        refreshInteractionState();
      }
    }
  }

  /* ==========================================
     ACTION BUTTONS
     ========================================== */

  function makeButton(label, actionName, handler, className = "button secondary") {
    const button = element("button", className, label);

    button.type = "button";
    button.dataset.profileAction = actionName;

    button.addEventListener("click", () => {
      handler(button);
    });

    return button;
  }

  function addActionsToCard(card) {
    if (!card || card.dataset.profileActionsReady === "true") {
      return;
    }

    const postId = card.dataset.postId;
    if (!postId) return;

    const footer = card.querySelector(
      ".profile-post-footer, .profile-repost-footer"
    );

    if (!footer) return;

    const actions = element("div", "profile-post-management");
    actions.dataset.profileActions = "true";

    if (currentUser) {
      const like = makeButton(
        "♡ Like",
        "like",
        button => toggleLike(postId, button)
      );

      const repost = makeButton(
        "↻ Repost",
        "repost",
        button => toggleRepost(postId, button)
      );

      actions.append(like, repost);
    }

    const share = makeButton(
      "↗ Share",
      "share",
      () => sharePost(postId)
    );

    actions.append(share);

    const discussion = element(
      "a",
      "button secondary",
      "View discussion"
    );

    discussion.href = postUrl(postId);
    discussion.dataset.profileAction = "discussion";

    actions.append(discussion);

    if (
      currentUser &&
      isOwnProfile() &&
      card.classList.contains("profile-post")
    ) {
      const edit = makeButton(
        "Edit",
        "edit",
        () => openEditDialog(postId)
      );

      const remove = makeButton(
        "Delete",
        "delete",
        button => deletePost(postId, button),
        "button danger"
      );

      actions.append(edit, remove);
    }

    footer.append(actions);
    card.dataset.profileActionsReady = "true";
  }

  function scanCards(root = document) {
    const cards = [];

    if (
      root instanceof Element &&
      root.matches(
        ".profile-post[data-post-id], .profile-repost-card[data-post-id]"
      )
    ) {
      cards.push(root);
    }

    if (root.querySelectorAll) {
      cards.push(
        ...root.querySelectorAll(
          ".profile-post[data-post-id], .profile-repost-card[data-post-id]"
        )
      );
    }

    for (const card of cards) {
      addActionsToCard(card);
    }

    if (cards.length) {
      refreshInteractionState();
    }
  }

  /* ==========================================
     INITIALIZE / WATCH PROFILE CONTENT
     ========================================== */

  async function initialize() {
    try {
      await resolveProfile();

      if (!profileId) return;

      scanCards();

      const observer = new MutationObserver(records => {
        let addedCards = false;

        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              scanCards(node);
              addedCards = true;
            }
          }
        }

        if (addedCards) refreshInteractionState();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

    } catch (error) {
      console.error("Profile post controls failed:", error);

      setStatus(
        error.message || "Post controls could not be initialized.",
        true
      );
    }
  }

  initialize();
})();
