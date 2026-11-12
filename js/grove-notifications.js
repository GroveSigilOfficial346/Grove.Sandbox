export function installGroveNotifications(supabase) {
  "use strict";

  if (window.__groveNotificationsInstalled) return;
  window.__groveNotificationsInstalled = true;

  const SOUND_KEY = id => `grove:notification-sound:${id}`;
  const VOLUME_KEY = id => `grove:notification-volume:${id}`;
  const TONE_KEY = id => `grove:notification-tone:${id}`;

  const DEFAULTS = {
    notify_messages: true,
    notify_follows: true,
    notify_likes: true,
    notify_comments: true,
    notify_nudges: true,
    notify_mentions: true
  };

  const TONES = {
    classic: [
      { frequency: 660, start: 0, duration: 0.12 },
      { frequency: 880, start: 0.14, duration: 0.17 }
    ],
    soft: [
      { frequency: 523, start: 0, duration: 0.19 },
      { frequency: 659, start: 0.21, duration: 0.22 }
    ],
    digital: [
      { frequency: 880, start: 0, duration: 0.07, type: "square" },
      { frequency: 1175, start: 0.09, duration: 0.07, type: "square" },
      { frequency: 880, start: 0.18, duration: 0.09, type: "square" }
    ],
    gothic: [
      { frequency: 392, start: 0, duration: 0.25 },
      { frequency: 523, start: 0.28, duration: 0.25 },
      { frequency: 659, start: 0.56, duration: 0.3 }
    ],
    pulse: [
      { frequency: 740, start: 0, duration: 0.09, type: "triangle" },
      { frequency: 740, start: 0.2, duration: 0.09, type: "triangle" },
      { frequency: 988, start: 0.4, duration: 0.16, type: "triangle" }
    ]
  };

  let user = null;
  let preferences = { ...DEFAULTS };
  let channel = null;
  let audioContext = null;
  let audioUnlocked = false;

  function getAudioContext() {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    return audioContext;
  }

  function primeAudio() {
    try {
      const context = getAudioContext();
      if (!context) return;

      audioUnlocked = true;

      if (context.state === "suspended") {
        context.resume().catch(error => {
          console.warn("Grove audio could not resume:", error);
        });
      }
    } catch (error) {
      console.warn("Grove audio could not initialize:", error);
    }
  }

  document.addEventListener("pointerdown", primeAudio, {
    once: true,
    passive: true
  });

  document.addEventListener("keydown", primeAudio, {
    once: true
  });

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
    if (!user) return false;

    try {
      return localStorage.getItem(SOUND_KEY(user.id)) !== "false";
    } catch {
      return true;
    }
  }

  function soundVolume() {
    if (!user) return 0.35;

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

  function selectedTone() {
    if (!user) return "classic";

    try {
      const value = localStorage.getItem(TONE_KEY(user.id));

      return Object.hasOwn(TONES, value) ? value : "classic";
    } catch {
      return "classic";
    }
  }

  async function playNotificationSound(force = false) {
    if (!user || (!force && (!audioUnlocked || !soundEnabled()))) {
      return false;
    }

    try {
      const context = getAudioContext();
      if (!context) return false;

      if (context.state === "suspended") {
        await context.resume();
      }

      if (context.state !== "running") return false;

      const volume = soundVolume();

      if (volume <= 0) return false;

      const notes = TONES[selectedTone()] || TONES.classic;
      const now = context.currentTime;

      for (const note of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = note.type || "sine";
        oscillator.frequency.setValueAtTime(
          note.frequency,
          now + note.start
        );

        const peak = volume * 0.12;

        gain.gain.setValueAtTime(0.0001, now + note.start);
        gain.gain.linearRampToValueAtTime(
          peak,
          now + note.start + 0.018
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + note.start + note.duration
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(now + note.start);
        oscillator.stop(now + note.start + note.duration + 0.02);
      }

      return true;
    } catch (error) {
      console.warn("Grove notification sound unavailable:", error);
      return false;
    }
  }

  async function loadPreferences() {
    if (!user) return;

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

    return preferences;
  }

  async function resolveActorName(actorId) {
    if (!actorId) return "";

    try {
      const { data, error } = await supabase
        .from("profile_directory")
        .select("display_name,username")
        .eq("id", actorId)
        .maybeSingle();

      if (error) throw error;

      return (
        data?.display_name?.trim() ||
        (data?.username ? `@${data.username}` : "") ||
        "Grove member"
      );
    } catch (error) {
      console.warn("Could not resolve notification sender:", error);
      return "Grove member";
    }
  }

  async function enrichNotification(row) {
    if (!row) return row;

    const actorName = await resolveActorName(row.actor_id);

    return {
      ...row,
      actor_name: actorName
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

      const body = [
        row.actor_name,
        row.message || "You have a new notification."
      ].filter(Boolean).join(" ");

      await registration.showNotification("Grove", {
        body,
        icon: "/assets/neural-tree.svg",
        badge: "/assets/neural-tree.svg",
        tag: `grove-${row.id}`,
        data: {
          url: destinationFor(row),
          actor_id: row.actor_id || null,
          actor_name: row.actor_name || ""
        }
      });
    } catch (error) {
      console.warn("Grove browser alert failed:", error);
    }
  }

  function disconnectRealtime() {
    if (!channel) return;

    const previous = channel;
    channel = null;

    supabase.removeChannel(previous);
  }

  function connectRealtime() {
    disconnectRealtime();

    if (!user) return;

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

          // Play immediately; do not wait for sender-name lookup.
          if (row.kind === "message") {
            playNotificationSound();
          } else {
            playNotificationSound();
          }

          const enriched = await enrichNotification(row);

          await showBrowserAlert(enriched);

          window.dispatchEvent(
            new CustomEvent("grove:notification-received", {
              detail: {
                id: enriched.id,
                kind: enriched.kind,
                message: enriched.message,
                actor_id: enriched.actor_id || null,
                actor_name: enriched.actor_name || "",
                created_at: enriched.created_at
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
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      user = data.user || null;

      if (!user) {
        disconnectRealtime();
        delete window.GroveNotifications;
        return;
      }

      await loadPreferences();
      connectRealtime();

      window.GroveNotifications = Object.freeze({
        playTestSound: () => playNotificationSound(true),
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
      disconnectRealtime();
      delete window.GroveNotifications;
    }

    if (event === "SIGNED_IN" && session?.user) {
      initialize();
    }
  });

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
