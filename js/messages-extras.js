import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const list = document.getElementById("conversation-list");
  const heading = document.querySelector(".chat-heading");
  const messageList = document.getElementById("message-list");

  if (!list || !heading || !messageList) return;

  let currentUser = null;
  let shareButton = null;
  let requestedConversationHandled = false;

  const requestedConversation =
    new URLSearchParams(location.search).get("conversation");

  function status(message, error = false) {
    const node = document.getElementById("messages-status");
    if (!node) return;

    node.textContent = message;
    node.style.color = error ? "#ff8585" : "";
  }

  async function getUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user || null;
  }

  async function deleteConversation(conversationId, button) {
    if (!currentUser || !conversationId || button.disabled) return;

    const confirmed = window.confirm(
      "Remove this conversation from your inbox? This does not delete the other member's copy."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Removing...";

    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUser.id)
        .select("conversation_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("This conversation could not be removed.");
      }

      status("Conversation removed from your inbox.");

      // Reloading lets the existing messaging module rebuild its
      // conversation list and open the next available conversation.
      window.location.reload();

    } catch (error) {
      console.error("Could not remove conversation:", error);
      status(error.message || "Could not remove this conversation.", true);

      button.disabled = false;
      button.textContent = "Delete";
    }
  }

  function addDeleteAction(conversationButton) {
    if (conversationButton.dataset.groveActions === "ready") return;

    const conversationId = conversationButton.dataset.conversationId;
    if (!conversationId) return;

    const wrapper = document.createElement("div");
    wrapper.className = "conversation-item-row";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "conversation-delete-button";
    deleteButton.textContent = "×";
    deleteButton.title = "Remove conversation from your inbox";
    deleteButton.setAttribute("aria-label", "Delete conversation");

    deleteButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      deleteConversation(conversationId, deleteButton);
    });

    conversationButton.dataset.groveActions = "ready";

    conversationButton.parentNode.insertBefore(
      wrapper,
      conversationButton
    );

    wrapper.append(conversationButton, deleteButton);
  }

  function addShareButton() {
    if (shareButton) return;

    const content = heading.querySelector(".chat-heading-content");
    if (!content) return;

    shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.className = "chat-share-button";
    shareButton.textContent = "Share link";
    shareButton.disabled = true;

    shareButton.addEventListener("click", shareConversation);

    heading.append(shareButton);
  }

  async function shareConversation() {
    const activeButton = list.querySelector(
      ".conversation-item.active[data-conversation-id]"
    );

    const conversationId = activeButton?.dataset.conversationId;

    if (!conversationId) {
      status("Choose a conversation before sharing its link.", true);
      return;
    }

    const url = new URL("/messages.html", window.location.origin);
    url.searchParams.set("conversation", conversationId);

    const shareData = {
      title: "Grove conversation",
      text: "Open this conversation on Grove.",
      url: url.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.href);
        status("Conversation link copied.");
      } else {
        window.prompt("Copy this conversation link:", url.href);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Conversation sharing failed:", error);
        status("Could not share this conversation link.", true);
      }
    }
  }

  function updateShareButton() {
    if (!shareButton) return;

    shareButton.disabled = !list.querySelector(
      ".conversation-item.active[data-conversation-id]"
    );
  }

  function openRequestedConversation() {
    if (!requestedConversation || requestedConversationHandled) return;

    const button = list.querySelector(
      `.conversation-item[data-conversation-id="${CSS.escape(requestedConversation)}"]`
    );

    if (!button) return;

    requestedConversationHandled = true;
    button.click();
  }

  function linkifyMessageParagraph(paragraph) {
    if (paragraph.dataset.groveLinks === "ready") return;

    paragraph.dataset.groveLinks = "ready";

    const walker = document.createTreeWalker(
      paragraph,
      NodeFilter.SHOW_TEXT
    );

    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      if (/https?:\/\/\S+/i.test(node.textContent)) {
        textNodes.push(node);
      }
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent;
      const fragment = document.createDocumentFragment();
      const expression = /https?:\/\/[^\s<>"']+/gi;

      let lastIndex = 0;
      let match;

      while ((match = expression.exec(text))) {
        const raw = match[0];
        const trailing = raw.match(/[),.!?;:]+$/)?.[0] || "";
        const cleanUrl = trailing
          ? raw.slice(0, -trailing.length)
          : raw;

        fragment.append(
          document.createTextNode(
            text.slice(lastIndex, match.index)
          )
        );

        try {
          const parsed = new URL(cleanUrl);

          if (!["http:", "https:"].includes(parsed.protocol)) {
            fragment.append(document.createTextNode(raw));
          } else {
            const anchor = document.createElement("a");
            anchor.href = parsed.href;
            anchor.textContent = cleanUrl;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.className = "grove-message-link";

            fragment.append(anchor);

            if (trailing) {
              fragment.append(document.createTextNode(trailing));
            }
          }
        } catch {
          fragment.append(document.createTextNode(raw));
        }

        lastIndex = match.index + raw.length;
      }

      fragment.append(
        document.createTextNode(text.slice(lastIndex))
      );

      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  function processMessageLinks(root = messageList) {
    root.querySelectorAll(".message-bubble p").forEach(
      linkifyMessageParagraph
    );
  }

  function processConversationList() {
    list.querySelectorAll(
      ".conversation-item[data-conversation-id]"
    ).forEach(addDeleteAction);

    openRequestedConversation();
    updateShareButton();
  }

  async function initialize() {
    try {
      await getUser();

      if (!currentUser) return;

      addShareButton();
      processConversationList();
      processMessageLinks();

      const conversationObserver = new MutationObserver(() => {
        processConversationList();
      });

      conversationObserver.observe(list, {
        childList: true,
        subtree: true
      });

      const messageObserver = new MutationObserver(() => {
        processMessageLinks();
      });

      messageObserver.observe(messageList, {
        childList: true,
        subtree: true
      });

      const activeObserver = new MutationObserver(updateShareButton);

      activeObserver.observe(list, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"]
      });

      // If a requested conversation is not in this member's inbox,
      // do not expose it or attempt to bypass membership checks.
      if (requestedConversation) {
        window.setTimeout(() => {
          if (!requestedConversationHandled) {
            status(
              "That conversation is not available in this account.",
              true
            );
          }
        }, 1800);
      }

    } catch (error) {
      console.error("Grove message extras failed:", error);
    }
  }

  initialize();
})();
