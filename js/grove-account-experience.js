import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const form = document.getElementById("edit-profile-form");

  if (!form || document.getElementById("grove-account-experience")) {
    return;
  }

  const FONT_OPTIONS = [
    ["modern", "Modern — DM Sans"],
    ["cinzel", "Cinzel — Classical"],
    ["gothic", "Gothic — UnifrakturMaguntia"],
    ["blackletter", "Blackletter — UnifrakturCook"],
    ["serif", "Editorial — Cormorant Garamond"],
    ["mono", "Monospace — IBM Plex Mono"]
  ];

  const ACCOUNT_TYPES = [
    ["personal", "Personal"],
    ["creator", "Creator"],
    ["professional", "Professional"],
    ["business", "Business"],
    ["organization", "Organization"]
  ];

  let user = null;
  let saving = false;

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function makeSelect(id, labelText, options) {
    const wrapper = node("div", "grove-experience-field");
    const label = node("label", "", labelText);
    const select = node("select");

    select.id = id;
    label.htmlFor = id;

    for (const [value, title] of options) {
      const option = node("option", "", title);
      option.value = value;
      select.append(option);
    }

    wrapper.append(label, select);
    return { wrapper, select };
  }

  function setMessage(element, message, error = false) {
    element.textContent = message || "";
    element.classList.toggle("is-error", error);
  }

  function applyFont(font) {
    const valid = FONT_OPTIONS.some(([value]) => value === font)
      ? font
      : "modern";

    document.body.dataset.groveFont = valid;
  }

  const section = node("section", "grove-experience-card");
  section.id = "grove-account-experience";

  const heading = node("h2", "", "Account type & appearance");

  const intro = node(
    "p",
    "grove-experience-description",
    "Choose how you use Grove and personalize your profile typography."
  );

  const accountField = makeSelect(
    "grove-account-type",
    "Account type",
    ACCOUNT_TYPES
  );

  const fontField = makeSelect(
    "grove-profile-font",
    "Profile typography",
    FONT_OPTIONS
  );

  const fontPreview = node(
    "p",
    "grove-font-preview",
    "The quick brown fox — Grove profile preview"
  );

  const saveButton = node(
    "button",
    "button primary",
    "Save account and appearance"
  );
  saveButton.type = "button";

  const status = node("p", "grove-experience-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  section.append(
    heading,
    intro,
    accountField.wrapper,
    fontField.wrapper,
    fontPreview,
    saveButton,
    status
  );

  form.insertBefore(section, form.firstElementChild);

  const accountSelect = accountField.select;
  const fontSelect = fontField.select;

  fontSelect.addEventListener("change", () => {
    applyFont(fontSelect.value);
  });

  async function saveSettings() {
    if (!user || saving) return;

    const accountType = accountSelect.value;
    const font = fontSelect.value;

    if (!ACCOUNT_TYPES.some(([value]) => value === accountType)) {
      setMessage(status, "Choose a valid account type.", true);
      return;
    }

    if (!FONT_OPTIONS.some(([value]) => value === font)) {
      setMessage(status, "Choose a valid profile font.", true);
      return;
    }

    saving = true;
    saveButton.disabled = true;

    try {
      setMessage(status, "Saving account preferences...");

      const { data, error } = await supabase
        .from("profiles")
        .update({
          account_type: accountType,
          profile_font: font,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Account preferences were not saved.");
      }

      applyFont(font);
      setMessage(status, "Account type and appearance saved.");

    } catch (error) {
      console.error("Grove account settings failed:", error);
      setMessage(
        status,
        error.message || "Could not save account preferences.",
        true
      );

    } finally {
      saving = false;
      saveButton.disabled = false;
    }
  }

  async function initialize() {
    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth.user) {
        window.location.replace("/login.html");
        return;
      }

      user = auth.user;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("account_type,profile_font")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!profile) {
        throw new Error("Your profile could not be found.");
      }

      const accountType = profile.account_type || "personal";

      accountSelect.value = ACCOUNT_TYPES.some(
        ([value]) => value === accountType
      ) ? accountType : "personal";

      fontSelect.value = profile.profile_font || "modern";

      applyFont(fontSelect.value);

      saveButton.addEventListener("click", saveSettings);

    } catch (error) {
      console.error("Grove experience settings failed:", error);

      setMessage(
        status,
        error.message || "Could not load account preferences.",
        true
      );

      saveButton.disabled = true;
    }
  }

  initialize();
})();
