import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const input = document.querySelector("[data-grove-relationship-date]");
  const message = document.querySelector("[data-grove-relationship-date-message]");
  const label = document.querySelector("[data-grove-relationship-date-label]");
  const statusDisplay = document.querySelector("[data-grove-relationship-current-status]");
  const statusSelect = document.querySelector("#edit-relationship-status");

  if (!input || !message) return;

  const labels = {
    not_set: "Not set",
    single: "Single",
    in_relationship: "In a relationship",
    engaged: "Engaged",
    married: "Married",
    complicated: "It's complicated",
    open_relationship: "In an open relationship",
    prefer_not_to_say: "Prefer not to say"
  };

  let userId = null;
  let saving = false;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function updateLabel(status) {
    if (label) {
      label.textContent =
        status === "married" ? "Date married" : "Relationship start date";
    }

    if (statusDisplay) {
      statusDisplay.textContent =
        "Current status: " + (labels[status] || "Not set");
    }
  }

  async function initialize() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!auth.user) {
      window.location.replace("/login.html");
      return;
    }

    userId = auth.user.id;

    const { data, error } = await supabase
      .from("profiles")
      .select("relationship_status,relationship_since")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Your profile could not be found.");

    input.value = data.relationship_since || "";
    updateLabel(data.relationship_status || "not_set");

    input.disabled = false;
  }

  async function saveDate() {
    if (!userId || saving) return;

    const value = input.value;

    if (value) {
      const parsed = new Date(value + "T00:00:00");

      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      ) {
        showMessage("Enter a valid date.", true);
        return;
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (parsed > today) {
        showMessage("The relationship date cannot be in the future.", true);
        return;
      }
    }

    saving = true;
    input.disabled = true;
    showMessage("Saving date...");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          relationship_since: value || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("id,relationship_since")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("The date was not saved. Check your profile permissions.");
      }

      input.value = data.relationship_since || "";
      showMessage("Relationship date saved.");
    } catch (error) {
      console.error("Relationship date save failed:", error);
      showMessage(error.message || "Could not save the date.", true);
    } finally {
      input.disabled = false;
      saving = false;
    }
  }

  input.disabled = true;
  input.addEventListener("change", saveDate);

  statusSelect?.addEventListener("change", () => {
    updateLabel(statusSelect.value);
  });

  initialize().catch(error => {
    console.error("Relationship date control failed:", error);
    showMessage(error.message || "Could not load the relationship date.", true);
  });
})();
