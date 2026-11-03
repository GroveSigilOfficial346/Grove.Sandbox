import { supabase } from "./supabase.js";

const POST_MEDIA_BUCKET = "post-media-private";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 10;
const MAX_PINS = 3;

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
  refresh: document.getElementById("refresh-feed")
};

let currentUser = null;
let currentProfile = null;
let feedLoading = false;
let pinnedCount = 0;

function setStatus(message, isError = false) {
  if (!elements.status) return;

  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function setComposerStatus(message, isError = false) {
  if (!elements.composerStatus) return;

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

function isHttpUrl(value) {
  return typeof value === "string" &&
    /^https?:\/\//i.test(value);
}

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

async function changePostPin(postId, shouldPin, button) {
  if (!currentUser) return;

  if (shouldPin && pinnedCount >= MAX_PINS) {
    setStatus("You can pin up to 3 posts. Unpin one first.", true);
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

async function loadFeed() {
  if (feedLoading) return;

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
            "id,author_id,body,media_urls,visibility,created_at,updated_at,pinned_at"
          )
          .order("created_at", { ascending: false })
          .limit(50),

        supabase
          .from("posts")
          .select(
            "id,author_id,body,media_urls,visibility,created_at,updated_at,pinned_at"
          )
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(50),

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

      createSignedUrlMap(allPosts)
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;

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
            false
          )
        );
      }
    }

    setStatus("");

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

function createPostCard(
  post,
  profiles,
  likesByPost,
  likedByMe,
  commentsByPost,
  signedUrlsByPath,
  isPinnedSection = false
) {
  const author = profiles.get(post.author_id);
  const card = createElement("article", "post-card");

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

  if (author?.avatar_url && isHttpUrl(author.avatar_url)) {
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

  authorLink.href =
    `/profile.html?id=${encodeURIComponent(post.author_id)}`;

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

  const mediaUrls = Array.isArray(post.media_urls)
    ? post.media_urls
    : [];

  if (mediaUrls.length) {
    const mediaContainer = createElement("div", "post-images");

    for (const value of mediaUrls) {
      if (typeof value !== "string") continue;

      const url = isHttpUrl(value)
        ? value
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
    const pinButton = createElement(
      "button",
      "button secondary",
      post.pinned_at ? "Unpin post" : "📌 Pin post"
    );

    pinButton.type = "button";

    pinButton.disabled =
      !post.pinned_at && pinnedCount >= MAX_PINS;

    pinButton.title = pinButton.disabled
      ? "Unpin another post before pinning this one."
      : "";

    pinButton.addEventListener("click", () => {
      changePostPin(
        post.id,
        !post.pinned_at,
        pinButton
      );
    });

    actions.append(pinButton);

    const deleteButton = createElement(
      "button",
      "button danger",
      "Delete post"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(
        "Delete this post? This cannot be undone."
      )) return;

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

      const privatePaths = mediaUrlsFromPost(post);

      if (privatePaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .remove(privatePaths);

        if (cleanupError) {
          console.warn(
            "Deleted post media cleanup failed:",
            cleanupError
          );
        }
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

  const commentButton = createElement(
    "button",
    "button secondary",
    "Comment"
  );

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

function mediaUrlsFromPost(post) {
  return (Array.isArray(post.media_urls) ? post.media_urls : [])
    .filter(value =>
      typeof value === "string" &&
      !isHttpUrl(value)
    );
}

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

if (elements.refresh) {
  elements.refresh.addEventListener("click", loadFeed);
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
