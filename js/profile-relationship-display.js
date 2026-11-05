import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const OPTIONS = [
    ["not_set", "Not set"], ["single", "Single"],
    ["in_relationship", "In a relationship"], ["engaged", "Engaged"],
    ["married", "Married"], ["complicated", "It's complicated"],
    ["open_relationship", "In an open relationship"],
    ["prefer_not_to_say", "Prefer not to say"]
  ];
  const LABELS = Object.fromEntries(OPTIONS);
  let viewer, profileId, isOwner = false, profileData, tagRecord, panel, feedback;
  let searchTimer;

  function styles() {
    if ($("#grove-relationship-styles")) return;
    const style = document.createElement("style");
    style.id = "grove-relationship-styles";
    style.textContent = `
      .grove-relationship-panel{margin-top:16px;padding:16px;border:1px solid rgba(133,30,255,.35);border-radius:15px;background:linear-gradient(145deg,#190d37,#09051d);color:#f7f5ff}
      .grove-relationship-panel[hidden]{display:none!important}.grove-rel-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.grove-rel-head h2{margin:0;font-size:1rem}.grove-rel-summary,.grove-rel-list{display:grid;gap:8px;margin-top:12px}.grove-rel-summary{display:flex;flex-wrap:wrap;color:#d8d0ef;font-size:.86rem}.grove-rel-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:13px}.grove-rel-field{display:grid;gap:6px}.grove-rel-field label,.grove-rel-partner label{font-size:.8rem;font-weight:750;color:#d8d0ef}.grove-rel-field input,.grove-rel-field select,.grove-rel-search{width:100%;min-width:0;min-height:43px;padding:10px;border:1px solid rgba(190,155,255,.27);border-radius:10px;background:#09051a;color:#f7f5ff;font:inherit}.grove-rel-save{grid-column:1/-1;min-height:42px;border:0;border-radius:10px;background:linear-gradient(110deg,#851eff,#eb36ed);color:white;font-weight:800;cursor:pointer}.grove-rel-feedback{grid-column:1/-1;min-height:1em;margin:0;color:#05c9f4;font-size:.8rem}.grove-rel-partner{display:grid;gap:8px;margin-top:15px;padding-top:13px;border-top:1px solid rgba(190,155,255,.17)}.grove-rel-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px;border:1px solid rgba(190,155,255,.17);border-radius:10px;background:rgba(255,255,255,.035)}.grove-rel-person{display:grid;gap:2px;min-width:0}.grove-rel-person strong{font-size:.84rem;overflow-wrap:anywhere}.grove-rel-person small,.grove-rel-note{color:#aaa1c8;font-size:.75rem;overflow-wrap:anywhere}.grove-rel-action{padding:7px 10px;border:1px solid rgba(5,201,244,.35);border-radius:9px;background:rgba(5,201,244,.08);color:#8deaff;font-weight:750;cursor:pointer}.grove-rel-action.danger{border-color:rgba(255,133,133,.35);color:#ffaaaa;background:rgba(255,133,133,.08)}.grove-rel-note{margin:3px 0}.grove-rel-action:disabled,.grove-rel-save:disabled{opacity:.55;cursor:wait}
      @media(max-width:520px){.grove-rel-fields{grid-template-columns:1fr}.grove-rel-save,.grove-rel-feedback{grid-column:1}.grove-rel-row{align-items:flex-start}}
    `;
    document.head.append(style);
  }

  const el = (tag, cls, text) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (text !== undefined) item.textContent = text;
    return item;
  };

  function dateLabel(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  async function resolveProfile() {
    const params = new URLSearchParams(location.search);
    if (params.get("id")) return params.get("id");
    if (params.get("username")) {
      const { data, error } = await supabase.from("profile_directory").select("id")
        .eq("username", params.get("username").toLowerCase()).maybeSingle();
      if (error) throw error;
      return data?.id || null;
    }
    return viewer?.id || null;
  }

  function buildPanel() {
    const details = $("#details");
    if (!details || panel) return;
    panel = el("section", "grove-relationship-panel");
    panel.innerHTML = `
      <header class="grove-rel-head"><h2>Relationship details</h2><span class="grove-rel-note"></span></header>
      <div class="grove-rel-summary" aria-live="polite"></div>
      <div class="grove-rel-fields" hidden>
        <div class="grove-rel-field"><label for="grove-rel-status">Relationship status</label><select id="grove-rel-status"></select></div>
        <div class="grove-rel-field"><label for="grove-rel-date">Relationship date</label><input id="grove-rel-date" type="date"></div>
        <button class="grove-rel-save" type="button">Save relationship details</button>
        <p class="grove-rel-feedback" role="status" aria-live="polite"></p>
      </div>
      <div class="grove-rel-partner" hidden>
        <label for="grove-rel-search">Partner tag (optional)</label>
        <input id="grove-rel-search" class="grove-rel-search" type="search" maxlength="40" autocomplete="off" placeholder="Search by member name or username">
        <div class="grove-rel-results grove-rel-list"></div>
        <div class="grove-rel-current grove-rel-list"></div>
        <p class="grove-rel-note">The selected member must accept before the tag appears publicly. You can add the tag now or later.</p>
        <div class="grove-rel-incoming grove-rel-list"></div>
      </div>`;
    details.insertAdjacentElement("afterend", panel);
    const select = panel.querySelector("#grove-rel-status");
    for (const [value, label] of OPTIONS) {
      const option = el("option", "", label);
      option.value = value;
      select.append(option);
    }
    feedback = panel.querySelector(".grove-rel-feedback");
    panel.querySelector(".grove-rel-save").addEventListener("click", saveDetails);
    panel.querySelector("#grove-rel-search").addEventListener("input", searchInput);
  }

  function message(text, error = false) {
    if (!feedback) return;
    feedback.textContent = text || "";
    feedback.style.color = error ? "#ff8585" : "#05c9f4";
  }

  async function member(id) {
    if (!id) return null;
    const { data, error } = await supabase.from("profile_directory")
      .select("id,username,display_name").eq("id", id).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function personRow(profile, detail, actionText, action, danger = false) {
    const row = el("div", "grove-rel-row");
    const identity = el("div", "grove-rel-person");
    identity.append(el("strong", "", profile?.display_name || profile?.username || "Grove member"));
    if (profile?.username) identity.append(el("small", "", "@" + profile.username));
    if (detail) identity.append(el("small", "", detail));
    row.append(identity);
    if (actionText) {
      const button = el("button", danger ? "grove-rel-action danger" : "grove-rel-action", actionText);
      button.type = "button";
      button.addEventListener("click", action);
      row.append(button);
    }
    return row;
  }

  function renderSummary(partner) {
    const summary = panel.querySelector(".grove-rel-summary");
    summary.replaceChildren();
    const since = dateLabel(profileData?.relationship_since);
    if (since && !isOwner) summary.append(el("span", "", "Since: " + since));
    if (partner && tagRecord?.status === "accepted") {
      summary.append(el("span", "", "With: " + (partner.display_name || "@" + partner.username)));
    }
  }

  async function loadTag() {
    const { data, error } = await supabase.from("profile_relationship_tags")
      .select("profile_id,partner_id,status").eq("profile_id", profileId).maybeSingle();
    if (error) throw error;
    tagRecord = data || null;
    const partner = tagRecord ? await member(tagRecord.partner_id) : null;
    renderSummary(partner);
    const current = panel.querySelector(".grove-rel-current");
    current.replaceChildren();
    if (tagRecord) {
      const label = tagRecord.status === "accepted" ? "Confirmed partner" : tagRecord.status === "pending" ? "Waiting for confirmation" : "Request declined";
      current.append(personRow(partner, label, "Remove", removeOwnTag, true));
    }
  }

  async function saveDetails() {
    if (!isOwner) return;
    const button = panel.querySelector(".grove-rel-save");
    const status = panel.querySelector("#grove-rel-status").value;
    const since = panel.querySelector("#grove-rel-date").value || null;
    if (!OPTIONS.some(([value]) => value === status)) return message("Choose a valid relationship status.", true);
    if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return message("Choose a valid date.", true);
    button.disabled = true;
    message("Saving relationship details...");
    try {
      const { data, error } = await supabase.from("profiles")
        .update({ relationship_status: status, relationship_since: since, updated_at: new Date().toISOString() })
        .eq("id", viewer.id).select("relationship_status,relationship_since").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Your profile was not updated. Check your profile permissions.");
      profileData = data;
      await loadTag();
      message("Relationship details saved.");
    } catch (error) {
      console.error("Relationship details save failed:", error);
      message(error.message || "Could not save relationship details.", true);
    } finally {
      button.disabled = false;
    }
  }

  function searchInput(event) {
    clearTimeout(searchTimer);
    const term = event.target.value.trim();
    const results = panel.querySelector(".grove-rel-results");
    results.replaceChildren();
    if (term.length >= 2) searchTimer = setTimeout(() => searchMembers(term), 250);
  }

  async function searchMembers(term) {
    const safe = term.replace(/[^a-zA-Z0-9 _.-]/g, " ").trim();
    const results = panel.querySelector(".grove-rel-results");
    if (safe.length < 2) return;
    results.replaceChildren(el("p", "grove-rel-note", "Searching members..."));
    try {
      const { data, error } = await supabase.from("profile_directory")
        .select("id,username,display_name").or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .neq("id", viewer.id).limit(8);
      if (error) throw error;
      results.replaceChildren();
      if (!data?.length) return results.append(el("p", "grove-rel-note", "No matching members found."));
      data.forEach(profile => results.append(personRow(profile, "", "Request tag", () => requestTag(profile))));
    } catch (error) {
      results.replaceChildren(el("p", "grove-rel-note", error.message || "Member search failed."));
    }
  }

  async function requestTag(profile) {
    if (!isOwner || !profile?.id || tagRecord) return message("Remove the current partner tag before choosing another member.", true);
    message("Sending confirmation request...");
    try {
      const { error } = await supabase.from("profile_relationship_tags").insert({ profile_id: viewer.id, partner_id: profile.id, status: "pending" });
      if (error) throw error;
      await loadTag();
      panel.querySelector(".grove-rel-results").replaceChildren();
      panel.querySelector("#grove-rel-search").value = "";
      message("Request sent. The member must accept before the tag appears publicly.");
    } catch (error) {
      message(error.message || "Could not send the request.", true);
    }
  }

  async function removeOwnTag() {
    if (!tagRecord || !isOwner) return;
    if (!confirm("Remove this partner tag?")) return;
    try {
      const { error } = await supabase.from("profile_relationship_tags").delete().eq("profile_id", profileId);
      if (error) throw error;
      tagRecord = null;
      await loadTag();
      message("Partner tag removed.");
    } catch (error) {
      message(error.message || "Could not remove partner tag.", true);
    }
  }

  async function loadIncoming() {
    if (!isOwner) return;
    const list = panel.querySelector(".grove-rel-incoming");
    list.replaceChildren();
    const { data, error } = await supabase.from("profile_relationship_tags")
      .select("profile_id,status").eq("partner_id", viewer.id).in("status", ["pending", "accepted"]);
    if (error) throw error;
    if (!data?.length) return;
    list.append(el("p", "grove-rel-note", "Members who tagged you"));
    const { data: profiles, error: profileError } = await supabase.from("profile_directory")
      .select("id,username,display_name").in("id", data.map(row => row.profile_id));
    if (profileError) throw profileError;
    const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
    for (const request of data) {
      const profile = byId.get(request.profile_id);
      const accepted = request.status === "accepted";
      const row = personRow(profile, accepted ? "You accepted this partner tag" : "Wants to tag you as their partner", accepted ? "Remove" : "Accept", () => accepted ? removeIncomingTag(request.profile_id) : respond(request.profile_id, "accepted"), true);
      if (!accepted) {
        const decline = el("button", "grove-rel-action danger", "Decline");
        decline.type = "button";
        decline.addEventListener("click", () => respond(request.profile_id, "declined"));
        row.append(decline);
      }
      list.append(row);
    }
  }

  async function respond(requesterId, decision) {
    try {
      const { data, error } = await supabase.from("profile_relationship_tags")
        .update({ status: decision, responded_at: new Date().toISOString() })
        .eq("profile_id", requesterId).eq("partner_id", viewer.id).eq("status", "pending")
        .select("profile_id,status").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This request is no longer pending.");
      await loadIncoming();
      message(decision === "accepted" ? "Partner tag accepted." : "Partner tag declined.");
    } catch (error) {
      message(error.message || "Could not respond to the request.", true);
    }
  }

  async function removeIncomingTag(requesterId) {
    if (!confirm("Remove this member's partner tag from your profile?")) return;
    try {
      const { error } = await supabase.from("profile_relationship_tags").delete().eq("profile_id", requesterId);
      if (error) throw error;
      await loadIncoming();
      message("Partner tag removed.");
    } catch (error) {
      message(error.message || "Could not remove partner tag.", true);
    }
  }

  async function initialize() {
    try {
      styles();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      viewer = auth.user || null;
      profileId = await resolveProfile();
      if (!profileId) return;
      isOwner = Boolean(viewer && viewer.id === profileId);
      const { data, error } = await supabase.from("profiles")
        .select("relationship_status,relationship_since").eq("id", profileId).maybeSingle();
      if (error) throw error;
      if (!data) return;
      profileData = data;
      buildPanel();
      if (!panel) return;

      if (isOwner) {
        panel.querySelector(".grove-rel-fields").hidden = false;
        panel.querySelector(".grove-rel-partner").hidden = false;
        panel.querySelector("#grove-rel-status").value = LABELS[profileData.relationship_status] ? profileData.relationship_status : "not_set";
        panel.querySelector("#grove-rel-date").value = profileData.relationship_since || "";
        panel.querySelector(".grove-rel-head .grove-rel-note").textContent = "Owner controls";
      }
      await loadTag();
      if (isOwner) await loadIncoming();
      if (!isOwner && !profileData.relationship_since && !tagRecord?.status) panel.hidden = true;
    } catch (error) {
      console.warn("Grove relationship panel could not load:", error);
      if (panel) panel.querySelector(".grove-rel-summary").textContent = "Relationship details are temporarily unavailable.";
    }
  }

  initialize();
})();
