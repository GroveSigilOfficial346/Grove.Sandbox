import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);

let user = null;
let activeConversationId = null;
let activeChannel = null;
let conversations = [];

function setStatus(message, error = false) {
  const node = $("#messages-status");

  if (!node) return;

  node.textContent = message;
  node.style.color = error ? "#ff8585" : "";
}

async function getProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

async function loadConversationList() {
  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id,last_read_at")
    .eq("user_id", user.id);

  if (error) throw error;

  const ids = (memberships || []).map(
    (item) => item.conversation_id
  );

  const list = $("#conversation-list");
  list.replaceChildren();

  if (!ids.length) {
    const empty = document.createElement("p");

    empty.textContent =
      "No conversations yet. Open a member profile and select Message.";

    list.append(empty);
    return;
  }

  const { data: rows, error: conversationsError } =
    await supabase
      .from("conversations")
      .select("id,conversation_type,title,updated_at")
      .in("id", ids)
      .order("updated_at", { ascending: false });

  if (conversationsError) throw conversationsError;

  conversations = [];

  for (const conversation of rows || []) {
    const { data: members, error: memberError } =
      await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversation.id);

    if (memberError) continue;

    const other = (members || []).find(
      (member) => member.user_id !== user.id
    );

    const profile = other
      ? await getProfile(other.user_id)
      : null;

    const label =
      conversation.title ||
      profile?.display_name ||
      (profile?.username
        ? `@${profile.username}`
        : "Grove conversation");

    conversations.push({
      ...conversation,
      label
    });

    const button = document.createElement("button");

    button.type = "button";
    button.className = "conversation-item";
    button.textContent = label;

    button.addEventListener("click", () => {
      openConversation(conversation.id, label);
    });

    list.append(button);
  }

  const requestedUser =
    new URLSearchParams(location.search).get("user");

  if (requestedUser) {
    await startOrOpenDirectConversation(requestedUser);
  } else if (conversations.length && !activeConversationId) {
    await openConversation(
      conversations[0].id,
      conversations[0].label
    );
  }
}

async function startOrOpenDirectConversation(otherUserId) {
  if (!otherUserId || otherUserId === user.id) {
    setStatus("Choose another member to message.", true);
    return;
  }

  for (const conversation of conversations) {
    if (conversation.conversation_type !== "direct") continue;

    const { data: members } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversation.id);

    if (
      (members || []).some(
        (member) => member.user_id === otherUserId
      )
    ) {
      return openConversation(
        conversation.id,
        conversation.label
      );
    }
  }

  const { data: ownMemberships, error: membershipsError } =
    await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);

  if (membershipsError) throw membershipsError;

  const ownIds = (ownMemberships || []).map(
    (row) => row.conversation_id
  );

  if (ownIds.length) {
    const { data: shared } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", ownIds)
      .limit(1);

    if (shared?.length) {
      const id = shared[0].conversation_id;

      const known = conversations.find(
        (item) => item.id === id
      );

      return openConversation(
        id,
        known?.label || "Conversation"
      );
    }
  }

  const { data: target, error: targetError } =
    await supabase
      .from("profile_directory")
      .select("id,username,display_name")
      .eq("id", otherUserId)
      .maybeSingle();

  if (targetError || !target) {
    setStatus("That member could not be found.", true);
    return;
  }

  const { data: conversation, error: createError } =
    await supabase
      .from("conversations")
      .insert({
        conversation_type: "direct",
        created_by: user.id
      })
      .select("id")
      .single();

  if (createError) throw createError;

  const { error: addMembersError } = await supabase
    .from("conversation_members")
    .insert([
      {
        conversation_id: conversation.id,
        user_id: user.id,
        role: "owner"
      },
      {
        conversation_id: conversation.id,
        user_id: otherUserId,
        role: "member"
      }
    ]);

  if (addMembersError) {
    setStatus(addMembersError.message, true);
    return;
  }

  const label =
    target.display_name ||
    (target.username
      ? `@${target.username}`
      : "Conversation");

  conversations.unshift({
    id: conversation.id,
    conversation_type: "direct",
    label
  });

  await loadConversationList();

  await openConversation(conversation.id, label);
}

function renderMessage(message) {
  const article = document.createElement("article");

  article.className =
    message.sender_id === user.id
      ? "message-bubble own-message"
      : "message-bubble";

  const body = document.createElement("p");
  body.textContent = message.body ?? "";

  const time = document.createElement("time");

  time.dateTime = message.created_at;

  time.textContent = new Date(
    message.created_at
  ).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  article.append(body, time);

  return article;
}

async function loadMessages() {
  if (!activeConversationId) return;

  const { data, error } = await supabase
    .from("conversation_messages")
    .select(
      "id,conversation_id,sender_id,body,created_at,deleted_for_everyone_at"
    )
    .eq("conversation_id", activeConversationId)
    .is("deleted_for_everyone_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) throw error;

  const list = $("#message-list");
  list.replaceChildren();

  if (!data?.length) {
    const empty = document.createElement("p");

    empty.className = "empty-chat";
    empty.textContent =
      "This is the beginning of the conversation.";

    list.append(empty);
    return;
  }

  for (const message of data) {
    list.append(renderMessage(message));
  }

  list.scrollTop = list.scrollHeight;
}

async function openConversation(id, label) {
  activeConversationId = id;

  $("#chat-title").textContent =
    label || "Conversation";

  $("#chat-subtitle").textContent =
    "Private conversation";

  $("#message-input").disabled = false;
  $("#send-message").disabled = false;

  if (activeChannel) {
    await supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  await loadMessages();

  activeChannel = supabase
    .channel(`grove-chat-${id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_messages",
        filter: `conversation_id=eq.${id}`
      },
      (payload) => {
        const message = payload.new;

        if (message.sender_id === user.id) return;

        $("#message-list").append(
          renderMessage(message)
        );

        $("#message-list").scrollTop =
          $("#message-list").scrollHeight;
      }
    )
    .subscribe();
}

async function sendMessage(event) {
  event.preventDefault();

  const input = $("#message-input");
  const body = input.value.trim();

  if (!body || !activeConversationId) return;

  $("#send-message").disabled = true;

  const { error } = await supabase
    .from("conversation_messages")
    .insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      body
    });

  $("#send-message").disabled = false;

  if (error) {
    setStatus(error.message, true);
    return;
  }

  input.value = "";

  await loadMessages();
}

async function initialize() {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) {
      setStatus("Sign in to use Grove Messages.", true);
      $("#message-form").hidden = true;
      return;
    }

    $("#message-input").disabled = true;
    $("#send-message").disabled = true;

    $("#message-form").addEventListener(
      "submit",
      sendMessage
    );

    await loadConversationList();

    setStatus("");
  } catch (error) {
    console.error(error);

    setStatus(
      error.message || "Messages could not load.",
      true
    );
  }
}

window.addEventListener("beforeunload", () => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
  }
});

initialize();
