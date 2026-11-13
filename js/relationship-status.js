import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const statusField = document.getElementById("edit-relationship-status");
  const statusMessage = document.getElementById("relationship-status-message");

  if (!statusField || !statusMessage) return;

  const allowedStatuses = new Set([
    "not_set",
    "single",
    "in_relationship",
    "engaged",
    "married",
    "complicated",
    "open_relationship",
    "prefer_not_to_say"
  ]);

  let userId = null;
  let saving = false;

  function showMessage(message, error = false) {
    statusMessage.textContent = message || "";
    statusMessage.style.color = error ? "#ff8585" : "#05c9f4";
  }

  async function initialize() {
    statusField.disabled = true;

    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!auth?.user) {
      window.location.replace("/login.html");
      return;
    }

    userId = auth.user.id;

    const { data, error } = await supabase
      .from("profiles")
      .select("relationship_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Your profile could not be found.");

    const value = data.relationship_status || "not_set";

    statusField.value = allowedStatuses.has(value)
      ? value
      : "not_set";

    statusField.disabled = false;
  }

  async function saveStatus() {
    if (!userId || saving) return;

    const value = statusField.value;

    if (!allowedStatuses.has(value)) {
      showMessage("Choose a valid relationship status.", true);
      return;
    }

    saving = true;
    statusField.disabled = true;
    showMessage("Saving relationship status...");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          relationship_status: value,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("id,relationship_status")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "The status was not saved. Check your profile permissions."
        );
      }

      showMessage("Relationship status saved.");

    } catch (error) {
      console.error("Relationship status update failed:", error);

      showMessage(
        error.message || "Could not save relationship status.",
        true
      );

    } finally {
      statusField.disabled = false;
      saving = false;
    }
  }

  statusField.addEventListener("change", saveStatus);

  initialize().catch(error => {
    console.error("Relationship settings failed to load:", error);

    showMessage(
      error.message || "Could not load relationship status.",
      true
    );

    statusField.disabled = true;
  });
})();
