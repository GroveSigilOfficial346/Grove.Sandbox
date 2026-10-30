(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const $ = (selector) => document.querySelector(selector);

  function isSafeWebUrl(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  function showError(message) {
    const status = $("#status");
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }

  function getInitial(name) {
    return (name || "G").trim().charAt(0).toUpperCase() || "G";
  }

  function renderProfile(profile) {
    $("#display-name").textContent =
      profile.display_name || "Grove Member";

    $("#username").textContent =
      profile.username ? `@${profile.username}` : "";

    const bio = $("#bio");

    if (profile.bio?.trim()) {
      bio.textContent = profile.bio;
      bio.hidden = false;
    } else {
      bio.hidden = true;
    }

    const avatar = $("#avatar");
    avatar.replaceChildren();

    const avatarUrl = profile.avatar_url
      ? isSafeWebUrl(profile.avatar_url)
      : null;

    if (avatarUrl) {
      const image = document.createElement("img");
      image.src = avatarUrl.href;
      image.alt = `${profile.display_name || "Member"}'s profile picture`;
      image.loading = "lazy";
      avatar.appendChild(image);
    } else {
      avatar.textContent = getInitial(profile.display_name);
    }

    const cover = $("#cover");
    cover.style.backgroundImage = "";

    const coverUrl = profile.cover_url
      ? isSafeWebUrl(profile.cover_url)
      : null;

    if (coverUrl) {
      cover.style.backgroundImage =
        `url("${coverUrl.href.replace(/["\\]/g, "\\$&")}")`;
    }

    const details = $("#details");
    details.replaceChildren();

    if (profile.location) {
      const location = document.createElement("span");
      location.textContent = `📍 ${profile.location}`;
      details.appendChild(location);
    }

    if (profile.pronouns) {
      const pronouns = document.createElement("span");
      pronouns.textContent = profile.pronouns;
      details.appendChild(pronouns);
    }

    if (profile.website) {
      let websiteValue = profile.website.trim();

      if (!/^https?:\/\//i.test(websiteValue)) {
        websiteValue = `https://${websiteValue}`;
      }

      const websiteUrl = isSafeWebUrl(websiteValue);

      if (websiteUrl) {
        const link = document.createElement("a");
        link.href = websiteUrl.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Website";
        details.appendChild(link);
      }
    }
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function addStyles() {
    if ($("#grove-profile-post-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-profile-post-styles";
    style.textContent = `
      .grove-profile-post {
        padding:20px;
        margin-bottom:16px;
        border:1px solid #851eff44;
        border-radius:14px;
        background:#08051a;
        overflow-wrap:anywhere;
      }
      .grove-profile-post-date {
        margin:0 0 12px;
        color:#a99bc9;
        font-size:12px;
      }
      .grove-profile-post-body {
        margin:0;
        color:#f7f5ff;
        line-height:1.7;
        white-space:pre-wrap;
      }
      .grove-profile-post-image {
        display:block;
        width:100%;
        max-height:500px;
        margin-top:14px;
        border-radius:10px;
        object-fit:contain;
        background:#050019;
      }
      .grove-profile-comments {
        display:grid;
        gap:10px;
        margin-top:18px;
        padding-top:14px;
        border-top:1px solid #851eff33;
      }
      .grove-profile-comments-title {
        margin:0 0 2px;
        color:#45e5ff;
        font-size:13px;
        font-weight:700;
      }
      .grove-profile-comment {
        padding:10px 12px;
        border-radius:9px;
        background:#111025;
        color:#d9d0ed;
        font-size:13px;
        line-height:1.5;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
      }
      .grove-profile-comment-author {
        display:block;
        margin-bottom:3px;
        color:#45e5ff;
        font-weight:700;
      }
      .grove-profile-comment-date {
        display:block;
        margin-top:4px;
        color:#a99bc9;
        font-size:11px;
      }
      .grove-profile-no-comments {
        color:#a99bc9;
        font-size:13px;
      }
    `;
    document.head.appendChild(style);
  }

  function createPostCard(post, comments, authorProfiles) {
    const article = document.createElement("article");
    article.className = "grove-profile-post";

    const date = document.createElement("p");
    date.className = "grove-profile-post-date";
    date.textContent = formatDate(post.created_at);
    article.appendChild(date);

    if (post.body?.trim()) {
      const body = document.createElement("p");
      body.className = "grove-profile-post-body";
      body.textContent = post.body;
      article.appendChild(body);
    }

    const mediaUrls = Array.isArray(post.media_urls)
      ? post.media_urls
      : [];

    mediaUrls.forEach((value) => {
      const safeUrl = isSafeWebUrl(value);
      if (!safeUrl) return;

      const image = document.createElement("img");
      image.className = "grove-profile-post-image";
      image.src = safeUrl.href;
      image.alt = "Post image";
      image.loading = "lazy";
      article.appendChild(image);
    });

    const commentsSection = document.createElement("section");
    commentsSection.className = "grove-profile-comments";

    const heading = document.createElement("h3");
    heading.className = "grove-profile-comments-title";
    heading.textContent = `Comments (${comments.length})`;
    commentsSection.appendChild(heading);

    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "grove-profile-no-comments";
      empty.textContent = "No comments yet.";
      commentsSection.appendChild(empty);
    } else {
      comments.forEach((comment) => {
        const row = document.createElement("div");
        row.className = "grove-profile-comment";

        const authorProfile = authorProfiles.get(comment.author_id);
        const author = document.createElement("span");
        author.className = "grove-profile-comment-author";
        author.textContent =
          authorProfile?.display_name ||
          authorProfile?.username ||
          "Grove Member";

        const text = document.createElement("span");
        text.textContent = comment.body;

        row.append(author, text);

        const commentDate = formatDate(comment.created_at);

        if (commentDate) {
          const dateLabel = document.createElement("span");
          dateLabel.className = "grove-profile-comment-date";
          dateLabel.textContent = commentDate;
          row.appendChild(dateLabel);
        }

        commentsSection.appendChild(row);
      });
    }

    article.appendChild(commentsSection);
    return article;
  }

  async function loadPosts(client, profile) {
    const postsSection = $("#posts-section");
    const postsList = $("#posts-list");
    const postsEmpty = $("#posts-empty");

    postsSection.hidden = false;
    postsList.replaceChildren();

    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Loading posts and comments…";
    postsList.appendChild(loading);

    const { data: posts, error } = await client
      .from("posts")
      .select("id, author_id, body, media_urls, visibility, created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Grove posts error:", error);
      postsList.replaceChildren();

      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent = "Posts couldn't be loaded right now.";
      postsList.appendChild(message);
      return;
    }

    if (!posts?.length) {
      postsList.replaceChildren();
      postsEmpty.hidden = false;
      postsList.appendChild(postsEmpty);
      return;
    }

    postsEmpty.hidden = true;

    // Load all comments for these posts in one query.
    const postIds = posts.map((post) => post.id);

    const { data: comments, error: commentsError } = await client
      .from("comments")
      .select("id, post_id, author_id, body, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentsError) {
      console.error("Grove profile comments error:", commentsError);
    }

    const safeComments = commentsError ? [] : (comments || []);
    const authorIds = [
      ...new Set(safeComments.map((comment) => comment.author_id))
    ];

    let authorProfiles = new Map();

    if (authorIds.length) {
      const { data: profiles, error: profilesError } = await client
        .from("profiles")
        .select("id, username, display_name")
        .in("id", authorIds);

      if (profilesError) {
        console.error("Grove comment authors error:", profilesError);
      } else {
        authorProfiles = new Map(
          (profiles || []).map((author) => [author.id, author])
        );
      }
    }

    const commentsByPost = new Map();

    safeComments.forEach((comment) => {
      if (!commentsByPost.has(comment.post_id)) {
        commentsByPost.set(comment.post_id, []);
      }

      commentsByPost.get(comment.post_id).push(comment);
    });

    addStyles();
    postsList.replaceChildren();

    posts.forEach((post) => {
      postsList.appendChild(
        createPostCard(
          post,
          commentsByPost.get(post.id) || [],
          authorProfiles
        )
      );
    });
  }

  async function initialize() {
    const status = $("#status");

    if (!window.supabase?.createClient) {
      showError("Grove couldn't load. Please refresh.");
      return;
    }

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    try {
      const {
        data: sessionData,
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) throw sessionError;

      const currentUser = sessionData.session?.user || null;

      const params = new URLSearchParams(window.location.search);
      const requestedUsername = params.get("username")?.trim();
      const requestedId = params.get("id")?.trim();

      let query = client
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, location, website, pronouns"
        );

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.ilike("username", requestedUsername);
      } else if (currentUser) {
        query = query.eq("id", currentUser.id);
      } else {
        throw new Error(
          "Choose a member profile to view, or sign in to see your own."
        );
      }

      const { data: profile, error } = await query.maybeSingle();

      if (error) throw error;
      if (!profile) {
        throw new Error("This Grove profile couldn't be found.");
      }

      const isOwner =
        Boolean(currentUser) && currentUser.id === profile.id;

      $("#edit-profile-link").hidden = !isOwner;
      $("#settings-link").hidden = !isOwner;

      renderProfile(profile);

      $("#profile-card").hidden = false;
      status.hidden = true;

      await loadPosts(client, profile);

    } catch (error) {
      console.error("Grove profile display error:", error);
      showError(error.message || "Couldn't load this profile.");
    }
  }

  initialize();
})();
