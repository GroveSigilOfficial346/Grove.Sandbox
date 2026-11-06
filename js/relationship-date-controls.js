import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const originalInput = document.querySelector(
    "[data-grove-relationship-date]"
  );

  const message = document.querySelector(
    "[data-grove-relationship-date-message]"
  );

  const label = document.querySelector(
    "[data-grove-relationship-date-label]"
  );

  const statusDisplay = document.querySelector(
    "[data-grove-relationship-current-status]"
  );

  const statusSelect = document.querySelector(
    "#edit-relationship-status"
  );

  if (!originalInput || !message) return;

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
  let savedValue = "";

  const wrapper = document.createElement("div");
  wrapper.className = "grove-date-fields";

  const fields = [
    { name: "month", label: "Month", placeholder: "MM", max: 12, length: 2 },
    { name: "day", label: "Day", placeholder: "DD", max: 31, length: 2 },
    { name: "year", label: "Year", placeholder: "YYYY", max: 9999, length: 4 }
  ];

  const inputs = {};

  fields.forEach(field => {
    const group = document.createElement("label");
    group.className = "grove-date-field";

    const caption = document.createElement("span");
    caption.textContent = field.label;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = field.placeholder;
    input.maxLength = field.length;
    input.pattern = "[0-9]*";
    input.dataset.datePart = field.name;

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, field.length);

      if (input.value.length === field.length) {
        const next = inputs[
          field.name === "month" ? "day" :
          field.name === "day" ? "year" : ""
        ];

        next?.focus();
      }
    });

    group.append(caption, input);
    wrapper.append(group);
    inputs[field.name] = input;
  });

  originalInput.insertAdjacentElement("afterend", wrapper);
  originalInput.hidden = true;
  originalInput.removeAttribute("required");

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

  function formatDate(value) {
    if (!value) return;

    const [year, month, day] = value.split("-");

    inputs.month.value = month;
    inputs.day.value = day;
    inputs.year.value = year;
  }

  function readDate() {
    const month = inputs.month.value;
    const day = inputs.day.value;
    const year = inputs.year.value;

    if (!month && !day && !year) return "";

    if (
      month.length !== 2 ||
      day.length !== 2 ||
      year.length !== 4
    ) {
      throw new Error("Enter the month, day, and full four-digit year.");
    }

    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const yearNumber = Number(year);

    const date = new Date(yearNumber, monthNumber - 1, dayNumber);

    if (
      yearNumber < 1900 ||
      yearNumber > 9999 ||
      date.getFullYear() !== yearNumber ||
      date.getMonth() !== monthNumber - 1 ||
      date.getDate() !== dayNumber
    ) {
      throw new Error("Enter a valid calendar date.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date > today) {
      throw new Error("The relationship date cannot be in the future.");
    }

    return `${year}-${month}-${day}`;
  }

  async function saveDate() {
    if (!userId || saving) return;

    let value;

    try {
      value = readDate();
    } catch (error) {
      showMessage(error.message, true);
      return;
    }

    if (value === savedValue) return;

    saving = true;
    Object.values(inputs).forEach(input => input.disabled = true);
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
        throw new Error("The date could not be saved. Check your profile permissions.");
      }

      savedValue = data.relationship_since || "";
      formatDate(savedValue);
      originalInput.value = savedValue;

      showMessage("Relationship date saved.");
    } catch (error) {
      console.error("Relationship date save failed:", error);
      showMessage(error.message || "Could not save the date.", true);
    } finally {
      Object.values(inputs).forEach(input => input.disabled = false);
      saving = false;
    }
  }

  Object.values(inputs).forEach(input => {
    input.addEventListener("change", saveDate);

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });

  statusSelect?.addEventListener("change", () => {
    updateLabel(statusSelect.value);
  });

  async function initialize() {
    Object.values(inputs).forEach(input => input.disabled = true);

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

    savedValue = data.relationship_since || "";
    formatDate(savedValue);
    originalInput.value = savedValue;

    updateLabel(data.relationship_status || "not_set");

    Object.values(inputs).forEach(input => input.disabled = false);
  }

  initialize().catch(error => {
    console.error("Relationship date control failed:", error);
    showMessage(error.message || "Could not load the date.", true);
  });
})();
