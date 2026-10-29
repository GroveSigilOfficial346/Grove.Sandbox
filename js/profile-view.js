(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const $ = (selector) => document.querySelector(selector);

  function isSafeWebUrl(value) {
    try {
      const url = new URL(value);

      if (!["https:", "http:"].includes(url.protocol)) {
        return null;
      }

      return url;
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

    // Profile picture
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

    // Cover photo
    const cover = $("#cover");
    cover.style.backgroundImage = "";

    const coverUrl = profile.cover_url
      ? isSafeWebUrl(profile.cover_url)
      : null;

    if (coverUrl) {
      cover.style.backgroundImage =
        `url("${coverUrl.href.replace(/["\\]/g, "\\$&")}")`;
    }

    // Profile details
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

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function createPostCard(post) {
    const article = document.createElement("article");

    Object.assign(article.style, {
      padding: "20px",
      border: "1px solid #851eff44",
      borderRadius: "14px",
      background: "#08051a",
      overflowWrap: "anywhere"
    });

    // Post date
    const date = document.createElement("p");
    date.textContent = formatDate(post.created_at);

    Object.assign(date.style, {
      margin: "0 0 12px",
      color: "#a99bc9",
      fontSize: "12px"
    });

    article.appendChild(date);

    // Post text
    if (post.body?.trim()) {
      const body = document.createElement("p");
      body.textContent = post.body;

      Object.assign(body.style, {
        margin: "0",
        color: "#f7f5ff",
        lineHeight: "1.7",
        whiteSpace: "pre-wrap"
      });

      article.appendChild(body);
    }

    // Post images
    const mediaUrls = Array.isArray(post.media_urls)
      ? post.media_urls
      : [];

    mediaUrls.forEach((value) => {
      const safeUrl = isSafeWebUrl(value);

      if (!safeUrl) return;

      const image = document.createElement("img");
      image.src = safeUrl.href;
      image.alt = "Post image";
      image.loading = "lazy";

      Object.assign(image.style, {
        display: "block",
        width: "100%",
        maxHeight: "500px",
        marginTop: "14px",
        borderRadius: "10px",
        objectFit: "contain",
        background: "#050019"
      });

      article.appendChild(image);
    });

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
    loading.textContent = "Loading posts…";
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

    postsList.replaceChildren();

    if (!posts || posts.length === 0) {
      postsList.appendChild(postsEmpty);
      postsEmpty.hidden = false;
      return;
    }

    postsEmpty.hidden = true;

    posts.forEach((post) => {
      postsList.appendChild(createPostCard(post));
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

      // Determine which profile to display.
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

      // Determine profile ownership.
      const isOwner =
        Boolean(currentUser) && currentUser.id === profile.id;

      $("#edit-profile-link").hidden = !isOwner;
      $("#settings-link").hidden = !isOwner;

      // Display profile and posts.
      renderProfile(profile);

      $("#profile-card").hidden = false;
      status.hidden = true;

      await loadPosts(client, profile);

    } catch (error) {
      console.error("Grove profile display error:", error);

      showError(
        error.message || "Couldn't load this profile."
      );
    }
  }

  initialize();
})();
