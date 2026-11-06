import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");
  if (!details) return;

  const STATUS_LABELS = {
    not_set: "",
    single: "Single",
    in_relationship: "In a relationship",
    married: "Married",
    engaged: "Engaged",
    open_relationship: "In an open relationship",
    complicated: "It's complicated",
    separated: "Separated",
    divorced: "Divorced",
    widowed: "Widowed"
  };

  function formatDate(value) {
    if (!value || typeof value !== "string") return "";

    const parts = value.split("-").map(Number);
    if (parts.length !== 3) return "";

    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return "";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function removeDuplicateStatusRows() {
    details.querySelectorAll(".profile-detail").forEach(item => {
      if (item.dataset.groveRelationshipCombined === "true") return;

      const text = (item.textContent || "").trim();

      if (/^relationship\s*:/i.test(text)) {
        item.remove();
      }
    });
  }

  function renderRelationship(status, dateValue) {
    removeDuplicateStatusRows();

    const existing = details.querySelector(
      "[data-grove-relationship-combined]"
    );

    const label = STATUS_LABELS[status] || "";
    const date = formatDate(dateValue);

    if (!label) {
      existing?.remove();
      return;
    }

    let text = label;

    if (date) {
      text += status === "married"
        ? " · " + date
        : " · Since " + date;
    }

    if (existing?.textContent === text) return;

    if (existing) {
      existing.textContent = text;
      return;
    }

    const item = document.createElement("span");
    item.className = "profile-detail grove-relationship-date";
    item.dataset.groveRelationshipCombined = "true";
    item.textContent = text;

    details.append(item);
  }

  async function initialize() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    const currentUser = auth.user || null;
    const params = new URLSearchParams(window.location.search);

    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    let viewedProfile;

    if (!requestedId && !requestedUsername) {
      if (!currentUser) return;

      viewedProfile = {
        id: currentUser.id,
        is_private: false
      };
    } else {
      let query = supabase
        .from("profile_directory")
        .select("id,is_private");

      query = requestedId
        ? query.eq("id", requestedId)
        : query.eq("username", requestedUsername.toLowerCase());

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (!data) return;

      viewedProfile = data;
    }

    const isOwner = Boolean(
      currentUser && currentUser.id === viewedProfile.id
    );

    if (viewedProfile.is_private && !isOwner) {
      if (!currentUser) return;

      const { data: follow, error } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", currentUser.id)
        .eq("following_id", viewedProfile.id)
        .maybeSingle();

      if (error) throw error;
      if (follow?.status !== "accepted") return;
    }

    const { data: relationship, error } = await supabase
      .from("profiles")
      .select("relationship_status,relationship_since")
      .eq("id", viewedProfile.id)
      .maybeSingle();

    if (error) throw error;
    if (!relationship) return;

    const updateDisplay = () => {
      renderRelationship(
        relationship.relationship_status,
        relationship.relationship_since
      );
    };

    const observer = new MutationObserver(updateDisplay);

    observer.observe(details, {
      childList: true,
      subtree: false
    });

    updateDisplay();
  }

  initialize().catch(error => {
    console.error(
      "Grove relationship display failed:",
      error
    );
  });
})();
