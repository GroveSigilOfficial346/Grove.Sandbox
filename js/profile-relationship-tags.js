import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const input = document.getElementById("partner-tag-username");
  const sendButton = document.getElementById("partner-tag-send");
  const status = document.getElementById("partner-tag-status");
  const currentContainer = document.getElementById("partner-tag-current");
  const incomingContainer = document.getElementById("partner-tag-incoming");

  if (!input || !sendButton || !status || !currentContainer || !incomingContainer) return;

  let currentUser = null;
  let selectedMember = null;
  let searchTimer = null;
  let searchToken = 0;
  let sending = false;
  let refreshPromise = null;
  let refreshRequested = false;

  const picker = document.createElement("div");
  picker.id = "partner-tag-suggestions";
  picker.className = "partner-tag-suggestions";
  picker.hidden = true;
  picker.setAttribute("role", "listbox");
  input.insertAdjacentElement("afterend", picker);

  const selectedNotice = document.createElement("p");
  selectedNotice.className = "partner-tag-selected";
  selectedNotice.setAttribute("aria-live", "polite");
  picker.insertAdjacentElement("afterend", selectedNotice);

  const heading = document.getElementById("partner-tag-heading");
  if (heading) heading.textContent = "Partner tag";

  const sendDescription =
    input.closest("section")?.querySelector(".field-hint");

  if (sendDescription) {
    sendDescription.textContent =
      "Search for a Grove member and send a Partner request. They must accept before the tag appears publicly.";
  }

  sendButton.textContent = "Send tag request";

  function showStatus(message, error = false) {
    status.textContent = message || "";
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function makeButton(label, action, className = "button secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function makeText(text, className = "field-hint") {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function memberLabel(member) {
    const name =
      member.display_name?.trim() ||
      member.username ||
      "Grove member";

    return member.username ? `${name} (@${member.username})` : name;
  }

  function clearSelection() {
    selectedMember = null;
    selectedNotice.textContent = "";
  }

  function selectMember(member) {
    if (!member?.id || member.id === currentUser?.id) return;

    selectedMember = member;
    input.value = member.username || member.display_name || "";

    picker.hidden = true;
    picker.replaceChildren();

    selectedNotice.textContent =
      `Selected Partner: ${memberLabel(member)}`;

    showStatus("Member selected. Send the Partner request.");
  }

  async function searchMembers(term) {
    const token = ++searchToken;
    const query = term.trim().replace(/^@/, "");
    const safeQuery = query.replace(/[%_]/g, "");

    if (safeQuery.length < 2) {
      picker.hidden = true;
      picker.replaceChildren();
      return;
    }

    picker.hidden = false;
    picker.replaceChildren(makeText("Searching Grove members..."));

    const pattern = `%${safeQuery}%`;

    const [usernames, displayNames] = await Promise.all([
      supabase
        .from("profile_directory")
        .select("id,username,display_name")
        .ilike("username", pattern)
        .limit(10),

      supabase
        .from("profile_directory")
        .select("id,username,display_name")
        .ilike("display_name", pattern)
        .limit(10)
    ]);

    if (token !== searchToken) return;
    if (usernames.error) throw usernames.error;
    if (displayNames.error) throw displayNames.error;

    const unique = new Map();

    for (const member of [
      ...(usernames.data || []),
      ...(displayNames.data || [])
    ]) {
      if (member.id && member.id !== currentUser.id) {
        unique.set(member.id, member);
      }
    }

    picker.replaceChildren();

    const results = [...unique.values()].slice(0, 10);

    if (!results.length) {
      picker.append(makeText("No matching Grove members found."));
      picker.hidden = false;
      return;
    }

    for (const member of results) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "partner-tag-suggestion";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = memberLabel(member);

      option.addEventListener("pointerdown", event => {
        event.preventDefault();
      });

      option.addEventListener("click", () => selectMember(member));

      picker.append(option);
    }

    picker.hidden = false;
  }

  function makeRequestCard(member, requestedAt) {
    const card = document.createElement("div");
    card.className = "partner-tag-request";

    card.append(
      makeText(
        `Partner request from ${memberLabel(member)}`,
        "partner-tag-request-name"
      )
    );

    if (requestedAt) {
      const date = new Date(requestedAt);

      if (!Number.isNaN(date.getTime())) {
        card.append(makeText(`Requested ${date.toLocaleDateString()}`));
      }
    }

    return card;
  }

  async function loadCurrentRequest() {
    const { data, error } = await supabase
      .from("profile_relationship_tags")
      .select("profile_id,partner_id,status,requested_at")
      .eq("profile_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    currentContainer.replaceChildren();

    if (!data) {
      currentContainer.append(
        makeText("You do not have an active Partner tag.")
      );
      return;
    }

    const { data: partner, error: partnerError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .eq("id", data.partner_id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    const label = partner ? memberLabel(partner) : "Grove member";

    if (data.status === "accepted") {
      currentContainer.append(
        makeText(
          `Accepted Partner: ${label}`,
          "partner-tag-current-label"
        ),
        makeButton("Remove Partner tag", removeCurrentTag)
      );
    } else if (data.status === "pending") {
      currentContainer.append(
        makeText(`Partner request pending: ${label}`),
        makeButton("Cancel request", removeCurrentTag)
      );
    } else {
      currentContainer.append(
        makeText(
          "Your previous Partner request was declined. You can send another request."
        )
      );
    }
  }

  async function removeCurrentTag() {
    if (!currentUser) return;

    if (!window.confirm(
      "Remove this Partner tag or cancel the pending request?"
    )) return;

    try {
      showStatus("Removing Partner tag...");

      const { error } = await supabase
        .from("profile_relationship_tags")
        .delete()
        .eq("profile_id", currentUser.id);

      if (error) throw error;

      clearSelection();
      showStatus("Partner tag removed.");
      await refreshRelationshipTags();

    } catch (error) {
      console.error(error);
      showStatus(error.message || "Could not remove the Partner tag.", true);
    }
  }

  async function removeIncomingTag(profileId) {
    if (!currentUser || !profileId) return;

    if (!window.confirm(
      "Remove this accepted Partner tag from your profile?"
    )) return;

    try {
      showStatus("Removing accepted Partner tag...");

      const { data, error } = await supabase
        .from("profile_relationship_tags")
        .delete()
        .eq("profile_id", profileId)
        .eq("partner_id", currentUser.id)
        .eq("status", "accepted")
        .select("profile_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "This tag was already removed or is no longer available."
        );
      }

      showStatus("Partner tag removed successfully.");
      await refreshRelationshipTags();

    } catch (error) {
      console.error("Incoming Partner tag removal failed:", error);
      showStatus(
        error.message || "Could not remove this Partner tag.",
        true
      );
    }
  }

  async function sendRequest() {
    if (!currentUser || sending) return;

    if (!selectedMember?.id) {
      showStatus(
        "Search for a Grove member and click their result first.",
        true
      );
      input.focus();
      return;
    }

    if (selectedMember.id === currentUser.id) {
      showStatus("You cannot tag your own account.", true);
      return;
    }

    sending = true;
    sendButton.disabled = true;

    const targetMember = selectedMember;

    try {
      showStatus("Checking existing Partner tag...");

      const { data: existing, error: existingError } = await supabase
        .from("profile_relationship_tags")
        .select("profile_id,partner_id,status")
        .eq("profile_id", currentUser.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.status === "accepted") {
        throw new Error(
          "You already have an accepted Partner tag. Remove it first."
        );
      }

      if (existing?.status === "pending") {
        throw new Error(
          "You already have a pending Partner request. Cancel it first."
        );
      }

      if (existing?.status === "declined") {
        const { error: deleteError } = await supabase
          .from("profile_relationship_tags")
          .delete()
          .eq("profile_id", currentUser.id)
          .eq("status", "declined");

        if (deleteError) throw deleteError;
      }

      showStatus("Sending Partner request...");

      const { error: insertError } = await supabase
        .from("profile_relationship_tags")
        .insert({
          profile_id: currentUser.id,
          partner_id: targetMember.id,
          tag_type: "partner",
          status: "pending",
          requested_at: new Date().toISOString(),
          responded_at: null
        });

      if (insertError) throw insertError;

      input.value = "";
      clearSelection();
      picker.hidden = true;
      picker.replaceChildren();

      showStatus(
        "Partner request sent. The other member must accept it."
      );

      await refreshRelationshipTags();

    } catch (error) {
      console.error("Partner request failed:", error);
      showStatus(error.message || "Could not send the Partner request.", true);

    } finally {
      sending = false;
      sendButton.disabled = false;
    }
  }

  async function respondToRequest(profileId, accepted) {
    try {
      showStatus(
        accepted ? "Accepting Partner request..." : "Declining Partner request..."
      );

      const { data, error } = await supabase
        .from("profile_relationship_tags")
        .update({
          status: accepted ? "accepted" : "declined",
          responded_at: new Date().toISOString()
        })
        .eq("profile_id", profileId)
        .eq("partner_id", currentUser.id)
        .eq("status", "pending")
        .select("profile_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "This request is no longer pending or cannot be updated."
        );
      }

      showStatus(
        accepted
          ? "Partner request accepted."
          : "Partner request declined."
      );

      await refreshRelationshipTags();

    } catch (error) {
      console.error(error);
      showStatus(error.message || "Could not update this request.", true);
    }
  }

  async function loadIncomingRequests() {
    const { data, error } = await supabase
      .from("profile_relationship_tags")
      .select("profile_id,requested_at")
      .eq("partner_id", currentUser.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (error) throw error;

    const section = document.createElement("section");
    section.className = "partner-tag-incoming-requests";

    const heading = document.createElement("h3");
    heading.textContent = "Pending Partner requests";
    section.append(heading);

    if (!data?.length) {
      section.append(makeText("You have no pending Partner requests."));
      incomingContainer.append(section);
      return;
    }

    const ids = data.map(item => item.profile_id);

    const { data: members, error: membersError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .in("id", ids);

    if (membersError) throw membersError;

    const memberMap = new Map(
      (members || []).map(member => [member.id, member])
    );

    for (const request of data) {
      const member = memberMap.get(request.profile_id);

      const card = makeRequestCard(
        member || {},
        request.requested_at
      );

      const actions = document.createElement("div");
      actions.className = "profile-actions";

      actions.append(
        makeButton(
          "Accept",
          () => respondToRequest(request.profile_id, true),
          "button primary"
        ),
        makeButton(
          "Decline",
          () => respondToRequest(request.profile_id, false)
        )
      );

      card.append(actions);
      section.append(card);
    }

    incomingContainer.append(section);
  }

  async function loadAcceptedIncomingTags() {
    const { data, error } = await supabase
      .from("profile_relationship_tags")
      .select("profile_id,responded_at")
      .eq("partner_id", currentUser.id)
      .eq("status", "accepted")
      .order("responded_at", { ascending: false });

    if (error) throw error;

    const section = document.createElement("section");
    section.className = "partner-tag-accepted-incoming";

    const heading = document.createElement("h3");
    heading.textContent = "Accepted Partner tags involving your account";
    section.append(heading);

    if (!data?.length) {
      section.append(
        makeText(
          "No other members currently have an accepted Partner tag involving your account."
        )
      );
      incomingContainer.append(section);
      return;
    }

    const ids = data.map(item => item.profile_id);

    const { data: members, error: membersError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .in("id", ids);

    if (membersError) throw membersError;

    const memberMap = new Map(
      (members || []).map(member => [member.id, member])
    );

    for (const tag of data) {
      const member = memberMap.get(tag.profile_id);
      const name = member ? memberLabel(member) : "Grove member";

      const card = document.createElement("div");
      card.className = "partner-tag-request partner-tag-accepted-card";

      card.append(
        makeText(
          `${name} has tagged you as their Partner.`,
          "partner-tag-request-name"
        ),
        makeText(
          "This accepted tag is visible on the relevant public profile."
        ),
        makeButton(
          "Remove Partner tag",
          () => removeIncomingTag(tag.profile_id)
        )
      );

      section.append(card);
    }

    incomingContainer.append(section);
  }

  function refreshRelationshipTags() {
    if (!currentUser) return Promise.resolve();

    refreshRequested = true;

    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        while (refreshRequested) {
          refreshRequested = false;
          incomingContainer.replaceChildren();

          await loadCurrentRequest();
          await loadIncomingRequests();
          await loadAcceptedIncomingTags();
        }
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function initialize() {
    sendButton.disabled = true;
    input.disabled = true;

    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      window.location.replace("/login.html");
      return;
    }

    currentUser = data.user;

    await refreshRelationshipTags();

    input.disabled = false;
    sendButton.disabled = false;
  }

  input.addEventListener("input", () => {
    clearSelection();
    searchToken++;
    window.clearTimeout(searchTimer);

    const term = input.value.trim();

    searchTimer = window.setTimeout(() => {
      searchMembers(term).catch(error => {
        console.error("Member search failed:", error);
        showStatus(error.message || "Member search failed.", true);
        picker.hidden = true;
      });
    }, 220);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") picker.hidden = true;
  });

  document.addEventListener("click", event => {
    if (event.target !== input && !picker.contains(event.target)) {
      picker.hidden = true;
    }
  });

  sendButton.addEventListener("click", sendRequest);

  initialize().catch(error => {
    console.error("Partner tag settings failed:", error);

    showStatus(
      error.message || "Could not load Partner tag settings.",
      true
    );

    incomingContainer.replaceChildren(
      makeText("Partner requests could not be loaded.")
    );

    input.disabled = true;
    sendButton.disabled = true;
  });
})();
