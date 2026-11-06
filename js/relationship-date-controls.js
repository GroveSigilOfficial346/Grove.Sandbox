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
  let savedValue = "";
  let initialized = false;
  let saving = false;

  const wrapper = document.createElement("div");
  wrapper.className = "grove-date-fields";

  const inputs = {};
  const definitions = [
    ["month", "Month", "MM", 2],
    ["day", "Day", "DD", 2],
    ["year", "Year", "YYYY", 4]
  ];

  function showMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function updateLabel(status) {
    if (label) {
      label.textContent = status === "married"
        ? "Date married"
        : "Relationship start date";
    }

    if (statusDisplay) {
      statusDisplay.textContent =
        "Current status: " + (labels[status] || "Not set");
    }
  }

  function focusNext(name) {
    const order = ["month", "day", "year"];
    const index = order.indexOf(name);
    if (index >= 0 && order[index + 1]) {
      inputs[order[index + 1]].focus();
      inputs[order[index + 1]].select();
    }
  }

  function updateButton() {
    if (!initialized || saving) return;

    try {
      saveButton.disabled = readDate() === savedValue;
    } catch {
      saveButton.disabled = false;
    }
  }

  function assignDate(value) {
    const digits = String(value || "").replace(/\D/g, "");

    if (digits.length >= 8) {
      inputs.month.value = digits.slice(0, 2);
      inputs.day.value = digits.slice(2, 4);
      inputs.year.value = digits.slice(4, 8);
      updateButton();
      return true;
    }

    return false;
  }

  definitions.forEach(([name, captionText, placeholder, max]) => {
    const group = document.createElement("label");
    group.className = "grove-date-field";

    const caption = document.createElement("span");
    caption.textContent = captionText;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = placeholder;
    input.maxLength = max;
    input.pattern = "[0-9]*";
    input.dataset.datePart = name;
    input.setAttribute("aria-label", captionText);

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, max);

      updateButton();

      if (input.value.length === max) {
        focusNext(name);
      }
    });

    input.addEventListener("paste", event => {
      const pasted = event.clipboardData?.getData("text") || "";
      const digits = pasted.replace(/\D/g, "");

      if (digits.length >= 8) {
        event.preventDefault();
        assignDate(digits);
        inputs.year.focus();
        inputs.year.select();
      }
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveDate();
        return;
      }

      if (
        event.key === "Backspace" &&
        input.value.length === 0
      ) {
        const order = ["month", "day", "year"];
        const index = order.indexOf(name);

        if (index > 0) {
          inputs[order[index - 1]].focus();
          inputs[order[index - 1]].select();
        }
      }

      if (event.key === "ArrowRight" && input.selectionStart === input.value.length) {
        focusNext(name);
      }

      if (event.key === "ArrowLeft" && input.selectionStart === 0) {
        const order = ["month", "day", "year"];
        const index = order.indexOf(name);

        if (index > 0) inputs[order[index - 1]].focus();
      }
    });

    group.append(caption, input);
    wrapper.append(group);
    inputs[name] = input;
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "button primary grove-date-save";
  saveButton.textContent = "Save Date";
  saveButton.disabled = true;
  saveButton.addEventListener("click", saveDate);

  originalInput.insertAdjacentElement("afterend", wrapper);
  wrapper.insertAdjacentElement("afterend", saveButton);

  originalInput.hidden = true;
  originalInput.removeAttribute("required");

  function formatDate(value) {
    const [year, month, day] = value
      ? value.split("-")
      : ["", "", ""];

    inputs.month.value = month;
    inputs.day.value = day;
    inputs.year.value = year;
  }

  function readDate() {
    const month = inputs.month.value.trim();
    const day = inputs.day.value.trim();
    const year = inputs.year.value.trim();

    if (!month && !day && !year) return "";

    if (
      month.length !== 2 ||
      day.length !== 2 ||
      year.length !== 4
    ) {
      throw new Error(
        "Enter the month, day, and full four-digit year."
      );
    }

    const m = Number(month);
    const d = Number(day);
    const y = Number(year);

    const date = new Date(y, m - 1, d);

    if (
      y < 1900 ||
      y > 9999 ||
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
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
    if (!userId || saving || !initialized) return;

    let value;

    try {
      value = readDate();
    } catch (error) {
      showMessage(error.message, true);
      return;
    }

    if (value === savedValue) {
      showMessage("No date changes to save.");
      return;
    }

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    Object.values(inputs).forEach(input => {
      input.disabled = true;
    });

    showMessage("Saving relationship date...");

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
        throw new Error(
          "The date was not saved. Check your profile permissions."
        );
      }

      savedValue = data.relationship_since || "";
      originalInput.value = savedValue;
      formatDate(savedValue);

      showMessage(
        savedValue
          ? "Relationship date saved successfully."
          : "Relationship date cleared successfully."
      );
    } catch (error) {
      console.error("Grove relationship date save failed:", error);
      showMessage(error.message || "Could not save the date.", true);
    } finally {
      saving = false;

      Object.values(inputs).forEach(input => {
        input.disabled = false;
      });

      saveButton.textContent = "Save Date";
      updateButton();
    }
  }

  async function initialize() {
    Object.values(inputs).forEach(input => {
      input.disabled = true;
    });

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
    originalInput.value = savedValue;

    formatDate(savedValue);
    updateLabel(data.relationship_status || "not_set");

    initialized = true;

    Object.values(inputs).forEach(input => {
      input.disabled = false;
    });

    updateButton();
    showMessage("Your relationship date is ready to edit.");
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      updateLabel(statusSelect.value);
    });
  }

  initialize().catch(error => {
    console.error("Grove relationship date control failed:", error);
    showMessage(error.message || "Could not load the relationship date.", true);
  });
})();
