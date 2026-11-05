import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");

  if (!details) return;

  let relationshipSince = null;
  let relationshipStatus = null;

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";

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
    details.querySelector(".grove-relationship-date")?.remove();

    if (!relationshipSince) return;

    const dateText = formatDate(relationshipSince);
    if (!dateText) return;

    const item = document.createElement("span");
    item.className = "profile-detail grove-relationship-date";
    item.textContent = `Since: ${dateText}`;

    details.append(item);
  }

  async function resolveProfileId(user) {
    const params = new URLSearchParams(location.search);

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
        .select("relationship_status,relationship_since")
        .eq("id", profileId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      relationshipStatus = data.relationship_status;
      relationshipSince = data.relationship_since;

      render();

      // The main profile renderer may rebuild the details section.
      // Restore the date after it does, without creating duplicates.
      const observer = new MutationObserver(() => {
        if (
          relationshipSince &&
          !details.querySelector(".grove-relationship-date")
        ) {
          render();
        }
      });

      observer.observe(details, {
        childList: true
      });

    } catch (error) {
      console.warn(
        "Grove relationship date could not be displayed:",
        error
      );
    }
  }

  initialize();
})();
