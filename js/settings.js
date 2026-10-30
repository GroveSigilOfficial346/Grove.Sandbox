(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const BUCKET = "grove-media";
  const $ = id => document.getElementById(id);

  let db;
  let user;
  let selectedTheme = "midnight-violet";
  let customBackgroundUrl = null;
  let selectedTrack = null;
  let tracks = [];

  const audio = $("grove-audio");
  const status = $("status");

  const say = (message, kind = "") => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  function setTheme(theme) {
    selectedTheme = theme;
    document.querySelectorAll(".theme-choice").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
    });
    document.documentElement.dataset.groveTheme = theme;
  }

  function applyPreview(url) {
    $("background-preview").style.backgroundImage = url
      ? `url("${url.replaceAll('"', "%22")}")`
      : "radial-gradient(ellipse at 50% 40%,#35165f,#08051a 70%)";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  async function loadSettings() {
    const [profileResult, prefResult] = await Promise.all([
      db.from("profiles")
        .select("is_private,comment_privacy,allow_image_saves,allow_image_downloads")
        .eq("id", user.id).maybeSingle(),
      db.from("user_preferences")
        .select("*").eq("user_id", user.id).maybeSingle()
    ]);

    if (profileResult.error) throw profileResult.error;
    if (prefResult.error) throw prefResult.error;

    const p = profileResult.data || {};
    const v = prefResult.data || {};

    $("email").value = user.email || "";
    $("is-private").checked = !!p.is_private;
    $("comment-privacy").value = p.comment_privacy || "everyone";
    $("allow-image-saves").checked = p.allow_image_saves !== false;
    $("allow-image-downloads").checked = p.allow_image_downloads !== false;

    $("saved-gallery-enabled").checked = v.saved_gallery_enabled !== false;
    $("notify-messages").checked = v.notify_messages !== false;
    $("notify-follows").checked = v.notify_follows !== false;
    $("notify-likes").checked = v.notify_likes !== false;
    $("notify-comments").checked = v.notify_comments !== false;
    $("notify-nudges").checked = v.notify_nudges !== false;
    $("notify-mentions").checked = v.notify_mentions !== false;

    setTheme(v.theme_id || "midnight-violet");
    $("featured-space").value = v.featured_space_background || "";
    customBackgroundUrl = v.custom_background_url || null;
    applyPreview(customBackgroundUrl);

    $("music-enabled").checked = v.app_music_enabled === true;
    $("music-volume").value = String(
      Number.isFinite(Number(v.app_music_volume))
        ? Math.max(0, Math.min(1, Number(v.app_music_volume)))
        : 0.7
    );
    updateVolumeLabel();

    if (v.app_music_url) {
      selectedTrack = {
        url: v.app_music_url,
        title: v.app_music_title || "Grove Music",
        artist: v.app_music_artist || "Grove"
      };
      showSelectedTrack(false);
    }
  }

  function updateVolumeLabel() {
    $("volume-value").textContent =
      `${Math.round(Number($("music-volume").value) * 100)}%`;
  }

  function publishMediaSession(track) {
    if (!("mediaSession" in navigator)) return;

    if ("MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Grove Music",
        artist: track.artist || "Grove",
        album: "Grove"
      });
    }

    const safeAction = (name, handler) => {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch (_) {
        // Unsupported action on this browser.
      }
    };

    safeAction("play", () => audio.play().catch(error => {
      say(error.message || "Playback could not start.", "error");
    }));

    safeAction("pause", () => audio.pause());
    safeAction("stop", () => audio.pause());
    safeAction("seekbackward", details => {
      audio.currentTime = Math.max(
        0,
        audio.currentTime - (details.seekOffset || 10)
      );
    });
    safeAction("seekforward", details => {
      audio.currentTime = Math.min(
        audio.duration || Infinity,
        audio.currentTime + (details.seekOffset || 10)
      );
    });
    safeAction("seekto", details => {
      if (Number.isFinite(details.seekTime)) {
        audio.currentTime = details.seekTime;
      }
    });
  }

  function updatePlaybackState() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      audio.paused ? "paused" : "playing";
  }

  function showSelectedTrack(loadAudio = true) {
    if (!selectedTrack) {
      $("now-title").textContent = "No track selected";
      $("now-artist").textContent = "Choose a track from your library.";
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    $("now-title").textContent = selectedTrack.title;
    $("now-artist").textContent = selectedTrack.artist || "Unknown artist";

    if (loadAudio) {
      audio.src = selectedTrack.url;
      audio.load();
    }

    audio.volume = Number($("music-volume").value);
    publishMediaSession(selectedTrack);
  }

  async function loadTracks() {
    const list = $("track-list");
    list.innerHTML = '<p class="muted">Loading your tracks…</p>';

    const { data, error } = await db.from("audio_tracks")
      .select("id,owner_id,title,artist,storage_path,mime_type,duration_seconds,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    tracks = data || [];
    list.replaceChildren();

    if (!tracks.length) {
      list.innerHTML = '<p class="muted">Your library is empty. Upload your first track above.</p>';
      return;
    }

    tracks.forEach(track => {
      const { data: publicData } = db.storage.from(BUCKET)
        .getPublicUrl(track.storage_path);

      const url = publicData?.publicUrl;
      const row = document.createElement("article");
      row.className = "track";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = track.title;
      const artist = document.createElement("small");
      artist.textContent = track.artist || "Unknown artist";
      info.append(title, artist);

      const actions = document.createElement("div");
      actions.className = "track-actions";

      const play = document.createElement("button");
      play.type = "button";
      play.textContent = "Play";
      play.addEventListener("click", () => {
        selectedTrack = {
          id: track.id,
          url,
          title: track.title,
          artist: track.artist || ""
        };
        $("music-enabled").checked = true;
        showSelectedTrack();
        audio.play().then(updatePlaybackState).catch(error => {
          say(error.message || "Press Play again to start audio.", "error");
        });
      });

      const choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = "Select";
      choose.addEventListener("click", () => {
        selectedTrack = {
          id: track.id,
          url,
          title: track.title,
          artist: track.artist || ""
        };
        $("music-enabled").checked = true;
        showSelectedTrack();
        say("Track selected. Save your music selection to keep it.", "success");
      });

      actions.append(play, choose);
      row.append(info, actions);
      list.appendChild(row);
    });
  }

  async function uploadTrack() {
    const file = $("music-file").files[0];
    const title = $("music-title").value.trim();
    const artist = $("music-artist").value.trim();

    if (!file) {
      say("Choose an audio file first.", "error");
      return;
    }

    if (!file.type.startsWith("audio/")) {
      say("Choose a supported audio file.", "error");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      say("Audio files must be 25 MB or smaller.", "error");
      return;
    }

    if (!title) {
      say("Enter a track title.", "error");
      return;
    }

    const button = $("upload-track");
    button.disabled = true;
    say("Uploading your track…");

    try {
      const extension = (file.name.split(".").pop() || "audio")
        .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);

      const path = `${user.id}/music/${crypto.randomUUID()}.${extension}`;

      const { error: storageError } = await db.storage.from(BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false
        });

      if (storageError) throw storageError;

      const { error: insertError } = await db.from("audio_tracks").insert({
        owner_id: user.id,
        title,
        artist,
        storage_path: path,
        mime_type: file.type
      });

      if (insertError) {
        await db.storage.from(BUCKET).remove([path]);
        throw insertError;
      }

      $("music-file").value = "";
      $("music-title").value = "";
      $("music-artist").value = "";

      await loadTracks();
      say("Track uploaded to your Grove library.", "success");
    } catch (error) {
      console.error("Grove music upload:", error);
      say(error.message || "Could not upload the track.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function saveMusic() {
    const button = $("save-music");
    button.disabled = true;

    try {
      if ($("music-enabled").checked && !selectedTrack?.url) {
        throw new Error("Select a track before enabling account music.");
      }

      const preferences = {
        user_id: user.id,
        app_music_enabled: $("music-enabled").checked,
        app_music_url: selectedTrack?.url || null,
        app_music_title: selectedTrack?.title || null,
        app_music_artist: selectedTrack?.artist || null,
        app_music_volume: Number($("music-volume").value),
        updated_at: new Date().toISOString()
      };

      const { error } = await db.from("user_preferences")
        .upsert(preferences, { onConflict: "user_id" });

      if (error) throw error;

      say("Your account music selection has been saved.", "success");
    } catch (error) {
      say(error.message || "Could not save music settings.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function saveSettings() {
    const button = $("save-settings");
    button.disabled = true;
    say("Saving your settings…");

    try {
      const profile = {
        is_private: $("is-private").checked,
        comment_privacy: $("comment-privacy").value,
        allow_image_saves: $("allow-image-saves").checked,
        allow_image_downloads: $("allow-image-downloads").checked
      };

      const preferences = {
        user_id: user.id,
        theme_id: selectedTheme,
        featured_space_background: $("featured-space").value || null,
        custom_background_url: customBackgroundUrl,
        background_mode: customBackgroundUrl ? "custom" : "preset",
        saved_gallery_enabled: $("saved-gallery-enabled").checked,
        notify_messages: $("notify-messages").checked,
        notify_follows: $("notify-follows").checked,
        notify_likes: $("notify-likes").checked,
        notify_comments: $("notify-comments").checked,
        notify_nudges: $("notify-nudges").checked,
        notify_mentions: $("notify-mentions").checked,
        updated_at: new Date().toISOString()
      };

      const { error: profileError } = await db.from("profiles")
        .update(profile).eq("id", user.id);
      if (profileError) throw profileError;

      const { error: prefError } = await db.from("user_preferences")
        .upsert(preferences, { onConflict: "user_id" });
      if (prefError) throw prefError;

      localStorage.setItem("grove-theme", selectedTheme);
      say("Settings saved successfully.", "success");
    } catch (error) {
      console.error("Grove settings save:", error);
      say(error.message || "Could not save settings.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function uploadBackground() {
    const file = $("custom-background").files[0];

    if (!file) {
      say("Choose an image first.", "error");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      say("Use a JPG, PNG, or WebP image.", "error");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      say("Background images must be 8 MB or smaller.", "error");
      return;
    }

    const button = $("upload-background");
    button.disabled = true;
    say("Uploading background…");

    try {
      const extension = file.type === "image/png" ? "png" :
        file.type === "image/webp" ? "webp" : "jpg";

      const path = `${user.id}/backgrounds/${crypto.randomUUID()}.${extension}`;

      const { error } = await db.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
      });

      if (error) throw error;

      const { data } = db.storage.from(BUCKET).getPublicUrl(path);
      customBackgroundUrl = data.publicUrl;
      applyPreview(customBackgroundUrl);
      say("Background uploaded. Save all settings to keep it.", "success");
    } catch (error) {
      say(error.message || "Background upload failed.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function updateEmail() {
    const email = $("email").value.trim();

    if (!email || email === user.email) {
      throw new Error("Enter a different valid email address.");
    }

    const { error } = await db.auth.updateUser({ email });
    if (error) throw error;

    say("Email change requested. Check your inbox to confirm.", "success");
  }

  async function updatePassword() {
    const password = $("password").value;

    if (password.length < 8) {
      throw new Error("Use a password with at least 8 characters.");
    }

    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;

    $("password").value = "";
    say("Password updated.", "success");
  }

  async function runAction(action) {
    try {
      await action();
    } catch (error) {
      console.error("Grove settings action:", error);
      say(error.message || "That action failed.", "error");
    }
  }

  function attachEvents() {
    document.querySelectorAll(".theme-choice").forEach(button => {
      button.addEventListener("click", () => setTheme(button.dataset.theme));
    });

    $("save-settings").addEventListener("click", saveSettings);
    $("save-music").addEventListener("click", saveMusic);
    $("upload-track").addEventListener("click", () => runAction(uploadTrack));
    $("upload-background").addEventListener("click", () => runAction(uploadBackground));
    $("remove-background").addEventListener("click", () => {
      customBackgroundUrl = null;
      $("custom-background").value = "";
      applyPreview(null);
      say("Custom background cleared. Save all settings to apply it.", "success");
    });

    $("change-email").addEventListener("click", () => runAction(updateEmail));
    $("change-password").addEventListener("click", () => runAction(updatePassword));

    $("music-volume").addEventListener("input", () => {
      audio.volume = Number($("music-volume").value);
      updateVolumeLabel();
    });

    audio.addEventListener("play", updatePlaybackState);
    audio.addEventListener("pause", updatePlaybackState);
    audio.addEventListener("ended", updatePlaybackState);

    audio.addEventListener("timeupdate", () => {
      if (!("mediaSession" in navigator) || !Number.isFinite(audio.duration)) return;

      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        });
      } catch (_) {}
    });

    $("logout").addEventListener("click", async () => {
      $("logout").disabled = true;

      const { error } = await db.auth.signOut({ scope: "local" });

      if (error) {
        $("logout").disabled = false;
        say(error.message, "error");
        return;
      }

      location.replace("auth.html?mode=login");
    });
  }

  async function start() {
    if (!window.supabase) {
      say("Supabase could not load. Check your connection and reload.", "error");
      return;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    user = data.session?.user;

    if (!user) {
      location.replace("auth.html?mode=login");
      return;
    }

    attachEvents();
    await loadSettings();
    await loadTracks();

    say("Grove settings loaded.", "success");
  }

  start().catch(error => {
    console.error("Grove settings initialization:", error);
    say(error.message || "Could not load Grove settings.", "error");
  });
})();
