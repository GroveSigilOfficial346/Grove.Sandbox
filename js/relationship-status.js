import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const field = document.getElementById("edit-relationship-status");
  const message = document.getElementById("relationship-status-message");

  if (!field || !message) return;

  const allowed = new Set([
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

  function setMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff8585" : "#05c9f4";
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      window.location.replace("/login.html");
      return;
    }

    userId = data.user.id;

    const result = await supabase
      .from("profiles")
      .select("relationship_status")
      .eq("id", userId)
      .maybeSingle();

    if (result.error) throw result.error;

    if (!result.data) {
      throw new Error("Your profile could not be found.");
    }

    const value = result.data.relationship_status || "not_set";

    field.value = allowed.has(value) ? value : "not_set";
    field.disabled = false;
  }

  async function save() {
    if (!userId || saving) return;

    const value = field.value;

    if (!allowed.has(value)) {
      setMessage("Choose a valid relationship status.", true);
      return;
    }

    saving = true;
    field.disabled = true;
    setMessage("Saving relationship status...");

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
        throw new Error("The status was not saved. Check your profile permissions.");
      }

      setMessage("Relationship status saved.");
    } catch (error) {
      console.error("Relationship status update failed:", error);
      setMessage(error.message || "Could not save relationship status.", true);
    } finally {
      field.disabled = false;
      saving = false;
    }
  }

  field.disabled = true;
  field.addEventListener("change", save);

  initialize().catch(error => {
    console.error("Relationship status could not load:", error);
    setMessage(error.message || "Could not load relationship status.", true);
  });
})();
