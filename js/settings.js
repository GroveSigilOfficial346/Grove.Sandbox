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

  let user = null;
  let saving = false;

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

  function playPreview() {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      setStatus("Audio preview is not supported in this browser.", true);
      return;
    }

    try {
      const context = new AudioContextClass();
      const now = context.currentTime;
      const volume = Number($("sound-volume")?.value ?? 0.35);

      [
        { frequency: 660, start: 0, duration: 0.12 },
        { frequency: 880, start: 0.13, duration: 0.16 }
      ].forEach(note => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

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
        gain.connect(context.destination);

        oscillator.start(now + note.start);
        oscillator.stop(now + note.start + note.duration);
      });

      window.setTimeout(() => context.close(), 800);
    } catch (error) {
      console.error("Grove sound preview failed:", error);
      setStatus("Could not play the sound preview.", true);
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
      setStatus(error.message || "Could not save this preference.", true);
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
    const preview = $("test-sound");

    if (enabled) {
      enabled.checked = soundEnabled();

      enabled.addEventListener("change", () => {
        try {
          localStorage.setItem(
            SOUND_KEY(user.id),
            enabled.checked ? "true" : "false"
          );

          setStatus("Sound preference saved on this device.");
        } catch (error) {
          console.error(error);
          setStatus("Could not save the sound preference.", true);
        }
      });
    }

    if (volume) {
      volume.value = String(soundVolume());

      volume.addEventListener("input", () => {
        try {
          localStorage.setItem(
            VOLUME_KEY(user.id),
            String(volume.value)
          );
        } catch (error) {
          console.error(error);
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
      setDeviceStatus("This browser does not support notifications.", true);
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
      setDeviceStatus("Service workers are not supported here.", true);
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
      console.error("Could not disable device notifications:", error);
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
      setStatus(error.message || "Could not load settings.", true);
    }
  }

  initialize();
})();
