import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const input = document.querySelector("#message-input");
  const conversationList = document.querySelector("#conversation-list");
  const wrapper = document.querySelector(".composer-input-wrap");

  if (!input || !conversationList || !wrapper) return;
  if (input.dataset.groveMentions === "installed") return;

  input.dataset.groveMentions = "installed";

  const MAX_RESULTS = 8;
  let currentUser = null;
  let currentConversationId = null;
  let conversationMembers = [];
  let searchTimer = null;
  let searchToken = 0;
  let activeIndex = -1;
  let results = [];
  let listbox = null;

  function getActiveConversationId() {
    return conversationList.querySelector(
      ".conversation-item.active[data-conversation-id]"
    )?.dataset.conversationId || null;
  }

  function getMentionQuery() {
    const cursor = input.selectionStart;
    const beforeCursor = input.value.slice(0, cursor);
    const match = beforeCursor.match(
      /(?:^|\s)@([a-zA-Z0-9_]{1,30})$/
    );

    if (!match) return null;

    return {
      term: match[1],
      start: cursor - match[1].length - 1,
      end: cursor
    };
  }

  function closeSuggestions() {
    if (listbox) listbox.hidden = true;
    results = [];
    activeIndex = -1;
  }

  function ensureListbox() {
    if (listbox) return listbox;

    listbox = document.createElement("div");
    listbox.id = "grove-mention-suggestions";
    listbox.className = "grove-mention-suggestions";
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("aria-label", "Mention a conversation member");
    listbox.hidden = true;

    wrapper.append(listbox);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listbox.id);

    return listbox;
  }

  function renderSuggestions() {
    const node = ensureListbox();
    node.replaceChildren();

    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "grove-mention-empty";
      empty.textContent = "No matching conversation members.";
      node.append(empty);
      node.hidden = false;
      return;
    }

    results.forEach((member, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "grove-mention-option";
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-selected",
        index === activeIndex ? "true" : "false"
      );

      const name = document.createElement("span");
      name.className = "grove-mention-name";
      name.textContent =
        member.display_name?.trim() || `@${member.username}`;

      const username = document.createElement("span");
      username.className = "grove-mention-username";
      username.textContent = `@${member.username}`;

      button.append(name, username);

      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        selectMember(member);
      });

      node.append(button);
    });

    node.hidden = false;
  }

  async function loadConversationMembers(conversationId) {
    if (!conversationId || !currentUser) {
      conversationMembers = [];
      return;
    }

    const token = ++searchToken;

    const { data, error } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId);

    if (error) throw error;
    if (token !== searchToken) return;

    const ids = [
      ...new Set(
        (data || [])
          .map(item => item.user_id)
          .filter(id => id && id !== currentUser.id)
      )
    ];

    if (!ids.length) {
      conversationMembers = [];
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .in("id", ids);

    if (profileError) throw profileError;
    if (token !== searchToken) return;

    conversationMembers = (profiles || [])
      .filter(profile => profile.username)
      .sort((a, b) =>
        a.username.localeCompare(b.username)
      );
  }

  async function searchMembers(term) {
    const token = ++searchToken;
    const normalized = term.toLowerCase();

    results = conversationMembers
      .filter(member =>
        member.username.toLowerCase().startsWith(normalized)
      )
      .slice(0, MAX_RESULTS);

    if (token !== searchToken) return;

    activeIndex = results.length ? 0 : -1;
    renderSuggestions();
  }

  function selectMember(member) {
    const query = getMentionQuery();

    if (!query || !member?.username) {
      closeSuggestions();
      return;
    }

    const before = input.value.slice(0, query.start);
    const after = input.value.slice(query.end);
    const insertion = `@${member.username} `;

    input.value = before + insertion + after;

    const cursor = before.length + insertion.length;

    input.focus();
    input.setSelectionRange(cursor, cursor);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    closeSuggestions();
  }

  function moveSelection(direction) {
    if (!results.length) return;

    activeIndex =
      (activeIndex + direction + results.length) % results.length;

    renderSuggestions();
  }

  function onInput() {
    window.clearTimeout(searchTimer);

    const query = getMentionQuery();

    if (!query || !currentConversationId) {
      closeSuggestions();
      return;
    }

    searchTimer = window.setTimeout(() => {
      searchMembers(query.term).catch(error => {
        console.warn("Grove mention search failed:", error);
        closeSuggestions();
      });
    }, 120);
  }

  input.addEventListener("input", onInput);

  input.addEventListener("keydown", event => {
    if (!listbox || listbox.hidden) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Enter" && results.length) {
      event.preventDefault();
      selectMember(results[activeIndex] || results[0]);
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  });

  document.addEventListener("click", event => {
    if (
      event.target !== input &&
      !listbox?.contains(event.target)
    ) {
      closeSuggestions();
    }
  });

  const conversationObserver = new MutationObserver(() => {
    const nextId = getActiveConversationId();

    if (nextId === currentConversationId) return;

    currentConversationId = nextId;
    closeSuggestions();
    conversationMembers = [];

    if (nextId) {
      loadConversationMembers(nextId).catch(error => {
        console.warn(
          "Could not load mentionable conversation members:",
          error
        );
      });
    }
  });

  conversationObserver.observe(conversationList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  function highlightMentions(article) {
    if (!article || article.dataset.groveMentionsRendered === "true") {
      return;
    }

    const paragraph = article.querySelector("p");
    if (!paragraph) return;

    const text = paragraph.textContent || "";
    const pattern = /(^|[^A-Za-z0-9_])(@[A-Za-z0-9_]{2,30})/g;

    if (!pattern.test(text)) return;

    pattern.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const mentionStart = match.index + match[1].length;
      const mentionEnd = mentionStart + match[2].length;

      fragment.append(
        document.createTextNode(text.slice(lastIndex, mentionStart))
      );

      const mention = document.createElement("span");
      mention.className = "grove-message-mention";
      mention.textContent = match[2];

      fragment.append(mention);
      lastIndex = mentionEnd;
    }

    fragment.append(
      document.createTextNode(text.slice(lastIndex))
    );

    paragraph.replaceChildren(fragment);
    article.dataset.groveMentionsRendered = "true";
  }

  function scanMessages() {
    document.querySelectorAll(
      "#message-list .message-bubble[data-message-id]"
    ).forEach(highlightMentions);
  }

  const messageObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.matches?.(".message-bubble[data-message-id]")) {
          highlightMentions(node);
        }

        node.querySelectorAll?.(
          ".message-bubble[data-message-id]"
        ).forEach(highlightMentions);
      }
    }
  });

  const messageList = document.querySelector("#message-list");

  if (messageList) {
    messageObserver.observe(messageList, {
      childList: true,
      subtree: true
    });

    scanMessages();
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user || null;

    if (!currentUser) return;

    currentConversationId = getActiveConversationId();

    if (currentConversationId) {
      await loadConversationMembers(currentConversationId);
    }

    scanMessages();
  }

  initialize().catch(error => {
    console.warn("Grove mentions could not initialize:", error);
  });
})();
