import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const messageList = $("#message-list");
  const conversationList = $("#conversation-list");

  if (!messageList || !conversationList) return;

  let user = null;
  let activeId = null;
  let channel = null;
  let refreshTimer = null;
  let requestToken = 0;

  function selectedConversationId() {
    return $(
      ".conversation-item.active[data-conversation-id]",
      conversationList
    )?.dataset.conversationId || null;
  }

  function clearReceipt() {
    messageList
      .querySelectorAll(".grove-read-receipt")
      .forEach((node) => node.remove());
  }

  function renderReceipt(message, label) {
    clearReceipt();

    const article = messageList.querySelector(
      `.message-bubble.own-message[data-message-id="${CSS.escape(message.id)}"]`
    );

    if (
      !article ||
      article.classList.contains("message-unsent-placeholder")
    ) {
      return;
    }

    const receipt = document.createElement("span");

    receipt.className = "grove-read-receipt";
    receipt.textContent = label;
    receipt.setAttribute("aria-label", label);

    article.append(receipt);
  }

  async function refreshReceipt() {
    const conversationId = selectedConversationId();
    const token = ++requestToken;

    if (!user || !conversationId) {
      clearReceipt();
      return;
    }

    const [
      { data: conversation, error: conversationError },
      { data: members, error: membersError },
      { data: latestMessage, error: messageError }
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("id,conversation_type")
        .eq("id", conversationId)
        .maybeSingle(),

      supabase
        .from("conversation_members")
        .select("user_id,last_read_at")
        .eq("conversation_id", conversationId),

      supabase
        .from("conversation_messages")
        .select("id,created_at")
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id)
        .is("deleted_for_everyone_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (
      token !== requestToken ||
      conversationId !== selectedConversationId()
    ) {
      return;
    }

    if (conversationError || membersError || messageError) {
      console.warn(
        "Grove read receipts could not refresh.",
        conversationError || membersError || messageError
      );
      return;
    }

    clearReceipt();

    if (!conversation || !latestMessage) return;

    const recipients = (members || []).filter(
      (member) => member.user_id !== user.id
    );

    if (!recipients.length) return;

    const messageTime = new Date(
      latestMessage.created_at
    ).getTime();

    const seenCount = recipients.filter((member) => {
      if (!member.last_read_at) return false;

      return (
        new Date(member.last_read_at).getTime() >= messageTime
      );
    }).length;

    if (seenCount === 0) return;

    const label =
      conversation.conversation_type === "direct"
        ? "Seen"
        : `Seen by ${seenCount} of ${recipients.length}`;

    renderReceipt(latestMessage, label);
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshReceipt().catch((error) => {
        console.warn(
          "Grove read receipt refresh failed.",
          error
        );
      });
    }, 150);
  }

  async function subscribeToConversation(conversationId) {
    if (channel) {
      const previous = channel;
      channel = null;

      await supabase.removeChannel(previous);
    }

    activeId = conversationId;

    if (!conversationId || !user) return;

    channel = supabase
      .channel(
        `grove-read-receipts-${conversationId}-${user.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`
        },
        scheduleRefresh
      )
      .subscribe();

    scheduleRefresh();
  }

  function syncConversation() {
    const nextId = selectedConversationId();

    if (nextId !== activeId) {
      subscribeToConversation(nextId).catch((error) => {
        console.warn(
          "Grove read receipt subscription failed.",
          error
        );
      });
    } else {
      scheduleRefresh();
    }
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) return;

    const conversationObserver = new MutationObserver(
      syncConversation
    );

    conversationObserver.observe(conversationList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    const messageObserver = new MutationObserver((records) => {
      const relevantChange = records.some((record) => {
        const changedNodes = [
          ...record.addedNodes,
          ...record.removedNodes
        ];

        return changedNodes.some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return true;
          }

          return (
            !node.matches(".grove-read-receipt") &&
            !node.closest(".grove-read-receipt")
          );
        });
      });

      if (relevantChange) scheduleRefresh();
    });

    messageObserver.observe(messageList, {
      childList: true,
      subtree: true
    });

    syncConversation();

    window.addEventListener("beforeunload", () => {
      conversationObserver.disconnect();
      messageObserver.disconnect();

      if (channel) {
        supabase.removeChannel(channel);
      }

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    });
  }

  initialize().catch((error) => {
    console.warn(
      "Grove read receipts did not initialize.",
      error
    );
  });
})();
