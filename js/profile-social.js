import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const POST_MEDIA_BUCKET = "post-media-private";
  const MAX_REPOSTS = 30;
  const MAX_LIST_MEMBERS = 100;

  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let isFollowing = false;
  let canSeeLists = false;
  let repostsLoaded = false;

  let listDialog = null;
  let listContent = null;
  let listTitle = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
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

  function setRepostStatus(message, error = false) {
    const status = $("#reposts-status");

    if (!status) return;

    status.textContent = message || "";
    status.style.color = error ? "#ff8585" : "";
  }

  function memberName(member) {
    return member?.display_name?.trim() ||
      (member?.username ? "@" + member.username : "Grove Member");
  }

  function profileUrl(id) {
    return "/profile.html?id=" + encodeURIComponent(id);
  }

  /* ----------------------------------------
     RESOLVE VIEWER AND PROFILE
     ---------------------------------------- */

  async function resolveProfile() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    currentUser = auth.user || null;

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    let profileId = requestedId;

    if (!profileId && requestedUsername) {
      const { data, error } = await supabase
        .from("profile_directory")
        .select("id")
        .eq("username", requestedUsername.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      if (!data) return false;

      profileId = data.id;
    }

    if (!profileId) {
      if (!currentUser) return false;
      profileId = currentUser.id;
    }

    const { data: found, error } = await supabase
      .from("profile_directory")
      .select("id,username,display_name,avatar_url,is_private")
      .eq("id", profileId)
      .maybeSingle();

    if (error) throw error;
    if (!found) return false;

    profile = found;

    isOwner = Boolean(
      currentUser && currentUser.id === profile.id
    );

    isFollowing = false;

    if (isOwner || !profile.is_private) {
      canSeeLists = true;
    } else if (currentUser) {
      const { data: relationship, error: relationshipError } =
        await supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id)
          .eq("status", "accepted")
          .maybeSingle();

      if (relationshipError) throw relationshipError;

      isFollowing = Boolean(relationship);
      canSeeLists = isFollowing;
    } else {
      canSeeLists = false;
    }

    return true;
  }

  /* ----------------------------------------
     FOLLOWER / FOLLOWING COUNT BUTTONS
     ---------------------------------------- */

  function makeStatButtons() {
    const stats = $("#profile-stats");

    if (!stats) return;

    const labels = stats.querySelectorAll(".profile-stat");

    for (const stat of labels) {
      if (stat.tagName === "BUTTON") continue;

      const text = stat.textContent.trim();

      const match = text.match(
        /^(?:[\d,]+|—)\s+(Followers|Following)$/i
      );

      if (!match) continue;

      const type = match[1].toLowerCase();

      const button = element(
        "button",
        "profile-stat profile-stat-button",
        text
      );

      button.type = "button";
      button.dataset.profileList = type;
      button.setAttribute(
        "aria-label",
        "View " + type + " list"
      );

      button.addEventListener("click", () => {
        openMemberList(type);
      });

      stat.replaceWith(button);
    }
  }

  function observeStats() {
    const stats = $("#profile-stats");

    if (!stats) return;

    makeStatButtons();

    const observer = new MutationObserver(() => {
      makeStatButtons();
    });

    observer.observe(stats, {
      childList: true,
      subtree: true
    });
  }

  /* ----------------------------------------
     MEMBER LIST DIALOG
     ---------------------------------------- */

  function createListDialog() {
    if (listDialog) return;

    listDialog = element("dialog", "profile-list-dialog");
    listDialog.setAttribute("aria-label", "Profile member list");

    const inner = element("div", "profile-list-dialog-inner");
    const header = element("header", "profile-list-header");

    listTitle = element("h2", "profile-list-title", "Members");
    listTitle.id = "profile-list-title";

    const close = element(
      "button",
      "profile-list-close",
      "×"
    );

    close.type = "button";
    close.setAttribute("aria-label", "Close member list");

    close.addEventListener("click", () => {
      listDialog.close();
    });

    header.append(listTitle, close);

    listContent = element("div", "profile-list-content");
    listContent.setAttribute("aria-live", "polite");

    inner.append(header, listContent);
    listDialog.append(inner);

    listDialog.addEventListener("click", event => {
      if (event.target === listDialog) {
        listDialog.close();
      }
    });

    document.body.append(listDialog);
  }

  async function openMemberList(type) {
    if (!profile) return;

    createListDialog();

    const label = type === "followers"
      ? "Followers"
      : "Following";

    listTitle.textContent = label;
    listContent.replaceChildren(
      element("p", "profile-list-message", "Loading members...")
    );

    if (!listDialog.open) {
      listDialog.showModal();
    }

    if (!canSeeLists) {
      listContent.replaceChildren(
        element(
          "p",
          "profile-list-message",
          "This account is private. Follow the member and wait for approval to view their lists."
        )
      );
      return;
    }

    try {
      const isFollowers = type === "followers";

      let query = supabase
        .from("follows")
        .select(
          isFollowers
            ? "follower_id,created_at"
            : "following_id,created_at"
        )
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(MAX_LIST_MEMBERS);

      query = isFollowers
        ? query.eq("following_id", profile.id)
        : query.eq("follower_id", profile.id);

      const { data: relationships, error } = await query;

      if (error) throw error;

      if (!relationships?.length) {
        listContent.replaceChildren(
          element(
            "p",
            "profile-list-message",
            "No " + label.toLowerCase() + " to show yet."
          )
        );
        return;
      }

      const memberIds = [
        ...new Set(
          relationships.map(row =>
            isFollowers ? row.follower_id : row.following_id
          )
        )
      ];

      const { data: members, error: membersError } =
        await supabase
          .from("profile_directory")
          .select("id,username,display_name,avatar_url")
          .in("id", memberIds);

      if (membersError) throw membersError;

      const memberMap = new Map(
        (members || []).map(member => [member.id, member])
      );

      listContent.replaceChildren();

      for (const id of memberIds) {
        const member = memberMap.get(id);

        if (!member) continue;

        listContent.append(renderMember(member));
      }

      if (!listContent.childElementCount) {
        listContent.append(
          element(
            "p",
            "profile-list-message",
            "No visible members were found."
          )
        );
      }

      if (relationships.length >= MAX_LIST_MEMBERS) {
        listContent.append(
          element(
            "p",
            "profile-list-message",
            "Showing the latest " + MAX_LIST_MEMBERS + " members."
          )
        );
      }

    } catch (error) {
      console.error("Profile member list failed:", error);

      listContent.replaceChildren(
        element(
          "p",
          "profile-list-message",
          error.message || "Could not load this member list."
        )
      );
    }
  }

  function renderMember(member) {
    const link = element("a", "profile-list-member");
    link.href = profileUrl(member.id);

    const avatar = element("span", "profile-list-avatar");
    const avatarUrl = safeHttpUrl(member.avatar_url);

    if (avatarUrl) {
      const image = element("img");
      image.src = avatarUrl;
      image.alt = "";
      image.loading = "lazy";
      avatar.append(image);
    } else {
      avatar.textContent = memberName(member)
        .charAt(0)
        .toUpperCase();
    }

    const info = element("span", "profile-list-member-info");

    info.append(
      element(
        "span",
        "profile-list-member-name",
        memberName(member)
      )
    );

    if (member.username) {
      info.append(
        element(
          "span",
          "profile-list-member-username",
          "@" + member.username
        )
      );
    }

    link.append(avatar, info);

    return link;
  }

  /* ----------------------------------------
     PROFILE TABS
     ---------------------------------------- */

  function setActiveTab(tabName) {
    const postsSection = $("#posts-section");
    const repostsSection = $("#reposts-section");
    const pinnedSection = $("#profile-pinned-section");

    const isPosts = tabName === "posts";

    if (postsSection) postsSection.hidden = !isPosts;
    if (repostsSection) repostsSection.hidden = isPosts;

    if (pinnedSection) {
      pinnedSection.hidden = !isPosts;
    }

    document
      .querySelectorAll("[data-profile-tab]")
      .forEach(button => {
        const active = button.dataset.profileTab === tabName;

        button.classList.toggle("active", active);
        button.setAttribute(
          "aria-selected",
          active ? "true" : "false"
        );
      });

    if (!isPosts) {
      loadReposts();
    }
  }

  function connectTabs() {
    document
      .querySelectorAll("[data-profile-tab]")
      .forEach(button => {
        button.addEventListener("click", () => {
          setActiveTab(button.dataset.profileTab);
        });
      });

    setActiveTab("posts");
  }

  /* ----------------------------------------
     REPOST MEDIA URLS
     ---------------------------------------- */

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

    if (error) {
      console.warn("Repost images could not be signed:", error);
      return signedUrls;
    }

    for (const item of data || []) {
      if (item.path && item.signedUrl && !item.error) {
        signedUrls.set(item.path, item.signedUrl);
      }
    }

    return signedUrls;
  }

  /* ----------------------------------------
     RENDER A REPOSTED POST
     ---------------------------------------- */

  function renderRepost(repost, post, author, signedUrls) {
    const card = element(
      "article",
      "profile-repost-card"
    );

    card.dataset.postId = post.id;

    card.append(
      element(
        "div",
        "profile-repost-label",
        "↻ Reposted by this member"
      )
    );

    const authorName = author
      ? memberName(author)
      : "Grove Member";

    const authorLine = element(
      "p",
      "profile-repost-author"
    );

    authorLine.append(
      document.createTextNode("Original post by ")
    );

    if (author?.id) {
      const authorLink = element("a", "", authorName);
      authorLink.href = profileUrl(author.id);
      authorLine.append(authorLink);
    } else {
      authorLine.append(
        document.createTextNode(authorName)
      );
    }

    card.append(authorLine);

    if (post.body) {
      card.append(
        element(
          "p",
          "profile-repost-body",
          post.body
        )
      );
    }

    const media = Array.isArray(post.media_urls)
      ? post.media_urls
      : [];

    if (media.length) {
      const gallery = element(
        "div",
        "profile-repost-gallery"
      );

      for (const value of media) {
        if (typeof value !== "string") continue;

        const url = isHttpUrl(value)
          ? safeHttpUrl(value)
          : signedUrls.get(value);

        if (!url) continue;

        const link = element("a", "profile-repost-media");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const image = element(
          "img",
          "profile-repost-image"
        );

        image.src = url;
        image.alt = "Image from reposted post";
        image.loading = "lazy";

        link.append(image);
        gallery.append(link);
      }

      if (gallery.childElementCount) {
        card.append(gallery);
      }
    }

    const footer = element(
      "div",
      "profile-repost-footer"
    );

    const originalDate = new Date(post.created_at);

    if (!Number.isNaN(originalDate.getTime())) {
      footer.append(
        element(
          "time",
          "",
          "Posted " + originalDate.toLocaleString()
        )
      );
    }

    const repostDate = new Date(repost.created_at);

    if (!Number.isNaN(repostDate.getTime())) {
      footer.append(
        element(
          "time",
          "",
          "Reposted " + repostDate.toLocaleString()
        )
      );
    }

    card.append(footer);

    return card;
  }

  /* ----------------------------------------
     LOAD PROFILE REPOSTS
     ---------------------------------------- */

  async function loadReposts() {
    if (repostsLoaded || !profile) return;

    const container = $("#reposts-list");

    if (!container) return;

    if (profile.is_private && !isOwner && !isFollowing) {
      container.replaceChildren(
        element(
          "p",
          "profile-list-message",
          "This profile is private. Follow to request access to its reposts."
        )
      );

      repostsLoaded = true;
      return;
    }

    setRepostStatus("Loading reposts...");

    container.replaceChildren();

    try {
      const { data: reposts, error: repostError } =
        await supabase
          .from("post_reposts")
          .select("post_id,created_at")
          .eq("reposter_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(MAX_REPOSTS);

      if (repostError) throw repostError;

      if (!reposts?.length) {
        container.replaceChildren(
          element(
            "p",
            "muted",
            "No reposts yet."
          )
        );

        setRepostStatus("");
        repostsLoaded = true;
        return;
      }

      const postIds = [
        ...new Set(reposts.map(item => item.post_id))
      ];

      const { data: posts, error: postsError } =
        await supabase
          .from("posts")
          .select(
            "id,author_id,body,media_urls,visibility,created_at"
          )
          .in("id", postIds);

      if (postsError) throw postsError;

      const postsById = new Map(
        (posts || []).map(post => [post.id, post])
      );

      const visiblePosts = reposts
        .map(repost => ({
          repost,
          post: postsById.get(repost.post_id)
        }))
        .filter(item => Boolean(item.post));

      if (!visiblePosts.length) {
        container.replaceChildren(
          element(
            "p",
            "muted",
            "There are no reposts currently visible to you."
          )
        );

        setRepostStatus("");
        repostsLoaded = true;
        return;
      }

      const authorIds = [
        ...new Set(
          visiblePosts.map(item => item.post.author_id)
        )
      ];

      const [
        authorsResult,
        signedUrls
      ] = await Promise.all([
        supabase
          .from("profile_directory")
          .select("id,username,display_name")
          .in("id", authorIds),

        createSignedUrlMap(
          visiblePosts.map(item => item.post)
        )
      ]);

      if (authorsResult.error) {
        console.warn(
          "Original post author names unavailable:",
          authorsResult.error
        );
      }

      const authorsById = new Map(
        (authorsResult.data || []).map(author => [
          author.id,
          author
        ])
      );

      container.replaceChildren();

      for (const item of visiblePosts) {
        container.append(
          renderRepost(
            item.repost,
            item.post,
            authorsById.get(item.post.author_id),
            signedUrls
          )
        );
      }

      setRepostStatus(
        visiblePosts.length >= MAX_REPOSTS
          ? "Showing the latest " + MAX_REPOSTS + " reposts."
          : ""
      );

      repostsLoaded = true;

    } catch (error) {
      console.error("Profile reposts failed:", error);

      setRepostStatus(
        error.message || "Could not load reposts.",
        true
      );

      container.replaceChildren(
        element(
          "p",
          "muted",
          "Reposts could not be loaded. Refresh the page and try again."
        )
      );
    }
  }

  /* ----------------------------------------
     INITIALIZE
     ---------------------------------------- */

  async function initialize() {
    observeStats();
    connectTabs();

    try {
      const found = await resolveProfile();

      if (!found) {
        setRepostStatus("Sign in to view your profile.");
        return;
      }

      // The existing profile-view.js renders the count elements
      // asynchronously. Process them again after profile resolution.
      makeStatButtons();

    } catch (error) {
      console.error("Profile social features failed:", error);

      setRepostStatus(
        error.message || "Profile social features could not load.",
        true
      );
    }
  }

  initialize();
})();
