import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const GENERAL_THEMES = [
    ["default", "Use account default"],
    ["galaxy", "Galaxy"],
    ["gothic", "Gothic"],
    ["velvet", "Velvet"],
    ["rose", "Rose"],
    ["ember", "Ember"],
    ["obsidian", "Obsidian"]
  ];

  const ADULT_THEMES = [
    ["dark-romance", "Dark Romance"],
    ["blood-moon", "Blood Moon"],
    ["silver-key", "Silver Key"],
    ["enchanted-lock", "Enchanted Lock"],
    ["celestial-velvet", "Celestial Velvet"],
    ["neon-noir", "Neon Noir"]
  ];

  const $ = selector => document.querySelector(selector);

  let user = null;
  let activeId = null;
  let loadToken = 0;
  let isVerifiedAdult = false;
  let defaultAdultTheme = "midnight-galaxy";
  let currentNickname = "";
  let currentTheme = "default";

  const baseNames = new Map();

  function element(tag, className, text) {
    const item = document.createElement(tag);

    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;

    return item;
  }

  const styleButton = element(
    "button",
    "grove-chat-style-button",
    "Chat style"
  );

  styleButton.type = "button";
  styleButton.disabled = true;

  const dialog = element("dialog", "grove-chat-style-dialog");
  dialog.setAttribute("aria-labelledby", "grove-chat-style-heading");

  const panel = element("form", "grove-chat-style-panel");
  panel.method = "dialog";

  const heading = element(
    "h2",
    "",
    "Personalize this conversation"
  );
  heading.id = "grove-chat-style-heading";

  const description = element(
    "p",
    "grove-chat-style-description",
    "These settings are private to your account."
  );

  const nicknameLabel = element(
    "label",
    "",
    "Private conversation nickname"
  );
  nicknameLabel.htmlFor = "grove-conversation-nickname";

  const nicknameInput = element("input");
  nicknameInput.id = "grove-conversation-nickname";
  nicknameInput.type = "text";
  nicknameInput.maxLength = 60;
  nicknameInput.placeholder = "Give this conversation a name";

  const themeLabel = element(
    "label",
    "",
    "Conversation theme"
  );
  themeLabel.htmlFor = "grove-conversation-theme";

  const themeSelect = element("select");
  themeSelect.id = "grove-conversation-theme";

  const saveButton = element(
    "button",
    "grove-chat-style-save",
    "Save chat settings"
  );
  saveButton.type = "button";

  const closeButton = element(
    "button",
    "grove-chat-style-close",
    "Close"
  );
  closeButton.type = "button";

  const status = element("p", "grove-chat-style-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  panel.append(
    heading,
    description,
    nicknameLabel,
    nicknameInput,
    themeLabel,
    themeSelect,
    status,
    saveButton,
    closeButton
  );

  dialog.append(panel);

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  function setThemeOptions() {
    themeSelect.replaceChildren();

    for (const [value, label] of GENERAL_THEMES) {
      const option = element("option", "", label);
      option.value = value;
      themeSelect.append(option);
    }

    if (isVerifiedAdult) {
      for (const [value, label] of ADULT_THEMES) {
        const option = element("option", "", label);
        option.value = value;
        themeSelect.append(option);
      }
    }
  }

  function activeConversation() {
    const button = document.querySelector(
      ".conversation-item.active, " +
      '.conversation-item[aria-current="true"]'
    );

    return button?.dataset.conversationId || null;
  }

  function applyTheme(theme) {
    const allowed = [
      ...GENERAL_THEMES.map(item => item[0]),
      ...(isVerifiedAdult
        ? ADULT_THEMES.map(item => item[0])
        : [])
    ];

    const selected = allowed.includes(theme)
      ? theme
      : "default";

    const effective = selected === "default"
      ? (isVerifiedAdult ? defaultAdultTheme : "")
      : selected;

    if (effective) {
      document.body.dataset.groveAdultTheme = effective;
    } else {
      delete document.body.dataset.groveAdultTheme;
    }
  }

  function applyNickname() {
    if (!activeId) return;

    const list = $(".conversation-list");
    const buttons = list
      ? list.querySelectorAll(".conversation-item")
      : [];

    let activeButton = null;

    for (const button of buttons) {
      if (button.dataset.conversationId === activeId) {
        activeButton = button;
        break;
      }
    }

    const nameNode =
      activeButton?.querySelector(".conversation-name");

    if (nameNode) {
      if (!baseNames.has(activeId)) {
        baseNames.set(activeId, nameNode.textContent || "");
      }

      const desired =
        currentNickname ||
        baseNames.get(activeId) ||
        "Conversation";

      if (nameNode.textContent !== desired) {
        nameNode.textContent = desired;
      }
    }

    const title = $("#chat-title");

    if (
      title &&
      currentNickname &&
      title.textContent !== currentNickname
    ) {
      title.textContent = currentNickname;
    }
  }

  async function loadConversationSettings(conversationId) {
    const token = ++loadToken;

    currentNickname = "";
    currentTheme = "default";

    applyTheme("default");

    const { data, error } = await supabase
      .from("conversation_user_settings")
      .select("conversation_nickname,theme_id")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (token !== loadToken) return;
    if (error) throw error;

    currentNickname = data?.conversation_nickname || "";
    currentTheme = data?.theme_id || "default";

    applyTheme(currentTheme);
    applyNickname();
  }

  async function syncActiveConversation() {
    const nextId = activeConversation();

    styleButton.disabled = !nextId;

    if (!nextId || nextId === activeId) {
      applyNickname();
      return;
    }

    activeId = nextId;

    try {
      await loadConversationSettings(nextId);
    } catch (error) {
      console.warn("Conversation settings could not load:", error);
      setStatus(
        "Could not load this conversation's saved settings.",
        true
      );
    }
  }

  async function saveSettings() {
    if (!user || !activeId) {
      setStatus("Choose a conversation first.", true);
      return;
    }

    const nickname = nicknameInput.value.trim();
    const theme = themeSelect.value;

    if (nickname.length > 60) {
      setStatus(
        "Nicknames must be 60 characters or fewer.",
        true
      );
      return;
    }

    saveButton.disabled = true;

    try {
      const { error } = await supabase
        .from("conversation_user_settings")
        .upsert({
          user_id: user.id,
          conversation_id: activeId,
          conversation_nickname: nickname,
          theme_id: theme,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "conversation_id,user_id"
        });

      if (error) throw error;

      currentNickname = nickname;
      currentTheme = theme;

      applyNickname();
      applyTheme(theme);

      setStatus("Your private chat settings have been saved.");

    } catch (error) {
      console.error("Conversation settings save failed:", error);

      setStatus(
        error.message || "Could not save chat settings.",
        true
      );

    } finally {
      saveButton.disabled = false;
    }
  }

  async function openDialog() {
    const conversationId = activeConversation();

    if (!conversationId) {
      setStatus("Choose a conversation first.", true);
      return;
    }

    if (conversationId !== activeId) {
      activeId = conversationId;

      try {
        await loadConversationSettings(conversationId);
      } catch (error) {
        setStatus(
          error.message || "Could not load conversation settings.",
          true
        );
      }
    }

    nicknameInput.value = currentNickname;
    themeSelect.value = currentTheme;
    setStatus("");

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  async function initialize() {
    const heading = $(".chat-heading");

    if (!heading || !$(".conversation-list")) return;

    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;
    if (!auth.user) return;

    user = auth.user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.account_type === "adult") {
      const { data: access, error: accessError } = await supabase
        .from("grove_adult_access")
        .select("verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (accessError) throw accessError;

      isVerifiedAdult =
        access?.verification_status === "verified";

      if (isVerifiedAdult) {
        const { data: preferences, error } = await supabase
          .from("grove_adult_preferences")
          .select("theme_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        defaultAdultTheme =
          preferences?.theme_id || "midnight-galaxy";
      }
    }

    setThemeOptions();
    applyTheme("default");

    heading.append(styleButton);
    document.body.append(dialog);

    styleButton.addEventListener("click", openDialog);
    saveButton.addEventListener("click", saveSettings);
    closeButton.addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });

    const list = $(".conversation-list");

    const observer = new MutationObserver(() => {
      syncActiveConversation().catch(error => {
        console.warn("Active conversation update failed:", error);
      });
    });

    observer.observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current"]
    });

    const chatTitle = $("#chat-title");

    if (chatTitle) {
      const titleObserver = new MutationObserver(() => {
        applyNickname();
      });

      titleObserver.observe(chatTitle, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    syncActiveConversation().catch(error => {
      console.warn("Initial conversation settings failed:", error);
    });
  }

  initialize().catch(error => {
    console.warn("Grove conversation personalization failed:", error);
  });
})();
