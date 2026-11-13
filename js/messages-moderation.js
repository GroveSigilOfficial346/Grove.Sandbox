import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const messageList = document.querySelector("#message-list");
  const conversationList = document.querySelector("#conversation-list");
  const chatPanel = document.querySelector(".chat-panel");

  if (!messageList || !conversationList || !chatPanel) return;
  if (window.__groveMessageModerationInstalled) return;

  window.__groveMessageModerationInstalled = true;

  let user = null;
  let activeConversationId = null;
  let pinChannel = null;
  let loadingPins = false;
  let pinnedMessages = [];

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function status(message, isError = false) {
    const node = $("#messages-status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = isError ? "#ff8585" : "";
  }

  function currentConversation() {
    return $(
      ".conversation-item.active[data-conversation-id]",
      conversationList
    )?.dataset.conversationId || null;
  }

  function messageId(article) {
    return article?.dataset.messageId || null;
  }

  function isOwnMessage(article) {
    return article?.classList.contains("own-message") || false;
  }

  function messageText(article) {
    return $("p", article)?.textContent?.trim() || "";
  }

  function ensurePinBar() {
    let bar = $("#message-pins-bar");

    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = "message-pins-bar";
    bar.className = "message-pins-bar";
    bar.hidden = true;
    bar.setAttribute("aria-label", "Pinned messages");

    const heading = document.createElement("strong");
    heading.className = "message-pins-heading";
    heading.textContent = "Pinned messages";

    const items = document.createElement("div");
    items.id = "message-pins-items";
    items.className = "message-pins-items";

    bar.append(heading, items);

    const chatHeading = $(".chat-heading", chatPanel);

    if (chatHeading) {
      chatHeading.insertAdjacentElement("afterend", bar);
    } else {
      chatPanel.prepend(bar);
    }

    return bar;
  }

  function makeAction(label, action, message) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "message-action-button";
    button.dataset.moderationAction = action;
    button.dataset.messageId = messageId(message);
    button.textContent = label;

    return button;
  }

  function installMessageActions(article) {
    const id = messageId(article);

    if (!id || article.dataset.moderationReady === "true") {
      return;
    }

    if (article.classList.contains("message-unsent-placeholder")) {
      return;
    }

    article.dataset.moderationReady = "true";

    const row = document.createElement("div");
    row.className = "message-moderation-actions";

    if (isOwnMessage(article)) {
      row.append(makeAction("Unsend", "unsend", article));
    }

    row.append(
      makeAction("Delete for me", "hide", article),
      makeAction("Pin", "pin", article)
    );

    article.append(row);
  }

  function updatePinButton(messageIdValue, pinned) {
    const button = $(
      `[data-moderation-action="pin"][data-message-id="${CSS.escape(messageIdValue)}"]`,
      messageList
    );

    if (!button) return;

    button.textContent = pinned ? "Pinned" : "Pin";
    button.disabled = pinned;
    button.title = pinned
      ? "This message is pinned"
      : "Pin this message for the conversation";
  }

  function renderPins() {
    const bar = ensurePinBar();
    const items = $("#message-pins-items", bar);

    items.replaceChildren();

    if (!pinnedMessages.length) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;

    for (const pin of pinnedMessages) {
      const row = document.createElement("div");
      row.className = "message-pin-item";

      const preview = document.createElement("span");
      preview.textContent = pin.preview || "Pinned message";

      const actions = document.createElement("div");
      actions.className = "message-pin-controls";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "message-action-button";
      openButton.textContent = "View";

      openButton.addEventListener("click", () => {
        const target = $(
          `[data-message-id="${CSS.escape(pin.message_id)}"]`,
          messageList
        );

        if (!target) {
          status(
            "That pinned message is not in the currently loaded history.",
            true
          );
          return;
        }

        target.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        target.classList.add("message-reply-highlight");

        window.setTimeout(() => {
          target.classList.remove("message-reply-highlight");
        }, 1400);
      });

      const unpinButton = document.createElement("button");
      unpinButton.type = "button";
      unpinButton.className = "message-action-button";
      unpinButton.textContent = "Unpin";

      unpinButton.addEventListener("click", () => {
        removePin(pin);
      });

      actions.append(openButton, unpinButton);
      row.append(preview, actions);
      items.append(row);
    }
  }

  async function loadPins(conversationId) {
    if (!conversationId || loadingPins) return;

    loadingPins = true;

    try {
      const { data: pins, error } = await supabase
        .from("conversation_message_pins")
        .select("conversation_id,message_id,pinned_by,pinned_at")
        .eq("conversation_id", conversationId)
        .order("pinned_at", { ascending: false });

      if (error) throw error;
      if (conversationId !== activeConversationId) return;

      const ids = (pins || []).map(pin => pin.message_id);

      let messages = [];

      if (ids.length) {
        const { data, error: messageError } = await supabase
          .from("conversation_messages")
          .select("id,body,sender_id,deleted_for_everyone_at")
          .in("id", ids);

        if (messageError) throw messageError;

        messages = data || [];
      }

      if (conversationId !== activeConversationId) return;

      const messageMap = new Map(
        messages.map(message => [message.id, message])
      );

      pinnedMessages = (pins || [])
        .filter(pin => {
          const message = messageMap.get(pin.message_id);
          return message && !message.deleted_for_everyone_at;
        })
        .map(pin => {
          const message = messageMap.get(pin.message_id);

          return {
            ...pin,
            preview: (message.body || "Attachment")
              .replace(/\s+/g, " ")
              .slice(0, 110)
          };
        });

      renderPins();

      for (const pin of pinnedMessages) {
        updatePinButton(pin.message_id, true);
      }

    } catch (error) {
      console.error("Could not load pinned messages:", error);
      status("Pinned messages could not load.", true);

    } finally {
      loadingPins = false;
    }
  }

  async function pinMessage(article, button) {
    const id = messageId(article);
    const conversationId = activeConversationId;

    if (!id || !conversationId || button.disabled) return;

    button.disabled = true;
    button.textContent = "Pinning...";

    try {
      const { data, error } = await supabase
        .from("conversation_message_pins")
        .insert({
          conversation_id: conversationId,
          message_id: id,
          pinned_by: user.id
        })
        .select("conversation_id,message_id,pinned_by,pinned_at")
        .single();

      if (error) throw error;

      if (conversationId !== activeConversationId) return;

      const preview = messageText(article) || "Attachment";

      pinnedMessages.unshift({
        ...data,
        preview: preview.replace(/\s+/g, " ").slice(0, 110)
      });

      renderPins();
      updatePinButton(id, true);
      status("Message pinned.");

    } catch (error) {
      console.error("Could not pin message:", error);

      status(
        error.message?.includes("row-level security")
          ? "You do not have permission to pin messages in this group."
          : error.message || "Could not pin this message.",
        true
      );

      button.disabled = false;
      button.textContent = "Pin";
    }
  }

  async function removePin(pin) {
    if (!pin || !activeConversationId) return;

    try {
      const { data, error } = await supabase
        .from("conversation_message_pins")
        .delete()
        .eq("conversation_id", activeConversationId)
        .eq("message_id", pin.message_id)
        .select("message_id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "You do not have permission to unpin this message."
        );
      }

      pinnedMessages = pinnedMessages.filter(
        item => item.message_id !== pin.message_id
      );

      renderPins();
      updatePinButton(pin.message_id, false);
      status("Message unpinned.");

    } catch (error) {
      console.error("Could not unpin message:", error);
      status(error.message || "Could not unpin this message.", true);
    }
  }

  async function hideMessage(article, button) {
    const id = messageId(article);

    if (!id || button.disabled) return;

    const confirmed = window.confirm(
      "Delete this message from your inbox? Other conversation members will still see it."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
      const { error } = await supabase
        .from("message_hidden_for")
        .insert({
          message_id: id,
          user_id: user.id
        });

      if (error) throw error;

      article.remove();
      status("Message deleted from your inbox.");

    } catch (error) {
      console.error("Could not hide message:", error);
      status(error.message || "Could not delete this message.", true);

      button.disabled = false;
      button.textContent = "Delete for me";
    }
  }

  async function unsendMessage(article, button) {
    const id = messageId(article);

    if (!id || !isOwnMessage(article) || button.disabled) return;

    const confirmed = window.confirm(
      "Unsend this message for everyone in the conversation? This cannot be undone."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Unsending...";

    try {
      const timestamp = new Date().toISOString();

      const { data, error } = await supabase
        .from("conversation_messages")
        .update({
          deleted_for_everyone_at: timestamp
        })
        .eq("id", id)
        .eq("sender_id", user.id)
        .is("deleted_for_everyone_at", null)
        .select("id,deleted_for_everyone_at")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("This message could not be unsent.");
      }

      article.remove();

      pinnedMessages = pinnedMessages.filter(
        pin => pin.message_id !== id
      );

      renderPins();
      status("Message unsent for everyone.");

    } catch (error) {
      console.error("Could not unsend message:", error);
      status(error.message || "Could not unsend this message.", true);

      button.disabled = false;
      button.textContent = "Unsend";
    }
  }

  async function handleAction(event) {
    const button = event.target.closest(
      "[data-moderation-action]"
    );

    if (!button || !messageList.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    const article = button.closest(
      ".message-bubble[data-message-id]"
    );

    if (!article) return;

    const action = button.dataset.moderationAction;

    if (action === "unsend") {
      await unsendMessage(article, button);
    } else if (action === "hide") {
      await hideMessage(article, button);
    } else if (action === "pin") {
      await pinMessage(article, button);
    }
  }

  function processMessages(root = messageList) {
    if (root.matches?.(".message-bubble[data-message-id]")) {
      installMessageActions(root);
    }

    root.querySelectorAll?.(
      ".message-bubble[data-message-id]"
    ).forEach(installMessageActions);
  }

  function onConversationChange() {
    const nextId = currentConversation();

    if (nextId === activeConversationId) return;

    activeConversationId = nextId;
    pinnedMessages = [];
    renderPins();

    if (nextId) {
      loadPins(nextId);
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      user = data.user;

      if (!user) return;

      ensurePinBar();
      processMessages();

      messageList.addEventListener("click", handleAction);

      const messageObserver = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              processMessages(node);
            }
          }
        }
      });

      messageObserver.observe(messageList, {
        childList: true,
        subtree: true
      });

      const conversationObserver = new MutationObserver(
        onConversationChange
      );

      conversationObserver.observe(conversationList, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });

      activeConversationId = currentConversation();

      if (activeConversationId) {
        await loadPins(activeConversationId);
      }

      window.addEventListener("beforeunload", () => {
        messageObserver.disconnect();
        conversationObserver.disconnect();

        if (pinChannel) {
          supabase.removeChannel(pinChannel);
        }
      });

    } catch (error) {
      console.error("Message moderation failed to initialize:", error);
      status("Message controls could not initialize.", true);
    }
  }

  initialize();
})();
