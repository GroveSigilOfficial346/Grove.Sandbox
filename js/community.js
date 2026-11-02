import { supabase } from "./supabase.js";

const MEDIA_BUCKET = "grove-media";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

const elements = {
  status: document.getElementById("community-status"),
  feed: document.getElementById("community-feed"),
  form: document.getElementById("post-form"),
  body: document.getElementById("post-body"),
  images: document.getElementById("post-images"),
  selectedImages: document.getElementById("selected-images"),
  visibility: document.getElementById("post-visibility"),
  publish: document.getElementById("publish-post"),
  composerStatus: document.getElementById("composer-status"),
  refresh: document.getElementById("refresh-feed")
};

let currentUser = null;
let currentProfile = null;
let feedLoading = false;

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function setComposerStatus(message, isError = false) {
  elements.composerStatus.textContent = message;
  elements.composerStatus.classList.toggle("error", isError);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
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
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be uploaded.");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error("Each image must be 5 MB or smaller.");
    }

    if (!getFileExtension(file)) {
      throw new Error("Use JPG, PNG, WEBP, or GIF images.");
    }
  }
}

async function uploadPostImages(files) {
  const urls = [];
  const uploadedPaths = [];

  try {
    for (const file of files) {
      const extension = getFileExtension(file);
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const path = `${currentUser.id}/posts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      uploadedPaths.push(path);

      const { data } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(path);

      if (!data?.publicUrl) {
        throw new Error("Could not create an image URL.");
      }

      urls.push(data.publicUrl);
    }

    return { urls, uploadedPaths };
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage
        .from(MEDIA_BUCKET)
        .remove(uploadedPaths);
    }

    throw error;
  }
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
    .select("id, username, display_name, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;

  currentProfile = profile;

  await loadFeed();
}

async function loadFeed() {
  if (feedLoading) return;

  feedLoading = true;
  elements.refresh.disabled = true;
  setStatus("Loading posts...");

  try {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, author_id, body, media_urls, visibility, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (postsError) throw postsError;

    if (!posts?.length) {
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

    const postIds = posts.map(post => post.id);
    const authorIds = [...new Set(posts.map(post => post.author_id))];

    const [
      profilesResult,
      likesResult,
      commentsResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", authorIds),

      supabase
        .from("post_likes")
        .select("post_id, user_id")
        .in("post_id", postIds),

      supabase
        .from("comments")
        .select("id, post_id, author_id, body, created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;

    const profiles = new Map(
      (profilesResult.data || []).map(profile => [profile.id, profile])
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

    elements.feed.replaceChildren();

    for (const post of posts) {
      const card = createPostCard(
        post,
        profiles,
        likesByPost,
        likedByMe,
        commentsByPost
      );

      elements.feed.append(card);
    }

    setStatus("");
  } catch (error) {
    console.error("Grove feed error:", error);
    setStatus(error.message || "Could not load the community feed.", true);
  } finally {
    feedLoading = false;
    elements.refresh.disabled = false;
  }
}

function createPostCard(post, profiles, likesByPost, likedByMe, commentsByPost) {
  const author = profiles.get(post.author_id);
  const card = createElement("article", "post-card");

  const header = createElement("div", "post-header");

  const avatar = createElement("div", "post-avatar");

  if (author?.avatar_url) {
    const image = document.createElement("img");
    image.src = author.avatar_url;
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
    author?.display_name || author?.username || "Grove Member"
  );

  authorLink.href = `/profile.html?id=${encodeURIComponent(post.author_id)}`;

  const meta = createElement(
    "p",
    "post-meta",
    `${formatDate(post.created_at)} · ${post.visibility}`
  );

  identity.append(authorLink, meta);
  header.append(avatar, identity);
  card.append(header);

  if (post.body) {
    card.append(createElement("p", "post-body", post.body));
  }

  const mediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [];

  if (mediaUrls.length) {
    const mediaContainer = createElement("div", "post-images");

    for (const url of mediaUrls) {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;

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

    card.append(mediaContainer);
  }

  const actions = createElement("div", "post-actions");

  const likeButton = createElement(
    "button",
    "button secondary",
    `${likedByMe.has(post.id) ? "♥ Liked" : "♡ Like"} · ${likesByPost.get(post.id) || 0}`
  );

  likeButton.type = "button";

  if (likedByMe.has(post.id)) {
    likeButton.classList.add("liked");
  }

  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;

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
      console.error("Like error:", error);
      setStatus(error.message || "Could not update like.", true);
      likeButton.disabled = false;
    }
  });

  actions.append(likeButton);

  if (post.author_id === currentUser.id) {
    const deleteButton = createElement(
      "button",
      "button danger",
      "Delete post"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete this post? This cannot be undone.")) return;

      deleteButton.disabled = true;

      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", post.id)
        .eq("author_id", currentUser.id);

      if (error) {
        setStatus(error.message || "Could not delete post.", true);
        deleteButton.disabled = false;
        return;
      }

      await loadFeed();
    });

    actions.append(deleteButton);
  }

  card.append(actions);

  const commentsSection = createElement("section", "comments");
  commentsSection.setAttribute("aria-label", "Comments");

  const comments = commentsByPost.get(post.id) || [];

  if (comments.length) {
    for (const comment of comments) {
      const commentAuthor = profiles.get(comment.author_id);

      const commentBox = createElement("div", "comment");

      commentBox.append(
        createElement(
          "p",
          "comment-author",
          commentAuthor?.display_name ||
          commentAuthor?.username ||
          "Grove Member"
        ),
        createElement("p", "comment-body", comment.body)
      );

      commentsSection.append(commentBox);
    }
  }

  const commentForm = createElement("form", "comment-form");
  const commentInput = document.createElement("input");

  commentInput.type = "text";
  commentInput.maxLength = 2000;
  commentInput.required = true;
  commentInput.placeholder = "Write a comment...";
  commentInput.setAttribute("aria-label", "Write a comment");

  const commentButton = createElement("button", "button secondary", "Comment");
  commentButton.type = "submit";

  commentForm.append(commentInput, commentButton);

  commentForm.addEventListener("submit", async event => {
    event.preventDefault();

    const body = commentInput.value.trim();

    if (!body) return;

    commentButton.disabled = true;

    const { error } = await supabase
      .from("comments")
      .insert({
        post_id: post.id,
        author_id: currentUser.id,
        body
      });

    if (error) {
      console.error("Comment error:", error);
      setStatus(error.message || "Could not publish comment.", true);
      commentButton.disabled = false;
      return;
    }

    await loadFeed();
  });

  commentsSection.append(commentForm);
  card.append(commentsSection);

  return card;
}

elements.images.addEventListener("change", () => {
  const files = Array.from(elements.images.files || []);

  try {
    validateImages(files);

    elements.selectedImages.textContent = files.length
      ? `${files.length} image(s) selected`
      : "";
  } catch (error) {
    elements.images.value = "";
    elements.selectedImages.textContent = "";
    setComposerStatus(error.message, true);
  }
});

elements.form.addEventListener("submit", async event => {
  event.preventDefault();

  const body = elements.body.value.trim();
  const files = Array.from(elements.images.files || []);
  const visibility = elements.visibility.value;

  if (!body && !files.length) {
    setComposerStatus("Write something or choose an image first.", true);
    return;
  }

  if (body.length > 5000) {
    setComposerStatus("Posts cannot exceed 5,000 characters.", true);
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
    let mediaUrls = [];

    if (files.length) {
      const uploadResult = await uploadPostImages(files);
      mediaUrls = uploadResult.urls;
      uploadedPaths = uploadResult.uploadedPaths;
    }

    const { error } = await supabase
      .from("posts")
      .insert({
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
        .from(MEDIA_BUCKET)
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

elements.refresh.addEventListener("click", loadFeed);

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    window.location.replace("/login.html");
  }
});

initialize().catch(error => {
  console.error("Grove community initialization error:", error);
  setStatus(error.message || "Could not open Grove Community.", true);
});
