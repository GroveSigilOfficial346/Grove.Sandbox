import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");
  const profileMain = document.querySelector(".profile-main");

  if (!details || !profileMain) return;

  let relationshipSince = null;
  let observer = null;

  function formatDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return "";
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return "";
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function render() {
    const existing = details.querySelector(
      "[data-grove-relationship-date]"
    );

    const dateText = formatDate(relationshipSince);

    if (!dateText) {
      existing?.remove();
      return;
    }

    const label = `Since: ${dateText}`;

    if (existing) {
      if (existing.textContent !== label) {
        existing.textContent = label;
      }
      return;
    }

    const item = document.createElement("span");
    item.className = "profile-detail grove-relationship-date";
    item.dataset.groveRelationshipDate = "true";
    item.textContent = label;

    details.append(item);
  }

  async function resolveProfileId(user) {
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    if (requestedId) return requestedId;

    if (requestedUsername) {
      const { data, error } = await supabase
        .from("profile_directory")
        .select("id")
        .eq("username", requestedUsername.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      return data?.id || null;
    }

    return user?.id || null;
  }

  async function initialize() {
    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const profileId = await resolveProfileId(auth.user);

      if (!profileId) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("relationship_since")
        .eq("id", profileId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      relationshipSince = data.relationship_since || null;
      render();

      observer = new MutationObserver(() => {
        render();
      });

      observer.observe(details, {
        childList: true,
        subtree: true
      });

    } catch (error) {
      console.warn(
        "Grove relationship date could not be loaded:",
        error
      );
    }
  }

  initialize();
})();
