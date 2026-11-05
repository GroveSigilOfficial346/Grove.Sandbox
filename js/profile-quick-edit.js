import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const RELATIONSHIP_OPTIONS = [
    ["not_set", "Not set"],
    ["single", "Single"],
    ["in_relationship", "In a relationship"],
    ["engaged", "Engaged"],
    ["married", "Married"],
    ["complicated", "It's complicated"],
    ["open_relationship", "In an open relationship"],
    ["prefer_not_to_say", "Prefer not to say"]
  ];

  let user = null;
  let profileId = null;
  let isOwner = false;
  let profileData = null;
  let modal = null;
  let form = null;
  let bioInput = null;
  let statusInput = null;
  let dateInput = null;
  let feedback = null;
  let saveButton = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function buildModal() {
    if (modal) return;

    modal = element("div", "grove-quick-edit-backdrop");
    modal.hidden = true;

    modal.innerHTML = `
      <section
        class="grove-quick-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grove-quick-edit-title"
      >
        <header class="grove-quick-edit-header">
          <div>
            <p class="grove-quick-edit-eyebrow">PROFILE STUDIO</p>
            <h2 id="grove-quick-edit-title">Edit profile details</h2>
          </div>
          <button
            type="button"
            class="grove-quick-edit-close"
            aria-label="Close"
          >×</button>
        </header>

        <form class="grove-quick-edit-form">

          <label for="grove-quick-bio">Bio</label>
          <textarea
            id="grove-quick-bio"
            maxlength="1000"
            rows="4"
            placeholder="Tell members about yourself..."
          ></textarea>

          <label for="grove-quick-status">Relationship status</label>
          <select id="grove-quick-status"></select>

          <label for="grove-quick-date">Relationship date</label>
          <input id="grove-quick-date" type="date">

          <p class="grove-quick-edit-hint">
            This date is displayed on your own profile. It does not
            approve or change another member's relationship status.
          </p>

          <p
            class="grove-quick-edit-feedback"
            role="status"
            aria-live="polite"
          ></p>

          <footer>
            <button type="button" class="grove-quick-edit-cancel">
              Cancel
            </button>
            <button type="submit" class="grove-quick-edit-save">
              Save changes
            </button>
          </footer>

        </form>
      </section>
    `;

    document.body.append(modal);

    form = modal.querySelector("form");
    bioInput = modal.querySelector("#grove-quick-bio");
    statusInput = modal.querySelector("#grove-quick-status");
    dateInput = modal.querySelector("#grove-quick-date");
    feedback = modal.querySelector(".grove-quick-edit-feedback");
    saveButton = modal.querySelector(".grove-quick-edit-save");

    for (const [value, label] of RELATIONSHIP_OPTIONS) {
      const option = element("option", "", label);
      option.value = value;
      statusInput.append(option);
    }

    modal.querySelector(".grove-quick-edit-close")
      .addEventListener("click", closeModal);

    modal.querySelector(".grove-quick-edit-cancel")
      .addEventListener("click", closeModal);

    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal.hidden) closeModal();
    });

    form.addEventListener("submit", save);
  }

  function addEditControl(target, label, action) {
    if (!target || target.querySelector(`[data-grove-edit="${action}"]`)) {
      return;
    }

    const button = element(
      "button",
      "grove-quick-edit-trigger",
      label
    );

    button.type = "button";
    button.dataset.groveEdit = action;
    button.addEventListener("click", event => {
      event.stopPropagation();
      openModal();
    });

    target.append(button);
  }

  function attachProfileControls() {
    if (!isOwner) return;

    const bio = $("#bio");
    const details = $("#details");

    if (bio) {
      bio.classList.add("grove-quick-editable");
      addEditControl(bio, "Edit bio", "bio");
    }

    if (details) {
      details.classList.add("grove-quick-editable");
      addEditControl(details, "Edit details", "details");
    }
  }

  function renderRelationshipDate() {
    const details = $("#details");
    if (!details) return;

    details.querySelector(".grove-relationship-date")?.remove();

    if (!profileData?.relationship_since) return;

    const date = new Date(
      profileData.relationship_since + "T00:00:00"
    );

    if (Number.isNaN(date.getTime())) return;

    const label = element(
      "span",
      "profile-detail grove-relationship-date",
      "Since: " + date.toLocaleDateString()
    );

    details.append(label);
  }

  function openModal() {
    if (!isOwner || !profileData) return;

    buildModal();

    bioInput.value = profileData.bio || "";

    statusInput.value = RELATIONSHIP_OPTIONS.some(
      ([value]) => value === profileData.relationship_status
    )
      ? profileData.relationship_status
      : "not_set";

    dateInput.value = profileData.relationship_since || "";
    feedback.textContent = "";
    saveButton.disabled = false;

    modal.hidden = false;
    bioInput.focus();
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  async function loadProfileFields() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,bio,relationship_status,relationship_since")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Your profile could not be found.");

    profileData = data;

    const bio = $("#bio");
    if (bio) {
      bio.textContent = profileData.bio?.trim() || "No bio yet.";
    }

    renderRelationshipDate();
    attachProfileControls();
  }

  async function save(event) {
    event.preventDefault();

    if (!isOwner || !profileData || saveButton.disabled) return;

    const bio = bioInput.value.trim();
    const relationshipStatus = statusInput.value;
    const relationshipSince = dateInput.value || null;

    if (bio.length > 1000) {
      feedback.textContent = "Bio must be 1,000 characters or fewer.";
      return;
    }

    if (!RELATIONSHIP_OPTIONS.some(
      ([value]) => value === relationshipStatus
    )) {
      feedback.textContent = "Choose a valid relationship status.";
      return;
    }

    if (
      relationshipSince &&
      !/^\d{4}-\d{2}-\d{2}$/.test(relationshipSince)
    ) {
      feedback.textContent = "Choose a valid relationship date.";
      return;
    }

    saveButton.disabled = true;
    feedback.textContent = "Saving...";

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          bio,
          relationship_status: relationshipStatus,
          relationship_since: relationshipSince,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)
        .select("id,bio,relationship_status,relationship_since")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "No profile row was updated. Check your account permissions."
        );
      }

      profileData = data;

      feedback.textContent = "Saved successfully.";

      // Reload the existing profile renderer so its own display stays in sync.
      window.setTimeout(() => window.location.reload(), 450);

    } catch (error) {
      console.error("Grove profile quick edit failed:", error);
      feedback.textContent =
        error.message || "Could not save profile details.";
      saveButton.disabled = false;
    }
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user || null;

    const params = new URLSearchParams(location.search);
    const requestedId = params.get("id");

    profileId = requestedId || user?.id || null;
    isOwner = Boolean(user && profileId === user.id);

    // Never show editing controls on another member's profile.
    if (!isOwner) return;

    await loadProfileFields();

    const observer = new MutationObserver(() => {
      attachProfileControls();
      renderRelationshipDate();
    });

    const main = $(".profile-main");

    if (main) {
      observer.observe(main, {
        childList: true,
        subtree: true
      });
    }
  }

  initialize().catch(error => {
    console.error("Grove quick profile editor:", error);
  });
})();
