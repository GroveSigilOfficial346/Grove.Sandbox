(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const searchInput = document.getElementById("user-search");
  const resultsContainer = document.getElementById("user-results");
  const resultsHeading = document.getElementById("results-heading");
  const resultsCount = document.getElementById("results-count");
  const status = document.getElementById("discover-status");

  let currentUser = null;
  let searchSequence = 0;

  const DEFAULT_AVATAR =
    "data:image/svg+xml," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#17152c"/>
        <circle cx="50" cy="37" r="19" fill="#5965ff"/>
        <path d="M15 100c2-27 16-40 35-40s33 13 35 40" fill="#851eff"/>
      </svg>
    `);

  function setStatus(message) {
    status.textContent = message || "";
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  async function initialize() {
    try {
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) throw error;

      currentUser = session?.user || null;

      await loadMembers("");
    } catch (error) {
      console.error("Discover initialization failed:", error);
      showError("Could not load Grove members. Please refresh.");
    }
  }

  async function loadMembers(searchTerm) {
    const sequence = ++searchSequence;

    setStatus("");
    resultsContainer.replaceChildren(
      createElement("div", "empty-state", "Searching Grove...")
    );

    resultsHeading.textContent = searchTerm
      ? "Search results"
      : "Explore members";

    try {
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(40);

      if (currentUser) {
        query = query.neq("id", currentUser.id);
      }

      if (searchTerm) {
        // Restrict filter characters so user input cannot alter
        // the PostgREST filter expression.
        const safeTerm = searchTerm
          .replace(/[^a-zA-Z0-9 _.-]/g, "")
          .trim()
          .slice(0, 40);

        if (!safeTerm) {
          showEmpty("Enter a username or display name to search.");
          return;
        }

        query = query.or(
          `username.ilike.%${safeTerm}%,display_name.ilike.%${safeTerm}%`
        );
      }

      const { data: profiles, error } = await query;

      if (error) throw error;
      if (sequence !== searchSequence) return;

      if (!profiles || profiles.length === 0) {
        showEmpty(
          searchTerm
            ? "No members found. Try another search."
            : "No other members have joined yet."
        );
        return;
      }

      const ids = profiles.map(profile => profile.id);

      const [followResult, followerResults] = await Promise.all([
        currentUser
          ? supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", currentUser.id)
              .in("following_id", ids)
          : Promise.resolve({ data: [], error: null }),

        supabase
          .from("follows")
          .select("following_id")
          .in("following_id", ids)
      ]);

      if (followResult.error) throw followResult.error;
      if (followerResults.error) throw followerResults.error;

      if (sequence !== searchSequence) return;

      const followingSet = new Set(
        (followResult.data || []).map(row => row.following_id)
      );

      const followerCounts = new Map();

      for (const row of followerResults.data || []) {
        followerCounts.set(
          row.following_id,
          (followerCounts.get(row.following_id) || 0) + 1
        );
      }

      resultsContainer.replaceChildren();

      for (const profile of profiles) {
        renderMember(
          profile,
          followingSet.has(profile.id),
          followerCounts.get(profile.id) || 0
        );
      }

      resultsCount.textContent =
        `${profiles.length} member${profiles.length === 1 ? "" : "s"}`;

    } catch (error) {
      console.error("Member search failed:", error);

      if (sequence === searchSequence) {
        showError("Something went wrong while searching. Please try again.");
      }
    }
  }

  function renderMember(profile, isFollowing, followerCount) {
    const card = createElement("article", "user-card");

    const avatar = createElement("img", "user-avatar");
    avatar.src = profile.avatar_url || DEFAULT_AVATAR;
    avatar.alt = "";
    avatar.loading = "lazy";

    avatar.addEventListener("error", () => {
      avatar.src = DEFAULT_AVATAR;
    }, { once: true });

    const info = createElement("div", "user-info");

    const displayName = createElement(
      "h3",
      "",
      profile.display_name || profile.username || "Grove Member"
    );

    const username = createElement(
      "div",
      "username",
      profile.username ? `@${profile.username}` : ""
    );

    const bio = createElement(
      "p",
      "bio",
      profile.bio || "A member of Grove."
    );

    const stats = createElement(
      "div",
      "user-stats",
      `${followerCount} follower${followerCount === 1 ? "" : "s"}`
    );

    info.append(displayName, username, bio, stats);

    const actions = createElement("div", "user-actions");

    const profileLink = createElement(
      "a",
      "profile-button",
      "View profile"
    );

    profileLink.href =
      `profile.html?id=${encodeURIComponent(profile.id)}`;

    actions.appendChild(profileLink);

    if (currentUser) {
      const followButton = createElement(
        "button",
        `follow-button${isFollowing ? " following" : ""}`,
        isFollowing ? "Following" : "Follow"
      );

      followButton.type = "button";

      followButton.addEventListener("click", () => {
        toggleFollow(
          profile.id,
          followButton,
          stats,
          isFollowing
        );
      });

      actions.appendChild(followButton);
    }

    card.append(avatar, info, actions);
    resultsContainer.appendChild(card);
  }

  async function toggleFollow(
    targetUserId,
    button,
    statsElement,
    currentlyFollowing
  ) {
    if (!currentUser) {
      setStatus("Please log in to follow Grove members.");
      return;
    }

    button.disabled = true;
    setStatus("");

    try {
      if (currentlyFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", targetUserId);

        if (error) throw error;

        button.textContent = "Follow";
        button.classList.remove("following");
        button.onclick = null;

        // Refresh results to ensure all displayed data is current.
        await loadMembers(searchInput.value.trim());
        setStatus("You unfollowed this member.");

      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: targetUserId
          });

        if (error) throw error;

        button.textContent = "Following";
        button.classList.add("following");

        await loadMembers(searchInput.value.trim());
        setStatus("You're now following this member!");
      }

    } catch (error) {
      console.error("Follow action failed:", error);

      if (error.code === "23505") {
        setStatus("You're already following this member.");
      } else {
        setStatus(
          error.message || "Could not update your follow. Please try again."
        );
      }

      button.disabled = false;
    }
  }

  function showEmpty(message) {
    resultsContainer.replaceChildren(
      createElement("div", "empty-state", message)
    );
    resultsCount.textContent = "";
  }

  function showError(message) {
    resultsContainer.replaceChildren(
      createElement("div", "empty-state", message)
    );
    resultsCount.textContent = "";
  }

  let searchTimeout;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      loadMembers(searchInput.value.trim());
    }, 300);
  });

  initialize();
})();
