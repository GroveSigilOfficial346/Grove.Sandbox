import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const messageList = $("#message-list");
  const conversationList = $("#conversation-list");
  const composer = $("#message-input");
  const chatPanel = $(".chat-panel");

  if (!messageList || !conversationList || !composer || !chatPanel) return;

  const MAX_LENGTH = 5000;

  let user = null;
  let realtimeChannel = null;
  let dialog = null;
  let editedMessages = new Set();
  let checkedMessages = new Set();

  function status(message, isError = false) {
    const node = $("#messages-status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = isError ? "#ff8585" : "";
  }

  function activeConversationId() {
    return $(".conversation-item.active[data-conversation-id]", conversationList)
      ?.dataset.conversationId || null;
  }

  function messageBody(article) {
    const paragraph = $("p", article);
    return paragraph?.textContent?.trim() || "";
  }

  function actionRow(article) {
    let row = $(".message-compose-action-row", article);

    if (!row) {
      row = $(".message-action-row", article);
    }

    if (!row) {
      row = document.createElement("div");
      row.className = "message-compose-action-row";
      article.append(row);
    }

    return row;
  }

  function makeButton(label, action) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "message-action-button message-compose-button";
    button.dataset.composeAction = action;
    button.textContent = label;

    return button;
  }

  function installButtons(article) {
    const messageId = article?.dataset.messageId;

    if (!messageId || article.classList.contains("message-unsent-placeholder")) {
      return;
    }

    const row = actionRow(article);
    const ownMessage = article.classList.contains("own-message");

    if (ownMessage && !('[data-compose-action="edit"]' in row)) {
      // Buttons are added below using querySelector to avoid duplicates.
    }

    if (
      ownMessage &&
      !$('[data-compose-action="edit"]', row)
    ) {
      row.append(makeButton("Edit", "edit"));
    }

    if (!$('[data-compose-action="reply"]', row)) {
      row.append(makeButton("Quote & reply", "reply"));
    }

    if (!$('[data-compose-action="forward"]', row)) {
      row.append(makeButton("Forward", "forward"));
    }
  }

  function addEditedIndicator(article, editedAt) {
    if (!article || !editedAt) return;

    let indicator = $(".message-edited-indicator", article);

    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "message-edited-indicator";
      indicator.textContent = "Edited";

      const time = $("time", article);

      if (time) {
        time.insertAdjacentElement("afterend", indicator);
      } else {
        article.append(indicator);
      }
    }

    article.dataset.editedAt = editedAt;
  }

  function updateMessageInView(message) {
    if (!message?.id) return;

    const article = $(
      `[data-message-id="${CSS.escape(message.id)}"]`,
      messageList
    );

    if (!article) return;

    if (message.deleted_for_everyone_at) return;

    const paragraph = $("p", article);

    if (paragraph && typeof message.body === "string") {
      paragraph.textContent = message.body;
    }

    if (message.edited_at) {
      addEditedIndicator(article, message.edited_at);
    }
  }

  async function loadEditedIndicators() {
    const articles = $$(
      ".message-bubble[data-message-id]",
      messageList
    );

    const ids = articles
      .map((article) => article.dataset.messageId)
      .filter((id) => id && !checkedMessages.has(id));

    if (!ids.length) return;

    ids.forEach((id) => checkedMessages.add(id));

    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("id,edited_at")
        .in("id", ids);

      if (error) throw error;

      for (const message of data || []) {
        if (!message.edited_at) continue;

        const article = $(
          `[data-message-id="${CSS.escape(message.id)}"]`,
          messageList
        );

        if (article) {
          addEditedIndicator(article, message.edited_at);
        }

        editedMessages.add(message.id);
      }

    } catch (error) {
      console.warn("Edited message indicators could not load.", error);
      ids.forEach((id) => checkedMessages.delete(id));
    }
  }

  async function editMessage(article) {
    if (!article.classList.contains("own-message")) {
      throw new Error("You can only edit your own messages.");
    }

    const messageId = article.dataset.messageId;
    const currentBody = messageBody(article);

    if (!currentBody) {
      throw new Error("This message does not contain editable text.");
    }

    const replacement = window.prompt(
      "Edit your message:",
      currentBody
    );

    if (replacement === null) return;

    const body = replacement.trim();

    if (!body) {
      throw new Error("A message cannot be empty.");
    }

    if (body.length > MAX_LENGTH) {
      throw new Error("Messages must be 5,000 characters or fewer.");
    }

    if (body === currentBody) return;

    const { data, error } = await supabase
      .from("conversation_messages")
      .update({
        body,
        edited_at: new Date().toISOString()
      })
      .eq("id", messageId)
      .eq("sender_id", user.id)
      .is("deleted_for_everyone_at", null)
      .select("id,body,edited_at")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("The message could not be edited.");
    }

    updateMessageInView(data);
    editedMessages.add(messageId);
    status("Message updated.");
  }

  function quoteReply(article) {
    const body = messageBody(article);

    if (!body) {
      throw new Error("There is no text in this message to quote.");
    }

    const sender = article.classList.contains("own-message")
      ? "You"
      : "Grove member";

    const excerpt = body.length > 700
      ? `${body.slice(0, 700)}…`
      : body;

    const quote = excerpt
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

    const prefix = `[Replying to ${sender}]\n${quote}\n\n`;
    const combined = `${prefix}${composer.value}`;

    if (combined.length > MAX_LENGTH) {
      throw new Error("There is not enough room to quote this message.");
    }

    composer.value = combined;
    composer.focus();

    composer.setSelectionRange(
      composer.value.length,
      composer.value.length
    );

    status("Quoted message added. Write your reply and send it.");
  }

  function createForwardDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "message-forward-dialog";
    dialog.setAttribute("aria-labelledby", "message-forward-title");

    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "message-forward-form";

    const heading = document.createElement("h2");
    heading.id = "message-forward-title";
    heading.textContent = "Forward message";

    const description = document.createElement("p");
    description.textContent = "Choose a conversation to receive a copy of this text message.";

    const label = document.createElement("label");
    label.htmlFor = "message-forward-target";
    label.textContent = "Destination conversation";

    const select = document.createElement("select");
    select.id = "message-forward-target";
    select.required = true;

    const error = document.createElement("p");
    error.className = "message-forward-error";
    error.setAttribute("role", "status");
    error.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "message-forward-dialog-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "message-forward-cancel";
    cancel.textContent = "Cancel";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "message-forward-submit";
    submit.textContent = "Forward message";

    actions.append(cancel, submit);
    form.append(heading, description, label, select, error, actions);
    dialog.append(form);
    document.body.append(dialog);

    cancel.addEventListener("click", () => dialog.close());

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const messageId = dialog.dataset.messageId;
      const targetConversationId = select.value;

      if (!messageId || !targetConversationId) return;

      const sourceArticle = $(
        `[data-message-id="${CSS.escape(messageId)}"]`,
        messageList
      );

      const body = sourceArticle ? messageBody(sourceArticle) : "";

      if (!body) {
        error.textContent = "This message has no text to forward.";
        return;
      }

      submit.disabled = true;
      error.textContent = "Forwarding...";

      try {
        const forwardedBody = `↪ Forwarded message\n\n${body}`;

        if (forwardedBody.length > MAX_LENGTH) {
          throw new Error("This message is too long to forward.");
        }

        const { error: insertError } = await supabase
          .from("conversation_messages")
          .insert({
            conversation_id: targetConversationId,
            sender_id: user.id,
            body: forwardedBody
          });

        if (insertError) throw insertError;

        dialog.close();
        status("Message forwarded.");

      } catch (forwardError) {
        console.error("Message forwarding failed.", forwardError);
        error.textContent =
          forwardError.message || "The message could not be forwarded.";

      } finally {
        submit.disabled = false;
      }
    });

    return dialog;
  }

  async function loadForwardTargets(select) {
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a conversation...";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);

    const { data: memberships, error: membershipError } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (membershipError) throw membershipError;

    const ids = [...new Set(
      (memberships || []).map((item) => item.conversation_id)
    )];

    if (!ids.length) return;

    const { data: rows, error: conversationError } = await supabase
      .from("conversations")
      .select("id,title,conversation_type")
      .in("id", ids);

    if (conversationError) throw conversationError;

    const { data: members, error: membersError } = await supabase
      .from("conversation_members")
      .select("conversation_id,user_id")
      .in("conversation_id", ids);

    if (membersError) throw membersError;

    const otherIds = [...new Set(
      (members || [])
        .filter((member) => member.user_id !== user.id)
        .map((member) => member.user_id)
    )];

    let profilesById = new Map();

    if (otherIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,username,display_name")
        .in("id", otherIds);

      if (profileError) {
        console.warn("Some forwarding names could not be loaded.", profileError);
      } else {
        profilesById = new Map(
          (profiles || []).map((profile) => [profile.id, profile])
        );
      }
    }

    for (const conversation of rows || []) {
      const otherMember = (members || []).find(
        (member) =>
          member.conversation_id === conversation.id &&
          member.user_id !== user.id
      );

      const profile = otherMember
        ? profilesById.get(otherMember.user_id)
        : null;

      const label =
        conversation.title?.trim() ||
        profile?.display_name?.trim() ||
        (profile?.username ? `@${profile.username}` : "") ||
        (conversation.conversation_type === "group"
          ? "Grove group"
          : "Grove conversation");

      const option = document.createElement("option");
      option.value = conversation.id;
      option.textContent = label;

      select.append(option);
    }
  }

  async function forwardMessage(article) {
    if (!messageBody(article)) {
      throw new Error("Only text messages can be forwarded right now.");
    }

    const modal = createForwardDialog();
    const select = $("#message-forward-target", modal);
    const error = $(".message-forward-error", modal);

    modal.dataset.messageId = article.dataset.messageId;
    error.textContent = "";

    await loadForwardTargets(select);

    if (select.options.length <= 1) {
      throw new Error("No destination conversations were found.");
    }

    modal.showModal();
  }

  chatPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-compose-action]");

    if (!button || !chatPanel.contains(button)) return;

    const article = button.closest(".message-bubble[data-message-id]");
    if (!article) return;

    const action = button.dataset.composeAction;

    button.disabled = true;

    try {
      if (action === "edit") {
        await editMessage(article);
      } else if (action === "reply") {
        quoteReply(article);
      } else if (action === "forward") {
        await forwardMessage(article);
      }

    } catch (error) {
      console.error("Message action failed.", error);
      status(error.message || "That action could not be completed.", true);

    } finally {
      button.disabled = false;
    }
  });

  function scanMessages(root = messageList) {
    if (root.matches?.(".message-bubble[data-message-id]")) {
      installButtons(root);
    }

    $$(".message-bubble[data-message-id]", root).forEach(installButtons);
    loadEditedIndicators();
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          scanMessages(node);
        }
      }
    }
  });

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) return;

    scanMessages();

    observer.observe(messageList, {
      childList: true,
      subtree: true
    });

    realtimeChannel = supabase
      .channel(`grove-message-edits-${user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "conversation_messages"
      }, (payload) => {
        const message = payload.new;

        if (!message || message.sender_id === user.id) {
          if (message?.edited_at) {
            updateMessageInView(message);
          }
          return;
        }

        if (message.edited_at) {
          updateMessageInView(message);
        }
      })
      .subscribe();
  }

  window.addEventListener("beforeunload", () => {
    observer.disconnect();

    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
  });

  initialize().catch((error) => {
    console.error("Message compose actions failed to initialize.", error);
    status("Some message actions could not initialize.", true);
  });
})();
