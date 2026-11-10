import { supabase } from "./supabase.js";
import {
  Room,
  RoomEvent,
  createLocalTracks
} from "https://cdn.jsdelivr.net/npm/livekit-client@2/+esm";

const $ = (id) => document.getElementById(id);

const statusNode = $("live-status");
const liveList = $("live-list");
const stage = $("video-stage");

let currentRoom = null;
let currentRoomId = null;
let currentIsHost = false;
let chatChannel = null;
let localTracks = [];

let cameraEnabled = true;
let micEnabled = true;

function status(message, error = false) {
  statusNode.textContent = message;
  statusNode.style.color = error ? "#ff8585" : "#05c9f4";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

async function getSession() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error("Sign in to Grove before joining a live broadcast.");
  }

  return session;
}

async function getLiveToken(roomId) {
  const { data, error } = await supabase.functions.invoke(
    "live-token",
    {
      body: { room_id: roomId }
    }
  );

  if (error) throw error;

  if (!data?.token || !data?.server_url) {
    throw new Error(data?.error || "Live video is not configured.");
  }

  return data;
}

async function loadBroadcasts() {
  liveList.innerHTML =
    '<p class="muted">Loading broadcasts…</p>';

  const { data, error } = await supabase
    .from("live_rooms")
    .select("id,title,host_id,created_at")
    .eq("is_live", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    liveList.innerHTML =
      '<p class="muted">Could not load broadcasts. Sign in and refresh.</p>';
    return;
  }

  if (!data?.length) {
    liveList.innerHTML =
      '<p class="muted">No one is live right now. Start the first broadcast.</p>';
    return;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  liveList.innerHTML = data.map((room) => `
    <article class="live-card">
      <span class="live-badge">● LIVE NOW</span>
      <h3>${escapeHtml(room.title)}</h3>
      <p>Host · ${escapeHtml(room.host_id.slice(0, 8))}</p>

      ${
        user?.id === room.host_id
          ? "<p>You are hosting this broadcast in another session.</p>"
          : `<button type="button" data-join="${room.id}">Join live</button>`
      }
    </article>
  `).join("");
}

function attachTrack(track, participant) {
  const element = track.attach();

  if (track.kind === "video") {
    stage.querySelector(".stage-placeholder")?.remove();

    element.autoplay = true;
    element.playsInline = true;
    element.dataset.participant = participant.identity;

    stage.append(element);
  } else {
    element.autoplay = true;
    element.dataset.participant = participant.identity;
    element.style.position = "absolute";
    element.style.width = "1px";
    element.style.height = "1px";
    element.style.opacity = "0";

    stage.append(element);
  }
}

function removeTrack(track) {
  track.detach().forEach((element) => element.remove());
}

function updateViewerCount() {
  if (!currentRoom) return;

  $("viewer-label").textContent =
    `${currentRoom.numParticipants + 1} connected`;
}

function renderMessage(message) {
  const list = $("live-chat-list");

  if (list.querySelector(`[data-message="${message.id}"]`)) {
    return;
  }

  const node = document.createElement("div");
  node.className = "chat-message";
  node.dataset.message = message.id;

  const name = document.createElement("strong");
  name.textContent = message.sender_id.slice(0, 8);

  const body = document.createElement("span");
  body.textContent = message.body;

  const time = document.createElement("time");
  time.textContent = new Date(
    message.created_at
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  node.append(name, body, time);
  list.append(node);

  list.scrollTop = list.scrollHeight;
}

async function loadChat(roomId) {
  $("live-chat-list").replaceChildren();

  const { data } = await supabase
    .from("live_chat_messages")
    .select("id,sender_id,body,created_at")
    .eq("live_room_id", roomId)
    .order("created_at")
    .limit(100);

  data?.forEach(renderMessage);

  chatChannel = supabase
    .channel("live-chat-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "live_chat_messages",
        filter: "live_room_id=eq." + roomId
      },
      (payload) => renderMessage(payload.new)
    )
    .subscribe();
}

async function connectToRoom(roomId) {
  await getSession();

  const credentials = await getLiveToken(roomId);

  const room = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  currentRoom = room;
  currentRoomId = roomId;
  currentIsHost = credentials.is_host;

  room.on(
    RoomEvent.TrackSubscribed,
    (track, publication, participant) => {
      attachTrack(track, participant);
    }
  );

  room.on(
    RoomEvent.TrackUnsubscribed,
    (track) => removeTrack(track)
  );

  room.on(RoomEvent.ParticipantConnected, updateViewerCount);
  room.on(RoomEvent.ParticipantDisconnected, updateViewerCount);

  await room.connect(credentials.server_url, credentials.token);

  $("active-session").hidden = false;
  $("end-live-button").hidden = !currentIsHost;

  $("camera-button").disabled = !currentIsHost;
  $("mic-button").disabled = !currentIsHost;

  $("viewer-label").textContent = currentIsHost
    ? "You are hosting"
    : "You are watching";

  if (currentIsHost) {
    localTracks = await createLocalTracks({
      audio: true,
      video: { facingMode: "user" }
    });

    for (const track of localTracks) {
      await room.localParticipant.publishTrack(track);

      if (track.kind === "video") {
        attachTrack(track, room.localParticipant);
      }
    }
  }

  await loadChat(roomId);
  updateViewerCount();

  $("active-session").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function leaveRoom() {
  if (chatChannel) {
    await supabase.removeChannel(chatChannel);
    chatChannel = null;
  }

  if (currentRoom) {
    await currentRoom.disconnect();
  }

  localTracks.forEach((track) => {
    try {
      track.stop();
    } catch {}
  });

  localTracks = [];
  currentRoom = null;
  currentRoomId = null;
  currentIsHost = false;

  stage.innerHTML = `
    <div class="stage-placeholder">
      <span>◉</span>
      <p>Waiting for video…</p>
    </div>
  `;

  $("active-session").hidden = true;
}

$("start-live-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("start-live-button");
  button.disabled = true;

  try {
    const session = await getSession();
    const title = $("live-title").value.trim();

    if (!title) {
      throw new Error("Enter a broadcast title.");
    }

    const roomName = "grove-" + crypto.randomUUID();

    const { data, error } = await supabase
      .from("live_rooms")
      .insert({
        host_id: session.user.id,
        title,
        room_name: roomName
      })
      .select("id")
      .single();

    if (error) throw error;

    $("session-title").textContent = title;

    await connectToRoom(data.id);

    status("You are live. Share the Grove Live page with viewers.");

    await loadBroadcasts();
  } catch (error) {
    status(
      error.message || "Could not start broadcast.",
      true
    );
  } finally {
    button.disabled = false;
  }
});

liveList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-join]");

  if (!button) return;

  button.disabled = true;

  try {
    const { data, error } = await supabase
      .from("live_rooms")
      .select("id,title")
      .eq("id", button.dataset.join)
      .eq("is_live", true)
      .single();

    if (error) throw error;

    $("session-title").textContent = data.title;

    await connectToRoom(data.id);

    status("Connected to live broadcast.");
  } catch (error) {
    status(
      error.message || "Could not join broadcast.",
      true
    );
  } finally {
    button.disabled = false;
  }
});

$("end-live-button").addEventListener("click", async () => {
  if (!currentRoomId || !currentIsHost) return;

  const button = $("end-live-button");
  button.disabled = true;

  try {
    const { error } = await supabase
      .from("live_rooms")
      .update({
        is_live: false,
        ended_at: new Date().toISOString()
      })
      .eq("id", currentRoomId);

    if (error) throw error;

    await leaveRoom();

    status("Broadcast ended.");

    await loadBroadcasts();
  } catch (error) {
    status(
      error.message || "Could not end broadcast.",
      true
    );
  } finally {
    button.disabled = false;
  }
});

$("camera-button").addEventListener("click", async () => {
  if (!currentRoom) return;

  cameraEnabled = !cameraEnabled;

  await currentRoom.localParticipant.setCameraEnabled(
    cameraEnabled
  );

  $("camera-button").textContent = cameraEnabled
    ? "Camera on"
    : "Camera off";
});

$("mic-button").addEventListener("click", async () => {
  if (!currentRoom) return;

  micEnabled = !micEnabled;

  await currentRoom.localParticipant.setMicrophoneEnabled(
    micEnabled
  );

  $("mic-button").textContent = micEnabled
    ? "Mic on"
    : "Mic muted";
});

$("live-chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentRoomId) return;

  const input = $("live-chat-input");
  const body = input.value.trim();

  if (!body) return;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return status("Sign in to chat.", true);
  }

  const { error } = await supabase
    .from("live_chat_messages")
    .insert({
      live_room_id: currentRoomId,
      sender_id: user.id,
      body
    });

  if (error) {
    return status(error.message, true);
  }

  input.value = "";
});

$("refresh-live").addEventListener("click", loadBroadcasts);

window.addEventListener("beforeunload", () => {
  currentRoom?.disconnect();
});

await loadBroadcasts();

const {
  data: { user }
} = await supabase.auth.getUser();

if (!user) {
  status("Sign in to Grove to host or join live broadcasts.");
}
