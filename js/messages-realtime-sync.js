import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const conversationList = document.querySelector("#conversation-list");
  const messageList = document.querySelector("#message-list");
  const chatPanel = document.querySelector(".chat-panel");

  if (!conversationList || !messageList || !chatPanel) return;
  if (window.__groveRealtimeSyncInstalled) return;

  window.__groveRealtimeSyncInstalled = true;

  let currentConversationId = null;
  let currentChannel = null;
  let switchToken = 0;
  let pinRefreshTimer = null;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function getActiveConversationId() {
    return $(
      ".conversation-item.active[data-conversation-id]",
      conversationList
    )?.dataset.conversationId || null;
  }

  function showError(message) {
    const status = $("#messages-status");
    if (!status) return;

    status.textContent = message;
    status.style.color = "#ff8585";
  }

  function updateMessage(payload) {
    const message = payload?.new;

    if (!message?.id) return;
    if (message.conversation_id !== currentConversationId) return;

    const article = $(
      `[data-message-id="${CSS.escape(message.id)}"]`,
      messageList
    );

    if (!article) return;

    // Unsend is represented by the same timestamp used by message history.
    if (message.deleted_for_everyone_at) {
      article.remove();

      window.dispatchEvent(
        new CustomEvent("grove:message-unsent", {
          detail: {
            messageId: message.id,
            conversationId: message.conversation_id
          }
        })
      );

      return;
    }

    // Reflect edits without replacing the article or its action controls.
    if (typeof message.body === "string") {
      const paragraph = $("p", article);

      if (paragraph && paragraph.textContent !== message.body) {
        paragraph.textContent = message.body;
        article.dataset.edited = "true";

        let editedLabel = $(".grove-message-edited", article);

        if (!editedLabel) {
          editedLabel = document.createElement("span");
          editedLabel.className = "grove-message-edited";
          editedLabel.textContent = "Edited";
          article.append(editedLabel);
        }
      }
    }

    if (message.created_at) {
      const time = $("time", article);

      if (time) {
        time.dateTime = message.created_at;
        time.textContent = new Date(
          message.created_at
        ).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        });
      }
    }

    window.dispatchEvent(
      new CustomEvent("grove:message-updated", {
        detail: {
          messageId: message.id,
          conversationId: message.conversation_id,
          body: message.body
        }
      })
    );
  }

  function ensurePinBar() {
    let bar = $("#message-pins-bar");

    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = "message-pins-bar";
    bar.className = "message-pins-bar";
    bar.hidden = true;

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

  async function refreshPins(conversationId, token) {
    if (!conversationId || token !== switchToken) return;

    try {
      const { data: pins, error } = await supabase
        .from("conversation_message_pins")
        .select("conversation_id,message_id,pinned_by,pinned_at")
        .eq("conversation_id", conversationId)
        .order("pinned_at", { ascending: false });

      if (error) throw error;
      if (token !== switchToken) return;

      const ids = (pins || []).map(pin => pin.message_id);
      let messages = [];

      if (ids.length) {
        const { data, error: messageError } = await supabase
          .from("conversation_messages")
          .select("id,body,deleted_for_everyone_at")
          .in("id", ids);

        if (messageError) throw messageError;
        messages = data || [];
      }

      if (token !== switchToken) return;

      const byId = new Map(
        messages.map(message => [message.id, message])
      );

      const visiblePins = (pins || []).filter(pin => {
        const message = byId.get(pin.message_id);
        return message && !message.deleted_for_everyone_at;
      });

      const bar = ensurePinBar();
      const items = $("#message-pins-items", bar);

      items.replaceChildren();
      bar.hidden = visiblePins.length === 0;

      for (const pin of visiblePins) {
        const message = byId.get(pin.message_id);

        const row = document.createElement("div");
        row.className = "message-pin-item";

        const preview = document.createElement("span");
        preview.textContent = (
          message.body || "Attachment"
        ).replace(/\s+/g, " ").slice(0, 110);

        const controls = document.createElement("div");
        controls.className = "message-pin-controls";

        const view = document.createElement("button");
        view.type = "button";
        view.className = "message-action-button";
        view.textContent = "View";

        view.addEventListener("click", () => {
          const target = $(
            `[data-message-id="${CSS.escape(pin.message_id)}"]`,
            messageList
          );

          if (!target) {
            showError(
              "That pinned message is not in the loaded history."
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

        const unpin = document.createElement("button");
        unpin.type = "button";
        unpin.className = "message-action-button";
        unpin.textContent = "Unpin";

        unpin.addEventListener("click", async () => {
          unpin.disabled = true;

          try {
            const { error: deleteError } = await supabase
              .from("conversation_message_pins")
              .delete()
              .eq("conversation_id", conversationId)
              .eq("message_id", pin.message_id);

            if (deleteError) throw deleteError;

            await refreshPins(conversationId, token);
          } catch (error) {
            console.error("Realtime unpin failed:", error);
            showError(error.message || "Could not unpin this message.");
            unpin.disabled = false;
          }
        });

        controls.append(view, unpin);
        row.append(preview, controls);
        items.append(row);
      }
    } catch (error) {
      console.warn("Pinned messages could not refresh:", error);
    }
  }

  function schedulePinRefresh(conversationId, token) {
    window.clearTimeout(pinRefreshTimer);

    pinRefreshTimer = window.setTimeout(() => {
      refreshPins(conversationId, token);
    }, 180);
  }

  async function removeChannel() {
    if (!currentChannel) return;

    const oldChannel = currentChannel;
    currentChannel = null;

    try {
      await supabase.removeChannel(oldChannel);
    } catch (error) {
      console.warn("Could not remove realtime channel:", error);
    }
  }

  async function connectToConversation(conversationId) {
    if (conversationId === currentConversationId) return;

    const token = ++switchToken;

    currentConversationId = conversationId;

    await removeChannel();

    if (!conversationId || token !== switchToken) return;

    const channel = supabase
      .channel(
        `grove-message-sync-${conversationId}-${token}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        payload => {
          if (token !== switchToken) return;
          updateMessage(payload);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_message_pins",
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          if (token !== switchToken) return;
          schedulePinRefresh(conversationId, token);
        }
      )
      .subscribe(status => {
        if (token !== switchToken) return;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showError(
            "Live message updates disconnected. Refresh if changes do not appear."
          );
        }
      });

    if (token !== switchToken) {
      await supabase.removeChannel(channel);
      return;
    }

    currentChannel = channel;
    await refreshPins(conversationId, token);
  }

  function observeConversationSelection() {
    const observer = new MutationObserver(() => {
      const nextId = getActiveConversationId();

      if (nextId !== currentConversationId) {
        connectToConversation(nextId).catch(error => {
          console.error("Realtime conversation switch failed:", error);
        });
      }
    });

    observer.observe(conversationList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    return observer;
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.warn("Realtime sync could not verify session:", error);
      return;
    }

    if (!data.user) return;

    ensurePinBar();
    observeConversationSelection();

    const initialId = getActiveConversationId();

    if (initialId) {
      await connectToConversation(initialId);
    }
  }

  window.addEventListener("beforeunload", () => {
    switchToken++;
    window.clearTimeout(pinRefreshTimer);

    if (currentChannel) {
      supabase.removeChannel(currentChannel);
    }
  });

  initialize().catch(error => {
    console.error("Grove realtime sync failed:", error);
  });
})();
