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
    ["organization", "Organization"],
    ["adult", "Adult — age-restricted access"]
  ];

  const ADULT_PROFILE_TYPES = [
    ["general", "General Adult"],
    ["bdsm_community", "BDSM Community"],
    ["adult_creator", "Adult Creator"],
    ["lifestyle_discussion", "Lifestyle Discussion"],
    ["relationship_community", "Relationship Community"]
  ];

  const ROLE_OPTIONS = [
    ["undisclosed", "Undisclosed"],
    ["domme", "Domme"],
    ["dominant", "Dominant"],
    ["submissive", "Submissive"],
    ["switch", "Switch"]
  ];

  const THEME_OPTIONS = [
    ["midnight-galaxy", "Midnight Galaxy"],
    ["velvet-noir", "Velvet Noir"],
    ["obsidian", "Obsidian"],
    ["rose-chrome", "Rose Chrome"],
    ["gothic-violet", "Gothic Violet"],
    ["dark-romance", "Dark Romance"],
    ["blood-moon", "Blood Moon"],
    ["silver-key", "Silver Key"],
    ["enchanted-lock", "Enchanted Lock"],
    ["celestial-velvet", "Celestial Velvet"],
    ["neon-noir", "Neon Noir"]
  ];

  let user = null;
  let accessStatus = "not_requested";
  let savingAccount = false;
  let savingAdult = false;

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

  function makeInput(id, labelText, maxLength = 40) {
    const wrapper = node("div", "grove-experience-field");
    const label = node("label", "", labelText);
    const input = node("input");

    input.id = id;
    input.type = "text";
    input.maxLength = maxLength;
    label.htmlFor = id;

    wrapper.append(label, input);

    return { wrapper, input };
  }

  function makeCheckbox(id, title, description) {
    const label = node("label", "grove-experience-toggle");
    label.htmlFor = id;

    const copy = node("span", "grove-experience-toggle-copy");
    copy.append(
      node("strong", "", title),
      node("small", "", description)
    );

    const input = node("input");
    input.type = "checkbox";
    input.id = id;

    label.append(copy, input);

    return { label, input };
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

  const heading = node("h2", "", "Account type & experience");

  const intro = node(
    "p",
    "grove-experience-description",
    "Choose your account category and personalize your Grove experience."
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

  const saveAccount = node(
    "button",
    "button primary",
    "Save account and appearance"
  );
  saveAccount.type = "button";

  const accountMessage = node(
    "p",
    "grove-experience-status"
  );
  accountMessage.setAttribute("role", "status");
  accountMessage.setAttribute("aria-live", "polite");

  const adultPanel = node("section", "grove-adult-options");
  adultPanel.id = "grove-adult-options";
  adultPanel.hidden = true;

  const adultHeading = node(
    "h3",
    "",
    "Adult community preferences"
  );

  const adultDescription = node(
    "p",
    "grove-experience-description",
    "Choose a community category and participation preference. These settings are private by default."
  );

  const verificationMessage = node(
    "p",
    "grove-verification-status"
  );
  verificationMessage.setAttribute("role", "status");
  verificationMessage.setAttribute("aria-live", "polite");

  const profileTypeField = makeSelect(
    "grove-adult-profile-type",
    "Adult community category",
    ADULT_PROFILE_TYPES
  );

  const roleField = makeSelect(
    "grove-participation-style",
    "Participation preference",
    ROLE_OPTIONS
  );

  const themeField = makeSelect(
    "grove-adult-theme",
    "Adult experience theme",
    THEME_OPTIONS
  );

  const nicknameField = makeInput(
    "grove-private-nickname",
    "Private nickname",
    40
  );

  const labelField = makeInput(
    "grove-adult-profile-label",
    "Optional profile label",
    40
  );

  const showRole = makeCheckbox(
    "grove-show-participation-label",
    "Display participation label",
    "Allows your selected label to appear on your profile."
  );

  const adultDiscovery = makeCheckbox(
    "grove-adult-discovery",
    "Appear in adult discovery",
    "Allows eligible verified members to find your Adult account."
  );

  const saveAdult = node(
    "button",
    "button primary",
    "Save adult preferences"
  );
  saveAdult.type = "button";

  const adultMessage = node(
    "p",
    "grove-experience-status"
  );
  adultMessage.setAttribute("role", "status");
  adultMessage.setAttribute("aria-live", "polite");

  adultPanel.append(
    adultHeading,
    adultDescription,
    verificationMessage,
    profileTypeField.wrapper,
    roleField.wrapper,
    themeField.wrapper,
    nicknameField.wrapper,
    labelField.wrapper,
    showRole.label,
    adultDiscovery.label,
    saveAdult,
    adultMessage
  );

  section.append(
    heading,
    intro,
    accountField.wrapper,
    fontField.wrapper,
    fontPreview,
    saveAccount,
    accountMessage,
    adultPanel
  );

  form.insertBefore(section, form.firstElementChild);

  const accountSelect = accountField.select;
  const fontSelect = fontField.select;
  const profileTypeSelect = profileTypeField.select;
  const roleSelect = roleField.select;
  const themeSelect = themeField.select;
  const nicknameInput = nicknameField.input;
  const labelInput = labelField.input;

  function setAdultControlsEnabled(enabled) {
    for (const control of [
      profileTypeSelect,
      roleSelect,
      themeSelect,
      nicknameInput,
      labelInput,
      showRole.input,
      adultDiscovery.input,
      saveAdult
    ]) {
      control.disabled = !enabled;
    }
  }

  function showAdultPanel() {
    adultPanel.hidden = accountSelect.value !== "adult";
  }

  async function loadAdultPreferences() {
    if (accountSelect.value !== "adult") {
      accessStatus = "not_requested";
      adultPanel.hidden = true;
      return;
    }

    adultPanel.hidden = false;
    setAdultControlsEnabled(false);

    const { data: access, error: accessError } = await supabase
      .from("grove_adult_access")
      .select("verification_status,verified_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (accessError) throw accessError;

    accessStatus = access?.verification_status || "not_requested";

    if (accessStatus !== "verified") {
      const messages = {
        pending:
          "Access review is pending. Restricted features remain locked.",
        denied:
          "Adult access was not approved. Contact Grove support for review.",
        disabled:
          "Adult access is disabled. Selecting Adult again requires a new review.",
        not_requested:
          "Save the Adult account type to create an access review request."
      };

      setMessage(
        verificationMessage,
        messages[accessStatus] || messages.not_requested
      );

      return;
    }

    const { data: preferences, error } = await supabase
      .from("grove_adult_preferences")
      .select(
        "adult_profile_type,participation_style,profile_label," +
        "private_nickname,theme_id,show_participation_label," +
        "adult_discovery_enabled"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (preferences) {
      profileTypeSelect.value =
        preferences.adult_profile_type || "general";

      roleSelect.value =
        preferences.participation_style || "undisclosed";

      themeSelect.value =
        preferences.theme_id || "midnight-galaxy";

      nicknameInput.value =
        preferences.private_nickname || "";

      labelInput.value =
        preferences.profile_label || "";

      showRole.input.checked =
        Boolean(preferences.show_participation_label);

      adultDiscovery.input.checked =
        Boolean(preferences.adult_discovery_enabled);
    }

    setAdultControlsEnabled(true);

    setMessage(
      verificationMessage,
      "Adult access verified. Private preferences are available."
    );
  }

  async function saveAccountSettings() {
    if (!user || savingAccount) return;

    const accountType = accountSelect.value;
    const font = fontSelect.value;

    if (!ACCOUNT_TYPES.some(([value]) => value === accountType)) {
      setMessage(accountMessage, "Choose a valid account type.", true);
      return;
    }

    if (!FONT_OPTIONS.some(([value]) => value === font)) {
      setMessage(accountMessage, "Choose a valid profile font.", true);
      return;
    }

    savingAccount = true;
    saveAccount.disabled = true;

    try {
      setMessage(accountMessage, "Saving account preferences...");

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

      await loadAdultPreferences();

      if (accountType === "adult") {
        setMessage(
          accountMessage,
          "Adult account selected. Restricted access remains locked until an authorized review verifies eligibility."
        );
      } else {
        setMessage(
          accountMessage,
          "Account type and profile appearance saved."
        );
      }

    } catch (error) {
      console.error("Grove account settings failed:", error);

      setMessage(
        accountMessage,
        error.message || "Could not save account preferences.",
        true
      );

    } finally {
      savingAccount = false;
      saveAccount.disabled = false;
    }
  }

  async function saveAdultPreferences() {
    if (!user || savingAdult) return;

    if (
      accountSelect.value !== "adult" ||
      accessStatus !== "verified"
    ) {
      setMessage(
        adultMessage,
        "Verified Adult access is required.",
        true
      );
      return;
    }

    savingAdult = true;
    saveAdult.disabled = true;

    try {
      const payload = {
        user_id: user.id,
        adult_profile_type: profileTypeSelect.value,
        participation_style: roleSelect.value,
        theme_id: themeSelect.value,
        private_nickname: nicknameInput.value.trim(),
        profile_label: labelInput.value.trim(),
        show_participation_label: showRole.input.checked,
        adult_discovery_enabled: adultDiscovery.input.checked,
        updated_at: new Date().toISOString()
      };

      if (payload.private_nickname.length > 40) {
        throw new Error(
          "Private nicknames must be 40 characters or fewer."
        );
      }

      if (payload.profile_label.length > 40) {
        throw new Error(
          "Profile labels must be 40 characters or fewer."
        );
      }

      setMessage(adultMessage, "Saving private preferences...");

      const { error } = await supabase
        .from("grove_adult_preferences")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      setMessage(
        adultMessage,
        "Verified Adult preferences saved."
      );

    } catch (error) {
      console.error("Adult preference save failed:", error);

      setMessage(
        adultMessage,
        error.message || "Could not save adult preferences.",
        true
      );

    } finally {
      savingAdult = false;
      saveAdult.disabled = false;
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

      accountSelect.value = profile.account_type || "personal";
      fontSelect.value = profile.profile_font || "modern";

      applyFont(fontSelect.value);
      showAdultPanel();

      await loadAdultPreferences();

      accountSelect.addEventListener("change", showAdultPanel);

      fontSelect.addEventListener("change", () => {
        applyFont(fontSelect.value);
      });

      saveAccount.addEventListener("click", saveAccountSettings);
      saveAdult.addEventListener("click", saveAdultPreferences);

    } catch (error) {
      console.error("Grove experience settings failed:", error);

      setMessage(
        accountMessage,
        error.message || "Could not load account preferences.",
        true
      );

      saveAccount.disabled = true;
    }
  }

  initialize();
})();
