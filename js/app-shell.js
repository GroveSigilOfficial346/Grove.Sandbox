(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
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
    #grove-search {
      width:100%; padding:14px 16px;
      border:1px solid #554477; border-radius:10px;
      background:#08051a; color:#f7f5ff;
      font:inherit; outline:none;
    }
    #grove-search:focus { border-color:#a855f7; }
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
    .grove-member-actions button {
      padding:9px 12px; border:1px solid #554477;
      border-radius:8px; color:#eee5ff;
      background:#211440; text-decoration:none;
      font:inherit; font-size:12px; font-weight:700;
      cursor:pointer;
    }
    .grove-member-actions button.primary {
      border:0; color:white;
      background:linear-gradient(110deg,#851eff,#5965ff);
    }
    .grove-member-actions button:disabled {
      opacity:.55; cursor:wait;
    }
    #grove-discover-status {
      min-height:20px; margin:14px 0 0;
      color:#45e5ff; font-size:13px;
    }
    .grove-empty {
      padding:25px 10px; color:#a99bc9;
      text-align:center; line-height:1.7;
    }
    .grove-feed-placeholder {
      padding:34px 20px; border:1px solid #851eff44;
      border-radius:16px; background:#100b25;
      color:#b9a7df; text-align:center; line-height:1.7;
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
    @media(max-width:600px) {
      .grove-tab { min-width:0; padding:11px 8px; }
      .grove-panel { padding:20px; }
      .grove-member { flex-wrap:wrap; }
      .grove-member-actions { width:100%; }
      .grove-member-actions a,
      .grove-member-actions button { flex:1; }
    }
  `;
  document.head.appendChild(style);

  // Keep the existing profile and posts together.
  const profileView = document.createElement("section");
  profileView.className = "grove-view";
  profileView.id = "grove-profile-view";

  profileCard.before(profileView);
  profileView.append(profileCard, postsSection);

  // Back to Discover button for profiles belonging to other members.
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "grove-back-discover";
  backButton.textContent = "← Back to Discover";
  backButton.hidden = !viewingOtherProfile;
  profileView.prepend(backButton);

  // Navigation.
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

  // My Profile always returns to the signed-in user's own profile.
  profileButton.addEventListener("click", () => {
    if (viewingOtherProfile) {
      window.location.href = "profile.html";
      return;
    }

    switchView("profile");
  });

  // Back button returns to the Discover member list.
  backButton.addEventListener("click", () => {
    switchView("discover");
  });

  const feedPanel = document.createElement("div");
  feedPanel.className = "grove-feed-placeholder";
  feedPanel.innerHTML = `
    <h2>Grove Feed</h2>
    <p>Your community feed is coming next.</p>
    <p>Discover members and follow the people whose posts you want to see.</p>
  `;
  views.feed.appendChild(feedPanel);

  const discoverPanel = document.createElement("section");
  discoverPanel.className = "grove-panel";
  discoverPanel.innerHTML = `
    <h2>Discover members</h2>
    <input
      id="grove-search"
      type="search"
      placeholder="Search usernames or display names…"
      autocomplete="off"
      aria-label="Search Grove members"
    >
    <div id="grove-members">
      <div class="grove-empty">Explore the Grove community.</div>
    </div>
    <p id="grove-discover-status" role="status" aria-live="polite"></p>
  `;
  views.discover.appendChild(discoverPanel);

  const searchInput = discoverPanel.querySelector("#grove-search");
  const memberList = discoverPanel.querySelector("#grove-members");
  const discoverStatus = discoverPanel.querySelector("#grove-discover-status");

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

      if (currentUser) {
        query = query.neq("id", currentUser.id);
      }

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

      if (!members || members.length === 0) {
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
    avatar.src = member.avatar_url ||
      "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#171044"/><circle cx="50" cy="38" r="20" fill="#5965ff"/><path d="M12 100c4-27 17-40 38-40s34 13 38 40" fill="#851eff"/></svg>'
      );

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
            : await db.from("follows")
                .insert({
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
          showDiscoverMessage(
            error.message || "Could not update your follow."
          );
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

  async function initializeSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      console.error("Grove session:", error);
      return;
    }

    currentUser = data?.session?.user || null;
  }

  initializeSession();

  // A viewed member's profile is displayed under the Discover tab.
  // Your own profile is displayed under My Profile.
  if (viewingOtherProfile) {
    switchView("profile", "discover");
  } else {
    switchView("profile", "profile");
  }
})();
