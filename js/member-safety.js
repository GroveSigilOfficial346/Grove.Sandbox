import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  let currentUser = null;
  let targetUserId = null;
  let isBlocked = false;
  let actionInProgress = false;

  function setStatus(message, error = false) {
    const status = $("#action-status");

    if (!status) return;

    status.textContent = message;
    status.style.color = error ? "#ff8585" : "";
  }

  function getTargetFromUrl() {
    const params = new URLSearchParams(window.location.search);

    return {
      id: params.get("id"),
      username: params.get("username")
    };
  }

  async function resolveTargetProfile() {
    const requested = getTargetFromUrl();

    if (requested.id) {
      const { data, error } = await supabase
        .from("profile_directory")
        .select("id")
        .eq("id", requested.id)
        .maybeSingle();

      if (error) throw error;

      return data?.id || null;
    }

    if (requested.username) {
      const { data, error } = await supabase
        .from("profile_directory")
        .select("id")
        .eq("username", requested.username.toLowerCase())
        .maybeSingle();

      if (error) throw error;

      return data?.id || null;
    }

    // No profile query means the signed-in member's own profile.
    return currentUser?.id || null;
  }

  function hideInteractionButtons() {
    const follow = $("#follow-button");
    const message = $("#message-button");

    if (follow) {
      follow.hidden = true;
      follow.disabled = true;
    }

    if (message) {
      message.hidden = true;
      message.disabled = true;
    }
  }

  function createBlockButton() {
    const actions = $(".profile-actions");

    if (!actions) return null;

    let button = $("#member-block-button");

    if (button) return button;

    button = document.createElement("button");
    button.type = "button";
    button.id = "member-block-button";
    button.className = "button secondary";

    actions.append(button);

    button.addEventListener("click", handleBlockAction);

    return button;
  }

  function updateBlockButton() {
    const button = createBlockButton();

    if (!button) return;

    button.textContent = isBlocked
      ? "Unblock member"
      : "Block member";

    button.setAttribute(
      "aria-label",
      isBlocked ? "Unblock this member" : "Block this member"
    );

    if (isBlocked) {
      hideInteractionButtons();
    }
  }

  async function loadBlockState() {
    if (!currentUser || !targetUserId) return;

    if (currentUser.id === targetUserId) return;

    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocker_id,blocked_id")
      .eq("blocker_id", currentUser.id)
      .eq("blocked_id", targetUserId)
      .maybeSingle();

    if (error) throw error;

    isBlocked = Boolean(data);

    updateBlockButton();
  }

  async function blockMember() {
    const { error } = await supabase
      .from("user_blocks")
      .insert({
        blocker_id: currentUser.id,
        blocked_id: targetUserId
      });

    if (error) {
      if (error.code === "23505") {
        throw new Error("This member is already blocked.");
      }

      throw error;
    }
  }

  async function unblockMember() {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", currentUser.id)
      .eq("blocked_id", targetUserId);

    if (error) throw error;
  }

  async function handleBlockAction() {
    if (
      !currentUser ||
      !targetUserId ||
      currentUser.id === targetUserId ||
      actionInProgress
    ) {
      return;
    }

    const action = isBlocked ? "unblock" : "block";

    const confirmed = window.confirm(
      action === "block"
        ? "Block this member? They will no longer be able to message you through Grove's protected conversation system."
        : "Unblock this member?"
    );

    if (!confirmed) return;

    const button = $("#member-block-button");

    actionInProgress = true;

    if (button) {
      button.disabled = true;
      button.textContent = action === "block"
        ? "Blocking..."
        : "Unblocking...";
    }

    setStatus(
      action === "block"
        ? "Updating your block list..."
        : "Removing this member from your block list..."
    );

    try {
      if (action === "block") {
        await blockMember();
        isBlocked = true;
      } else {
        await unblockMember();
        isBlocked = false;
      }

      setStatus(
        isBlocked
          ? "Member blocked. Protected messaging restrictions now apply."
          : "Member unblocked."
      );

      updateBlockButton();

      // Reload profile controls so follow and message states are refreshed.
      window.setTimeout(() => {
        window.location.reload();
      }, 650);

    } catch (error) {
      console.error("Grove member safety action failed:", error);

      setStatus(
        error.message || "This action could not be completed.",
        true
      );

      updateBlockButton();

    } finally {
      actionInProgress = false;

      if (button) {
        button.disabled = false;
      }
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      currentUser = data.user || null;

      if (!currentUser) return;

      targetUserId = await resolveTargetProfile();

      if (!targetUserId || targetUserId === currentUser.id) {
        return;
      }

      await loadBlockState();

    } catch (error) {
      console.error("Grove member safety could not initialize:", error);
      setStatus(
        error.message || "Member safety controls could not load.",
        true
      );
    }
  }

  initialize();
})();
