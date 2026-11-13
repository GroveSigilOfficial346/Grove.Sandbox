import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const details = document.querySelector("#details");
  if (!details) return;

  if (details.dataset.groveRelationshipDisplay === "installed") {
    return;
  }

  details.dataset.groveRelationshipDisplay = "installed";

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

  let relationshipData = null;
  let acceptedTagLabels = [];
  let rendering = false;
  let renderTimer = null;

  const wrapper = document.createElement("div");

  wrapper.className = "profile-relationship-details";
  wrapper.style.display = "contents";
  wrapper.setAttribute("aria-label", "Relationship details");

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

    item.className =
      "profile-detail profile-relationship-detail";

    item.textContent = text;

    return item;
  }

  function getProfileId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  function memberName(profile) {
    return (
      profile?.display_name?.trim() ||
      (profile?.username ? `@${profile.username}` : "")
    );
  }

  function tagLabel(tagType) {
    return tagType === "owner" ? "Owner" : "Partner";
  }

  async function loadAcceptedTags(profileId) {
    const [outgoingResult, incomingResult] = await Promise.all([
      supabase
        .from("profile_relationship_tags")
        .select("profile_id,partner_id,tag_type")
        .eq("profile_id", profileId)
        .eq("status", "accepted"),

      supabase
        .from("profile_relationship_tags")
        .select("profile_id,partner_id,tag_type")
        .eq("partner_id", profileId)
        .eq("status", "accepted")
    ]);

    if (outgoingResult.error) throw outgoingResult.error;
    if (incomingResult.error) throw incomingResult.error;

    const relationships = [];

    for (const tag of outgoingResult.data || []) {
      relationships.push({
        counterpartId: tag.partner_id,
        textPrefix: `Accepted ${tagLabel(tag.tag_type)}: `
      });
    }

    for (const tag of incomingResult.data || []) {
      relationships.push({
        counterpartId: tag.profile_id,
        textPrefix: `Tagged as ${tagLabel(tag.tag_type)} by: `
      });
    }

    const counterpartIds = [
      ...new Set(
        relationships
          .map(item => item.counterpartId)
          .filter(Boolean)
      )
    ];

    if (!counterpartIds.length) return [];

    // Existing profiles RLS determines which names are visible.
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .in("id", counterpartIds);

    if (error) throw error;

    const profileMap = new Map(
      (profiles || []).map(profile => [
        profile.id,
        memberName(profile)
      ])
    );

    return relationships
      .map(item => {
        const name = profileMap.get(item.counterpartId);

        return name
          ? item.textPrefix + name
          : null;
      })
      .filter(Boolean);
  }

  function removeLegacyRelationshipDetail() {
    details
      .querySelectorAll(":scope > .profile-detail")
      .forEach(item => {
        if (
          item.textContent.trim().toLowerCase().startsWith("relationship:")
        ) {
          item.remove();
        }
      });
  }

  function render() {
    if (!relationshipData || rendering) return;

    rendering = true;

    try {
      removeLegacyRelationshipDetail();

      const fragment = document.createDocumentFragment();

      const status = String(
        relationshipData.relationship_status || "not_set"
      ).toLowerCase();

      if (LABELS[status]) {
        fragment.append(
          createDetail(LABELS[status])
        );
      }

      const date = formatDate(
        relationshipData.relationship_since
      );

      if (!HIDE_DATE.has(status) && date) {
        fragment.append(
          createDetail(
            status === "married"
              ? `Married since: ${date}`
              : `Together since: ${date}`
          )
        );
      }

      const role = String(
        relationshipData.relationship_dynamic_tag || ""
      ).toLowerCase();

      if (role === "owner") {
        fragment.append(
          createDetail("Profile tag: Owner")
        );
      }

      for (const label of acceptedTagLabels) {
        fragment.append(createDetail(label));
      }

      wrapper.replaceChildren(fragment);

      if (!wrapper.isConnected) {
        details.append(wrapper);
      }
    } finally {
      rendering = false;
    }
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);

    renderTimer = window.setTimeout(() => {
      if (!relationshipData) return;

      // profile-view.js may replace the entire details container.
      // Reattach our dedicated wrapper if that happens.
      if (!wrapper.isConnected) {
        render();
        return;
      }

      removeLegacyRelationshipDetail();
    }, 0);
  }

  const observer = new MutationObserver(records => {
    if (rendering) return;

    const externalChange = records.some(record => {
      const changedNodes = [
        ...record.addedNodes,
        ...record.removedNodes
      ];

      return changedNodes.some(node => {
        if (node === wrapper) return false;

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return true;
        }

        return !node.classList.contains(
          "profile-relationship-details"
        );
      });
    });

    if (externalChange || !wrapper.isConnected) {
      scheduleRender();
    }
  });

  observer.observe(details, {
    childList: true,
    subtree: false
  });

  async function loadRelationshipDisplay() {
    let profileId = getProfileId();

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

    relationshipData = data;

    try {
      acceptedTagLabels = await loadAcceptedTags(profileId);
    } catch (tagError) {
      console.error(
        "Grove accepted relationship tags could not load:",
        tagError
      );

      acceptedTagLabels = [];
    }

    render();
  }

  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    window.clearTimeout(renderTimer);
  });

  loadRelationshipDisplay().catch(error => {
    console.error(
      "Grove relationship display failed:",
      error
    );
  });
})();
