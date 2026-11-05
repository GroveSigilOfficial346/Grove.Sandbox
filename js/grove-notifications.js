export function installGroveNotifications(supabase) {
  "use strict";

  if (window.__groveNotificationsInstalled) return;
  window.__groveNotificationsInstalled = true;

  const SOUND_KEY = userId =>
    `grove:notification-sound:${userId}`;

  const VOLUME_KEY = userId =>
    `grove:notification-volume:${userId}`;

  const DEFAULTS = {
    notify_messages: true,
    notify_follows: true,
    notify_likes: true,
    notify_comments: true,
    notify_nudges: true,
    notify_mentions: true
  };

  let user = null;
  let preferences = { ...DEFAULTS };
  let channel = null;
  let rows = [];
  let audioContext = null;
  let interacted = false;
  let bell = null;
  let badge = null;
  let panel = null;
  let list = null;

  const style = document.createElement("style");

  style.textContent = `
    .grove-notification-control {
      position: relative;
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      z-index: 10001;
    }

    .grove-notification-bell {
      position: relative;
      min-width: 40px;
      min-height: 38px;
      border: 1px solid rgba(133,30,255,.55);
      border-radius: 9px;
      background: rgba(133,30,255,.18);
      color: #f7f5ff;
      font-size: 1.1rem;
      cursor: pointer;
    }

    .grove-notification-bell:hover {
      border-color: #05c9f4;
      background: rgba(133,30,255,.35);
    }

    .grove-notification-count {
      position: absolute;
      top: -7px;
      right: -7px;
      min-width: 18px;
      padding: 2px 5px;
      border-radius: 20px;
      background: #eb36ed;
      color: white;
      font-size: .65rem;
      font-weight: 800;
    }

    .grove-notification-count[hidden] {
      display: none;
    }

    .grove-notification-panel {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: min(370px, calc(100vw - 24px));
      max-height: min(570px, 75vh);
      overflow: auto;
      padding: 14px;
      border: 1px solid rgba(133,30,255,.5);
      border-radius: 14px;
      background: rgba(10,5,29,.98);
      color: #f7f5ff;
      box-shadow: 0 16px 48px rgba(0,0,0,.5);
      backdrop-filter: blur(18px);
    }

    .grove-notification-panel[hidden] {
      display: none;
    }

    .grove-notification-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .grove-notification-heading h2 {
      margin: 0;
      font-size: 1rem;
    }

    .grove-notification-heading button,
    .grove-notification-settings {
      border: 0;
      background: transparent;
      color: #05c9f4;
      font: inherit;
      font-size: .78rem;
      cursor: pointer;
    }

    .grove-notification-item {
      display: block;
      width: 100%;
      padding: 12px 10px;
      margin: 5px 0;
      border: 1px solid rgba(190,155,255,.12);
      border-radius: 9px;
      background: rgba(133,30,255,.08);
      color: #f7f5ff;
      text-align: left;
      cursor: pointer;
    }

    .grove-notification-item:hover {
      border-color: rgba(5,201,244,.5);
      background: rgba(133,30,255,.18);
    }

    .grove-notification-item.unread {
      border-left: 3px solid #05c9f4;
      background: rgba(133,30,255,.2);
    }

    .grove-notification-message {
      display: block;
      font-size: .85rem;
      line-height: 1.45;
    }

    .grove-notification-date {
      display: block;
      margin-top: 5px;
      color: #aaa1c8;
      font-size: .7rem;
    }

    .grove-notification-empty {
      padding: 22px 8px;
      color: #aaa1c8;
      text-align: center;
      font-size: .85rem;
    }

    .grove-notification-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(190,155,255,.16);
    }

    @media (max-width: 600px) {
      .grove-notification-panel {
        position: fixed;
        top: 64px;
        right: 12px;
        max-height: calc(100dvh - 88px);
      }
    }
  `;

  document.head.append(style);

  document.addEventListener("pointerdown", () => {
    interacted = true;
  }, { once: true });

  document.addEventListener("keydown", () => {
    interacted = true;
  }, { once: true });

  function categoryEnabled(kind) {
    switch (kind) {
      case "message":
        return preferences.notify_messages;

      case "follow":
      case "follow_request":
        return preferences.notify_follows;

      case "like":
        return preferences.notify_likes;

      case "comment":
        return preferences.notify_comments;

      case "nudge":
        return preferences.notify_nudges;

      case "mention":
        return preferences.notify_mentions;

      default:
        return true;
    }
  }

  function soundEnabled() {
    try {
      return localStorage.getItem(SOUND_KEY(user.id)) !== "false";
    } catch {
      return true;
    }
  }

  function soundVolume() {
    try {
      const value = Number(localStorage.getItem(VOLUME_KEY(user.id)));
      return Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : 0.35;
    } catch {
      return 0.35;
    }
  }

  function playNotificationSound() {
    if (!user || !interacted || !soundEnabled()) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      audioContext ||= new AudioContextClass();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const now = audioContext.currentTime;
      const volume = soundVolume();

      [
        { frequency: 660, start: 0, duration: 0.12 },
        { frequency: 880, start: 0.13, duration: 0.16 }
      ].forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = note.frequency;

        gain.gain.setValueAtTime(0, now + note.start);
        gain.gain.linearRampToValueAtTime(
          volume * 0.12,
          now + note.start + 0.02
        );
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now + note.start + note.duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(now + note.start);
        oscillator.stop(now + note.start + note.duration);
      });
    } catch (error) {
      console.warn("Grove notification sound unavailable:", error);
    }
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short"
    });
  }

  function destinationFor(row) {
    if (row.kind === "message") {
      return "/messages.html";
    }

    if (row.post_id) {
      return "/community.html?post=" +
        encodeURIComponent(row.post_id);
    }

    if (row.actor_id) {
      return "/profile.html?id=" +
        encodeURIComponent(row.actor_id);
    }

    return "/settings.html";
  }

  function createInterface() {
    if (bell) return;

    const target = document.querySelector(
      ".site-header nav, .messages-navigation, .account-navigation"
    );

    if (!target) return;

    const control = document.createElement("div");
    control.className = "grove-notification-control";

    bell = document.createElement("button");
    bell.type = "button";
    bell.className = "grove-notification-bell";
    bell.textContent = "♧";
    bell.setAttribute("aria-label", "Notifications");
    bell.setAttribute("aria-expanded", "false");

    badge = document.createElement("span");
    badge.className = "grove-notification-count";
    badge.hidden = true;

    bell.append(badge);

    panel = document.createElement("section");
    panel.className = "grove-notification-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Grove notifications");

    const heading = document.createElement("div");
    heading.className = "grove-notification-heading";

    const title = document.createElement("h2");
    title.textContent = "Notifications";

    const markAll = document.createElement("button");
    markAll.type = "button";
    markAll.textContent = "Mark all read";
    markAll.addEventListener("click", markAllRead);

    heading.append(title, markAll);

    list = document.createElement("div");

    const footer = document.createElement("div");
    footer.className = "grove-notification-footer";

    const settingsLink = document.createElement("a");
    settingsLink.href = "/settings.html";
    settingsLink.className = "grove-notification-settings";
    settingsLink.textContent = "Notification settings";

    const viewAll = document.createElement("a");
    viewAll.href = "/settings.html";
    viewAll.className = "grove-notification-settings";
    viewAll.textContent = "Manage";

    footer.append(settingsLink, viewAll);
    panel.append(heading, list, footer);
    control.append(bell, panel);
    target.append(control);

    bell.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      bell.setAttribute(
        "aria-expanded",
        String(!panel.hidden)
      );

      if (!panel.hidden) loadNotifications();
    });

    document.addEventListener("click", event => {
      if (!control.contains(event.target)) {
        panel.hidden = true;
        bell.setAttribute("aria-expanded", "false");
      }
    });
  }

  function updateCount() {
    const unread = rows.filter(
      row => !row.read_at && categoryEnabled(row.kind)
    ).length;

    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
    bell.setAttribute(
      "aria-label",
      unread
        ? `${unread} unread notifications`
        : "Notifications"
    );
  }

  async function loadPreferences() {
    const { data, error } = await supabase
      .from("user_preferences")
      .select(
        "notify_messages,notify_follows,notify_likes," +
        "notify_comments,notify_nudges,notify_mentions"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    preferences = {
      ...DEFAULTS,
      ...(data || {})
    };
  }

  async function loadNotifications() {
    if (!user || !list) return;

    list.replaceChildren();

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id,recipient_id,actor_id,kind,post_id,message,created_at,read_at"
      )
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      list.textContent = "Could not load notifications.";
      console.error("Grove notifications:", error);
      return;
    }

    rows = (data || []).filter(row =>
      categoryEnabled(row.kind)
    );

    updateCount();

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "grove-notification-empty";
      empty.textContent = "You're all caught up.";
      list.append(empty);
      return;
    }

    let actors = new Map();

    const actorIds = [
      ...new Set(
        rows.map(row => row.actor_id).filter(Boolean)
      )
    ];

    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profile_directory")
        .select("id,username,display_name")
        .in("id", actorIds);

      actors = new Map(
        (profiles || []).map(profile => [
          profile.id,
          profile.display_name ||
            (profile.username ? "@" + profile.username : "A member")
        ])
      );
    }

    for (const row of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "grove-notification-item" +
        (row.read_at ? "" : " unread");

      const actor = actors.get(row.actor_id) ||
        (row.kind === "system" ? "Grove" : "A member");

      const message = document.createElement("span");
      message.className = "grove-notification-message";
      message.textContent =
        row.kind === "system"
          ? row.message || "Grove has an update for you."
          : `${actor} ${row.message || "sent you a notification."}`;

      const date = document.createElement("span");
      date.className = "grove-notification-date";
      date.textContent = formatDate(row.created_at);

      button.append(message, date);

      button.addEventListener("click", async () => {
        if (!row.read_at) {
          await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("recipient_id", user.id);
        }

        window.location.href = destinationFor(row);
      });

      list.append(button);
    }
  }

  async function markAllRead() {
    if (!user) return;

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("Could not mark notifications read:", error);
      return;
    }

    await loadNotifications();
  }

  async function showBrowserAlert(row) {
    if (
      !document.hidden ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification(
        "Grove",
        {
          body: row.message || "You have a new notification.",
          icon: "/assets/neural-tree.svg",
          badge: "/assets/neural-tree.svg",
          tag: `grove-${row.id}`,
          data: {
            url: destinationFor(row)
          }
        }
      );
    } catch (error) {
      console.warn("Grove browser alert failed:", error);
    }
  }

  function connectRealtime() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    channel = supabase
      .channel(`grove-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`
        },
        async payload => {
          const row = payload.new;

          if (categoryEnabled(row.kind)) {
            playNotificationSound();
            await showBrowserAlert(row);
          }

          await loadNotifications();
        }
      )
      .subscribe();
  }

  async function removeCurrentDeviceSubscription() {
    if (!user || !("serviceWorker" in navigator)) return;

    try {
      const registration =
        await navigator.serviceWorker.getRegistration(
          "/service-worker.js"
        );

      const subscription =
        await registration?.pushManager.getSubscription();

      if (!subscription) return;

      const endpoint = subscription.endpoint;

      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);

      if (error) {
        console.warn("Could not remove device subscription:", error);
      }

      await subscription.unsubscribe();

    } catch (error) {
      console.warn("Device notification cleanup failed:", error);
    }
  }

  function exposeControls() {
    window.GroveNotifications = Object.freeze({
      reload: loadNotifications,
      removeCurrentDeviceSubscription,
      playTestSound: playNotificationSound
    });
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.warn("Grove notification account check failed:", error);
      return;
    }

    user = data.user || null;

    if (!user) return;

    createInterface();

    if (!bell) return;

    try {
      await loadPreferences();
      await loadNotifications();
      connectRealtime();
      exposeControls();
    } catch (error) {
      console.error("Grove notifications could not initialize:", error);
    }
  }

  // Remove the current device's subscription before account sign-out.
  if (!supabase.auth.__groveSignOutWrapped) {
    const originalSignOut = supabase.auth.signOut.bind(supabase.auth);

    supabase.auth.signOut = async (...args) => {
      await removeCurrentDeviceSubscription();
      return originalSignOut(...args);
    };

    supabase.auth.__groveSignOutWrapped = true;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      user = null;
      rows = [];

      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      document.querySelector(
        ".grove-notification-control"
      )?.remove();

      bell = null;
      badge = null;
      panel = null;
      list = null;
    }

    if (event === "SIGNED_IN" && session?.user) {
      initialize();
    }
  });

  window.addEventListener(
    "grove:notification-preferences-updated",
    async event => {
      preferences = {
        ...DEFAULTS,
        ...(event.detail || {})
      };

      await loadNotifications();
    }
  );

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js")
      .catch(error => {
        console.warn("Grove service worker registration failed:", error);
      });
  }

  initialize();
}
