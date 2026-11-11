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

  const SINGLE_STATUSES = new Set(["single", "not_set", "", null]);

  function formatDate(value) {
    if (!value || typeof value !== "string") return "";

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "";

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

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

  function clearRelationshipRows() {
    details.querySelectorAll(".profile-detail").forEach(item => {
      const text = (item.textContent || "").trim();

      if (
        item.dataset.groveRelationshipRow === "true" ||
        /^relationship\s*:/i.test(text) ||
        /^since\s*:/i.test(text)
      ) {
        item.remove();
      }
    });
  }

  function renderRelationship(statusValue, dateValue) {
    clearRelationshipRows();

    const status = String(statusValue || "not_set").toLowerCase();
    const label = STATUS_LABELS[status] || "";

    if (!label) return;

    const relationshipRow = document.createElement("span");
    relationshipRow.className = "profile-detail grove-relationship-row";
    relationshipRow.dataset.groveRelationshipRow = "true";
    relationshipRow.textContent = "Relationship: " + label;

    details.append(relationshipRow);

    // A Single or unset relationship never displays a start date.
    if (SINGLE_STATUSES.has(status)) return;

    const date = formatDate(dateValue);
    if (!date) return;

    const sinceRow = document.createElement("span");
    sinceRow.className = "profile-detail grove-relationship-row";
    sinceRow.dataset.groveRelationshipRow = "true";
    sinceRow.textContent = "Since: " + date;

    details.append(sinceRow);
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

    renderRelationship(
      relationship.relationship_status,
      relationship.relationship_since
    );

    // profile-view.js may rebuild #details after this module loads.
    // Re-render only when another script changes its children.
    let scheduled = false;

    const observer = new MutationObserver(() => {
      if (scheduled) return;

      scheduled = true;

      queueMicrotask(() => {
        scheduled = false;

        renderRelationship(
          relationship.relationship_status,
          relationship.relationship_since
        );
      });
    });

    observer.observe(details, {
      childList: true,
      subtree: false
    });
  }

  initialize().catch(error => {
    console.error("Grove relationship display failed:", error);
  });
})();
