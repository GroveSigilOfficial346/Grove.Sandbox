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

  function renderRelationship(statusValue, dateValue) {
    const status = String(statusValue || "not_set").toLowerCase();
    const label = LABELS[status] || "";
    const desired = [];

    if (label) {
      desired.push("Relationship: " + label);

      if (!HIDE_DATE.has(status)) {
        const date = formatDate(dateValue);
        if (date) desired.push("Since: " + date);
      }
    }

    const rows = [...details.children].filter(node => {
      const value = (node.textContent || "").trim();

      return (
        node.dataset.groveRelationshipRow === "true" ||
        /^relationship\s*:/i.test(value) ||
        /^since\s*:/i.test(value)
      );
    });

    const current = rows.map(node =>
      (node.textContent || "").trim()
    );

    const alreadyCorrect =
      current.length === desired.length &&
      current.every((value, index) => value === desired[index]) &&
      rows.every(node =>
        node.dataset.groveRelationshipRow === "true"
      );

    if (alreadyCorrect) return;

    rows.forEach(node => node.remove());

    for (const value of desired) {
      const row = document.createElement("span");
      row.className = "profile-detail grove-relationship-row";
      row.dataset.groveRelationshipRow = "true";
      row.textContent = value;
      details.append(row);
    }
  }

  function getOrCreatePartnerContainer() {
    let container = document.getElementById("grove-accepted-partner");

    if (!container) {
      container = document.createElement("div");
      container.id = "grove-accepted-partner";
      container.className = "profile-details grove-accepted-partner";
      container.setAttribute("aria-live", "polite");
      details.insertAdjacentElement("afterend", container);
    }

    return container;
  }

  async function renderAcceptedPartner(profileId) {
    const container = getOrCreatePartnerContainer();
    container.replaceChildren();

    const { data: tag, error } = await supabase
      .from("profile_relationship_tags")
      .select("partner_id,status")
      .eq("profile_id", profileId)
      .eq("status", "accepted")
      .maybeSingle();

    if (error) throw error;
    if (!tag) return;

    const { data: partner, error: partnerError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .eq("id", tag.partner_id)
      .maybeSingle();

    if (partnerError) throw partnerError;
    if (!partner) return;

    const link = document.createElement("a");
    link.className = "profile-detail grove-partner-link";
    link.href = `/profile.html?id=${encodeURIComponent(partner.id)}`;

    const name = partner.display_name || partner.username || "Grove member";
    const username = partner.username ? ` (@${partner.username})` : "";

    link.textContent = `Partner: ${name}${username}`;
    container.append(link);
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

    const update = () => renderRelationship(
      relationship.relationship_status,
      relationship.relationship_since
    );

    update();

    new MutationObserver(update).observe(details, {
      childList: true,
      subtree: false
    });

    await renderAcceptedPartner(viewedProfile.id);
  }

  initialize().catch(error => {
    console.error("Grove relationship display failed:", error);
  });
})();
