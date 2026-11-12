import { supabase } from "./supabase.js";

(() => {
  "use strict";

  async function loadPublicLabel() {
    const details = document.getElementById("details");
    if (!details) return;

    try {
      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get("id");
      const requestedUsername = params.get("username");

      let query = supabase
        .from("profile_directory")
        .select(
          "is_private,adult_profile_label,adult_participation_style"
        );

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.eq(
          "username",
          requestedUsername.toLowerCase()
        );
      } else {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;
        if (!auth.user) return;

        query = query.eq("id", auth.user.id);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      function renderLabel() {
        const existing = details.querySelector(
          "[data-grove-adult-public-label]"
        );

        if (
          !data ||
          data.is_private ||
          !data.adult_profile_label
        ) {
          existing?.remove();
          return;
        }

        const text = `Community: ${data.adult_profile_label}`;

        if (existing?.textContent === text) return;

        existing?.remove();

        const label = document.createElement("span");
        label.className = "profile-detail";
        label.dataset.groveAdultPublicLabel = "true";
        label.textContent = text;

        details.append(label);
      }

      const observer = new MutationObserver(renderLabel);

      observer.observe(details, {
        childList: true,
        subtree: true
      });

      renderLabel();

    } catch (error) {
      console.warn(
        "Grove public participation label could not load:",
        error
      );
    }
  }

  loadPublicLabel();
})();
