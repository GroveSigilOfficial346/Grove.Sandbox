import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const busy = new Set();
  let user = null;
  let dialog = null;
  let activeMessageId = null;
  let observer = null;

  function setStatus(message, isError = false) {
    const node = $("#messages-status");
    if (!node) return;
    node.textContent = message || "";
    node.style.color = isError ? "#ff8585" : "";
  }

  function getDestinations(sourceConversationId) {
    return [...document.querySelectorAll(
      "#conversation-list .conversation-item[data-conversation-id]"
    )]
      .map((item) => ({
        id: item.dataset.conversationId,
        label: $(".conversation-name", item)?.textContent?.trim()
          || item.textContent.trim()
          || "Grove conversation"
      }))
      .filter((item) => item.id && item.id !== sourceConversationId);
  }

  function buildDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "grove-forward-dialog grove-forward-text-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="grove-forward-form">
        <h2>Forward message</h2>
        <p class="grove-forward-description">
          Send a copy of this message to another Grove conversation.
        </p>
        <label for="grove-forward-text-destination">Destination conversation</label>
        <select id="grove-forward-text-destination" required></select>
        <p class="grove-forward-error" role="alert" aria-live="polite"></p>
        <div class="grove-forward-actions">
          <button type="button" class="grove-forward-cancel">Cancel</button>
          <button type="submit" class="grove-forward-submit">Forward message</button>
        </div>
      </form>
    `;

    document.body.append(dialog);

    const form = $(".grove-forward-form", dialog);
    const cancel = $(".grove-forward-cancel", dialog);
    const submit = $(".grove-forward-submit", dialog);
    const select = $("#grove-forward-text-destination", dialog);
    const errorNode = $(".grove-forward-error", dialog);

    cancel.addEventListener("click", () => dialog.close("cancel"));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const destinationId = select.value;
      const messageId = activeMessageId;

      if (!destinationId || !messageId) return;

      submit.disabled = true;
      cancel.disabled = true;
      submit.textContent = "Forwarding...";
      errorNode.textContent = "";

      try {
        await forwardTextMessage(messageId, destinationId);
        dialog.close("success");
        setStatus("Message forwarded successfully.");
      } catch (error) {
        console.error("Text message forwarding failed.", error);
        errorNode.textContent =
          error?.message || "This message could not be forwarded.";
      } finally {
        submit.disabled = false;
        cancel.disabled = false;
        submit.textContent = "Forward message";
      }
    });

    return dialog;
  }

  async function openDialog(messageId, sourceConversationId) {
    const destinations = getDestinations(sourceConversationId);

    if (!destinations.length) {
      setStatus(
        "Start another conversation before forwarding this message.",
        true
      );
      return;
    }

    const modal = buildDialog();
    const select = $("#grove-forward-text-destination", modal);
    const errorNode = $(".grove-forward-error", modal);

    select.replaceChildren();
    errorNode.textContent = "";
    activeMessageId = messageId;

    for (const destination of destinations) {
      const option = document.createElement("option");
      option.value = destination.id;
      option.textContent = destination.label;
      select.append(option);
    }

    if (!modal.open) modal.showModal();
  }

  function ensureButton(article) {
    if (
      !article?.dataset.messageId ||
      article.classList.contains("message-unsent-placeholder") ||
      $(".message-forward-text", article)
    ) return;

    const row = $(".message-action-row", article) || article;
    const button = document.createElement("button");

    button.type = "button";
    button.className = "message-forward-text";
    button.textContent = "Forward";
    button.title = "Forward this message to another conversation";
    button.dataset.forwardTextMessageId = article.dataset.messageId;

    button.addEventListener("click", async () => {
      const messageId = article.dataset.messageId;

      if (!messageId || busy.has(messageId)) return;

      button.disabled = true;
      busy.add(messageId);

      try {
        const { data: message, error } = await supabase
          .from("conversation_messages")
          .select("id,conversation_id,body,deleted_for_everyone_at")
          .eq("id", messageId)
          .maybeSingle();

        if (error) throw error;

        if (!message || message.deleted_for_everyone_at) {
          throw new Error("This message is no longer available.");
        }

        if (!String(message.body || "").trim()) {
          throw new Error("This message does not contain text to forward.");
        }

        await openDialog(message.id, message.conversation_id);
      } catch (error) {
        console.error("Could not prepare message forwarding.", error);
        setStatus(
          error?.message || "This message cannot be forwarded.",
          true
        );
      } finally {
        busy.delete(messageId);
        button.disabled = false;
      }
    });

    row.append(button);
  }

  function scan(root = document) {
    if (
      root instanceof Element &&
      root.matches(".message-bubble[data-message-id]")
    ) {
      ensureButton(root);
    }

    root.querySelectorAll?.(
      ".message-bubble[data-message-id]"
    ).forEach(ensureButton);
  }

  async function forwardTextMessage(messageId, destinationConversationId) {
    if (!user) {
      throw new Error("Sign in before forwarding messages.");
    }

    if (busy.has(messageId)) {
      throw new Error("This message is already being forwarded.");
    }

    busy.add(messageId);

    try {
      const { data: source, error: sourceError } = await supabase
        .from("conversation_messages")
        .select(
          "id,conversation_id,sender_id,body,deleted_for_everyone_at"
        )
        .eq("id", messageId)
        .maybeSingle();

      if (sourceError) throw sourceError;

      if (!source || source.deleted_for_everyone_at) {
        throw new Error("The original message is no longer available.");
      }

      if (!String(source.body || "").trim()) {
        throw new Error("There is no text in this message to forward.");
      }

      if (source.conversation_id === destinationConversationId) {
        throw new Error("Choose a different conversation.");
      }

      const { data: membership, error: membershipError } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", destinationConversationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        throw new Error(
          "You are no longer a member of that conversation."
        );
      }

      let senderName = "a Grove member";

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name,username")
        .eq("id", source.sender_id)
        .maybeSingle();

      if (!profileError && profile) {
        senderName = String(
          profile.display_name || profile.username || senderName
        ).trim() || senderName;
      }

      const forwardedBody =
        `Forwarded message from ${senderName}:\n\n${source.body}`;

      const { data: inserted, error: insertError } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: destinationConversationId,
          sender_id: user.id,
          body: forwardedBody
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (!inserted?.id) {
        throw new Error("The forwarded message was not saved.");
      }
    } finally {
      busy.delete(messageId);
    }
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) return;

    const messageList = $("#message-list");

    if (!messageList) return;

    scan(messageList);

    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            scan(node);
          }
        }
      }
    });

    observer.observe(messageList, {
      childList: true,
      subtree: true
    });

    window.addEventListener("beforeunload", () => {
      observer?.disconnect();

      if (dialog?.open) {
        dialog.close();
      }
    });
  }

  initialize().catch((error) => {
    console.error("Grove text forwarding did not initialize.", error);

    setStatus(
      error?.message || "Message forwarding could not initialize.",
      true
    );
  });
})();
