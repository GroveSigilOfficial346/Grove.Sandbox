import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const status = document.getElementById("blocked-members-status");
  const list = document.getElementById("blocked-members-list");

  let user = null;
  let loading = false;

  function setStatus(message, error = false) {
    if (!status) return;

    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function safeUrl(value) {
    if (typeof value !== "string") return "";

    try {
      const url = new URL(value);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function memberLabel(profile) {
    return profile?.display_name?.trim() ||
      (profile?.username ? "@" + profile.username : "Grove member");
  }

  function renderMember(block, profile) {
    const card = makeElement("article", "blocked-member-card");

    const identity = makeElement("div", "blocked-member-identity");

    const avatar = makeElement("div", "blocked-member-avatar");
    const avatarUrl = safeUrl(profile?.avatar_url);

    if (avatarUrl) {
      const image = document.createElement("img");
      image.src = avatarUrl;
      image.alt = "";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        avatar.textContent = memberLabel(profile).charAt(0).toUpperCase();
      }, { once: true });

      avatar.append(image);
    } else {
      avatar.textContent = memberLabel(profile).charAt(0).toUpperCase();
    }

    const information = makeElement("div", "blocked-member-information");

    const name = makeElement(
      "strong",
      "blocked-member-name",
      memberLabel(profile)
    );

    const username = makeElement(
      "span",
      "blocked-member-username",
      profile?.username ? "@" + profile.username : "Grove member"
    );

    information.append(name, username);

    const date = new Date(block.created_at);

    if (!Number.isNaN(date.getTime())) {
      information.append(
        makeElement(
          "small",
          "blocked-member-date",
          "Blocked " + date.toLocaleDateString()
        )
      );
    }

    identity.append(avatar, information);

    const actions = makeElement("div", "blocked-member-actions");

    const view = makeElement("a", "button secondary", "View profile");
    view.href = "/profile.html?id=" +
      encodeURIComponent(block.blocked_id);

    const unblock = makeElement(
      "button",
      "button primary",
      "Unblock"
    );

    unblock.type = "button";

    unblock.addEventListener("click", () => {
      unblockMember(block.blocked_id, unblock);
    });

    actions.append(view, unblock);
    card.append(identity, actions);

    return card;
  }

  async function loadBlockedMembers() {
    if (!user || loading) return;

    loading = true;
    setStatus("Loading your block list...");
    list.replaceChildren();

    try {
      const { data: blocks, error } = await supabase
        .from("user_blocks")
        .select("blocked_id,created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!blocks?.length) {
        setStatus("You have not blocked any members.");
        return;
      }

      const ids = blocks.map(item => item.blocked_id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profile_directory")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      if (profilesError) throw profilesError;

      const profilesById = new Map(
        (profiles || []).map(profile => [profile.id, profile])
      );

      const fragment = document.createDocumentFragment();

      for (const block of blocks) {
        fragment.append(
          renderMember(block, profilesById.get(block.blocked_id))
        );
      }

      list.replaceChildren(fragment);

      setStatus(
        blocks.length === 1
          ? "1 blocked member"
          : `${blocks.length} blocked members`
      );

    } catch (error) {
      console.error("Grove block list failed:", error);
      setStatus(
        error.message || "Could not load your blocked members.",
        true
      );
    } finally {
      loading = false;
    }
  }

  async function unblockMember(memberId, button) {
    if (!user || !memberId || button.disabled) return;

    if (!window.confirm("Unblock this member?")) return;

    button.disabled = true;
    button.textContent = "Unblocking...";

    try {
      const { data, error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", memberId)
        .select("blocked_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("The block could not be removed.");
      }

      setStatus("Member unblocked.");
      await loadBlockedMembers();

    } catch (error) {
      console.error("Grove unblock action failed:", error);

      setStatus(
        error.message || "Could not unblock this member.",
        true
      );

      button.disabled = false;
      button.textContent = "Unblock";
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      user = data.user || null;

      if (!user) {
        setStatus("Sign in to manage your blocked members.", true);
        return;
      }

      await loadBlockedMembers();

    } catch (error) {
      console.error("Grove block manager initialization failed:", error);
      setStatus(
        error.message || "Could not initialize blocked members.",
        true
      );
    }
  }

  initialize();
})();
