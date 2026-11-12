import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const usernameInput = document.getElementById("partner-tag-username");
  const sendButton = document.getElementById("partner-tag-send");
  const status = document.getElementById("partner-tag-status");
  const currentContainer = document.getElementById("partner-tag-current");
  const incomingContainer = document.getElementById("partner-tag-incoming");

  if (!usernameInput || !sendButton || !status || !currentContainer || !incomingContainer) {
    return;
  }

  let currentUser = null;
  let sending = false;

  function showStatus(message, error = false) {
    status.textContent = message;
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

  async function getMemberByUsername(username) {
    const { data, error } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .eq("username", username)
      .maybeSingle();

    if (error) throw error;
    return data;
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
      currentContainer.append(makeText("You do not have an active partner tag."));
      return;
    }

    const { data: partner, error: partnerError } = await supabase
      .from("profile_directory")
      .select("username,display_name")
      .eq("id", data.partner_id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    const name = partner?.display_name || partner?.username || "Grove member";
    const username = partner?.username ? ` (@${partner.username})` : "";

    if (data.status === "accepted") {
      currentContainer.append(
        makeText(`Accepted partner: ${name}${username}`, "partner-tag-current-label")
      );

      currentContainer.append(
        makeButton("Remove partner tag", removeCurrentTag)
      );
      return;
    }

    if (data.status === "pending") {
      currentContainer.append(
        makeText(`Request pending: ${name}${username}`)
      );

      currentContainer.append(
        makeButton("Cancel request", removeCurrentTag)
      );
      return;
    }

    currentContainer.append(
      makeText("Your previous partner request was declined. You can send a new request.")
    );
  }

  async function removeCurrentTag() {
    if (!currentUser) return;

    const confirmed = window.confirm(
      "Remove this partner tag or cancel the pending request?"
    );

    if (!confirmed) return;

    try {
      showStatus("Removing partner tag...");

      const { error } = await supabase
        .from("profile_relationship_tags")
        .delete()
        .eq("profile_id", currentUser.id);

      if (error) throw error;

      showStatus("Partner tag removed.");
      await loadCurrentRequest();
    } catch (error) {
      console.error("Partner tag removal failed:", error);
      showStatus(error.message || "Could not remove the partner tag.", true);
    }
  }

  async function sendRequest() {
    if (!currentUser || sending) return;

    const username = usernameInput.value
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      showStatus("Enter a valid Grove username.", true);
      return;
    }

    sending = true;
    sendButton.disabled = true;

    try {
      showStatus("Finding Grove member...");

      const partner = await getMemberByUsername(username);

      if (!partner) {
        throw new Error("No Grove member was found with that username.");
      }

      if (partner.id === currentUser.id) {
        throw new Error("You cannot send a partner request to yourself.");
      }

      const { data: existing, error: existingError } = await supabase
        .from("profile_relationship_tags")
        .select("profile_id,partner_id,status")
        .eq("profile_id", currentUser.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.status === "accepted") {
        throw new Error("You already have an accepted partner tag. Remove it first.");
      }

      if (existing?.status === "pending") {
        throw new Error("You already have a pending partner request. Cancel it first.");
      }

      showStatus("Sending partner request...");

      const { error } = await supabase
        .from("profile_relationship_tags")
        .upsert({
          profile_id: currentUser.id,
          partner_id: partner.id,
          status: "pending",
          requested_at: new Date().toISOString(),
          responded_at: null
        }, {
          onConflict: "profile_id"
        });

      if (error) throw error;

      usernameInput.value = "";
      showStatus("Partner request sent. The other member must accept it.");
      await loadCurrentRequest();

    } catch (error) {
      console.error("Partner request failed:", error);
      showStatus(error.message || "Could not send partner request.", true);
    } finally {
      sending = false;
      sendButton.disabled = false;
    }
  }

  async function respondToRequest(profileId, accepted) {
    const nextStatus = accepted ? "accepted" : "declined";

    try {
      showStatus(accepted ? "Accepting request..." : "Declining request...");

      const { data, error } = await supabase
        .from("profile_relationship_tags")
        .update({
          status: nextStatus,
          responded_at: new Date().toISOString()
        })
        .eq("profile_id", profileId)
        .eq("partner_id", currentUser.id)
        .eq("status", "pending")
        .select("profile_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("This request is no longer pending or cannot be updated.");
      }

      showStatus(accepted ? "Partner request accepted." : "Partner request declined.");

      await Promise.all([
        loadIncomingRequests(),
        loadCurrentRequest()
      ]);

    } catch (error) {
      console.error("Partner request response failed:", error);
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

    incomingContainer.replaceChildren();

    if (!data?.length) {
      incomingContainer.append(makeText("You have no pending partner requests."));
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
      const card = document.createElement("div");
      card.className = "partner-tag-request";

      const name = member?.display_name || member?.username || "Grove member";
      const username = member?.username ? `@${member.username}` : "";

      card.append(makeText(name, "partner-tag-request-name"));

      if (username) {
        card.append(makeText(username));
      }

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

  sendButton.addEventListener("click", sendRequest);

  initialize().catch(error => {
    console.error("Partner tag settings failed to initialize:", error);
    showStatus(error.message || "Could not load partner tag settings.", true);
    incomingContainer.replaceChildren(
      makeText("Partner requests could not be loaded.")
    );
  });
})();
