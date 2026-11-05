import { supabase } from "./supabase.js";

const POST_MEDIA_BUCKET = "post-media-private";
const FEED_LIMIT = 50;

const elements = {
  feed: document.getElementById("following-feed"),
  status: document.getElementById("feed-status"),
  count: document.getElementById("feed-count"),
  description: document.getElementById("feed-description"),
  empty: document.getElementById("feed-empty"),
  refresh: document.getElementById("refresh-feed")
};

let currentUser = null;
let loading = false;

function setStatus(message, isError = false) {
  elements.status.textContent = message || "";
  elements.status.classList.toggle("error", isError);
}

function node(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function safeUrl(value) {
  if (typeof value !== "string") return "";

  try {
    const url = new URL(value.trim());

    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function profileUrl(id) {
  return "/profile.html?id=" + encodeURIComponent(id);
}

function postUrl(id) {
  const url = new URL("/community.html", window.location.origin);
  url.searchParams.set("post", id);
  url.hash = "post-" + id;
  return url.href;
}

function memberName(profile) {
  return profile?.display_name?.trim() ||
    (profile?.username ? "@" + profile.username : "Grove Member");
}

function appendPostText(container, value) {
  const text = String(value || "");
  const expression = /https?:\/\/[^\s<>"']+/gi;

  let cursor = 0;
  let match;

  while ((match = expression.exec(text)) !== null) {
    if (match.index > cursor) {
      container.append(
        document.createTextNode(text.slice(cursor, match.index))
      );
    }

    let raw = match[0];
    let trailing = "";

    while (/[),.!?;:]$/.test(raw)) {
      trailing = raw.slice(-1) + trailing;
      raw = raw.slice(0, -1);
    }

    const href = safeUrl(raw);

    if (href) {
      const link = node("a", "", raw);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
    } else {
      container.append(document.createTextNode(raw));
    }

    if (trailing) {
      container.append(document.createTextNode(trailing));
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    container.append(document.createTextNode(text.slice(cursor)));
  }
}

async function getSignedUrls(posts) {
  const paths = [
    ...new Set(
      posts.flatMap(post =>
        Array.isArray(post.media_urls)
          ? post.media_urls.filter(value =>
              typeof value === "string" &&
              value.trim() &&
              !safeUrl(value)
            )
          : []
      )
    )
  ];

  const result = new Map();

  if (!paths.length) return result;

  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, 180);

  if (error) {
    console.warn("Some feed images could not be loaded:", error);
    return result;
  }

  for (const item of data || []) {
    if (item.path && item.signedUrl && !item.error) {
      result.set(item.path, item.signedUrl);
    }
  }

  return result;
}

function renderAvatar(profile) {
  const avatar = node("div", "feed-avatar");
  const url = safeUrl(profile?.avatar_url);

  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.loading = "lazy";

    image.addEventListener("error", () => {
      avatar.replaceChildren(
        document.createTextNode(memberName(profile).charAt(0).toUpperCase())
      );
    }, { once: true });

    avatar.append(image);
  } else {
    avatar.textContent = memberName(profile).charAt(0).toUpperCase();
  }

  return avatar;
}

async function sharePost(post) {
  const url = postUrl(post.id);

  try {
    if (navigator.share) {
      await navigator.share({
        title: "A post on Grove",
        text: "Check out this post on Grove.",
        url
      });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setStatus("Post link copied.");
      return;
    }

    window.prompt("Copy this post link:", url);

  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("Post sharing failed:", error);
      setStatus("Could not share this post.", true);
    }
  }
}

async function toggleLike(post, liked, button) {
  button.disabled = true;

  try {
    if (liked) {
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
    setStatus(error.message || "Could not update like.", true);
    button.disabled = false;
  }
}

async function toggleRepost(post, reposted, button) {
  if (post.author_id === currentUser.id) return;

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

    } else {
      const { error } = await supabase
        .from("post_reposts")
        .insert({
          post_id: post.id,
          reposter_id: currentUser.id
        });

      if (error) throw error;
    }

    setStatus(reposted ? "Repost removed." : "Post reposted.");
    await loadFeed();

  } catch (error) {
    console.error("Repost update failed:", error);
    setStatus(error.message || "Could not update repost.", true);
    button.disabled = false;
  }
}

function renderGallery(post, signedUrls) {
  const values = Array.isArray(post.media_urls)
    ? post.media_urls
    : [];

  if (!values.length) return null;

  const gallery = node(
    "div",
    "feed-gallery" + (values.length === 1 ? " single" : "")
  );

  for (const value of values) {
    if (typeof value !== "string") continue;

    const url = safeUrl(value) || signedUrls.get(value);
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
    gallery.append(link);
  }

  return gallery.childElementCount ? gallery : null;
}

function renderPost(post, profile, stats, signedUrls) {
  const card = node("article", "feed-post");
  card.id = "post-" + post.id;

  const header = node("header", "feed-post-header");

  const authorInfo = node("div", "feed-author-info");
  const author = node("a", "feed-author", memberName(profile));
  author.href = profileUrl(post.author_id);

  const metaParts = [formatDate(post.created_at)];

  if (post.edited_at) metaParts.push("Edited");
  if (post.visibility) metaParts.push(post.visibility);

  const meta = node("span", "feed-meta", metaParts.join(" · "));

  authorInfo.append(author, meta);
  header.append(renderAvatar(profile), authorInfo);

  if (post.pinned_at) {
    header.append(node("span", "feed-pinned", "📌 Pinned"));
  }

  card.append(header);

  if (post.body) {
    const body = node("p", "feed-post-body");
    appendPostText(body, post.body);
    card.append(body);
  }

  const gallery = renderGallery(post, signedUrls);
  if (gallery) card.append(gallery);

  const likeCount = stats.likes.get(post.id) || 0;
  const repostCount = stats.reposts.get(post.id) || 0;
  const liked = stats.likedByMe.has(post.id);
  const reposted = stats.repostedByMe.has(post.id);

  const actions = node("div", "feed-actions");

  const likeButton = node(
    "button",
    "feed-action" + (liked ? " active" : ""),
    `${liked ? "♥ Liked" : "♡ Like"} · ${likeCount}`
  );
  likeButton.type = "button";
  likeButton.addEventListener("click", () => {
    toggleLike(post, liked, likeButton);
  });

  const repostButton = node(
    "button",
    "feed-action" + (reposted ? " active" : ""),
    `↻ ${reposted ? "Reposted" : "Repost"} · ${repostCount}`
  );
  repostButton.type = "button";
  repostButton.disabled = post.author_id === currentUser.id;
  repostButton.title = repostButton.disabled
    ? "You cannot repost your own post."
    : "";
  repostButton.addEventListener("click", () => {
    toggleRepost(post, reposted, repostButton);
  });

  const shareButton = node("button", "feed-action", "↗ Share");
  shareButton.type = "button";
  shareButton.addEventListener("click", () => sharePost(post));

  actions.append(likeButton, repostButton, shareButton);
  card.append(actions);

  const footer = node("footer", "feed-post-footer");
  const openPost = node("a", "", "Open post and comments →");
  openPost.href = postUrl(post.id);
  footer.append(openPost);
  card.append(footer);

  return card;
}

async function loadFeed() {
  if (loading || !currentUser) return;

  loading = true;
  elements.refresh.disabled = true;
  elements.empty.hidden = true;
  setStatus("Loading your following feed...");

  try {
    const { data: follows, error: followsError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUser.id)
      .eq("status", "accepted");

    if (followsError) throw followsError;

    const authorIds = [
      ...new Set([
        currentUser.id,
        ...(follows || []).map(row => row.following_id)
      ])
    ];

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        "id,author_id,body,media_urls,visibility,created_at,edited_at,pinned_at"
      )
      .in("author_id", authorIds)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT);

    if (postsError) throw postsError;

    const visiblePosts = posts || [];

    if (!visiblePosts.length) {
      elements.feed.replaceChildren();
      elements.count.textContent = "Following feed";
      elements.description.textContent = "No visible posts yet";
      elements.empty.hidden = false;
      setStatus("");
      return;
    }

    const postIds = visiblePosts.map(post => post.id);
    const profileIds = [
      ...new Set(visiblePosts.map(post => post.author_id))
    ];

    const [
      profilesResult,
      likesResult,
      repostsResult,
      signedUrls
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", profileIds),

      supabase
        .from("post_likes")
        .select("post_id,user_id")
        .in("post_id", postIds),

      supabase
        .from("post_reposts")
        .select("post_id,reposter_id")
        .in("post_id", postIds),

      getSignedUrls(visiblePosts)
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (likesResult.error) throw likesResult.error;

    if (repostsResult.error) {
      console.warn("Repost counts unavailable:", repostsResult.error);
    }

    const profiles = new Map(
      (profilesResult.data || []).map(profile => [profile.id, profile])
    );

    const likes = new Map();
    const likedByMe = new Set();

    for (const row of likesResult.data || []) {
      likes.set(row.post_id, (likes.get(row.post_id) || 0) + 1);

      if (row.user_id === currentUser.id) {
        likedByMe.add(row.post_id);
      }
    }

    const reposts = new Map();
    const repostedByMe = new Set();

    for (const row of repostsResult.data || []) {
      reposts.set(row.post_id, (reposts.get(row.post_id) || 0) + 1);

      if (row.reposter_id === currentUser.id) {
        repostedByMe.add(row.post_id);
      }
    }

    const stats = {
      likes,
      likedByMe,
      reposts,
      repostedByMe
    };

    const fragment = document.createDocumentFragment();

    for (const post of visiblePosts) {
      fragment.append(
        renderPost(
          post,
          profiles.get(post.author_id),
          stats,
          signedUrls
        )
      );
    }

    elements.feed.replaceChildren(fragment);
    elements.count.textContent = `${visiblePosts.length} posts`;
    elements.description.textContent =
      `${follows?.length || 0} accepted connections · newest first`;

    elements.empty.hidden = true;
    setStatus("");

  } catch (error) {
    console.error("Following feed failed:", error);
    setStatus(error.message || "Could not load your following feed.", true);
  } finally {
    loading = false;
    elements.refresh.disabled = false;
  }
}

elements.refresh.addEventListener("click", loadFeed);

async function initialize() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  currentUser = data.session?.user || null;

  if (!currentUser) {
    window.location.replace("/login.html");
    return;
  }

  await loadFeed();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    window.location.replace("/login.html");
  }
});

initialize().catch(error => {
  console.error("Following feed initialization failed:", error);
  setStatus(error.message || "Could not open Following.", true);
});
