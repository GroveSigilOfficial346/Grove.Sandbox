import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const messageList = $("#message-list");
  const conversationList = $("#conversation-list");
  const chatPanel = $(".chat-panel");

  if (!messageList || !conversationList || !chatPanel) return;

  let user = null;
  let activePinsConversationId = null;
  let pinLoadToken = 0;
  let pins = [];
  let canPinMessages = false;
  let canUnpinAnyPin = false;
  let actionChannel = null;
  let pinChannel = null;

  function setStatus(message, isError = false) {
    const node = $("#messages-status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = isError ? "#ff8585" : "";
  }

  function activeConversationId() {
    return $(".conversation-item.active[data-conversation-id]", conversationList)
      ?.dataset.conversationId || null;
  }

  function pinForMessage(messageId) {
    return pins.find(pin => pin.message_id === messageId) || null;
  }

  function makeButton(label, action, title = label) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "message-action-button";
    button.dataset.messageAction = action;
    button.textContent = label;
    button.title = title;

    return button;
  }

  function ensureMessageActions(article) {
    if (
      !article?.dataset.messageId ||
      article.classList.contains("message-unsent-placeholder")
    ) {
      return;
    }

    let row = $(".message-action-row", article);

    if (!row) {
      row = document.createElement("div");
      row.className = "message-action-row";
      article.append(row);
    }

    const ownMessage = article.classList.contains("own-message");

    if (!$('[data-message-action="delete-for-me"]', row)) {
      row.append(makeButton("Delete for me", "delete-for-me"));
    }

    if (
      ownMessage &&
      !$('[data-message-action="unsend"]', row)
    ) {
      row.append(
        makeButton(
          "Unsend",
          "unsend",
          "Unsend this message for everyone"
        )
      );
    }

    if (
      canPinMessages &&
      !$('[data-message-action="toggle-pin"]', row)
    ) {
      row.append(
        makeButton(
          "Pin",
          "toggle-pin",
          "Pin this message to the conversation"
        )
      );
    }

    const pinButton = $('[data-message-action="toggle-pin"]', row);

    if (pinButton) {
      const pinned = Boolean(pinForMessage(article.dataset.messageId));

      pinButton.textContent = pinned ? "Unpin" : "Pin";
      pinButton.title = pinned
        ? "Remove this conversation pin"
        : "Pin this message to the conversation";

      pinButton.dataset.pinned = String(pinned);
    }
  }

  function refreshMessageActions() {
    $$(".message-bubble[data-message-id]", messageList)
      .forEach(ensureMessageActions);
  }

  function processAddedMessageNodes(records) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (
          node.matches?.(".message-bubble[data-message-id]")
        ) {
          ensureMessageActions(node);
        }

        node.querySelectorAll?.(
          ".message-bubble[data-message-id]"
        ).forEach(ensureMessageActions);
      }
    }
  }

  function showUnsentNotice(messageId, ownMessage) {
    const existing = $(
      `[data-message-id="${CSS.escape(messageId)}"]`,
      messageList
    );

    if (!existing) return;

    const notice = document.createElement("article");

    notice.className = "message-bubble message-unsent-placeholder";

    if (ownMessage) {
      notice.classList.add("own-message");
    }

    notice.dataset.messageId = messageId;

    const body = document.createElement("p");

    body.textContent = ownMessage
      ? "You unsent a message."
      : "This message was unsent.";

    notice.append(body);
    existing.replaceWith(notice);
  }

  function renderPinnedBar() {
    let bar = $("#message-pins-bar");

    if (!bar) {
      bar = document.createElement("aside");
      bar.id = "message-pins-bar";
      bar.className = "message-pins-bar";

      bar.setAttribute(
        "aria-label",
        "Pinned messages in this conversation"
      );

      chatPanel.insertBefore(bar, messageList);
    }

    bar.replaceChildren();
    bar.hidden = pins.length === 0;

    if (!pins.length) return;

    const heading = document.createElement("strong");

    heading.className = "message-pins-heading";
    heading.textContent = pins.length === 1
      ? "Pinned message"
      : `Pinned messages (${pins.length})`;

    bar.append(heading);

    const list = document.createElement("div");
    list.className = "message-pins-items";

    for (const pin of pins) {
      const item = document.createElement("div");
      item.className = "message-pin-item";

      const preview = document.createElement("span");
      preview.textContent = pin.preview || "Shared attachment";

      item.append(preview);

      const canUnpin =
        pin.pinned_by === user?.id || canUnpinAnyPin;

      if (canUnpin) {
        const button = makeButton("Unpin", "unpin-from-bar");

        button.dataset.messageId = pin.message_id;

        item.append(button);
      }

      list.append(item);
    }

    bar.append(list);
  }

  async function loadPins(force = false) {
    if (!user) return;

    const conversationId = activeConversationId();

    if (!conversationId) {
      pinLoadToken++;
      activePinsConversationId = null;
      pins = [];
      canPinMessages = false;
      canUnpinAnyPin = false;

      renderPinnedBar();
      refreshMessageActions();

      return;
    }

    if (!force && conversationId === activePinsConversationId) {
      return;
    }

    const token = ++pinLoadToken;

    activePinsConversationId = conversationId;

    try {
      const [
        { data: conversation, error: conversationError },
        { data: membership, error: membershipError }
      ] = await Promise.all([
        supabase
          .from("conversations")
          .select("id,conversation_type")
          .eq("id", conversationId)
          .maybeSingle(),

        supabase
          .from("conversation_members")
          .select("role")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      if (conversationError) throw conversationError;
      if (membershipError) throw membershipError;

      if (token !== pinLoadToken) return;

      if (conversationId !== activeConversationId()) return;

      const canManagePins = Boolean(
        conversation &&
        membership &&
        (
          conversation.conversation_type === "direct" ||
          membership.role === "owner" ||
          membership.role === "admin"
        )
      );

      canPinMessages = canManagePins;
      canUnpinAnyPin = canManagePins;

      const { data: pinRows, error: pinError } = await supabase
        .from("conversation_message_pins")
        .select("conversation_id,message_id,pinned_by,pinned_at")
        .eq("conversation_id", conversationId)
        .order("pinned_at", { ascending: false });

      if (pinError) throw pinError;

      const ids = (pinRows || []).map(pin => pin.message_id);

      let messagesById = new Map();

      if (ids.length) {
        const { data: messageRows, error: messageError } = await supabase
          .from("conversation_messages")
          .select("id,body,attachment_filename")
          .in("id", ids);

        if (messageError) throw messageError;

        messagesById = new Map(
          (messageRows || []).map(message => [
            message.id,
            message
          ])
        );
      }

      if (token !== pinLoadToken) return;

      if (conversationId !== activeConversationId()) return;

      pins = (pinRows || []).map(pin => {
        const message = messagesById.get(pin.message_id);

        return {
          ...pin,
          preview: String(
            message?.body ||
            message?.attachment_filename ||
            "Shared attachment"
          )
            .replace(/\s+/g, " ")
            .slice(0, 140)
        };
      });

      renderPinnedBar();
      refreshMessageActions();

    } catch (error) {
      if (token !== pinLoadToken) return;

      console.warn("Could not load pinned messages.", error);

      pins = [];
      canPinMessages = false;
      canUnpinAnyPin = false;

      renderPinnedBar();
      refreshMessageActions();
    }
  }

  async function deleteForMe(messageId, article) {
    const { error } = await supabase
      .from("message_hidden_for")
      .insert({
        message_id: messageId,
        user_id: user.id
      });

    if (error && error.code !== "23505") {
      throw error;
    }

    article.remove();
  }

  async function unsendForEveryone(messageId, article) {
    const ownMessage = article.classList.contains("own-message");

    const { data, error } = await supabase
      .from("conversation_messages")
      .update({
        deleted_for_everyone_at: new Date().toISOString()
      })
      .eq("id", messageId)
      .eq("sender_id", user.id)
      .is("deleted_for_everyone_at", null)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data?.id) {
      throw new Error(
        "This message could not be unsent. It may already be removed."
      );
    }

    showUnsentNotice(messageId, ownMessage);
  }

  async function togglePin(messageId) {
    const conversationId = activeConversationId();

    if (!conversationId || !canPinMessages) return;

    const existing = pinForMessage(messageId);

    if (existing) {
      const { error } = await supabase
        .from("conversation_message_pins")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("message_id", messageId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("conversation_message_pins")
        .insert({
          conversation_id: conversationId,
          message_id: messageId,
          pinned_by: user.id
        });

      if (error) throw error;
    }

    await loadPins(true);
  }

  async function unpinFromBar(messageId) {
    const conversationId = activeConversationId();

    if (!conversationId) return;

    const { error } = await supabase
      .from("conversation_message_pins")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("message_id", messageId);

    if (error) throw error;

    await loadPins(true);
  }

  chatPanel.addEventListener("click", async event => {
    const button = event.target.closest("[data-message-action]");

    if (!button || !chatPanel.contains(button)) return;

    const action = button.dataset.messageAction;

    const article = button.closest(
      ".message-bubble[data-message-id]"
    );

    const messageId =
      article?.dataset.messageId ||
      button.dataset.messageId;

    if (!messageId || button.disabled) return;

    button.disabled = true;

    try {
      if (action === "delete-for-me" && article) {
        await deleteForMe(messageId, article);

      } else if (action === "unsend" && article) {
        await unsendForEveryone(messageId, article);

      } else if (action === "toggle-pin") {
        await togglePin(messageId);

      } else if (action === "unpin-from-bar") {
        await unpinFromBar(messageId);
      }

      setStatus("");

    } catch (error) {
      console.error("Message action failed.", error);

      setStatus(
        error?.message ||
        "That message action could not be completed.",
        true
      );

      button.disabled = false;
    }
  });

  function handleMessageMutations(records) {
    processAddedMessageNodes(records);

    const currentId = activeConversationId();

    if (currentId !== activePinsConversationId) {
      loadPins();
    }
  }

  const messageObserver = new MutationObserver(
    handleMessageMutations
  );

  messageObserver.observe(messageList, {
    childList: true,
    subtree: true
  });

  const conversationObserver = new MutationObserver(() => {
    const currentId = activeConversationId();

    if (currentId !== activePinsConversationId) {
      loadPins();
    }
  });

  conversationObserver.observe(conversationList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.warn(
        "Message actions could not verify the current user.",
        error
      );
      return;
    }

    user = data.user;

    if (!user) return;

    refreshMessageActions();
    await loadPins(true);

    actionChannel = supabase
      .channel(`grove-message-actions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_messages"
        },
        payload => {
          const message = payload.new;

          if (!message?.deleted_for_everyone_at) return;

          const article = $(
            `[data-message-id="${CSS.escape(message.id)}"]`,
            messageList
          );

          if (article) {
            showUnsentNotice(
              message.id,
              message.sender_id === user.id
            );
          }
        }
      )
      .subscribe();

    pinChannel = supabase
      .channel(`grove-message-pins-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_message_pins"
        },
        payload => {
          const changedConversationId =
            payload.new?.conversation_id ||
            payload.old?.conversation_id;

          if (
            changedConversationId &&
            changedConversationId === activeConversationId()
          ) {
            loadPins(true);
          }
        }
      )
      .subscribe();
  }

  window.addEventListener("beforeunload", () => {
    if (actionChannel) {
      supabase.removeChannel(actionChannel);
    }

    if (pinChannel) {
      supabase.removeChannel(pinChannel);
    }

    messageObserver.disconnect();
    conversationObserver.disconnect();
  });

  initialize().catch(error => {
    console.error(
      "Grove message actions failed to initialize.",
      error
    );
  });
})();
