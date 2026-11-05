export function installGroveNotifications(supabase) {
  "use strict";

  if (window.__groveNotificationsInstalled) return;
  window.__groveNotificationsInstalled = true;

  const SOUND_KEY = id => `grove:notification-sound:${id}`;
  const VOLUME_KEY = id => `grove:notification-volume:${id}`;

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
  let audioContext = null;
  let interacted = false;

  // Remove any notification interface left by an older script.
  function removeNotificationInterface() {
    document.querySelectorAll(
      ".grove-notification-control, " +
      ".grove-notification-panel, " +
      ".grove-notification-bell"
    ).forEach(element => element.remove());
  }

  removeNotificationInterface();

  // Keep notification sounds available after user interaction.
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
      const value = Number(
        localStorage.getItem(VOLUME_KEY(user.id))
      );

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

  async function showBrowserAlert(row) {
    if (
      !document.hidden ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification("Grove", {
        body: row.message || "You have a new notification.",
        icon: "/assets/neural-tree.svg",
        badge: "/assets/neural-tree.svg",
        tag: `grove-${row.id}`,
        data: {
          url: destinationFor(row)
        }
      });
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

          if (!row || !categoryEnabled(row.kind)) return;

          playNotificationSound();
          await showBrowserAlert(row);

          window.dispatchEvent(
            new CustomEvent("grove:notification-received", {
              detail: {
                kind: row.kind,
                message: row.message,
                created_at: row.created_at
              }
            })
          );
        }
      )
      .subscribe(status => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.warn(
            "Grove notification realtime connection:",
            status
          );
        }
      });
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.warn("Grove notification account check failed:", error);
      return;
    }

    user = data.user || null;

    removeNotificationInterface();

    if (!user) return;

    try {
      await loadPreferences();
      connectRealtime();

      window.GroveNotifications = Object.freeze({
        playTestSound: playNotificationSound,
        reloadPreferences: loadPreferences
      });
    } catch (error) {
      console.error(
        "Grove notification system could not initialize:",
        error
      );
    }
  }

  window.addEventListener(
    "grove:notification-preferences-updated",
    event => {
      preferences = {
        ...DEFAULTS,
        ...(event.detail || {})
      };
    }
  );

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      user = null;

      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      removeNotificationInterface();
      delete window.GroveNotifications;
    }

    if (event === "SIGNED_IN" && session?.user) {
      initialize();
    }
  });

  // Device alerts still require the service worker and permission.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch(error => {
        console.warn(
          "Grove service worker registration failed:",
          error
        );
      });
  }

  initialize();
}
