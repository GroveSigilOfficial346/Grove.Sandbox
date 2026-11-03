import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);

let user = null;
let activeConversationId = null;
let activeChannel = null;
let conversations = [];
let conversationLoadToken = 0;
let messageLoadToken = 0;

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
  if (button) button.disabled = !enabled;
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

async function removeActiveChannel() {
  if (!activeChannel) return;

  const channel = activeChannel;
  activeChannel = null;

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

function renderConversationButton(conversation) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "conversation-item";
  button.textContent = conversation.label;
  button.dataset.conversationId = conversation.id;

  if (conversation.id === activeConversationId) {
    button.classList.add("active");
    button.setAttribute("aria-current", "true");
  }

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

    empty.textContent =
      "No conversations yet. Open a member profile and select Message.";

    list.append(empty);
    return;
  }

  for (const conversation of conversations) {
    list.append(renderConversationButton(conversation));
  }
}

/*
 * Options prevent the requested-user URL from recursively reopening
 * itself when a new direct conversation is created.
 */
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

    return {
      ...conversation,
      label
    };
  });

  renderConversationList();

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

async function startOrOpenDirectConversation(targetUserId) {
  if (!targetUserId || targetUserId === user.id) {
    setStatus("Choose another member to message.", true);
    return;
  }

  setStatus("Opening conversation...");

  // The database function enforces message privacy and block rules.
  // It also prevents duplicate direct conversations.
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

  // Critical fix: do not process the URL target again here.
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

function renderMessage(message) {
  const article = document.createElement("article");

  article.className =
    message.sender_id === user.id
      ? "message-bubble own-message"
      : "message-bubble";

  article.dataset.messageId = message.id;

  const body = document.createElement("p");
  body.textContent = message.body ?? "";

  const time = document.createElement("time");
  time.dateTime = message.created_at;
  time.textContent = formatTime(message.created_at);

  article.append(body, time);

  return article;
}

function scrollMessagesToBottom() {
  const list = $("#message-list");
  if (!list) return;

  list.scrollTop = list.scrollHeight;
}

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
}

async function loadMessages() {
  if (!activeConversationId) return;

  const conversationId = activeConversationId;
  const token = ++messageLoadToken;

  const { data, error } = await supabase
    .from("conversation_messages")
    .select(
      "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at"
    )
    .eq("conversation_id", conversationId)
    .is("deleted_for_everyone_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

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

  if (!data?.length) {
    const empty = document.createElement("p");

    empty.className = "empty-chat";
    empty.textContent =
      "This is the beginning of the conversation.";

    list.append(empty);
  } else {
    for (const message of data) {
      list.append(renderMessage(message));
    }
  }

  scrollMessagesToBottom();

  await updateReadMarker(conversationId);
}

async function openConversation(id, label) {
  if (!id) return;

  activeConversationId = id;
  messageLoadToken++;

  const title = $("#chat-title");
  const subtitle = $("#chat-subtitle");

  if (title) title.textContent = label || "Conversation";
  if (subtitle) subtitle.textContent = "Private conversation";

  setComposerEnabled(true);
  renderConversationList();

  await removeActiveChannel();

  await loadMessages();

  // Do not attach a channel if the user switched conversations while loading.
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
          message.sender_id === user.id ||
          message.deleted_for_everyone_at
        ) {
          return;
        }

        const list = $("#message-list");
        if (!list) return;

        // Avoid rendering a duplicate if the message was already loaded.
        if (
          list.querySelector(
            `[data-message-id="${message.id}"]`
          )
        ) {
          return;
        }

        const empty = list.querySelector(".empty-chat");
        if (empty) empty.remove();

        list.append(renderMessage(message));
        scrollMessagesToBottom();

        await updateReadMarker(id);
      }
    )
    .subscribe((status) => {
      if (activeConversationId !== id) return;

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setStatus(
          "Live updates are temporarily unavailable. You can still refresh the conversation.",
          true
        );
      }
    });

  activeChannel = channel;
}

async function sendMessage(event) {
  event.preventDefault();

  const input = $("#message-input");
  const button = $("#send-message");

  if (!input || !button || !activeConversationId) return;

  const body = input.value.trim();

  if (!body) return;

  if (body.length > 5000) {
    setStatus("Messages must be 5,000 characters or fewer.", true);
    return;
  }

  const conversationId = activeConversationId;

  button.disabled = true;
  setStatus("Sending...");

  try {
    const { error } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body
      });

    if (error) throw error;

    input.value = "";

    if (activeConversationId === conversationId) {
      await loadMessages();
    }

    setStatus("");
  } catch (error) {
    showError(error, "Your message could not be sent.");
  } finally {
    button.disabled = !activeConversationId;
  }
}

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

    await loadConversationList();

    setStatus("");
  } catch (error) {
    showError(error, "Messages could not load.");
  }
}

window.addEventListener("beforeunload", () => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
  }
});

initialize();
