import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  let user = null;
  let isOwner = false;
  let profileData = null;
  let modal = null;
  let bioInput = null;
  let feedback = null;
  let saveButton = null;

  function buildModal() {
    if (modal) return;

    modal = document.createElement("div");
    modal.className = "grove-quick-edit-backdrop";
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
            <h2 id="grove-quick-edit-title">Edit your bio</h2>
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
            rows="5"
            placeholder="Tell members about yourself..."
          ></textarea>

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
              Save bio
            </button>
          </footer>
        </form>
      </section>
    `;

    document.body.append(modal);

    bioInput = modal.querySelector("#grove-quick-bio");
    feedback = modal.querySelector(".grove-quick-edit-feedback");
    saveButton = modal.querySelector(".grove-quick-edit-save");

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

    modal.querySelector("form").addEventListener("submit", saveBio);
  }

  function attachBioControl() {
    if (!isOwner) return;

    const bio = $("#bio");
    if (!bio || bio.querySelector('[data-grove-edit="bio"]')) return;

    bio.classList.add("grove-quick-editable");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "grove-quick-edit-trigger";
    button.dataset.groveEdit = "bio";
    button.textContent = "Edit bio";

    button.addEventListener("click", event => {
      event.stopPropagation();
      openModal();
    });

    bio.append(button);
  }

  function openModal() {
    if (!isOwner || !profileData) return;

    buildModal();

    bioInput.value = profileData.bio || "";
    feedback.textContent = "";
    saveButton.disabled = false;

    modal.hidden = false;
    bioInput.focus();
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  async function saveBio(event) {
    event.preventDefault();

    if (!isOwner || !profileData || saveButton.disabled) return;

    const bio = bioInput.value.trim();

    if (bio.length > 1000) {
      feedback.textContent = "Bio must be 1,000 characters or fewer.";
      return;
    }

    saveButton.disabled = true;
    feedback.textContent = "Saving...";

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          bio,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)
        .select("id,bio")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Your bio was not saved. Check your profile permissions.");
      }

      profileData.bio = data.bio;

      const bioElement = $("#bio");
      if (bioElement) {
        const editButton = bioElement.querySelector(
          '[data-grove-edit="bio"]'
        );

        bioElement.textContent = data.bio || "No bio yet.";

        if (editButton) bioElement.append(editButton);
      }

      feedback.textContent = "Bio saved successfully.";

      window.setTimeout(closeModal, 500);

    } catch (error) {
      console.error("Grove bio update failed:", error);

      feedback.textContent =
        error.message || "Could not save your bio.";

      saveButton.disabled = false;
    }
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user || null;
    if (!user) return;

    const params = new URLSearchParams(location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    let viewedId = user.id;

    if (requestedId) {
      viewedId = requestedId;
    } else if (requestedUsername) {
      const { data: directoryEntry, error: lookupError } =
        await supabase
          .from("profile_directory")
          .select("id")
          .eq("username", requestedUsername.toLowerCase())
          .maybeSingle();

      if (lookupError) throw lookupError;

      viewedId = directoryEntry?.id || null;
    }

    isOwner = Boolean(viewedId && viewedId === user.id);
    if (!isOwner) return;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,bio")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error("Your profile could not be found.");

    profileData = profile;

    const bio = $("#bio");
    if (bio) {
      bio.textContent = profileData.bio?.trim() || "No bio yet.";
    }

    attachBioControl();

    const main = $(".profile-main");
    if (main) {
      new MutationObserver(attachBioControl).observe(main, {
        childList: true,
        subtree: true
      });
    }
  }

  initialize().catch(error => {
    console.error("Grove bio editor initialization failed:", error);
  });
})();
