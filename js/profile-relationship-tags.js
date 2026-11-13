import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const input = $("partner-tag-username");
  const sendButton = $("partner-tag-send");
  const status = $("partner-tag-status");
  const currentContainer = $("partner-tag-current");
  const incomingContainer = $("partner-tag-incoming");

  if (!input || !sendButton || !status || !currentContainer || !incomingContainer) {
    return;
  }

  let currentUser = null;
  let selectedMember = null;
  let searchTimer = null;
  let searchToken = 0;
  let sending = false;
  let loading = false;

  const REQUEST_TIMEOUT = 12000;

  function withTimeout(promise, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error(`${label} timed out. Refresh the page and try again.`)),
          REQUEST_TIMEOUT
        );
      })
    ]);
  }

  function showStatus(message, error = false) {
    status.textContent = message || "";
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function text(message, className = "field-hint") {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = message;
    return element;
  }

  function button(label, action, className = "button secondary") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    element.addEventListener("click", action);
    return element;
  }

  function memberLabel(member) {
    const name = member?.display_name?.trim() || member?.username || "Grove member";
    return member?.username ? `${name} (@${member.username})` : name;
  }

  function clearSelection() {
    selectedMember = null;
    const notice = $("partner-tag-selected");
    if (notice) notice.textContent = "";
  }

  const picker = document.createElement("div");
  picker.id = "partner-tag-suggestions";
  picker.className = "partner-tag-suggestions";
  picker.hidden = true;
  picker.setAttribute("role", "listbox");
  input.insertAdjacentElement("afterend", picker);

  const selectedNotice = document.createElement("p");
  selectedNotice.id = "partner-tag-selected";
  selectedNotice.className = "partner-tag-selected";
  selectedNotice.setAttribute("aria-live", "polite");
  picker.insertAdjacentElement("afterend", selectedNotice);

  function selectMember(member) {
    if (!member?.id || member.id === currentUser?.id) return;

    selectedMember = member;
    input.value = member.username || member.display_name || "";
    picker.hidden = true;
    picker.replaceChildren();

    selectedNotice.textContent = `Selected Partner: ${memberLabel(member)}`;
    showStatus("Member selected. Send the Partner request.");
  }

  async function searchMembers(term) {
    const token = ++searchToken;
    const query = term.trim().replace(/^@/, "").replace(/[%_]/g, "");

    if (query.length < 2) {
      picker.hidden = true;
      picker.replaceChildren();
      return;
    }

    picker.hidden = false;
    picker.replaceChildren(text("Searching Grove members..."));

    const pattern = `%${query}%`;

    const [usernameResult, displayResult] = await withTimeout(
      Promise.all([
        supabase.from("profile_directory")
          .select("id,username,display_name")
          .ilike("username", pattern)
          .limit(10),

        supabase.from("profile_directory")
          .select("id,username,display_name")
          .ilike("display_name", pattern)
          .limit(10)
      ]),
      "Member search"
    );

    if (token !== searchToken) return;
    if (usernameResult.error) throw usernameResult.error;
    if (displayResult.error) throw displayResult.error;

    const unique = new Map();

    for (const member of [
      ...(usernameResult.data || []),
      ...(displayResult.data || [])
    ]) {
      if (member.id && member.id !== currentUser.id) {
        unique.set(member.id, member);
      }
    }

    picker.replaceChildren();

    const results = [...unique.values()].slice(0, 10);

    if (!results.length) {
      picker.append(text("No matching Grove members found."));
      picker.hidden = false;
      return;
    }

    for (const member of results) {
      const option = button(
        memberLabel(member),
        () => selectMember(member),
        "partner-tag-suggestion"
      );

      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");

      option.addEventListener("pointerdown", event => {
        event.preventDefault();
      });

      picker.append(option);
    }

    picker.hidden = false;
  }

  async function loadCurrentRequest() {
    const result = await withTimeout(
      supabase.from("profile_relationship_tags")
        .select("profile_id,partner_id,status,requested_at")
        .eq("profile_id", currentUser.id)
        .maybeSingle(),
      "Your Partner tag"
    );

    if (result.error) throw result.error;

    currentContainer.replaceChildren();

    if (!result.data) {
      currentContainer.append(text("You do not have an active Partner tag."));
      return;
    }

    const request = result.data;

    const partnerResult = await withTimeout(
      supabase.from("profile_directory")
        .select("id,username,display_name")
        .eq("id", request.partner_id)
        .maybeSingle(),
      "Partner profile"
    );

    if (partnerResult.error) throw partnerResult.error;

    const label = partnerResult.data
      ? memberLabel(partnerResult.data)
      : "Grove member";

    if (request.status === "accepted") {
      currentContainer.append(
        text(`Accepted Partner: ${label}`, "partner-tag-current-label"),
        button("Remove Partner tag", removeCurrentTag)
      );
    } else if (request.status === "pending") {
      currentContainer.append(
        text(`Partner request pending: ${label}`),
        button("Cancel request", removeCurrentTag)
      );
    } else {
      currentContainer.append(
        text("Your previous Partner request was declined. You can send another request.")
      );
    }
  }

  async function loadIncomingRequests() {
    const result = await withTimeout(
      supabase.from("profile_relationship_tags")
        .select("profile_id,requested_at")
        .eq("partner_id", currentUser.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
      "Incoming Partner requests"
    );

    if (result.error) throw result.error;

    const section = document.createElement("section");
    section.className = "partner-tag-incoming-requests";
    section.append(text("Pending Partner requests", "partner-tag-section-heading"));

    if (!result.data?.length) {
      section.append(text("You have no pending Partner requests."));
      incomingContainer.append(section);
      return;
    }

    const ids = result.data.map(item => item.profile_id);

    const membersResult = await withTimeout(
      supabase.from("profile_directory")
        .select("id,username,display_name")
        .in("id", ids),
      "Partner request profiles"
    );

    if (membersResult.error) throw membersResult.error;

    const members = new Map(
      (membersResult.data || []).map(member => [member.id, member])
    );

    for (const request of result.data) {
      const member = members.get(request.profile_id) || {};
      const card = document.createElement("article");
      card.className = "partner-tag-request";

      card.append(text(
        `Partner request from ${memberLabel(member)}`,
        "partner-tag-request-name"
      ));

      if (request.requested_at) {
        const date = new Date(request.requested_at);
        if (!Number.isNaN(date.getTime())) {
          card.append(text(`Requested ${date.toLocaleDateString()}`));
        }
      }

      const actions = document.createElement("div");
      actions.className = "profile-actions";

      actions.append(
        button("Accept", () => respondToRequest(request.profile_id, true), "button primary"),
        button("Decline", () => respondToRequest(request.profile_id, false))
      );

      card.append(actions);
      section.append(card);
    }

    incomingContainer.append(section);
  }

  async function loadAcceptedIncomingTags() {
    const result = await withTimeout(
      supabase.from("profile_relationship_tags")
        .select("profile_id,responded_at")
        .eq("partner_id", currentUser.id)
        .eq("status", "accepted")
        .order("responded_at", { ascending: false }),
      "Accepted Partner tags"
    );

    if (result.error) throw result.error;

    const section = document.createElement("section");
    section.className = "partner-tag-accepted-incoming";
    section.append(text(
      "Accepted Partner tags involving your account",
      "partner-tag-section-heading"
    ));

    if (!result.data?.length) {
      section.append(text("No other members currently have an accepted Partner tag involving your account."));
      incomingContainer.append(section);
      return;
    }

    const ids = result.data.map(item => item.profile_id);

    const membersResult = await withTimeout(
      supabase.from("profile_directory")
        .select("id,username,display_name")
        .in("id", ids),
      "Accepted Partner profiles"
    );

    if (membersResult.error) throw membersResult.error;

    const members = new Map(
      (membersResult.data || []).map(member => [member.id, member])
    );

    for (const tag of result.data) {
      const member = members.get(tag.profile_id) || {};
      const card = document.createElement("article");
      card.className = "partner-tag-request partner-tag-accepted-card";

      card.append(
        text(`${memberLabel(member)} has tagged you as their Partner.`, "partner-tag-request-name"),
        text("This accepted tag is visible on the relevant public profile."),
        button("Remove Partner tag", () => removeIncomingTag(tag.profile_id))
      );

      section.append(card);
    }

    incomingContainer.append(section);
  }

  async function refreshRelationshipTags() {
    if (!currentUser || loading) return;

    loading = true;
    incomingContainer.replaceChildren(text("Loading Partner requests..."));
    currentContainer.replaceChildren(text("Loading your Partner tag..."));

    try {
      await loadCurrentRequest();

      incomingContainer.replaceChildren();
      await loadIncomingRequests();
      await loadAcceptedIncomingTags();

      showStatus("");
    } catch (error) {
      console.error("Partner tag refresh failed:", error);

      currentContainer.replaceChildren(
        text("Your Partner tag could not be loaded.")
      );

      incomingContainer.replaceChildren(
        text(error.message || "Partner requests could not be loaded.", "partner-tag-error")
      );

      showStatus(error.message || "Could not load Partner requests.", true);
    } finally {
      loading = false;
    }
  }

  async function removeCurrentTag() {
    if (!window.confirm("Remove this Partner tag or cancel the pending request?")) return;

    try {
      showStatus("Removing Partner tag...");

      const result = await withTimeout(
        supabase.from("profile_relationship_tags")
          .delete()
          .eq("profile_id", currentUser.id),
        "Remove Partner tag"
      );

      if (result.error) throw result.error;

      showStatus("Partner tag removed.");
      await refreshRelationshipTags();
    } catch (error) {
      console.error(error);
      showStatus(error.message || "Could not remove the Partner tag.", true);
    }
  }

  async function removeIncomingTag(profileId) {
    if (!window.confirm("Remove this accepted Partner tag from your profile?")) return;

    try {
      showStatus("Removing accepted Partner tag...");

      const result = await withTimeout(
        supabase.from("profile_relationship_tags")
          .delete()
          .eq("profile_id", profileId)
          .eq("partner_id", currentUser.id)
          .eq("status", "accepted")
          .select("profile_id")
          .maybeSingle(),
        "Remove accepted Partner tag"
      );

      if (result.error) throw result.error;
      if (!result.data) throw new Error("This Partner tag is no longer available.");

      showStatus("Partner tag removed.");
      await refreshRelationshipTags();
    } catch (error) {
      console.error(error);
      showStatus(error.message || "Could not remove this Partner tag.", true);
    }
  }

  async function sendRequest() {
    if (!currentUser || sending) return;

    if (!selectedMember?.id) {
      showStatus("Search for a Grove member and select their result first.", true);
      input.focus();
      return;
    }

    sending = true;
    sendButton.disabled = true;

    try {
      const existingResult = await withTimeout(
        supabase.from("profile_relationship_tags")
          .select("profile_id,partner_id,status")
          .eq("profile_id", currentUser.id)
          .maybeSingle(),
        "Existing Partner tag"
      );

      if (existingResult.error) throw existingResult.error;

      const existing = existingResult.data;

      if (existing?.status === "accepted") {
        throw new Error("You already have an accepted Partner tag. Remove it first.");
      }

      if (existing?.status === "pending") {
        throw new Error("You already have a pending Partner request. Cancel it first.");
      }

      if (existing?.status === "declined") {
        const deleteResult = await withTimeout(
          supabase.from("profile_relationship_tags")
            .delete()
            .eq("profile_id", currentUser.id)
            .eq("status", "declined"),
          "Previous Partner request"
        );

        if (deleteResult.error) throw deleteResult.error;
      }

      const target = selectedMember;

      const insertResult = await withTimeout(
        supabase.from("profile_relationship_tags").insert({
          profile_id: currentUser.id,
          partner_id: target.id,
          tag_type: "partner",
          status: "pending",
          requested_at: new Date().toISOString(),
          responded_at: null
        }),
        "Send Partner request"
      );

      if (insertResult.error) throw insertResult.error;

      input.value = "";
      clearSelection();
      picker.hidden = true;
      picker.replaceChildren();

      showStatus("Partner request sent. The other member must accept it.");
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
      showStatus(accepted ? "Accepting Partner request..." : "Declining Partner request...");

      const result = await withTimeout(
        supabase.from("profile_relationship_tags")
          .update({
            status: accepted ? "accepted" : "declined",
            responded_at: new Date().toISOString()
          })
          .eq("profile_id", profileId)
          .eq("partner_id", currentUser.id)
          .eq("status", "pending")
          .select("profile_id")
          .maybeSingle(),
        "Partner request response"
      );

      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error("This request is no longer pending or you cannot respond to it.");
      }

      showStatus(accepted ? "Partner request accepted." : "Partner request declined.");
      await refreshRelationshipTags();
    } catch (error) {
      console.error("Partner request response failed:", error);
      showStatus(error.message || "Could not update this request.", true);
    }
  }

  input.addEventListener("input", () => {
    clearSelection();
    searchToken++;
    window.clearTimeout(searchTimer);

    const term = input.value.trim();

    searchTimer = window.setTimeout(() => {
      searchMembers(term).catch(error => {
        console.error("Partner member search failed:", error);
        showStatus(error.message || "Member search failed.", true);
        picker.replaceChildren(text(error.message || "Member search failed.", "partner-tag-error"));
        picker.hidden = false;
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

  async function initialize() {
    input.disabled = true;
    sendButton.disabled = true;

    currentContainer.replaceChildren(text("Connecting to Grove..."));
    incomingContainer.replaceChildren(text("Connecting to Grove..."));

    const result = await withTimeout(
      supabase.auth.getUser(),
      "Grove sign-in"
    );

    if (result.error) throw result.error;

    if (!result.data?.user) {
      window.location.replace("/login.html");
      return;
    }

    currentUser = result.data.user;

    await refreshRelationshipTags();

    input.disabled = false;
    sendButton.disabled = false;
  }

  initialize().catch(error => {
    console.error("Partner tag settings initialization failed:", error);

    const message = error.message || "Partner tag settings could not initialize.";

    currentContainer.replaceChildren(text(message, "partner-tag-error"));
    incomingContainer.replaceChildren(text(message, "partner-tag-error"));
    showStatus(message, true);

    input.disabled = true;
    sendButton.disabled = true;
  });
})();
