import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const status = $("settings-status");
  const deviceStatus = $("device-status");

  const preferenceFields = {
    "notify-messages": "notify_messages",
    "notify-follows": "notify_follows",
    "notify-likes": "notify_likes",
    "notify-comments": "notify_comments",
    "notify-nudges": "notify_nudges",
    "notify-mentions": "notify_mentions"
  };

  const DEFAULTS = {
    notify_messages: true,
    notify_follows: true,
    notify_likes: true,
    notify_comments: true,
    notify_nudges: true,
    notify_mentions: true
  };

  const SOUND_KEY = userId =>
    `grove:notification-sound:${userId}`;

  const VOLUME_KEY = userId =>
    `grove:notification-volume:${userId}`;

  const TONE_KEY = userId =>
    `grove:notification-tone:${userId}`;

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
  let saving = false;
  let audioContext = null;

  function setStatus(message, error = false) {
    if (!status) return;

    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function setDeviceStatus(message, error = false) {
    if (!deviceStatus) return;

    deviceStatus.textContent = message;
    deviceStatus.style.color = error ? "#ff8585" : "";
  }

  function soundEnabled() {
    if (!user) return true;

    try {
      return localStorage.getItem(SOUND_KEY(user.id)) !== "false";
    } catch {
      return true;
    }
  }

  function soundVolume() {
    if (!user) return 0.35;

    try {
      const value = Number(localStorage.getItem(VOLUME_KEY(user.id)));

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

  function getAudioContext() {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    return audioContext;
  }

  async function playPreview() {
    const context = getAudioContext();

    if (!context) {
      setStatus(
        "Audio preview is not supported in this browser.",
        true
      );
      return;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }

      if (context.state !== "running") {
        throw new Error("Browser audio is not available.");
      }

      const volume = Number($("sound-volume")?.value ?? 0.35);

      if (volume <= 0) {
        setStatus("Increase the volume to preview the sound.", true);
        return;
      }

      const tone = $("sound-tone")?.value || selectedTone();
      const notes = TONES[tone] || TONES.classic;
      const now = context.currentTime;

      for (const note of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = note.type || "sine";
        oscillator.frequency.setValueAtTime(
          note.frequency,
          now + note.start
        );

        gain.gain.setValueAtTime(0.0001, now + note.start);
        gain.gain.linearRampToValueAtTime(
          volume * 0.12,
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

      setStatus("Playing sound preview.");

    } catch (error) {
      console.error("Grove sound preview failed:", error);
      setStatus(
        error.message || "Could not play the sound preview.",
        true
      );
    }
  }

  async function savePreference(column, value) {
    if (!user || saving) return;

    saving = true;

    try {
      const update = {
        [column]: value,
        updated_at: new Date().toISOString()
      };

      const result = await supabase
        .from("user_preferences")
        .update(update)
        .eq("user_id", user.id)
        .select("user_id")
        .maybeSingle();

      if (result.error) throw result.error;

      if (!result.data) {
        const insert = await supabase
          .from("user_preferences")
          .insert({
            user_id: user.id,
            [column]: value
          })
          .select("user_id")
          .maybeSingle();

        if (insert.error) throw insert.error;

        if (!insert.data) {
          throw new Error("Your preference could not be saved.");
        }
      }

      setStatus("Notification preferences saved.");

      window.dispatchEvent(
        new CustomEvent("grove:notification-preferences-updated", {
          detail: { [column]: value }
        })
      );

    } catch (error) {
      console.error("Grove preference save failed:", error);
      setStatus(
        error.message || "Could not save this preference.",
        true
      );

      await loadPreferences();

    } finally {
      saving = false;
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

    const preferences = {
      ...DEFAULTS,
      ...(data || {})
    };

    for (const [id, column] of Object.entries(preferenceFields)) {
      const field = $(id);
      if (field) field.checked = Boolean(preferences[column]);
    }
  }

  function connectSoundControls() {
    const enabled = $("sound-enabled");
    const volume = $("sound-volume");
    const tone = $("sound-tone");
    const preview = $("test-sound");
    const volumeValue = $("sound-volume-value");

    if (enabled) {
      enabled.checked = soundEnabled();

      enabled.addEventListener("change", () => {
        try {
          localStorage.setItem(
            SOUND_KEY(user.id),
            enabled.checked ? "true" : "false"
          );

          setStatus(
            enabled.checked
              ? "Notification sounds enabled on this device."
              : "Notification sounds disabled on this device."
          );
        } catch (error) {
          console.error(error);
          setStatus(
            "Could not save the sound preference.",
            true
          );
        }
      });
    }

    if (volume) {
      volume.value = String(soundVolume());

      if (volumeValue) {
        volumeValue.value = `${Math.round(Number(volume.value) * 100)}%`;
        volumeValue.textContent = volumeValue.value;
      }

      volume.addEventListener("input", () => {
        const currentVolume = Number(volume.value);

        if (volumeValue) {
          volumeValue.value = `${Math.round(currentVolume * 100)}%`;
          volumeValue.textContent = volumeValue.value;
        }

        try {
          localStorage.setItem(
            VOLUME_KEY(user.id),
            String(currentVolume)
          );
        } catch (error) {
          console.error("Could not save sound volume:", error);
        }
      });
    }

    if (tone) {
      tone.value = selectedTone();

      tone.addEventListener("change", () => {
        try {
          const value = TONES[tone.value] ? tone.value : "classic";

          localStorage.setItem(TONE_KEY(user.id), value);
          setStatus("Notification sound style saved.");
        } catch (error) {
          console.error(error);
          setStatus(
            "Could not save the sound style.",
            true
          );
        }
      });
    }

    preview?.addEventListener("click", playPreview);
  }

  async function updateDeviceStatus() {
    if (!("Notification" in window)) {
      setDeviceStatus(
        "This browser does not support device notifications.",
        true
      );
      return;
    }

    const permission = Notification.permission;

    if (permission === "denied") {
      setDeviceStatus(
        "Notifications are blocked in browser settings. Change the permission there to allow Grove alerts.",
        true
      );
      return;
    }

    if (permission === "granted") {
      setDeviceStatus(
        "Browser permission is allowed on this device. Remote push delivery still needs Grove's push sender to be configured."
      );
      return;
    }

    setDeviceStatus(
      "Device notifications are not enabled yet."
    );
  }

  async function enableDeviceNotifications() {
    if (!("Notification" in window)) {
      setDeviceStatus(
        "This browser does not support notifications.",
        true
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        await updateDeviceStatus();

        if (permission === "denied") {
          setDeviceStatus(
            "Permission was blocked. Re-enable it in your browser's site settings.",
            true
          );
        }

        return;
      }

      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/service-worker.js");
      }

      await updateDeviceStatus();

    } catch (error) {
      console.error("Device notification permission failed:", error);

      setDeviceStatus(
        error.message || "Could not enable device notifications.",
        true
      );
    }
  }

  async function disableDeviceNotifications() {
    if (!("serviceWorker" in navigator)) {
      setDeviceStatus(
        "Service workers are not supported here.",
        true
      );
      return;
    }

    try {
      const registration =
        await navigator.serviceWorker.getRegistration(
          "/service-worker.js"
        );

      const subscription =
        await registration?.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;

        const { error } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", endpoint);

        if (error) throw error;

        await subscription.unsubscribe();
      }

      await updateDeviceStatus();

      setDeviceStatus(
        "This device's Grove push subscription has been turned off. Browser permission can be managed separately in site settings."
      );

    } catch (error) {
      console.error(
        "Could not disable device notifications:",
        error
      );

      setDeviceStatus(
        error.message || "Could not turn off device notifications.",
        true
      );
    }
  }

  function connectPreferenceControls() {
    for (const [id, column] of Object.entries(preferenceFields)) {
      const field = $(id);

      field?.addEventListener("change", () => {
        savePreference(column, field.checked);
      });
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!data.user) {
        window.location.replace("/login.html");
        return;
      }

      user = data.user;

      connectPreferenceControls();
      connectSoundControls();

      await loadPreferences();
      await updateDeviceStatus();

      $("enable-device")?.addEventListener(
        "click",
        enableDeviceNotifications
      );

      $("disable-device")?.addEventListener(
        "click",
        disableDeviceNotifications
      );

      setStatus("");

    } catch (error) {
      console.error("Grove settings failed to initialize:", error);

      setStatus(
        error.message || "Could not load settings.",
        true
      );
    }
  }

  initialize();
})();
