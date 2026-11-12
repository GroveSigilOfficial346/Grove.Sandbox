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

  const allowedDynamicTags = new Set([
    "",
    "domme",
    "dom",
    "submissive"
  ]);

  let userId = null;
  let statusSaving = false;
  let tagSaving = false;

  function setMessage(element, message, error = false) {
    element.textContent = message;
    element.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function createDynamicTagControl() {
    const wrapper = document.createElement("section");
    wrapper.id = "grove-dynamic-tag-settings";
    wrapper.className = "grove-dynamic-tag-settings";

    const heading = document.createElement("h3");
    heading.textContent = "Relationship role tag";

    const description = document.createElement("p");
    description.className = "field-hint";
    description.textContent =
      "Choose an optional role tag to display on your public Grove profile. You can change or hide it at any time.";

    const label = document.createElement("label");
    label.htmlFor = "edit-relationship-dynamic-tag";
    label.textContent = "Your role tag";

    const select = document.createElement("select");
    select.id = "edit-relationship-dynamic-tag";
    select.disabled = true;

    const options = [
      ["", "No role tag"],
      ["domme", "Domme"],
      ["dom", "Dom"],
      ["submissive", "Submissive"]
    ];

    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }

    const message = document.createElement("p");
    message.id = "relationship-dynamic-tag-message";
    message.className = "field-hint";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    wrapper.append(heading, description, label, select, message);
    statusMessage.insertAdjacentElement("afterend", wrapper);

    return { select, message };
  }

  const dynamicTagControl = createDynamicTagControl();
  const dynamicTagField = dynamicTagControl.select;
  const dynamicTagMessage = dynamicTagControl.message;

  async function loadSettings() {
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
      .select("relationship_status,relationship_dynamic_tag")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Your profile could not be found.");
    }

    const statusValue = data.relationship_status || "not_set";
    const tagValue = data.relationship_dynamic_tag || "";

    statusField.value = allowedStatuses.has(statusValue)
      ? statusValue
      : "not_set";

    dynamicTagField.value = allowedDynamicTags.has(tagValue)
      ? tagValue
      : "";

    statusField.disabled = false;
    dynamicTagField.disabled = false;
  }

  async function saveStatus() {
    if (!userId || statusSaving) return;

    const value = statusField.value;

    if (!allowedStatuses.has(value)) {
      setMessage(statusMessage, "Choose a valid relationship status.", true);
      return;
    }

    statusSaving = true;
    statusField.disabled = true;
    setMessage(statusMessage, "Saving relationship status...");

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

      setMessage(statusMessage, "Relationship status saved.");
    } catch (error) {
      console.error("Relationship status update failed:", error);
      setMessage(
        statusMessage,
        error.message || "Could not save relationship status.",
        true
      );
    } finally {
      statusField.disabled = false;
      statusSaving = false;
    }
  }

  async function saveDynamicTag() {
    if (!userId || tagSaving) return;

    const value = dynamicTagField.value;

    if (!allowedDynamicTags.has(value)) {
      setMessage(dynamicTagMessage, "Choose a valid role tag.", true);
      return;
    }

    tagSaving = true;
    dynamicTagField.disabled = true;
    setMessage(dynamicTagMessage, "Saving role tag...");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          relationship_dynamic_tag: value || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("id,relationship_dynamic_tag")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "The role tag was not saved. Check your profile permissions."
        );
      }

      setMessage(
        dynamicTagMessage,
        value
          ? "Your role tag has been saved."
          : "Your role tag has been hidden."
      );
    } catch (error) {
      console.error("Relationship role tag update failed:", error);
      setMessage(
        dynamicTagMessage,
        error.message || "Could not save your role tag.",
        true
      );
    } finally {
      dynamicTagField.disabled = false;
      tagSaving = false;
    }
  }

  statusField.disabled = true;
  dynamicTagField.disabled = true;

  statusField.addEventListener("change", saveStatus);
  dynamicTagField.addEventListener("change", saveDynamicTag);

  loadSettings().catch(error => {
    console.error("Relationship settings failed to load:", error);

    setMessage(
      statusMessage,
      error.message || "Could not load relationship status.",
      true
    );

    setMessage(
      dynamicTagMessage,
      "Could not load your role tag settings.",
      true
    );
  });
})();
