import { supabase } from "./supabase.js";
import {
  applyGroveButtonTheme,
  getGroveButtonDefaults
} from "./grove-button-theme.js";

(() => {
  "use strict";

  const DEFAULT_STYLE = "ember";

  const main = document.querySelector(".settings-container");
  if (!main || document.getElementById("grove-button-studio")) return;

  const style = document.createElement("style");
  style.id = "grove-button-studio-styles";
  style.textContent = `
    .button-studio-panel {
      display: grid;
      gap: 15px;
    }

    .button-studio-panel h2 {
      margin: 0;
    }

    .button-studio-description {
      margin: 0;
      color: var(--grove-muted, #aaa1c8);
      line-height: 1.6;
    }

    .button-studio-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .button-studio-field {
      display: grid;
      gap: 8px;
      min-width: 0;
      color: var(--grove-muted, #aaa1c8);
      font-size: .85rem;
      font-weight: 700;
    }

    .button-studio-field select {
      width: 100%;
      min-height: 46px;
      padding: 10px;
      border: 1px solid rgba(190,155,255,.25);
      border-radius: 10px;
      background: #100b25;
      color: #f7f5ff;
    }

    .button-studio-field input[type="color"] {
      width: 100%;
      height: 46px;
      padding: 4px;
      border: 1px solid rgba(190,155,255,.25);
      border-radius: 10px;
      background: #100b25;
      cursor: pointer;
    }

    .button-studio-preview {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 17px;
      border: 1px solid rgba(190,155,255,.16);
      border-radius: 13px;
      background: rgba(5,0,25,.45);
    }

    .button-studio-preview-label {
      width: 100%;
      color: var(--grove-muted, #aaa1c8);
      font-size: .72rem;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .button-studio-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .button-studio-status {
      min-height: 1.2em;
      margin: 0;
      color: #7bd7a2;
      font-size: .85rem;
    }

    .button-studio-status.error {
      color: #ff8585;
    }

    @media (max-width: 520px) {
      .button-studio-controls {
        grid-template-columns: 1fr;
      }

      .button-studio-actions > button {
        flex: 1 1 100%;
      }
    }
  `;

  document.head.append(style);

  const panel = document.createElement("section");
  panel.id = "grove-button-studio";
  panel.className = "settings-panel button-studio-panel";

  const title = document.createElement("h2");
  title.textContent = "Button Studio";

  const description = document.createElement("p");
  description.className = "button-studio-description";
  description.textContent =
    "Choose a button finish and accent color. Your selection follows your account across Grove.";

  const controls = document.createElement("div");
  controls.className = "button-studio-controls";

  const styleLabel = document.createElement("label");
  styleLabel.className = "button-studio-field";
  styleLabel.textContent = "Button style";

  const styleSelect = document.createElement("select");
  styleSelect.id = "grove-button-style";

  const choices = [
    ["ember", "Ember Gold"],
    ["gothic", "Gothic Obsidian"],
    ["violet", "Violet Arc"],
    ["rose", "Rose Velvet"],
    ["forest", "Forest"],
    ["monochrome", "Monochrome"]
  ];

  choices.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    styleSelect.append(option);
  });

  styleLabel.append(styleSelect);

  const colorLabel = document.createElement("label");
  colorLabel.className = "button-studio-field";
  colorLabel.textContent = "Accent color";

  const colorInput = document.createElement("input");
  colorInput.id = "grove-button-color";
  colorInput.type = "color";
  colorInput.value = "#D9A15B";
  colorLabel.append(colorInput);

  controls.append(styleLabel, colorLabel);

  const preview = document.createElement("div");
  preview.className = "button-studio-preview";

  const previewLabel = document.createElement("span");
  previewLabel.className = "button-studio-preview-label";
  previewLabel.textContent = "Live preview";

  const primaryPreview = document.createElement("button");
  primaryPreview.type = "button";
  primaryPreview.className = "button primary";
  primaryPreview.textContent = "Primary action";

  const secondaryPreview = document.createElement("button");
  secondaryPreview.type = "button";
  secondaryPreview.className = "button secondary";
  secondaryPreview.textContent = "Secondary action";

  preview.append(
    previewLabel,
    primaryPreview,
    secondaryPreview
  );

  const actions = document.createElement("div");
  actions.className = "button-studio-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "button primary";
  saveButton.textContent = "Save button style";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button secondary";
  resetButton.textContent = "Restore Grove default";

  actions.append(saveButton, resetButton);

  const status = document.createElement("p");
  status.className = "button-studio-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  panel.append(
    title,
    description,
    controls,
    preview,
    actions,
    status
  );

  const heading = main.querySelector(".settings-heading");
  if (heading) {
    heading.insertAdjacentElement("afterend", panel);
  } else {
    main.prepend(panel);
  }

  let user = null;
  let saving = false;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function updatePreview() {
    applyGroveButtonTheme(
      styleSelect.value,
      colorInput.value
    );
  }

  function setDefaults(styleValue = DEFAULT_STYLE) {
    const defaults = getGroveButtonDefaults(styleValue);

    styleSelect.value = defaults.style;
    colorInput.value = defaults.color;

    updatePreview();
  }

  async function loadSettings() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    user = auth.user || null;

    if (!user) {
      setStatus("Sign in to save your button preferences.", true);
      saveButton.disabled = true;
      resetButton.disabled = true;
      return;
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("button_style,button_color")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    styleSelect.value = data?.button_style || DEFAULT_STYLE;
    colorInput.value = data?.button_color || "#D9A15B";

    updatePreview();
    setStatus("Your saved button preferences are loaded.");
  }

  async function saveSettings() {
    if (!user || saving) return;

    saving = true;
    saveButton.disabled = true;
    resetButton.disabled = true;

    const buttonStyle = styleSelect.value;
    const buttonColor = colorInput.value.toUpperCase();

    setStatus("Saving your button style...");

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          button_style: buttonStyle,
          button_color: buttonColor,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id"
        })
        .select("button_style,button_color")
        .single();

      if (error) throw error;

      applyGroveButtonTheme(
        data.button_style,
        data.button_color
      );

      setStatus("Button style saved to your Grove account.");

    } catch (error) {
      console.error("Grove button preferences could not save:", error);
      setStatus(
        error.message || "Could not save your button preferences.",
        true
      );
    } finally {
      saving = false;
      saveButton.disabled = !user;
      resetButton.disabled = !user;
    }
  }

  styleSelect.addEventListener("change", () => {
    const defaults = getGroveButtonDefaults(styleSelect.value);
    colorInput.value = defaults.color;
    updatePreview();
    setStatus("Preview updated. Save to keep this style.");
  });

  colorInput.addEventListener("input", () => {
    updatePreview();
    setStatus("Preview updated. Save to keep this color.");
  });

  saveButton.addEventListener("click", saveSettings);

  resetButton.addEventListener("click", () => {
    setDefaults(DEFAULT_STYLE);
    saveSettings();
  });

  loadSettings().catch(error => {
    console.error("Grove Button Studio could not load:", error);
    setStatus(error.message || "Could not load Button Studio.", true);
  });
})();
