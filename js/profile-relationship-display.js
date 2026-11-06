import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");

  if (!details) return;

  function formatRelationshipDate(value) {
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

  function renderDate(status, value) {
    const existing = details.querySelector(
      "[data-grove-relationship-date-display]"
    );

    if (existing) existing.remove();

    const formatted = formatRelationshipDate(value);

    if (!formatted) return;

    const label = status === "married"
      ? "Married on: "
      : "Since: ";

    const item = document.createElement("span");

    item.className = "profile-detail grove-relationship-date";
    item.dataset.groveRelationshipDateDisplay = "true";
    item.textContent = label + formatted;

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

    let viewedProfile = null;

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
      currentUser &&
      currentUser.id === viewedProfile.id
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
      renderDate(
        relationship.relationship_status,
        relationship.relationship_since
      );
    };

    // The profile renderer can rebuild #details after this module loads.
    // Reinsert the date after those updates without duplicating it.
    const observer = new MutationObserver(updateDisplay);

    observer.observe(details, {
      childList: true
    });

    updateDisplay();
  }

  initialize().catch(error => {
    console.error(
      "Grove relationship date display failed:",
      error
    );
  });
})();
