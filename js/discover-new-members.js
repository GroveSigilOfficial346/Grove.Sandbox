import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const list = document.getElementById("new-members-list");
  const status = document.getElementById("new-members-status");
  const refreshButton = document.getElementById("refresh-new-members");

  if (!list || !status || !refreshButton) return;

  const MAX_VISIBLE = 12;

  let currentUser = null;
  let loading = false;
  let ignoredMembers = new Set();

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function memberName(member) {
    return member.display_name?.trim() ||
      (member.username ? "@" + member.username : "Grove member");
  }

  function profileUrl(member) {
    return new URL(
      "/profile.html?id=" + encodeURIComponent(member.id),
      window.location.origin
    ).href;
  }

  function ignoredStorageKey() {
    return "grove:new-members:ignored:" + (currentUser?.id || "guest");
  }

  function readIgnoredMembers() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(ignoredStorageKey()) || "[]"
      );

      ignoredMembers = new Set(
        Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []
      );
    } catch {
      ignoredMembers = new Set();
    }
  }

  function saveIgnoredMembers() {
    try {
      localStorage.setItem(
        ignoredStorageKey(),
        JSON.stringify([...ignoredMembers])
      );
    } catch (error) {
      console.warn("Could not save ignored Grove members.", error);
    }
  }

  function makeAvatar(member) {
    const avatar = makeElement(
      "span",
      "new-member-avatar",
      memberName(member).charAt(0).toUpperCase()
    );

    const url = member.avatar_url;

    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      image.addEventListener("error", () => {
        image.remove();
      }, { once: true });

      avatar.append(image);
    }

    return avatar;
  }

  async function copyProfileLink(member, button) {
    const url = profileUrl(member);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt("Copy this Grove profile link:", url);
      }

      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = "Copy link";
      }, 1400);

    } catch (error) {
      console.error("Could not copy profile link:", error);
      setStatus("Could not copy that profile link.", true);
    }
  }

  async function ignoreMember(memberId, button) {
    button.disabled = true;
    button.textContent = "Ignoring...";

    ignoredMembers.add(memberId);
    saveIgnoredMembers();

    await loadNewMembers();
    setStatus("Member ignored. Your list has been refreshed.");
  }

  async function followMember(member, button) {
    if (!currentUser) {
      window.location.href = "/login.html";
      return;
    }

    button.disabled = true;
    button.textContent = "Following...";

    try {
      const { error } = await supabase
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: member.id,
          status: "accepted"
        });

      if (error) throw error;

      await loadNewMembers();
      setStatus("You're now following " + memberName(member) + ". List refreshed.");

    } catch (error) {
      console.error("New member follow failed:", error);

      setStatus(
        error.message || "Could not follow this member.",
        true
      );

      button.disabled = false;
      button.textContent = "Follow";
    }
  }

  function renderMember(member) {
    const card = makeElement("article", "new-member-card");

    const identity = makeElement("div", "new-member-identity");
    const information = makeElement("div", "new-member-information");

    const name = makeElement(
      "strong",
      "new-member-name",
      memberName(member)
    );

    const username = makeElement(
      "span",
      "new-member-username",
      member.username ? "@" + member.username : "New Grove member"
    );

    const joined = new Date(member.created_at);

    const joinedText = Number.isNaN(joined.getTime())
      ? "Recently joined"
      : "Joined " + joined.toLocaleDateString();

    information.append(
      name,
      username,
      makeElement("small", "new-member-date", joinedText)
    );

    identity.append(makeAvatar(member), information);

    const actions = makeElement("div", "new-member-actions");

    const profile = makeElement(
      "a",
      "new-member-action secondary",
      "View profile"
    );
    profile.href = profileUrl(member);

    const copy = makeElement(
      "button",
      "new-member-action secondary",
      "Copy link"
    );
    copy.type = "button";
    copy.addEventListener("click", () => copyProfileLink(member, copy));

    const follow = makeElement(
      "button",
      "new-member-action primary",
      currentUser ? "Follow" : "Sign in to follow"
    );
    follow.type = "button";
    follow.addEventListener("click", () => followMember(member, follow));

    const ignore = makeElement(
      "button",
      "new-member-action quiet",
      "Ignore"
    );
    ignore.type = "button";
    ignore.addEventListener("click", () => ignoreMember(member.id, ignore));

    actions.append(profile, copy, follow, ignore);
    card.append(identity, actions);

    return card;
  }

  async function loadNewMembers() {
    if (loading) return;

    loading = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    setStatus("Finding the newest Grove members...");

    try {
      readIgnoredMembers();

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,is_private,created_at")
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;

      let members = (profiles || []).filter(member =>
        member.id !== currentUser?.id &&
        !ignoredMembers.has(member.id)
      );

      if (currentUser && members.length) {
        const ids = members.map(member => member.id);

        const { data: follows, error: followsError } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUser.id)
          .eq("status", "accepted")
          .in("following_id", ids);

        if (followsError) throw followsError;

        const followedIds = new Set(
          (follows || []).map(row => row.following_id)
        );

        members = members.filter(member => !followedIds.has(member.id));
      }

      const visible = members.slice(0, MAX_VISIBLE);
      const fragment = document.createDocumentFragment();

      for (const member of visible) {
        fragment.append(renderMember(member));
      }

      list.replaceChildren(fragment);

      if (!visible.length) {
        setStatus(
          "You're all caught up. Check back later for new Grove members."
        );
      } else {
        setStatus(
          visible.length +
          (visible.length === 1
            ? " new member to discover."
            : " new members to discover.")
        );
      }

    } catch (error) {
      console.error("New to Grove list failed:", error);
      setStatus(
        error.message || "Could not load new members. Try refreshing.",
        true
      );
    } finally {
      loading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "↻ Refresh";
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.warn("Could not resolve current Grove account:", error);
      }

      currentUser = data?.user || null;

      refreshButton.addEventListener("click", loadNewMembers);

      await loadNewMembers();

    } catch (error) {
      console.error("New to Grove initialization failed:", error);
      setStatus("Could not initialize the new-member list.", true);
    }
  }

  initialize();
})();
