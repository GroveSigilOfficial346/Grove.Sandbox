import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const THEMES = [
    ["default", "Use default appearance"],
    ["galaxy", "Galaxy"],
    ["midnight-galaxy", "Midnight Galaxy"],
    ["gothic", "Gothic"],
    ["gothic-violet", "Gothic Violet"],
    ["witchlight", "Witchlight"],
    ["moonlit", "Moonlit"],
    ["velvet", "Velvet Noir"],
    ["velvet-noir", "Velvet Noir"],
    ["dark-romance", "Dark Romance"],
    ["rose", "Rose Chrome"],
    ["rose-chrome", "Rose Chrome"],
    ["ember", "Ember"],
    ["blood-moon", "Blood Moon"],
    ["obsidian", "Obsidian"],
    ["silver-key", "Silver Mist"],
    ["enchanted-lock", "Enchanted Forest"],
    ["celestial-velvet", "Celestial Velvet"],
    ["neon-noir", "Neon Noir"]
  ];

  const $ = selector => document.querySelector(selector);

  let user = null;
  let activeId = null;
  let loadToken = 0;
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
    "Choose a visual style and private nickname for this conversation. Only your account's settings are changed."
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
    status.textContent = message || "";
    status.classList.toggle("is-error", error);
  }

  function setThemeOptions() {
    themeSelect.replaceChildren();

    for (const [value, label] of THEMES) {
      const option = element("option", "", label);
      option.value = value;
      themeSelect.append(option);
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
    const allowed = THEMES.map(item => item[0]);
    const selected = allowed.includes(theme) ? theme : "default";

    if (selected === "default") {
      delete document.body.dataset.groveChatTheme;
      return;
    }

    document.body.dataset.groveChatTheme = selected;
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

    const nameNode = activeButton?.querySelector(".conversation-name");

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

    if (title && currentNickname && title.textContent !== currentNickname) {
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

    if (!nextId) {
      activeId = null;
      currentNickname = "";
      currentTheme = "default";
      applyTheme("default");
      return;
    }

    if (nextId === activeId) {
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
      setStatus("Nicknames must be 60 characters or fewer.", true);
      return;
    }

    if (!THEMES.some(([value]) => value === theme)) {
      setStatus("Choose a valid conversation theme.", true);
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
    const chatHeading = $(".chat-heading");
    const list = $(".conversation-list");

    if (!chatHeading || !list) return;

    const { data: auth, error } = await supabase.auth.getUser();

    if (error) throw error;
    if (!auth.user) return;

    user = auth.user;

    setThemeOptions();
    applyTheme("default");

    chatHeading.append(styleButton);
    document.body.append(dialog);

    styleButton.addEventListener("click", openDialog);
    saveButton.addEventListener("click", saveSettings);
    closeButton.addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });

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

    await syncActiveConversation();
  }

  initialize().catch(error => {
    console.warn("Grove conversation personalization failed:", error);
  });
})();
