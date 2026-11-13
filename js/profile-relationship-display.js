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

    if (!relationships.length) return [];

    const counterpartIds = [
      ...new Set(
        relationships
          .map(item => item.counterpartId)
          .filter(Boolean)
      )
    ];

    if (!counterpartIds.length) return [];

    // The profiles table's RLS policy controls which names
    // this visitor is allowed to retrieve.
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

        if (!name) return null;

        return item.textPrefix + name;
      })
      .filter(Boolean);
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

    details
      .querySelectorAll(".profile-relationship-detail")
      .forEach(item => item.remove());

    const status = String(
      data.relationship_status || "not_set"
    ).toLowerCase();

    // Display the selected relationship status.
    if (LABELS[status]) {
      details.append(
        createDetail(LABELS[status])
      );
    }

    // Display the date only for statuses where a date is relevant.
    const date = formatDate(data.relationship_since);

    if (!HIDE_DATE.has(status) && date) {
      details.append(
        createDetail(
          `${status === "married" ? "Married since" : "Together since"}: ${date}`
        )
      );
    }

    // Preserve the optional Owner profile label.
    const role = String(
      data.relationship_dynamic_tag || ""
    ).toLowerCase();

    if (ROLE_LABELS[role]) {
      details.append(
        createDetail(`Profile tag: ${ROLE_LABELS[role]}`)
      );
    }

    // Show accepted Partner/Owner requests on both relevant profiles.
    try {
      const acceptedTags = await loadAcceptedTags(profileId);

      for (const label of acceptedTags) {
        details.append(createDetail(label));
      }
    } catch (tagError) {
      console.error(
        "Grove accepted relationship tags could not load:",
        tagError
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
