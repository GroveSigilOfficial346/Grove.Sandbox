(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const MEDIA_BUCKET = "grove-media";

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const app = document.querySelector(".profile-app");
  const topbar = document.querySelector(".topbar");
  const profileCard = document.getElementById("profile-card");
  const postsSection = document.getElementById("posts-section");

  if (!app || !topbar || !profileCard || !postsSection) {
    console.error("Grove app shell: required profile elements not found.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const viewingOtherProfile = params.has("id") || params.has("username");

  let currentUser = null;
  let searchTimer = null;
  let searchSequence = 0;
  let discoverLoaded = false;
  let feedMode = "for-you";
  let feedSequence = 0;

  const style = document.createElement("style");
  style.textContent = `
    .grove-navigation {
      display:flex; gap:8px; flex-wrap:wrap;
      margin:0 0 24px; padding:8px;
      border:1px solid #851eff44; border-radius:14px;
      background:#100b25;
    }
    .grove-tab {
      flex:1; min-width:90px; padding:12px 14px;
      border:1px solid transparent; border-radius:9px;
      background:transparent; color:#b9a7df;
      font:inherit; font-size:13px; font-weight:700;
      cursor:pointer;
    }
    .grove-tab:hover { background:#211440; color:white; }
    .grove-tab[aria-selected="true"] {
      color:white; border-color:#851eff88;
      background:linear-gradient(110deg,#851eff55,#353bff44);
    }
    .grove-view[hidden] { display:none !important; }
    .grove-panel {
      margin-top:0; padding:25px 28px;
      border:1px solid #851eff44; border-radius:16px;
      background:#100b25;
    }
    .grove-panel h2 { margin:0 0 18px; font-size:20px; }
    #grove-search, .grove-input, .grove-textarea {
      width:100%; padding:13px 15px;
      border:1px solid #554477; border-radius:10px;
      background:#08051a; color:#f7f5ff;
      font:inherit; outline:none; box-sizing:border-box;
    }
    #grove-search:focus, .grove-input:focus,
    .grove-textarea:focus { border-color:#a855f7; }
    .grove-textarea { min-height:100px; resize:vertical; }
    #grove-members { display:grid; gap:12px; margin-top:18px; }
    .grove-member {
      display:flex; align-items:center; gap:14px;
      padding:15px; border:1px solid #851eff44;
      border-radius:13px; background:#08051a;
      min-width:0;
    }
    .grove-member img {
      width:58px; height:58px; border-radius:50%;
      object-fit:cover; background:#171044;
      border:2px solid #851eff; flex-shrink:0;
    }
    .grove-member-info { flex:1; min-width:0; }
    .grove-member-info strong {
      display:block; color:white; overflow-wrap:anywhere;
    }
    .grove-member-info small { color:#45e5ff; }
    .grove-member-info p {
      margin:6px 0 0; color:#a99bc9;
      font-size:13px; overflow-wrap:anywhere;
    }
    .grove-member-actions {
      display:flex; gap:8px; flex-wrap:wrap;
    }
    .grove-member-actions a,
    .grove-member-actions button,
    .grove-action {
      padding:9px 12px; border:1px solid #554477;
      border-radius:8px; color:#eee5ff;
      background:#211440; text-decoration:none;
      font:inherit; font-size:12px; font-weight:700;
      cursor:pointer;
    }
    .grove-member-actions button.primary,
    .grove-action.primary {
      border:0; color:white;
      background:linear-gradient(110deg,#851eff,#5965ff);
    }
    .grove-member-actions button:disabled,
    .grove-action:disabled {
      opacity:.55; cursor:wait;
    }
    #grove-discover-status, #grove-feed-status {
      min-height:20px; margin:14px 0 0;
      color:#45e5ff; font-size:13px;
    }
    .grove-empty {
      padding:25px 10px; color:#a99bc9;
      text-align:center; line-height:1.7;
    }
    .grove-back-discover {
      display:inline-flex; align-items:center; gap:8px;
      margin:0 0 18px; padding:10px 14px;
      border:1px solid #851eff66; border-radius:9px;
      background:#211440; color:#eee5ff;
      font:inherit; font-size:13px; font-weight:700;
      cursor:pointer;
    }
    .grove-back-discover:hover {
      background:#33205a; border-color:#a855f7;
    }
    .grove-feed-layout { display:grid; gap:18px; }
    .grove-feed-tabs {
      display:flex; gap:8px; margin-bottom:16px;
    }
    .grove-feed-tabs button {
      flex:1; padding:11px; border:1px solid #554477;
      border-radius:9px; background:#08051a;
      color:#b9a7df; font:inherit; font-weight:700;
      cursor:pointer;
    }
    .grove-feed-tabs button.active {
      color:white; border-color:#851eff;
      background:#35165f;
    }
    .grove-composer, .grove-post, .grove-suggestions {
      padding:20px; border:1px solid #851eff44;
      border-radius:15px; background:#100b25;
    }
    .grove-composer h2, .grove-suggestions h2 {
      margin:0 0 14px; font-size:17px;
    }
    .grove-composer textarea { margin-bottom:10px; }
    .grove-composer-actions {
      display:flex; align-items:center; gap:10px;
      flex-wrap:wrap; margin-top:10px;
    }
    .grove-composer input[type=file] {
      max-width:100%; color:#b9a7df; font-size:12px;
    }
    .grove-preview {
      display:block; max-width:100%; max-height:260px;
      margin-top:12px; border-radius:10px;
    }
    .grove-post-list { display:grid; gap:14px; }
    .grove-post-header {
      display:flex; align-items:center; gap:11px;
      margin-bottom:13px;
    }
    .grove-post-avatar {
      width:42px; height:42px; border-radius:50%;
      object-fit:cover; background:#171044;
    }
    .grove-post-author { min-width:0; flex:1; }
    .grove-post-author strong {
      display:block; color:white; font-size:14px;
    }
    .grove-post-author small {
      color:#a99bc9; font-size:12px;
    }
    .grove-post-body {
      color:#e5def5; line-height:1.7;
      white-space:pre-wrap; overflow-wrap:anywhere;
    }
    .grove-post-image {
      display:block; width:100%; max-height:520px;
      object-fit:contain; margin-top:13px;
      border-radius:11px; background:#08051a;
    }
    .grove-post-actions {
      display:flex; gap:9px; flex-wrap:wrap;
      margin-top:15px; padding-top:13px;
      border-top:1px solid #851eff33;
    }
    .grove-post-actions button {
      border:0; background:transparent;
      color:#b9a7df; padding:7px 5px;
      font:inherit; font-size:13px; cursor:pointer;
    }
    .grove-post-actions button.liked { color:#ff7cbd; }
    .grove-comments {
      display:grid; gap:10px; margin-top:14px;
    }
    .grove-comment {
      padding:10px 12px; border-radius:9px;
      background:#08051a; color:#d9d0ed;
      font-size:13px; line-height:1.5;
    }
    .grove-comment strong {
      color:#45e5ff; margin-right:6px;
    }
    .grove-comment-form {
      display:flex; gap:8px; margin-top:12px;
    }
    .grove-comment-form input { flex:1; min-width:0; }
    .grove-feed-footer {
      color:#a99bc9; font-size:12px; margin-top:10px;
    }
    .grove-suggestions-list {
      display:grid; gap:10px;
    }
    .grove-suggestion {
      display:flex; align-items:center; gap:9px;
      min-width:0;
    }
    .grove-suggestion img {
      width:35px; height:35px; border-radius:50%;
      object-fit:cover; background:#171044;
    }
    .grove-suggestion a {
      flex:1; min-width:0; color:#eee5ff;
      text-decoration:none; font-size:13px;
      overflow-wrap:anywhere;
    }
    .grove-suggestion button {
      border:1px solid #554477; border-radius:7px;
      padding:7px 9px; background:#211440;
      color:white; cursor:pointer; font-size:11px;
    }
    .grove-action {
      border:0; color:white;
      background:linear-gradient(110deg,#851eff,#5965ff);
    }
    @media(min-width:800px) {
      .grove-feed-layout {
        grid-template-columns:minmax(0,1fr) 260px;
        align-items:start;
      }
    }
    @media(max-width:600px) {
      .grove-tab { min-width:0; padding:11px 8px; }
      .grove-panel { padding:20px; }
      .grove-member { flex-wrap:wrap; }
      .grove-member-actions { width:100%; }
      .grove-member-actions a,
      .grove-member-actions button { flex:1; }
      .grove-comment-form { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);

  // Keep the existing profile and posts together.
  const profileView = document.createElement("section");
  profileView.className = "grove-view";
  profileView.id = "grove-profile-view";

  profileCard.before(profileView);
  profileView.append(profileCard, postsSection);

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "grove-back-discover";
  backButton.textContent = "← Back to Discover";
  backButton.hidden = !viewingOtherProfile;
  profileView.prepend(backButton);

  const navigation = document.createElement("nav");
  navigation.className = "grove-navigation";
  navigation.setAttribute("aria-label", "Grove sections");

  const views = {};

  function switchView(name, selectedTab = name) {
    Object.entries(views).forEach(([key, view]) => {
      view.hidden = key !== name;
    });

    profileView.hidden = name !== "profile";

    navigation.querySelectorAll(".grove-tab").forEach(button => {
      button.setAttribute(
        "aria-selected",
        String(button.dataset.view === selectedTab)
      );
    });

    if (name === "discover" && !discoverLoaded) {
      loadMembers(searchInput.value.trim());
    }

    if (name === "feed") {
      loadFeed();
    }
  }

  function createView(name, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "grove-tab";
    button.textContent = label;
    button.dataset.view = name;
    button.setAttribute("aria-selected", "false");
    navigation.appendChild(button);

    const view = document.createElement("section");
    view.className = "grove-view";
    view.hidden = true;
    app.insertBefore(view, profileView);
    views[name] = view;

    button.addEventListener("click", () => switchView(name));
  }

  createView("feed", "Feed");
  createView("discover", "Discover");

  const profileButton = document.createElement("button");
  profileButton.type = "button";
  profileButton.className = "grove-tab";
  profileButton.textContent = "My Profile";
  profileButton.dataset.view = "profile";
  profileButton.setAttribute("aria-selected", "false");
  navigation.appendChild(profileButton);

  profileButton.addEventListener("click", () => {
    if (viewingOtherProfile) {
      window.location.href = "profile.html";
      return;
    }
    switchView("profile");
  });

  backButton.addEventListener("click", () => {
    switchView("discover");
  });

  topbar.after(navigation);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showDiscoverMessage(text) {
    discoverStatus.textContent = text || "";
  }

  // FEED INTERFACE
  const feedView = views.feed;
  const feedLayout = element("div", "grove-feed-layout");
  const feedMain = element("div", "grove-feed-main");
  const feedSide = element("aside", "grove-feed-side");

  const composer = element("section", "grove-composer");
  composer.innerHTML = `
    <h2>Create a post</h2>
    <textarea class="grove-textarea" id="grove-post-text"
      maxlength="5000" placeholder="What's happening in your world?"></textarea>
    <div class="grove-composer-actions">
      <input type="file" id="grove-post-image" accept="image/jpeg,image/png,image/webp,image/gif">
      <button class="grove-action" id="grove-publish" type="button">Publish</button>
    </div>
    <img id="grove-post-preview" class="grove-preview" hidden alt="Post image preview">
    <p id="grove-post-status" role="status" aria-live="polite"></p>
  `;

  const feedTabs = element("div", "grove-feed-tabs");
  feedTabs.innerHTML = `
    <button type="button" data-feed="for-you" class="active">For You</button>
    <button type="button" data-feed="following">Following</button>
  `;

  const postList = element("div", "grove-post-list");
  const feedStatus = element("p", "");
  feedStatus.id = "grove-feed-status";
  feedStatus.setAttribute("role", "status");
  feedStatus.setAttribute("aria-live", "polite");

  feedMain.append(composer, feedTabs, postList, feedStatus);

  const suggestions = element("section", "grove-suggestions");
  suggestions.innerHTML = `
    <h2>Suggested members</h2>
    <div class="grove-suggestions-list" id="grove-suggestions-list">
      <div class="grove-empty">Loading suggestions…</div>
    </div>
  `;
  feedSide.appendChild(suggestions);
  feedLayout.append(feedMain, feedSide);
  feedView.appendChild(feedLayout);

  const postText = composer.querySelector("#grove-post-text");
  const postImage = composer.querySelector("#grove-post-image");
  const postPreview = composer.querySelector("#grove-post-preview");
  const publishButton = composer.querySelector("#grove-publish");
  const postStatus = composer.querySelector("#grove-post-status");
  const suggestionsList = suggestions.querySelector("#grove-suggestions-list");

  postImage.addEventListener("change", () => {
    const file = postImage.files?.[0];

    if (!file) {
      postPreview.hidden = true;
      postPreview.removeAttribute("src");
      return;
    }

    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      postStatus.textContent = "Choose an image under 5 MB (JPEG, PNG, WebP or GIF).";
      postImage.value = "";
      postPreview.hidden = true;
      return;
    }

    postStatus.textContent = "";
    postPreview.src = URL.createObjectURL(file);
    postPreview.hidden = false;
  });

  publishButton.addEventListener("click", publishPost);

  async function publishPost() {
    if (!currentUser) {
      postStatus.textContent = "Please log in to publish a post.";
      return;
    }

    const body = postText.value.trim();
    const file = postImage.files?.[0];

    if (!body && !file) {
      postStatus.textContent = "Write something or choose a photo first.";
      return;
    }

    publishButton.disabled = true;
    postStatus.textContent = "Publishing your post…";

    try {
      const mediaUrls = [];

      if (file) {
        const extension = file.name.split(".").pop().toLowerCase();
        const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
        const path = `${currentUser.id}/posts/${crypto.randomUUID()}.${safeExtension}`;

        const { error: uploadError } = await db.storage
          .from(MEDIA_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = db.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(path);

        if (!publicData?.publicUrl) {
          throw new Error("The uploaded image URL could not be created.");
        }

        mediaUrls.push(publicData.publicUrl);
      }

      const { error } = await db.from("posts").insert({
        author_id: currentUser.id,
        body,
        media_urls: mediaUrls,
        visibility: "public"
      });

      if (error) throw error;

      postText.value = "";
      postImage.value = "";
      postPreview.hidden = true;
      postPreview.removeAttribute("src");
      postStatus.textContent = "Your post is live!";
      await loadFeed();

    } catch (error) {
      console.error("Grove publish post:", error);
      postStatus.textContent = error.message || "Your post could not be published.";
    } finally {
      publishButton.disabled = false;
    }
  }

  feedTabs.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      feedMode = button.dataset.feed;
      feedTabs.querySelectorAll("button").forEach(tab => {
        tab.classList.toggle("active", tab === button);
      });
      loadFeed();
    });
  });

  async function loadFeed() {
    const sequence = ++feedSequence;
    feedStatus.textContent = "";
    postList.replaceChildren(
      element("div", "grove-empty", "Loading Grove posts…")
    );

    try {
      let query = db
        .from("posts")
        .select("id, author_id, body, media_urls, visibility, created_at")
        .order("created_at", { ascending: false })
        .limit(40);

      if (feedMode === "following") {
        if (!currentUser) {
          postList.replaceChildren(
            element("div", "grove-empty", "Log in to see posts from members you follow.")
          );
          return;
        }

        const { data: follows, error: followError } = await db
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUser.id);

        if (followError) throw followError;

        const authorIds = [
          currentUser.id,
          ...(follows || []).map(row => row.following_id)
        ];

        query = query.in("author_id", [...new Set(authorIds)]);
      } else {
        query = query.eq("visibility", "public");
      }

      const { data: posts, error } = await query;
      if (error) throw error;
      if (sequence !== feedSequence) return;

      if (!posts?.length) {
        postList.replaceChildren(
          element(
            "div",
            "grove-empty",
            feedMode === "following"
              ? "No posts here yet. Follow members to fill your feed."
              : "No public posts yet. Be the first to share something with Grove."
          )
        );
        return;
      }

      const authorIds = [...new Set(posts.map(post => post.author_id))];

      const [profilesResult, likesResult] = await Promise.all([
        db.from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", authorIds),

        currentUser
          ? db.from("post_likes")
              .select("post_id")
              .eq("user_id", currentUser.id)
              .in("post_id", posts.map(post => post.id))
          : Promise.resolve({ data: [], error: null })
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (likesResult.error) throw likesResult.error;
      if (sequence !== feedSequence) return;

      const profiles = new Map(
        (profilesResult.data || []).map(profile => [profile.id, profile])
      );

      const likedIds = new Set(
        (likesResult.data || []).map(row => row.post_id)
      );

      const countsResult = await db
        .from("post_likes")
        .select("post_id")
        .in("post_id", posts.map(post => post.id));

      if (countsResult.error) throw countsResult.error;
      if (sequence !== feedSequence) return;

      const likeCounts = new Map();
      (countsResult.data || []).forEach(row => {
        likeCounts.set(row.post_id, (likeCounts.get(row.post_id) || 0) + 1);
      });

      postList.replaceChildren();

      posts.forEach(post => {
        postList.appendChild(
          renderPost(
            post,
            profiles.get(post.author_id),
            likedIds.has(post.id),
            likeCounts.get(post.id) || 0
          )
        );
      });

    } catch (error) {
      console.error("Grove feed:", error);
      postList.replaceChildren(
        element("div", "grove-empty", "Couldn't load the feed. Please try again.")
      );
      feedStatus.textContent = error.message || "Feed unavailable.";
    }
  }

  function renderPost(post, profile, isLiked, likeCount) {
    const card = element("article", "grove-post");

    const header = element("div", "grove-post-header");
    const avatar = element("img", "grove-post-avatar");
    avatar.alt = "";
    avatar.src = profile?.avatar_url || fallbackAvatar();

    const author = element("div", "grove-post-author");
    const authorName = element(
      "strong",
      "",
      profile?.display_name || profile?.username || "Grove Member"
    );
    const username = element(
      "small",
      "",
      profile?.username ? "@" + profile.username : "Grove member"
    );
    author.append(authorName, username);

    const date = element(
      "small",
      "",
      new Date(post.created_at).toLocaleString()
    );
    date.style.color = "#a99bc9";
    header.append(avatar, author, date);
    card.appendChild(header);

    if (post.body) {
      card.appendChild(element("div", "grove-post-body", post.body));
    }

    (Array.isArray(post.media_urls) ? post.media_urls : []).forEach(url => {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
      const image = element("img", "grove-post-image");
      image.src = url;
      image.alt = "Post image";
      image.loading = "lazy";
      card.appendChild(image);
    });

    const actions = element("div", "grove-post-actions");
    const likeButton = element(
      "button",
      isLiked ? "liked" : "",
      `${isLiked ? "♥ Liked" : "♡ Like"} · ${likeCount}`
    );
    likeButton.type = "button";
    likeButton.disabled = !currentUser;

    likeButton.addEventListener("click", async () => {
      likeButton.disabled = true;

      try {
        const result = isLiked
          ? await db.from("post_likes")
              .delete()
              .eq("post_id", post.id)
              .eq("user_id", currentUser.id)
          : await db.from("post_likes").insert({
              post_id: post.id,
              user_id: currentUser.id
            });

        if (result.error) throw result.error;
        await loadFeed();

      } catch (error) {
        console.error("Grove like:", error);
        feedStatus.textContent = error.message || "Couldn't update like.";
        likeButton.disabled = false;
      }
    });

    const commentButton = element("button", "", "Comments");
    commentButton.type = "button";

    actions.append(likeButton, commentButton);
    card.appendChild(actions);

    const commentsArea = element("div", "grove-comments");
    commentsArea.hidden = true;
    card.appendChild(commentsArea);

    commentButton.addEventListener("click", async () => {
      commentsArea.hidden = !commentsArea.hidden;
      if (!commentsArea.hidden && !commentsArea.dataset.loaded) {
        await loadComments(post.id, commentsArea);
      }
    });

    return card;
  }

  async function loadComments(postId, container) {
    container.replaceChildren(
      element("div", "grove-empty", "Loading comments…")
    );

    try {
      const { data: comments, error } = await db
        .from("comments")
        .select("id, author_id, body, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;

      const authorIds = [...new Set((comments || []).map(c => c.author_id))];
      let profiles = new Map();

      if (authorIds.length) {
        const result = await db.from("profiles")
          .select("id, username, display_name")
          .in("id", authorIds);

        if (result.error) throw result.error;

        profiles = new Map(
          (result.data || []).map(profile => [profile.id, profile])
        );
      }

      container.replaceChildren();

      (comments || []).forEach(comment => {
        const profile = profiles.get(comment.author_id);
        const row = element("div", "grove-comment");
        const name = element(
          "strong",
          "",
          profile?.display_name || profile?.username || "Member"
        );
        row.append(name, document.createTextNode(comment.body));
        container.appendChild(row);
      });

      if (!comments?.length) {
        container.appendChild(
          element("div", "grove-empty", "No comments yet. Start the conversation.")
        );
      }

      if (currentUser) {
        const form = element("form", "grove-comment-form");
        const input = element("input", "grove-input");
        input.type = "text";
        input.maxLength = 2000;
        input.placeholder = "Write a comment…";
        input.required = true;

        const submit = element("button", "grove-action", "Send");
        submit.type = "submit";
        form.append(input, submit);

        form.addEventListener("submit", async event => {
          event.preventDefault();
          const body = input.value.trim();
          if (!body) return;

          submit.disabled = true;

          try {
            const { error } = await db.from("comments").insert({
              post_id: postId,
              author_id: currentUser.id,
              body
            });

            if (error) throw error;
            await loadComments(postId, container);

          } catch (error) {
            console.error("Grove comment:", error);
            feedStatus.textContent = error.message || "Couldn't send comment.";
            submit.disabled = false;
          }
        });

        container.appendChild(form);
      } else {
        container.appendChild(
          element("p", "grove-feed-footer", "Log in to comment.")
        );
      }

      container.dataset.loaded = "true";

    } catch (error) {
      console.error("Grove comments:", error);
      container.replaceChildren(
        element("div", "grove-empty", "Couldn't load comments.")
      );
    }
  }

  function fallbackAvatar() {
    return "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#171044"/><circle cx="50" cy="38" r="20" fill="#5965ff"/><path d="M12 100c4-27 17-40 38-40s34 13 38 40" fill="#851eff"/></svg>'
    );
  }

  // DISCOVER INTERFACE
  const discoverPanel = element("section", "grove-panel");
  discoverPanel.innerHTML = `
    <h2>Discover members</h2>
    <input id="grove-search" type="search"
      placeholder="Search usernames or display names…"
      autocomplete="off" aria-label="Search Grove members">
    <div id="grove-members">
      <div class="grove-empty">Explore the Grove community.</div>
    </div>
    <p id="grove-discover-status" role="status" aria-live="polite"></p>
  `;
  views.discover.appendChild(discoverPanel);

  const searchInput = discoverPanel.querySelector("#grove-search");
  const memberList = discoverPanel.querySelector("#grove-members");
  const discoverStatus = discoverPanel.querySelector("#grove-discover-status");

  function showDiscoverMessage(text) {
    discoverStatus.textContent = text || "";
  }

  async function loadMembers(term) {
    const sequence = ++searchSequence;

    showDiscoverMessage("");
    memberList.replaceChildren(
      element("div", "grove-empty", "Searching Grove…")
    );

    try {
      let query = db
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(40);

      if (currentUser) query = query.neq("id", currentUser.id);

      const safeTerm = term
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .slice(0, 40);

      if (safeTerm) {
        query = query.or(
          `username.ilike.%${safeTerm}%,display_name.ilike.%${safeTerm}%`
        );
      }

      const { data: members, error } = await query;
      if (error) throw error;
      if (sequence !== searchSequence) return;

      if (!members?.length) {
        memberList.replaceChildren(
          element(
            "div",
            "grove-empty",
            term ? "No members found. Try another search." :
              "No other members have joined yet."
          )
        );
        discoverLoaded = true;
        return;
      }

      const ids = members.map(member => member.id);

      const [followingResult, followersResult] = await Promise.all([
        currentUser
          ? db.from("follows")
              .select("following_id")
              .eq("follower_id", currentUser.id)
              .in("following_id", ids)
          : Promise.resolve({ data: [], error: null }),

        db.from("follows")
          .select("following_id")
          .in("following_id", ids)
      ]);

      if (followingResult.error) throw followingResult.error;
      if (followersResult.error) throw followersResult.error;
      if (sequence !== searchSequence) return;

      const following = new Set(
        (followingResult.data || []).map(row => row.following_id)
      );

      const counts = new Map();
      (followersResult.data || []).forEach(row => {
        counts.set(
          row.following_id,
          (counts.get(row.following_id) || 0) + 1
        );
      });

      memberList.replaceChildren();

      members.forEach(member => {
        memberList.appendChild(
          renderMember(
            member,
            following.has(member.id),
            counts.get(member.id) || 0
          )
        );
      });

      discoverLoaded = true;

    } catch (error) {
      console.error("Grove Discover:", error);
      memberList.replaceChildren(
        element("div", "grove-empty", "Couldn't load members. Please try again.")
      );
      showDiscoverMessage(error.message || "Discover is unavailable.");
    }
  }

  function renderMember(member, isFollowing, followerCount) {
    const card = element("article", "grove-member");

    const avatar = element("img");
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.src = member.avatar_url || fallbackAvatar();

    const info = element("div", "grove-member-info");
    info.appendChild(
      element("strong", "", member.display_name || member.username || "Grove Member")
    );
    info.appendChild(
      element("small", "", member.username ? "@" + member.username : "")
    );
    info.appendChild(
      element(
        "p",
        "",
        (member.bio || "A member of Grove.") +
          " · " + followerCount +
          (followerCount === 1 ? " follower" : " followers")
      )
    );

    const actions = element("div", "grove-member-actions");
    const profileLink = element("a", "", "View profile");
    profileLink.href = "profile.html?id=" + encodeURIComponent(member.id);
    actions.appendChild(profileLink);

    if (currentUser) {
      const followButton = element(
        "button",
        isFollowing ? "" : "primary",
        isFollowing ? "Following" : "Follow"
      );

      followButton.type = "button";
      followButton.addEventListener("click", async () => {
        followButton.disabled = true;
        showDiscoverMessage("");

        try {
          const result = isFollowing
            ? await db.from("follows")
                .delete()
                .eq("follower_id", currentUser.id)
                .eq("following_id", member.id)
            : await db.from("follows").insert({
                follower_id: currentUser.id,
                following_id: member.id
              });

          if (result.error) throw result.error;

          showDiscoverMessage(
            isFollowing
              ? "You unfollowed this member."
              : "You're now following this member!"
          );

          discoverLoaded = false;
          await loadMembers(searchInput.value.trim());

        } catch (error) {
          console.error("Grove follow action:", error);
          showDiscoverMessage(error.message || "Could not update your follow.");
          followButton.disabled = false;
        }
      });

      actions.appendChild(followButton);
    }

    card.append(avatar, info, actions);
    return card;
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      discoverLoaded = false;
      loadMembers(searchInput.value.trim());
    }, 300);
  });

  // SUGGESTED MEMBERS
  async function loadSuggestions() {
    suggestionsList.replaceChildren(
      element("div", "grove-empty", "Loading suggestions…")
    );

    try {
      let query = db
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .order("created_at", { ascending: false })
        .limit(5);

      if (currentUser) query = query.neq("id", currentUser.id);

      const { data, error } = await query;
      if (error) throw error;

      if (!data?.length) {
        suggestionsList.replaceChildren(
          element("div", "grove-empty", "More members are coming soon.")
        );
        return;
      }

      suggestionsList.replaceChildren();

      data.forEach(member => {
        const row = element("div", "grove-suggestion");
        const image = element("img");
        image.alt = "";
        image.src = member.avatar_url || fallbackAvatar();

        const link = element(
          "a",
          "",
          member.display_name || member.username || "Grove Member"
        );
        link.href = "profile.html?id=" + encodeURIComponent(member.id);

        row.append(image, link);

        if (currentUser) {
          const follow = element("button", "", "Follow");
          follow.type = "button";

          follow.addEventListener("click", async () => {
            follow.disabled = true;
            try {
              const { error: followError } = await db.from("follows").insert({
                follower_id: currentUser.id,
                following_id: member.id
              });

              if (followError) throw followError;
              follow.textContent = "Following";
            } catch (error) {
              console.error("Grove suggested follow:", error);
              follow.textContent = "Retry";
              follow.disabled = false;
            }
          });

          row.appendChild(follow);
        }

        suggestionsList.appendChild(row);
      });

    } catch (error) {
      console.error("Grove suggestions:", error);
      suggestionsList.replaceChildren(
        element("div", "grove-empty", "Suggestions are unavailable.")
      );
    }
  }

  // Initialize session before loading feeds or member suggestions.
  async function initialize() {
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      currentUser = data?.session?.user || null;

      if (currentUser) {
        composer.hidden = false;
      } else {
        composer.hidden = true;
      }

      await loadSuggestions();

    } catch (error) {
      console.error("Grove session:", error);
      composer.hidden = true;
    }

    if (viewingOtherProfile) {
      switchView("profile", "discover");
    } else {
      switchView("profile", "profile");
    }
  }

  initialize();
})();
