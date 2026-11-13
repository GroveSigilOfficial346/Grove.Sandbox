import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");
  if (!details) return;

  const LABELS = {
    not_set: "",
    single: "Single",
    in_relationship: "In a relationship",
    married: "Married",
    engaged: "Engaged",
    open_relationship: "In an open relationship",
    complicated: "It's complicated",
    separated: "Separated",
    divorced: "Divorced",
    widowed: "Widowed",
    prefer_not_to_say: "Prefer not to say"
  };

  // Only neutral profile tags are displayed.
  const ROLE_LABELS = {
    owner: "Owner"
  };

  const HIDE_DATE = new Set([
    "not_set",
    "single",
    "prefer_not_to_say"
  ]);

  function formatDate(value) {
    if (!value || typeof value !== "string") return "";

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "";

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
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

  function createDetail(text) {
    const item = document.createElement("span");
    item.className = "profile-detail profile-relationship-detail";
    item.textContent = text;
    return item;
  }

  function getProfileId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  async function loadRelationshipDisplay() {
    const requestedProfileId = getProfileId();

    let profileId = requestedProfileId;

    if (!profileId) {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      profileId = auth?.user?.id;
    }

    if (!profileId) return;

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "relationship_status,relationship_since,relationship_dynamic_tag"
      )
      .eq("id", profileId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return;

    // Remove only this script's previous output.
    details
      .querySelectorAll(".profile-relationship-detail")
      .forEach(item => item.remove());

    const status = String(
      data.relationship_status || "not_set"
    ).toLowerCase();

    const date = formatDate(data.relationship_since);

    if (!HIDE_DATE.has(status) && date) {
      details.append(
        createDetail("Together since: " + date)
      );
    }

    const role = String(
      data.relationship_dynamic_tag || ""
    ).toLowerCase();

    if (ROLE_LABELS[role]) {
      details.append(
        createDetail("Profile tag: " + ROLE_LABELS[role])
      );
    }
  }

  loadRelationshipDisplay().catch(error => {
    console.error(
      "Grove relationship display failed:",
      error
    );
  });
})();
