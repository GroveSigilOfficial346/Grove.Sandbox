import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const sidebar = document.querySelector(".conversation-sidebar");
  const sidebarHeading = document.querySelector(".sidebar-heading");

  if (!sidebar || !sidebarHeading) {
    console.error("Grove groups: conversation sidebar was not found.");
    return;
  }

  let currentUser = null;
  let selectedMembers = new Map();
  let searchTimer = null;
  let isCreating = false;

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);

  function setStatus(message, isError = false) {
    const status = document.getElementById("messages-status");
    if (!status) return;

    status.textContent = message;
    status.style.color = isError ? "#ff8585" : "";
  }

  async function loadCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user;

    if (!currentUser) {
      throw new Error("Please sign in before creating a group.");
    }
  }

  function createButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "grove-create-group-button";
    button.innerHTML = `
      <span class="grove-create-group-icon" aria-hidden="true">＋</span>
      <span>Create group</span>
    `;

    button.addEventListener("click", openGroupDialog);

    sidebarHeading.append(button);
  }

  function buildDialog() {
    const overlay = document.createElement("div");

    overlay.className = "grove-group-overlay";
    overlay.id = "grove-group-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <section
        class="grove-group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grove-group-title"
      >
        <header class="grove-group-header">
          <div>
            <span class="grove-group-eyebrow">GROVE NETWORK</span>
            <h2 id="grove-group-title">Create a group</h2>
            <p>Bring your people into one conversation.</p>
          </div>

          <button
            type="button"
            class="grove-group-close"
            aria-label="Close group creator"
          >×</button>
        </header>

        <label class="grove-group-label" for="grove-group-name">
          Group name
        </label>

        <input
          id="grove-group-name"
          class="grove-group-input"
          type="text"
          maxlength="80"
          placeholder="Give your group a name"
          autocomplete="off"
        >

        <label class="grove-group-label" for="grove-group-search">
          Add members
        </label>

        <input
          id="grove-group-search"
          class="grove-group-input"
          type="search"
          placeholder="Search by name or username"
          autocomplete="off"
        >

        <div class="grove-group-selection-heading">
          <span>Selected members</span>
          <span id="grove-group-count">0 / 49</span>
        </div>

        <div
          id="grove-group-selected"
          class="grove-group-selected"
        >
          <span class="grove-group-empty-selection">
            No members selected yet.
          </span>
        </div>

        <div
          id="grove-group-results"
          class="grove-group-results"
          aria-live="polite"
        >
          <p class="grove-group-hint">
            Search for members to add.
          </p>
        </div>

        <p
          id="grove-group-error"
          class="grove-group-error"
          role="alert"
        ></p>

        <footer class="grove-group-footer">
          <button
            type="button"
            class="grove-group-cancel"
          >Cancel</button>

          <button
            type="button"
            class="grove-group-submit"
          >
            Create group
          </button>
        </footer>
      </section>
    `;

    document.body.append(overlay);

    overlay.querySelector(".grove-group-close")
      .addEventListener("click", closeGroupDialog);

    overlay.querySelector(".grove-group-cancel")
      .addEventListener("click", closeGroupDialog);

    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeGroupDialog();
    });

    overlay.querySelector(".grove-group-submit")
      .addEventListener("click", createGroup);

    overlay.querySelector("#grove-group-search")
      .addEventListener("input", event => {
        clearTimeout(searchTimer);

        const term = event.target.value.trim();

        searchTimer = setTimeout(() => {
          searchMembers(term);
        }, 250);
      });

    return overlay;
  }

  function getDialog() {
    return document.getElementById("grove-group-overlay");
  }

  function showError(message) {
    const node = document.getElementById("grove-group-error");
    if (node) node.textContent = message;
  }

  function openGroupDialog() {
    const overlay = getDialog();

    if (!overlay) return;

    selectedMembers.clear();

    overlay.hidden = false;
    document.body.classList.add("grove-group-open");

    document.getElementById("grove-group-name").value = "";
    document.getElementById("grove-group-search").value = "";
    document.getElementById("grove-group-results").innerHTML = `
      <p class="grove-group-hint">
        Search for members to add.
      </p>
    `;

    showError("");
    renderSelectedMembers();

    document.getElementById("grove-group-name").focus();
  }

  function closeGroupDialog() {
    const overlay = getDialog();

    if (!overlay || isCreating) return;

    overlay.hidden = true;
    document.body.classList.remove("grove-group-open");
  }

  function renderSelectedMembers() {
    const container = document.getElementById("grove-group-selected");
    const count = document.getElementById("grove-group-count");

    if (!container || !count) return;

    count.textContent = `${selectedMembers.size} / 49`;

    if (selectedMembers.size === 0) {
      container.innerHTML = `
        <span class="grove-group-empty-selection">
          No members selected yet.
        </span>
      `;
      return;
    }

    container.innerHTML = "";

    for (const member of selectedMembers.values()) {
      const chip = document.createElement("button");

      chip.type = "button";
      chip.className = "grove-group-chip";
      chip.innerHTML = `
        <span>${escapeHTML(member.display_name || member.username || "Member")}</span>
        <span aria-hidden="true">×</span>
      `;

      chip.addEventListener("click", () => {
        selectedMembers.delete(member.id);
        renderSelectedMembers();
        updateSearchSelectionStates();
      });

      container.append(chip);
    }
  }

  function updateSearchSelectionStates() {
    document.querySelectorAll(".grove-group-result").forEach(button => {
      const id = button.dataset.memberId;
      const selected = selectedMembers.has(id);

      button.classList.toggle("is-selected", selected);
      button.querySelector(".grove-group-result-action").textContent =
        selected ? "Added" : "Add";
    });
  }

  async function searchMembers(term) {
    const results = document.getElementById("grove-group-results");

    if (!results) return;

    if (term.length < 2) {
      results.innerHTML = `
        <p class="grove-group-hint">
          Type at least two characters to search.
        </p>
      `;
      return;
    }

    results.innerHTML = `
      <p class="grove-group-hint">Searching members...</p>
    `;

    try {
      // Search the public directory by username and display name.
      // The database RPC performs the final messaging-privacy checks.
      const safeTerm = term
        .replace(/[%_\\]/g, "")
        .slice(0, 40);

      const pattern = `%${safeTerm}%`;

      const [nameResult, usernameResult] = await Promise.all([
        supabase
          .from("profile_directory")
          .select("id, username, display_name, avatar_url")
          .ilike("display_name", pattern)
          .limit(20),

        supabase
          .from("profile_directory")
          .select("id, username, display_name, avatar_url")
          .ilike("username", pattern)
          .limit(20)
      ]);

      if (nameResult.error) throw nameResult.error;
      if (usernameResult.error) throw usernameResult.error;

      const combined = new Map();

      for (const member of [
        ...(nameResult.data || []),
        ...(usernameResult.data || [])
      ]) {
        if (!member.id || member.id === currentUser.id) continue;
        combined.set(member.id, member);
      }

      renderSearchResults([...combined.values()]);

    } catch (error) {
      console.error("Grove group member search failed:", error);

      results.innerHTML = `
        <p class="grove-group-hint grove-group-error">
          Could not search members. Please try again.
        </p>
      `;
    }
  }

  function renderSearchResults(members) {
    const results = document.getElementById("grove-group-results");

    if (!results) return;

    if (!members.length) {
      results.innerHTML = `
        <p class="grove-group-hint">
          No matching members found.
        </p>
      `;
      return;
    }

    results.innerHTML = "";

    for (const member of members) {
      const selected = selectedMembers.has(member.id);
      const button = document.createElement("button");

      button.type = "button";
      button.className = "grove-group-result";
      button.dataset.memberId = member.id;

      const avatar = member.avatar_url
        ? `<img src="${escapeHTML(member.avatar_url)}" alt="">`
        : `<span class="grove-group-avatar-fallback">G</span>`;

      button.innerHTML = `
        <span class="grove-group-result-avatar">${avatar}</span>

        <span class="grove-group-result-info">
          <strong>${escapeHTML(member.display_name || member.username || "Grove member")}</strong>
          <small>${member.username ? `@${escapeHTML(member.username)}` : "Grove member"}</small>
        </span>

        <span class="grove-group-result-action">
          ${selected ? "Added" : "Add"}
        </span>
      `;

      button.classList.toggle("is-selected", selected);

      button.addEventListener("click", () => {
        toggleMember(member);
      });

      results.append(button);
    }
  }

  function toggleMember(member) {
    if (selectedMembers.has(member.id)) {
      selectedMembers.delete(member.id);
    } else {
      if (selectedMembers.size >= 49) {
        showError("A group can contain up to 49 invited members.");
        return;
      }

      selectedMembers.set(member.id, member);
      showError("");
    }

    renderSelectedMembers();
    updateSearchSelectionStates();
  }

  async function createGroup() {
    if (isCreating) return;

    const nameInput = document.getElementById("grove-group-name");
    const submitButton = document.querySelector(".grove-group-submit");

    const title = nameInput.value.trim();
    const memberIds = [...selectedMembers.keys()];

    showError("");

    if (!title) {
      showError("Enter a name for your group.");
      nameInput.focus();
      return;
    }

    if (title.length > 80) {
      showError("Group names must be 80 characters or fewer.");
      return;
    }

    if (memberIds.length < 2) {
      showError("Select at least two other members to create a group.");
      return;
    }

    if (memberIds.length > 49) {
      showError("A group can contain up to 49 invited members.");
      return;
    }

    isCreating = true;
    submitButton.disabled = true;
    submitButton.textContent = "Creating...";

    try {
      const { data, error } = await supabase.rpc(
        "grove_create_group_conversation",
        {
          p_member_ids: memberIds,
          p_title: title
        }
      );

      if (error) throw error;

      if (!data) {
        throw new Error("The group was not created. Please try again.");
      }

      setStatus("Group created. Opening your conversation...");

      window.location.href =
        `/messages.html?conversation=${encodeURIComponent(data)}`;

    } catch (error) {
      console.error("Grove group creation failed:", error);

      showError(
        error.message ||
        "Could not create the group. Check member messaging permissions and try again."
      );

      isCreating = false;
      submitButton.disabled = false;
      submitButton.textContent = "Create group";
    }
  }

  async function initialize() {
    try {
      await loadCurrentUser();

      if (!currentUser) return;

      buildDialog();
      createButton();

    } catch (error) {
      console.error("Grove group creator could not initialize:", error);
    }
  }

  initialize();
})();
