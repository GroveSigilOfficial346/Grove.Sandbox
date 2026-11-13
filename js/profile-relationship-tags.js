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

  const picker = document.createElement("div");
  picker.id = "partner-tag-suggestions";
  picker.className = "partner-tag-suggestions";
  picker.hidden = true;
  picker.setAttribute("role", "listbox");
  input.insertAdjacentElement("afterend", picker);

  const typeLabel = document.createElement("label");
  typeLabel.htmlFor = "partner-tag-type";
  typeLabel.textContent = "Tag relationship";

  const typeSelect = document.createElement("select");
  typeSelect.id = "partner-tag-type";

  [
    ["partner", "Partner"],
    ["owner", "Owner"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    typeSelect.append(option);
  });

  picker.insertAdjacentElement("afterend", typeLabel);
  typeLabel.insertAdjacentElement("afterend", typeSelect);

  const selectedNotice = document.createElement("p");
  selectedNotice.className = "partner-tag-selected";
  selectedNotice.setAttribute("aria-live", "polite");
  typeSelect.insertAdjacentElement("afterend", selectedNotice);

  const heading = document.getElementById("partner-tag-heading");
  if (heading) heading.textContent = "Partner / Owner tag";

  const sendDescription = input
    .closest("section")
    ?.querySelector(".field-hint");

  if (sendDescription) {
    sendDescription.textContent =
      "Search for a Grove member and request a Partner or Owner tag. " +
      "They must accept before the tag appears publicly.";
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

  function typeName(value) {
    return value === "owner" ? "Owner" : "Partner";
  }

  function memberLabel(member) {
    const name =
      member.display_name?.trim() ||
      member.username ||
      "Grove member";

    return member.username
      ? `${name} (@${member.username})`
      : name;
  }

  function clearSelection() {
    selectedMember = null;
    selectedNotice.textContent = "";
  }

  function selectMember(member) {
    selectedMember = member;
    input.value = member.username || member.display_name || "";
    picker.hidden = true;
    picker.replaceChildren();

    selectedNotice.textContent =
      `Selected ${typeName(typeSelect.value)}: ${memberLabel(member)}`;

    showStatus("Member selected. Send the request when ready.");
  }

  async function searchMembers(term) {
    const token = ++searchToken;
    const query = term.trim().replace(/^@/, "");

    if (query.length < 2) {
      picker.hidden = true;
      picker.replaceChildren();
      return;
    }

    const safeQuery = query.replace(/[%_]/g, "");

    if (!safeQuery) return;

    picker.hidden = false;
    picker.replaceChildren(
      makeText("Searching Grove members...")
    );

    const pattern = `%${safeQuery}%`;

    const [usernames, displayNames] = await Promise.all([
      supabase
        .from("profile_directory")
        .select("id,username,display_name")
        .ilike("username", pattern)
        .limit(8),

      supabase
        .from("profile_directory")
        .select("id,username,display_name")
        .ilike("display_name", pattern)
        .limit(8)
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
      picker.append(
        makeText("No matching Grove members found.")
      );
      picker.hidden = false;
      return;
    }

    for (const member of results) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "partner-tag-suggestion";
      option.setAttribute("role", "option");
      option.textContent = memberLabel(member);

      option.addEventListener("pointerdown", event => {
        event.preventDefault();
      });

      option.addEventListener("click", () => {
        selectMember(member);
      });

      picker.append(option);
    }

    picker.hidden = false;
  }

  function makeRequestCard(member, requestedAt, tagType) {
    const card = document.createElement("div");
    card.className = "partner-tag-request";

    card.append(
      makeText(
        `${typeName(tagType)} request from ${memberLabel(member)}`,
        "partner-tag-request-name"
      )
    );

    if (requestedAt) {
      const date = new Date(requestedAt);

      if (!Number.isNaN(date.getTime())) {
        card.append(
          makeText(`Requested ${date.toLocaleDateString()}`)
        );
      }
    }

    return card;
  }

  async function loadCurrentRequest() {
    const { data, error } = await supabase
      .from("profile_relationship_tags")
      .select("profile_id,partner_id,status,requested_at,tag_type")
      .eq("profile_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    currentContainer.replaceChildren();

    if (!data) {
      currentContainer.append(
        makeText("You do not have an active Partner or Owner tag.")
      );
      return;
    }

    const { data: partner, error: partnerError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .eq("id", data.partner_id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    const label = partner
      ? memberLabel(partner)
      : "Grove member";

    const tagName = typeName(data.tag_type);

    if (data.status === "accepted") {
      currentContainer.append(
        makeText(
          `Accepted ${tagName}: ${label}`,
          "partner-tag-current-label"
        ),
        makeButton(
          `Remove ${tagName.toLowerCase()} tag`,
          removeCurrentTag
        )
      );
    } else if (data.status === "pending") {
      currentContainer.append(
        makeText(
          `${tagName} request pending: ${label}`
        ),
        makeButton(
          "Cancel request",
          removeCurrentTag
        )
      );
    } else {
      currentContainer.append(
        makeText(
          `Your previous ${tagName.toLowerCase()} request was declined. You can send another request.`
        )
      );
    }
  }

  async function removeCurrentTag() {
    if (!currentUser) return;

    if (!window.confirm(
      "Remove this relationship tag or cancel the pending request?"
    )) {
      return;
    }

    try {
      showStatus("Removing tag...");

      const { error } = await supabase
        .from("profile_relationship_tags")
        .delete()
        .eq("profile_id", currentUser.id);

      if (error) throw error;

      clearSelection();
      showStatus("Relationship tag removed.");
      await loadCurrentRequest();

    } catch (error) {
      console.error(error);
      showStatus(
        error.message || "Could not remove the tag.",
        true
      );
    }
  }

  async function sendRequest() {
    if (!currentUser || sending) return;

    if (!selectedMember?.id) {
      showStatus(
        "Search for and select a Grove member first.",
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

    const tagType = typeSelect.value;

    try {
      showStatus("Checking existing relationship tag...");

      const { data: existing, error: existingError } = await supabase
        .from("profile_relationship_tags")
        .select("profile_id,partner_id,status,tag_type")
        .eq("profile_id", currentUser.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.status === "accepted") {
        throw new Error(
          `You already have an accepted ${typeName(existing.tag_type).toLowerCase()} tag. Remove it first.`
        );
      }

      if (existing?.status === "pending") {
        throw new Error(
          `You already have a pending ${typeName(existing.tag_type).toLowerCase()} request. Cancel it first.`
        );
      }

      const { error } = await supabase
        .from("profile_relationship_tags")
        .upsert({
          profile_id: currentUser.id,
          partner_id: selectedMember.id,
          tag_type: tagType,
          status: "pending",
          requested_at: new Date().toISOString(),
          responded_at: null
        }, {
          onConflict: "profile_id"
        });

      if (error) throw error;

      input.value = "";
      clearSelection();
      picker.hidden = true;

      showStatus(
        `${typeName(tagType)} request sent. The other member must accept it.`
      );

      await loadCurrentRequest();

    } catch (error) {
      console.error("Relationship tag request failed:", error);

      showStatus(
        error.message || "Could not send the request.",
        true
      );

    } finally {
      sending = false;
      sendButton.disabled = false;
    }
  }

  async function respondToRequest(profileId, accepted) {
    try {
      showStatus(
        accepted ? "Accepting request..." : "Declining request..."
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
        .select("profile_id,tag_type")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "This request is no longer pending or cannot be updated."
        );
      }

      showStatus(
        accepted
          ? `${typeName(data.tag_type)} request accepted.`
          : `${typeName(data.tag_type)} request declined.`
      );

      await Promise.all([
        loadIncomingRequests(),
        loadCurrentRequest()
      ]);

    } catch (error) {
      console.error(error);

      showStatus(
        error.message || "Could not update this request.",
        true
      );
    }
  }

  async function loadIncomingRequests() {
    const { data, error } = await supabase
      .from("profile_relationship_tags")
      .select("profile_id,requested_at,tag_type")
      .eq("partner_id", currentUser.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (error) throw error;

    incomingContainer.replaceChildren();

    if (!data?.length) {
      incomingContainer.append(
        makeText("You have no pending Partner or Owner requests.")
      );
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
        request.requested_at,
        request.tag_type
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
      incomingContainer.append(card);
    }
  }

  async function initialize() {
    sendButton.disabled = true;

    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      window.location.replace("/login.html");
      return;
    }

    currentUser = data.user;

    await Promise.all([
      loadCurrentRequest(),
      loadIncomingRequests()
    ]);

    sendButton.disabled = false;
  }

  input.addEventListener("input", () => {
    clearSelection();
    window.clearTimeout(searchTimer);

    const term = input.value.trim();

    searchTimer = window.setTimeout(() => {
      searchMembers(term).catch(error => {
        console.error("Member search failed:", error);

        showStatus(
          error.message || "Member search failed.",
          true
        );
      });
    }, 220);
  });

  typeSelect.addEventListener("change", () => {
    if (selectedMember) {
      selectedNotice.textContent =
        `Selected ${typeName(typeSelect.value)}: ${memberLabel(selectedMember)}`;
    }
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      picker.hidden = true;
    }
  });

  document.addEventListener("click", event => {
    if (
      event.target !== input &&
      !picker.contains(event.target)
    ) {
      picker.hidden = true;
    }
  });

  sendButton.addEventListener("click", sendRequest);

  initialize().catch(error => {
    console.error("Relationship tag settings failed:", error);

    showStatus(
      error.message || "Could not load relationship tag settings.",
      true
    );

    incomingContainer.replaceChildren(
      makeText("Relationship requests could not be loaded.")
    );
  });
})();
