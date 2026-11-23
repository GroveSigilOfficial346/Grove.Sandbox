(function () {
  "use strict";

  const client = window.supabaseClient;

  const statusElement = document.getElementById("settings-status");
  const saveButton = document.getElementById("save-button");
  const testSoundButton = document.getElementById("test-sound-button");
  const logoutButton = document.getElementById("logout-button");

  const controls = {
    enabled: document.getElementById("enabled"),
    follow_enabled: document.getElementById("follow-enabled"),
    follow_request_enabled: document.getElementById("follow-request-enabled"),
    like_enabled: document.getElementById("like-enabled"),
    comment_enabled: document.getElementById("comment-enabled"),
    sound_enabled: document.getElementById("sound-enabled")
  };

  let currentUser = null;
  let audioContext = null;

  function setStatus(message, type) {
    statusElement.textContent = message || "";
    statusElement.dataset.type = type || "info";
  }

  function getValues() {
    const values = {};

    Object.keys(controls).forEach(function (key) {
      values[key] = controls[key].checked;
    });

    return values;
  }

  function setValues(values) {
    Object.keys(controls).forEach(function (key) {
      controls[key].checked =
        typeof values[key] === "boolean"
          ? values[key]
          : key !== "sound_enabled";
    });
  }

  async function loadSettings() {
    const { data, error } = await client
      .from("notification_preferences")
      .select(
        "enabled, follow_enabled, follow_request_enabled, like_enabled, comment_enabled, sound_enabled"
      )
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      setValues(data);
    } else {
      setValues({
        enabled: true,
        follow_enabled: true,
        follow_request_enabled: true,
        like_enabled: true,
        comment_enabled: true,
        sound_enabled: false
      });
    }

    setStatus("Notification settings loaded.", "success");
  }

  async function saveSettings() {
    saveButton.disabled = true;
    saveButton.textContent = "SAVING...";
    setStatus("Saving your preferences...", "info");

    try {
      const values = getValues();

      const { error } = await client
        .from("notification_preferences")
        .upsert({
          user_id: currentUser.id,
          ...values,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      setStatus("Your notification preferences have been saved.", "success");
    } catch (error) {
      console.error("Grove notification settings error:", error);
      setStatus(
        error.message || "Could not save your preferences.",
        "error"
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "SAVE SETTINGS";
    }
  }

  async function playTestSound() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("This browser does not support Web Audio.");
      }

      if (!audioContext) {
        audioContext = new AudioContextClass();
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        660,
        audioContext.currentTime
      );

      gain.gain.setValueAtTime(
        0.0001,
        audioContext.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.12,
        audioContext.currentTime + 0.025
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.22
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.23);

      setStatus("Test sound played.", "success");
    } catch (error) {
      console.error("Grove test sound error:", error);
      setStatus(
        error.message || "Could not play the test sound.",
        "error"
      );
    }
  }

  async function initialize() {
    try {
      if (!client) {
        throw new Error("Supabase is not connected.");
      }

      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      await loadSettings();
    } catch (error) {
      console.error("Grove settings initialization:", error);
      setStatus(
        error.message || "Could not load settings.",
        "error"
      );
    }
  }

  saveButton.addEventListener("click", saveSettings);
  testSoundButton.addEventListener("click", playTestSound);

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      setStatus(error.message || "Logout failed.", "error");
      logoutButton.disabled = false;
    }
  });

  initialize();
})();
