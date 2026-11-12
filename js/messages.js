import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);

const MAX_MESSAGE_LENGTH = 5000;
const MESSAGE_HISTORY_LIMIT = 300;

let user = null;
let activeConversationId = null;
let activeChannel = null;
let activeChannelConversationId = null;
let openingConversationId = null;
let conversations = [];

let conversationLoadToken = 0;
let messageLoadToken = 0;
let isSending = false;

let replyTarget = null;

const messageById = new Map();

function setStatus(message, error = false) {
  const node = $("#messages-status");
  if (!node) return;

  node.textContent = message;
  node.style.color = error ? "#ff8585" : "";
}

function showError(error, fallback = "Something went wrong.") {
  console.error(error);
  setStatus(error?.message || fallback, true);
}

function setComposerEnabled(enabled) {
  const input = $("#message-input");
  const button = $("#send-message");

  if (input) input.disabled = !enabled;
  if (button) button.disabled = !enabled || isSending;
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatPreview(body) {
  if (!body) return "Start a conversation";

  const normalized = String(body).replace(/\s+/g, " ").trim();

  return normalized.length > 65
    ? `${normalized.slice(0, 65)}…`
    : normalized;
}

function safeMessageText(message) {
  if (!message) return "Message unavailable";

  if (message.deleted_for_everyone_at) {
    return "Original message was unsent";
  }

  return formatPreview(message.body);
}

function clearReplyTarget() {
  replyTarget = null;

  const context = $("#message-reply-context");
  const contextText = $("#message-reply-context-text");
  const input = $("#message-input");

  if (context) context.hidden = true;
  if (contextText) contextText.textContent = "";
  if (input) input.placeholder = "Write a message...";
}

function setReplyTarget(message) {
  if (!message || !message.id || !activeConversationId) return;

  if (message.conversation_id !== activeConversationId) {
    setStatus("That message belongs to another conversation.", true);
    return;
  }

  if (message.deleted_for_everyone_at) {
    setStatus("You cannot reply to an unsent message.", true);
    return;
  }

  replyTarget = message;

  const context = $("#message-reply-context");
  const contextText = $("#message-reply-context-text");
  const input = $("#message-input");

  if (contextText) {
    const author = message.sender_id === user.id
      ? "your message"
      : "this message";

    contextText.textContent =
      `${author}: ${formatPreview(message.body)}`;
  }

  if (context) context.hidden = false;

  if (input) {
    input.placeholder = "Write your reply...";
    input.focus();
  }
}

async function removeActiveChannel() {
  if (!activeChannel) {
    activeChannelConversationId = null;
    return;
  }

  const channel = activeChannel;
  activeChannel = null;
  activeChannelConversationId = null;

  try {
    await supabase.removeChannel(channel);
  } catch (error) {
    console.warn("Could not remove previous message channel.", error);
  }
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not load conversation profile.", error);
    return null;
  }

  return data;
}

function getProfileLabel(profile) {
  if (!profile) return "Grove member";

  return (
    profile.display_name?.trim() ||
    (profile.username ? `@${profile.username}` : "Grove member")
  );
}

/* ==========================================
   CONVERSATION LIST
   ========================================== */

function renderConversationButton(conversation) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "conversation-item";
  button.dataset.conversationId = conversation.id;

  if (conversation.id === activeConversationId) {
    button.classList.add("active");
    button.setAttribute("aria-current", "true");
  }

  if (conversation.hasUnread) {
    button.classList.add("has-unread");
  }

  button.setAttribute(
    "aria-label",
    `${conversation.label}${conversation.hasUnread ? ", unread message" : ""}`
  );

  const content = document.createElement("span");
  content.className = "conversation-content";

  const name = document.createElement("span");
  name.className = "conversation-name";
  name.textContent = conversation.label;

  const preview = document.createElement("span");
  preview.className = "conversation-preview";

  const lastMessage = conversation.lastMessage;

  preview.textContent = lastMessage
    ? `${lastMessage.sender_id === user.id ? "You: " : ""}${formatPreview(lastMessage.body)}`
    : "Start a conversation";

  const details = document.createElement("span");
  details.className = "conversation-details";

  const time = document.createElement("span");
  time.className = "conversation-time";
  time.textContent = lastMessage
    ? formatTime(lastMessage.created_at)
    : "";

  details.append(time);

  if (conversation.hasUnread) {
    const unread = document.createElement("span");
    unread.className = "conversation-unread";
    unread.setAttribute("aria-label", "Unread message");
    details.append(unread);
  }

  content.append(name, preview);
  button.append(content, details);

  button.addEventListener("click", () => {
    openConversation(conversation.id, conversation.label)
      .catch((error) =>
        showError(error, "Conversation could not open.")
      );
  });

  return button;
}

function renderConversationList() {
  const list = $("#conversation-list");
  if (!list) return;

  list.replaceChildren();

  if (!conversations.length) {
    const empty = document.createElement("p");

    empty.className = "conversation-loading";
    empty.textContent =
      "No conversations yet. Open a member profile and select Message.";

    list.append(empty);
    return;
  }

  for (const conversation of conversations) {
    list.append(renderConversationButton(conversation));
  }
}

function updateConversationPreview(conversationId, message) {
  const conversation = conversations.find(
    (item) => item.id === conversationId
  );

  if (!conversation) return;

  if (
    conversation.lastMessage &&
    new Date(conversation.lastMessage.created_at) >
      new Date(message.created_at)
  ) {
    return;
  }

  conversation.lastMessage = message;

  conversation.hasUnread =
    message.sender_id !== user.id &&
    activeConversationId !== conversationId;

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.created_at || a.updated_at;
    const bTime = b.lastMessage?.created_at || b.updated_at;

    return new Date(bTime) - new Date(aTime);
  });

  renderConversationList();
}

/* ==========================================
   LOAD CONVERSATIONS
   ========================================== */

async function loadConversationList({
  processRequestedUser = true,
  autoOpenFirst = true
} = {}) {
  const token = ++conversationLoadToken;

  const { data: memberships, error: membershipError } =
    await supabase
      .from("conversation_members")
      .select("conversation_id,last_read_at")
      .eq("user_id", user.id);

  if (membershipError) throw membershipError;

  const ids = (memberships || []).map(
    (membership) => membership.conversation_id
  );

  if (!ids.length) {
    conversations = [];
    renderConversationList();

    if (processRequestedUser) {
      const requestedUser =
        new URLSearchParams(location.search).get("user");

      if (requestedUser) {
        await startOrOpenDirectConversation(requestedUser);
      } else if (
        new URLSearchParams(location.search).get("conversation")
      ) {
        setStatus(
          "That conversation is not available in this account.",
          true
        );
      }
    }

    return;
  }

  const { data: rows, error: conversationError } =
    await supabase
      .from("conversations")
      .select("id,conversation_type,title,updated_at")
      .in("id", ids)
      .order("updated_at", { ascending: false });

  if (conversationError) throw conversationError;

  const { data: members, error: membersError } =
    await supabase
      .from("conversation_members")
      .select("conversation_id,user_id")
      .in("conversation_id", ids);

  if (membersError) throw membersError;

  const otherUserIds = [
    ...new Set(
      (members || [])
        .filter((member) => member.user_id !== user.id)
        .map((member) => member.user_id)
    )
  ];

  let profilesById = new Map();

  if (otherUserIds.length) {
    const { data: profiles, error: profilesError } =
      await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", otherUserIds);

    if (profilesError) {
      console.warn(
        "Some conversation names could not be loaded.",
        profilesError
      );
    } else {
      profilesById = new Map(
        (profiles || []).map((profile) => [profile.id, profile])
      );
    }
  }

  if (token !== conversationLoadToken) return;

  const latestMessageResults = await Promise.all(
    ids.map(async (conversationId) => {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select(
          "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at,reply_to_message_id"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_for_everyone_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.warn(
          "Could not load latest conversation message.",
          error
        );
        return [conversationId, null];
      }

      return [conversationId, data?.[0] || null];
    })
  );

  if (token !== conversationLoadToken) return;

  const latestMessageByConversation = new Map(
    latestMessageResults
  );

  const membershipByConversation = new Map(
    (memberships || []).map((membership) => [
      membership.conversation_id,
      membership
    ])
  );

  conversations = (rows || []).map((conversation) => {
    const conversationMembers = (members || []).filter(
      (member) => member.conversation_id === conversation.id
    );

    const otherMembers = conversationMembers.filter(
      (member) => member.user_id !== user.id
    );

    let label = conversation.title?.trim();

    if (!label && conversation.conversation_type === "direct") {
      const otherProfile = otherMembers.length
        ? profilesById.get(otherMembers[0].user_id)
        : null;

      label = getProfileLabel(otherProfile);
    }

    if (!label && conversation.conversation_type === "group") {
      label = "Grove group";
    }

    if (!label) label = "Grove conversation";

    const membership = membershipByConversation.get(conversation.id);
    const lastMessage = latestMessageByConversation.get(conversation.id);

    const hasUnread = Boolean(
      lastMessage &&
      lastMessage.sender_id !== user.id &&
      (
        !membership?.last_read_at ||
        new Date(lastMessage.created_at) >
          new Date(membership.last_read_at)
      )
    );

    return {
      ...conversation,
      label,
      lastMessage,
      hasUnread
    };
  });

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.created_at || a.updated_at;
    const bTime = b.lastMessage?.created_at || b.updated_at;

    return new Date(bTime) - new Date(aTime);
  });

  renderConversationList();

  const requestedConversation =
    new URLSearchParams(location.search).get("conversation");

  if (requestedConversation) return;

  if (processRequestedUser) {
    const requestedUser =
      new URLSearchParams(location.search).get("user");

    if (requestedUser) {
      await startOrOpenDirectConversation(requestedUser);
      return;
    }
  }

  if (
    autoOpenFirst &&
    conversations.length &&
    !activeConversationId
  ) {
    await openConversation(
      conversations[0].id,
      conversations[0].label
    );
  }
}

/* ==========================================
   OPEN OR CREATE DIRECT CONVERSATION
   ========================================== */

async function startOrOpenDirectConversation(targetUserId) {
  if (!targetUserId || targetUserId === user.id) {
    setStatus("Choose another member to message.", true);
    return;
  }

  setStatus("Opening conversation...");

  const { data: conversationId, error } = await supabase.rpc(
    "open_or_create_direct_conversation",
    {
      p_target_user_id: targetUserId
    }
  );

  if (error) throw error;

  if (!conversationId) {
    throw new Error("The conversation could not be created.");
  }

  await loadConversationList({
    processRequestedUser: false,
    autoOpenFirst: false
  });

  const existing = conversations.find(
    (conversation) => conversation.id === conversationId
  );

  let label = existing?.label;

  if (!label) {
    const profile = await getProfile(targetUserId);
    label = getProfileLabel(profile);
  }

  await openConversation(conversationId, label);
  setStatus("");
}

/* ==========================================
   REPLY PREVIEWS
   ========================================== */

function createReplyPreview(message) {
  if (!message.reply_to_message_id) return null;

  const preview = document.createElement("button");

  preview.type = "button";
  preview.className = "message-reply-preview";
  preview.dataset.replyTarget = message.reply_to_message_id;
  preview.textContent = "View replied-to message";

  return preview;
}

function updateReplyPreview(messageId, originalMessage) {
  const previews = document.querySelectorAll(
    `.message-reply-preview[data-reply-target="${CSS.escape(messageId)}"]`
  );

  const label = originalMessage
    ? safeMessageText(originalMessage)
    : "Original message unavailable";

  previews.forEach((preview) => {
    preview.textContent = label;
    preview.title = "Jump to original message";
  });
}

async function hydrateReplyPreviews(messages) {
  const referencedIds = [
    ...new Set(
      (messages || [])
        .map((message) => message.reply_to_message_id)
        .filter(Boolean)
    )
  ];

  if (!referencedIds.length || !activeConversationId) return;

  const conversationId = activeConversationId;

  const cachedIds = referencedIds.filter(
    (id) => !messageById.has(id)
  );

  let fetched = [];

  if (cachedIds.length) {
    const { data, error } = await supabase
      .from("conversation_messages")
      .select(
        "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at,reply_to_message_id"
      )
      .eq("conversation_id", conversationId)
      .in("id", cachedIds);

    if (error) {
      console.warn("Could not load original replied-to messages.", error);
    } else {
      fetched = data || [];

      for (const message of fetched) {
        messageById.set(message.id, message);
      }
    }
  }

  if (conversationId !== activeConversationId) return;

  for (const id of referencedIds) {
    updateReplyPreview(id, messageById.get(id) || null);
  }
}

/* ==========================================
   MESSAGE RENDERING
   ========================================== */

function renderMessage(message) {
  messageById.set(message.id, message);

  const article = document.createElement("article");

  article.className =
    message.sender_id === user.id
      ? "message-bubble own-message"
      : "message-bubble";

  article.dataset.messageId = message.id;

  const replyPreview = createReplyPreview(message);

  const body = document.createElement("p");
  body.textContent = message.body ?? "";

  const time = document.createElement("time");
  time.dateTime = message.created_at;
  time.textContent = formatTime(message.created_at);

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "message-reply-trigger";
  replyButton.dataset.replyMessageId = message.id;
  replyButton.textContent = "Reply";
  replyButton.setAttribute(
    "aria-label",
    "Reply to this message"
  );

  if (replyPreview) {
    article.append(replyPreview);
  }

  article.append(body, time, replyButton);

  return article;
}

function scrollMessagesToBottom() {
  const list = $("#message-list");
  if (!list) return;

  list.scrollTop = list.scrollHeight;
}

function appendMessageToView(message) {
  const list = $("#message-list");
  if (!list) return;

  if (
    list.querySelector(
      `[data-message-id="${CSS.escape(message.id)}"]`
    )
  ) {
    return;
  }

  const empty = list.querySelector(".empty-chat");
  if (empty) empty.remove();

  list.append(renderMessage(message));
  scrollMessagesToBottom();

  if (message.reply_to_message_id) {
    hydrateReplyPreviews([message]).catch((error) => {
      console.warn("Reply preview could not load.", error);
    });
  }
}

/* ==========================================
   REPLY BUTTON INTERACTIONS
   ========================================== */

function handleMessageListClick(event) {
  const replyButton = event.target.closest(
    ".message-reply-trigger"
  );

  if (replyButton) {
    const message = messageById.get(
      replyButton.dataset.replyMessageId
    );

    if (message) {
      setReplyTarget(message);
    }

    return;
  }

  const preview = event.target.closest(
    ".message-reply-preview"
  );

  if (preview) {
    const targetId = preview.dataset.replyTarget;

    const target = document.querySelector(
      `[data-message-id="${CSS.escape(targetId)}"]`
    );

    if (!target) {
      setStatus(
        "The original message is not in the loaded message history.",
        true
      );
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    target.classList.remove("message-reply-highlight");

    requestAnimationFrame(() => {
      target.classList.add("message-reply-highlight");
    });

    window.setTimeout(() => {
      target.classList.remove("message-reply-highlight");
    }, 1600);
  }
}

/* ==========================================
   READ MARKERS
   ========================================== */

async function updateReadMarker(conversationId) {
  const { error } = await supabase
    .from("conversation_members")
    .update({
      last_read_at: new Date().toISOString()
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) {
    console.warn("Could not update message read marker.", error);
  }

  const conversation = conversations.find(
    (item) => item.id === conversationId
  );

  if (conversation) {
    conversation.hasUnread = false;
    renderConversationList();
  }
}

/* ==========================================
   LOAD MESSAGE HISTORY
   ========================================== */

async function loadMessages() {
  if (!activeConversationId) return;

  const conversationId = activeConversationId;
  const token = ++messageLoadToken;

  const { data, error } = await supabase
    .from("conversation_messages")
    .select(
      "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at,reply_to_message_id"
    )
    .eq("conversation_id", conversationId)
    .is("deleted_for_everyone_at", null)
    .order("created_at", { ascending: true })
    .limit(MESSAGE_HISTORY_LIMIT);

  if (error) throw error;

  if (
    token !== messageLoadToken ||
    conversationId !== activeConversationId
  ) {
    return;
  }

  const list = $("#message-list");
  if (!list) return;

  list.replaceChildren();
  messageById.clear();

  if (!data?.length) {
    const empty = document.createElement("div");

    empty.className = "empty-chat";

    const heading = document.createElement("h3");
    heading.textContent =
      "This is the beginning of the conversation.";

    empty.append(heading);
    list.append(empty);
  } else {
    for (const message of data) {
      list.append(renderMessage(message));
    }

    await hydrateReplyPreviews(data);
  }

  scrollMessagesToBottom();

  await updateReadMarker(conversationId);
}

/* ==========================================
   OPEN CONVERSATION AND REALTIME
   ========================================== */

async function openConversation(id, label) {
  if (!id) return;

  if (
    activeConversationId === id &&
    (
      openingConversationId === id ||
      activeChannelConversationId === id
    )
  ) {
    return;
  }

  if (activeConversationId !== id) {
    clearReplyTarget();
    messageById.clear();
  }

  openingConversationId = id;
  activeConversationId = id;
  messageLoadToken++;

  const title = $("#chat-title");
  const subtitle = $("#chat-subtitle");

  if (title) title.textContent = label || "Conversation";
  if (subtitle) subtitle.textContent = "Private conversation";

  setComposerEnabled(true);
  renderConversationList();

  try {
    await removeActiveChannel();

    await loadMessages();

    if (activeConversationId !== id) return;

    const channel = supabase
      .channel(`grove-chat-${id}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${id}`
        },
        async (payload) => {
          if (activeConversationId !== id) return;

          const message = payload.new;

          if (
            !message ||
            message.deleted_for_everyone_at
          ) {
            return;
          }

          updateConversationPreview(id, message);
          appendMessageToView(message);

          if (message.sender_id !== user.id) {
            await updateReadMarker(id);
          }
        }
      )
      .subscribe((status) => {
        if (activeConversationId !== id) return;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setStatus(
            "Live updates are temporarily unavailable. Refresh the conversation to check for new messages.",
            true
          );
        } else if (status === "SUBSCRIBED") {
          setStatus("");
        }
      });

    activeChannel = channel;
    activeChannelConversationId = id;

  } finally {
    if (openingConversationId === id) {
      openingConversationId = null;
    }
  }
}

/* ==========================================
   SEND MESSAGE
   ========================================== */

async function sendMessage(event) {
  event.preventDefault();

  const input = $("#message-input");
  const button = $("#send-message");

  if (!input || !button || !activeConversationId || isSending) {
    return;
  }

  const body = input.value.trim();

  if (!body) return;

  if (body.length > MAX_MESSAGE_LENGTH) {
    setStatus("Messages must be 5,000 characters or fewer.", true);
    return;
  }

  const conversationId = activeConversationId;
  const selectedReply = replyTarget;

  if (
    selectedReply &&
    selectedReply.conversation_id !== conversationId
  ) {
    clearReplyTarget();
    setStatus(
      "Your reply target changed. Select the message again.",
      true
    );
    return;
  }

  isSending = true;
  setComposerEnabled(false);
  setStatus("Sending...");

  try {
    const { data, error } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        reply_to_message_id: selectedReply?.id || null
      })
      .select(
        "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at,reply_to_message_id"
      )
      .single();

    if (error) throw error;

    input.value = "";

    if (replyTarget?.id === selectedReply?.id) {
      clearReplyTarget();
    }

    if (activeConversationId === conversationId && data) {
      appendMessageToView(data);
      updateConversationPreview(conversationId, data);
    }

    setStatus("");
  } catch (error) {
    showError(error, "Your message could not be sent.");
  } finally {
    isSending = false;
    setComposerEnabled(Boolean(activeConversationId));
  }
}

/* ==========================================
   INITIALIZATION
   ========================================== */

async function initialize() {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) {
      setStatus("Sign in to use Grove Messages.", true);

      const form = $("#message-form");
      if (form) form.hidden = true;

      const list = $("#conversation-list");
      if (list) {
        list.textContent = "Sign in to view your conversations.";
      }

      setComposerEnabled(false);
      return;
    }

    setComposerEnabled(false);

    const form = $("#message-form");

    if (form) {
      form.addEventListener("submit", sendMessage);
    }

    const messageList = $("#message-list");

    if (messageList) {
      messageList.addEventListener(
        "click",
        handleMessageListClick
      );
    }

    const cancelReply = $("#cancel-message-reply");

    if (cancelReply) {
      cancelReply.addEventListener("click", clearReplyTarget);
    }

    await loadConversationList();

    setStatus("");
  } catch (error) {
    showError(error, "Messages could not load.");
  }
}

/* ==========================================
   CLEANUP
   ========================================== */

window.addEventListener("beforeunload", () => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
  }
});

initialize();
