```javascript
(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const BUCKET = "grove-media";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const AUDIO_TYPES = [
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/ogg", "audio/mp4", "audio/aac", "audio/webm", "audio/flac"
  ];

  const $ = selector => document.querySelector(selector);

  const form = $("#profile-form");
  const status = $("#status");
  const saveButton = $("#save-profile");
  const logoutButton = $("#logout");
  const usernameInput = $("#username");
  const avatarInput = $("#avatar");
  const coverInput = $("#cover");
  const avatarPreview = $("#avatar-preview");
  const coverPreview = $("#cover-preview");

  let supabase;
  let currentUser;
  let originalProfile = {};
  let busy = false;
  let avatarObjectUrl = null;
  let coverObjectUrl = null;
  let avatarCrop = null;
  let coverCrop = null;
  let audioFile = null;
  let audioTracks = [];
  let musicEnabled = false;
  let selectedTrackId = null;

  function setStatus(message, kind = "info") {
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    if (saveButton) {
      saveButton.disabled = value;
      saveButton.textContent = value ? "Saving…" : "Save profile";
    }
    if (logoutButton) logoutButton.disabled = value;
  }

  function setField(selector, value) {
    const field = $(selector);
    if (field) field.value = value ?? "";
  }

  function safeText(value) {
    return String(value ?? "").trim();
  }

  function validateImage(file, label) {
    if (!file) return true;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus(`${label} must be JPG, PNG, WebP, or GIF.`, "error");
      return false;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setStatus(`${label} must be no larger than 5 MB.`, "error");
      return false;
    }

    return true;
  }

  function showImage(image, url) {
    if (!image) return;
    image.hidden = !url;

    if (url) image.src = url;
    else image.removeAttribute("src");
  }

  function revokeObjectUrl(type) {
    if (type === "avatar" && avatarObjectUrl) {
      URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = null;
    }
    if (type === "cover" && coverObjectUrl) {
      URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = null;
    }
  }

  function addEditorStyles() {
    if ($("#grove-profile-editor-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-profile-editor-styles";
    style.textContent = `
      .grove-editor-extra {
        margin:20px 0;
        padding:18px;
        border:1px solid #851eff55;
        border-radius:14px;
        background:#100b25;
        color:#f7f5ff;
      }
      .grove-editor-extra h3 {
        margin:0 0 12px;
        font-size:16px;
      }
      .grove-editor-extra label {
        display:block;
        margin:12px 0 6px;
        color:#c9b9ed;
        font-size:13px;
      }
      .grove-editor-extra input[type="text"],
      .grove-editor-extra input[type="file"],
      .grove-editor-extra select {
        width:100%;
        padding:11px;
        border:1px solid #554477;
        border-radius:8px;
        background:#08051a;
        color:#f7f5ff;
      }
      .grove-crop-controls {
        display:grid;
        gap:8px;
        margin-top:12px;
      }
      .grove-crop-controls input[type="range"] {
        width:100%;
        accent-color:#a855f7;
      }
      .grove-crop-actions {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:10px;
      }
      .grove-crop-actions button,
      .grove-editor-extra button {
        padding:9px 12px;
        border:1px solid #851eff88;
        border-radius:8px;
        background:#211440;
        color:white;
        cursor:pointer;
      }
      .grove-editor-extra button.primary {
        background:linear-gradient(110deg,#851eff,#5965ff);
      }
      .grove-music-track {
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px;
        margin-top:8px;
        border:1px solid #554477;
        border-radius:9px;
        background:#08051a;
      }
      .grove-music-track label {
        flex:1;
        margin:0;
      }
      .grove-music-track input {
        accent-color:#a855f7;
      }
      .grove-editor-hint {
        color:#a99bc9;
        font-size:12px;
        line-height:1.6;
      }
      .grove-crop-preview {
        display:block;
        max-width:100%;
        max-height:260px;
        margin-top:10px;
        border-radius:10px;
        object-fit:contain;
      }
    `;
    document.head.appendChild(style);
  }

  function createExtraEditor() {
    addEditorStyles();

    const container = document.createElement("section");
    container.className = "grove-editor-extra";
    container.id = "grove-profile-extras";

    container.innerHTML = `
      <h3>Image Cropping</h3>
      <p class="grove-editor-hint">
        Select an avatar or cover image above, then adjust its zoom and position.
        Your original image remains unchanged.
      </p>

      <div class="grove-crop-controls">
        <label for="grove-crop-target">Image to adjust</label>
        <select id="grove-crop-target">
          <option value="avatar">Profile picture — square</option>
          <option value="cover">Cover image — wide</option>
        </select>

        <label for="grove-crop-zoom">Zoom</label>
        <input id="grove-crop-zoom" type="range" min="1" max="3" step=".05" value="1">

        <label for="grove-crop-x">Horizontal position</label>
        <input id="grove-crop-x" type="range" min="0" max="100" value="50">

        <label for="grove-crop-y">Vertical position</label>
        <input id="grove-crop-y" type="range" min="0" max="100" value="50">

        <div class="grove-crop-actions">
          <button type="button" id="grove-crop-reset">Reset crop</button>
          <button type="button" class="primary" id="grove-crop-apply">Apply crop</button>
        </div>
        <p class="grove-editor-hint" id="grove-crop-status" aria-live="polite"></p>
      </div>

      <hr style="border-color:#ffffff18;margin:22px 0">

      <h3>Profile Music</h3>
      <p class="grove-editor-hint">
        Upload audio you own or have permission to use. Choose a track from your
        library to feature on your profile.
      </p>

      <label for="grove-audio-upload">Upload audio (maximum 25 MB)</label>
      <input id="grove-audio-upload" type="file"
        accept="audio/*">

      <label for="grove-audio-title">Track title</label>
      <input id="grove-audio-title" type="text" maxlength="120"
        placeholder="Track title">

      <label for="grove-audio-artist">Artist</label>
      <input id="grove-audio-artist" type="text" maxlength="120"
        placeholder="Artist name">

      <div class="grove-crop-actions">
        <button type="button" class="primary" id="grove-audio-upload-button">
          Upload to Saved Audio
        </button>
        <button type="button" id="grove-profile-music-toggle">
          Enable profile music
        </button>
      </div>

      <div id="grove-audio-library" aria-live="polite"></div>
      <p class="grove-editor-hint" id="grove-audio-status"></p>
    `;

    const saveArea = saveButton?.parentElement || form;
    if (saveArea && saveArea !== form) {
      saveArea.before(container);
    } else {
      form.appendChild(container);
    }

    $("#grove-crop-target").addEventListener("change", updateCropControls);
    $("#grove-crop-reset").addEventListener("click", resetCrop);
    $("#grove-crop-apply").addEventListener("click", applyCrop);
    $("#grove-audio-upload").addEventListener("change", event => {
      audioFile = event.target.files?.[0] || null;
      if (audioFile) {
        $("#grove-audio-title").value =
          audioFile.name.replace(/\.[^.]+$/, "");
      }
    });
    $("#grove-audio-upload-button").addEventListener("click", uploadAudioTrack);
    $("#grove-profile-music-toggle").addEventListener("click", toggleProfileMusic);
  }

  function cropState(type) {
    return type === "avatar" ? avatarCrop : coverCrop;
  }

  function setCropState(type, value) {
    if (type === "avatar") avatarCrop = value;
    else coverCrop = value;
  }

  function updateCropControls() {
    const type = $("#grove-crop-target").value;
    const state = cropState(type);
    $("#grove-crop-zoom").value = state?.zoom ?? 1;
    $("#grove-crop-x").value = state?.x ?? 50;
    $("#grove-crop-y").value = state?.y ?? 50;
    $("#grove-crop-status").textContent = state
      ? "Crop controls ready."
      : "Choose an image above to enable cropping.";
  }

  function resetCrop() {
    const type = $("#grove-crop-target").value;
    if (!cropState(type)) return;

    setCropState(type, { zoom: 1, x: 50, y: 50, applied: false });
    updateCropControls();
    $("#grove-crop-status").textContent = "Crop reset.";
  }

  function currentCropSettings(type) {
    return {
      zoom: Number($("#grove-crop-zoom").value),
      x: Number($("#grove-crop-x").value),
      y: Number($("#grove-crop-y").value),
      applied: false
    };
  }

  async function createCroppedFile(file, type, settings) {
    if (file.type === "image/gif") {
      throw new Error("GIF cropping is not supported. Please use JPG, PNG, or WebP.");
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not read this image."));
        image.src = objectUrl;
      });

      const ratio = type === "avatar" ? 1 : 3;
      const outputWidth = type === "avatar" ? 800 : 1500;
      const outputHeight = Math.round(outputWidth / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const context = canvas.getContext("2d");
      const baseScale = Math.max(
        outputWidth / image.naturalWidth,
        outputHeight / image.naturalHeight
      );
      const scale = baseScale * settings.zoom;
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const overflowX = Math.max(0, drawWidth - outputWidth);
      const overflowY = Math.max(0, drawHeight - outputHeight);
      const x = -(overflowX * settings.x / 100);
      const y = -(overflowY * settings.y / 100);

      context.drawImage(image, x, y, drawWidth, drawHeight);

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/webp", 0.92)
      );

      if (!blob) throw new Error("Could not create the cropped image.");

      return new File([blob], `${type}-${Date.now()}.webp`, {
        type: "image/webp"
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function applyCrop() {
    const type = $("#grove-crop-target").value;
    const input = type === "avatar" ? avatarInput : coverInput;
    const file = input?.files?.[0];

    if (!file) {
      $("#grove-crop-status").textContent =
        `Choose a ${type} image first.`;
      return;
    }

    try {
      const settings = currentCropSettings(type);
      const cropped = await createCroppedFile(file, type, settings);

      setCropState(type, { ...settings, file: cropped, applied: true });

      const image = type === "avatar" ? avatarPreview : coverPreview;
      const oldUrl = type === "avatar" ? avatarObjectUrl : coverObjectUrl;
      if (oldUrl) URL.revokeObjectURL(oldUrl);

      const url = URL.createObjectURL(cropped);
      image.src = url;
      image.hidden = false;

      if (type === "avatar") avatarObjectUrl = url;
      else coverObjectUrl = url;

      $("#grove-crop-status").textContent =
        "Crop applied. Save your profile to upload it.";
    } catch (error) {
      $("#grove-crop-status").textContent = error.message;
    }
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, cover_url, location, website, pronouns, profile_music_url, profile_music_title, profile_music_artist, profile_music_enabled")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Your profile record could not be found.");

    originalProfile = data;

    setField("#username", data.username);
    setField("#display-name", data.display_name);
    setField("#bio", data.bio);
    setField("#location", data.location);
    setField("#website", data.website);
    setField("#pronouns", data.pronouns);

    showImage(avatarPreview, data.avatar_url);
    showImage(coverPreview, data.cover_url);

    musicEnabled = Boolean(data.profile_music_enabled);
    $("#grove-profile-music-toggle").textContent =
      musicEnabled ? "Disable profile music" : "Enable profile music";

    if (data.profile_music_title) {
      $("#grove-audio-title").value = data.profile_music_title;
    }
    if (data.profile_music_artist) {
      $("#grove-audio-artist").value = data.profile_music_artist;
    }
  }

  async function usernameAvailable(username) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", currentUser.id)
      .limit(1);

    if (error) throw error;
    return !data?.length;
  }

  async function uploadImage(file, type) {
    if (!file) return null;

    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };

    const path = `${currentUser.id}/${type}-${crypto.randomUUID()}.${extensions[file.type]}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false
      });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function validWebsite(value) {
    if (!value) return true;

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (busy) return;

    setStatus("");

    const username = safeText(usernameInput.value).toLowerCase();
    const displayName = safeText($("#display-name")?.value);
    const bio = safeText($("#bio")?.value);
    const location = safeText($("#location")?.value);
    const website = safeText($("#website")?.value);
    const pronouns = safeText($("#pronouns")?.value);

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setStatus("Username must be 3–30 characters using lowercase letters, numbers, and underscores.", "error");
      usernameInput.focus();
      return;
    }

    if (!displayName) {
      setStatus("Please enter a display name.", "error");
      $("#display-name").focus();
      return;
    }

    if (!validWebsite(website)) {
      setStatus("Enter a valid website URL beginning with https:// or http://.", "error");
      $("#website").focus();
      return;
    }

    const avatarFile = avatarCrop?.applied
      ? avatarCrop.file
      : avatarInput.files[0];

    const coverFile = coverCrop?.applied
      ? coverCrop.file
      : coverInput.files[0];

    if (
      !validateImage(avatarFile, "Profile picture") ||
      !validateImage(coverFile, "Cover image")
    ) return;

    setBusy(true);

    try {
      if (username !== (originalProfile.username || "").toLowerCase()) {
        if (!await usernameAvailable(username)) {
          setStatus("That username is already taken. Try another one.", "error");
          usernameInput.focus();
          return;
        }
      }

      let avatarUrl = originalProfile.avatar_url || null;
      let coverUrl = originalProfile.cover_url || null;

      if (avatarFile) avatarUrl = await uploadImage(avatarFile, "avatar");
      if (coverFile) coverUrl = await uploadImage(coverFile, "cover");

      const updates = {
        username,
        display_name: displayName,
        bio,
        location,
        website: website || null,
        pronouns,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUser.id)
        .select("*")
        .single();

      if (error) throw error;

      originalProfile = data;
      avatarInput.value = "";
      coverInput.value = "";
      avatarCrop = null;
      coverCrop = null;

      showImage(avatarPreview, data.avatar_url);
      showImage(coverPreview, data.cover_url);

      setStatus(
        "Profile saved successfully! Your username is @" + data.username,
        "success"
      );
    } catch (error) {
      console.error("Grove profile save failed:", error);

      if (error.code === "23505") {
        setStatus("That username is already taken.", "error");
      } else if (error.code === "42501") {
        setStatus("Permission denied. Check your Supabase profile and storage policies.", "error");
      } else {
        setStatus(error.message || "Couldn't save your profile.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadAudioLibrary() {
    const list = $("#grove-audio-library");
    list.replaceChildren();

    const { data, error } = await supabase
      .from("audio_tracks")
      .select("id,title,artist,storage_path,mime_type,created_at")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      $("#grove-audio-status").textContent =
        "Your audio library could not be loaded: " + error.message;
      return;
    }

    audioTracks = data || [];

    if (!audioTracks.length) {
      list.textContent = "Your Saved Audio Library is empty.";
      return;
    }

    audioTracks.forEach(track => {
      const row = document.createElement("div");
      row.className = "grove-music-track";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "grove-profile-track";
      radio.value = track.id;
      radio.checked = selectedTrackId === track.id;

      const label = document.createElement("label");
      label.textContent = `${track.title}${track.artist ? " — " + track.artist : ""}`;

      radio.addEventListener("change", () => {
        selectedTrackId = track.id;
        $("#grove-audio-status").textContent =
          "Track selected. Save your profile to feature it.";
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => deleteAudioTrack(track));

      row.append(radio, label, remove);
      list.appendChild(row);
    });
  }

  async function uploadAudioTrack() {
    if (busy) return;

    if (!audioFile) {
      $("#grove-audio-status").textContent = "Choose an audio file first.";
      return;
    }

    if (!AUDIO_TYPES.includes(audioFile.type)) {
      $("#grove-audio-status").textContent =
        "This audio format is not supported. Try MP3, WAV, OGG, AAC, WebM, or FLAC.";
      return;
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      $("#grove-audio-status").textContent =
        "Audio files must be 25 MB or smaller.";
      return;
    }

    const title = safeText($("#grove-audio-title").value);
    const artist = safeText($("#grove-audio-artist").value);

    if (!title) {
      $("#grove-audio-status").textContent = "Enter a track title.";
      return;
    }

    const button = $("#grove-audio-upload-button");
    button.disabled = true;
    button.textContent = "Uploading…";

    try {
      const extension = audioFile.name.split(".").pop().toLowerCase();
      const path = `${currentUser.id}/audio/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, audioFile, {
          contentType: audioFile.type,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("audio_tracks")
        .insert({
          owner_id: currentUser.id,
          title,
          artist,
          storage_path: path,
          mime_type: audioFile.type
        })
        .select("id")
        .single();

      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }

      audioFile = null;
      $("#grove-audio-upload").value = "";
      selectedTrackId = data.id;

      $("#grove-audio-status").textContent =
        "Uploaded and saved to your audio library.";
      await loadAudioLibrary();
    } catch (error) {
      console.error("Audio upload failed:", error);
      $("#grove-audio-status").textContent =
        error.message || "Audio upload failed.";
    } finally {
      button.disabled = false;
      button.textContent = "Upload to Saved Audio";
    }
  }

  async function deleteAudioTrack(track) {
    if (!confirm(`Remove "${track.title}" from your Saved Audio Library?`)) {
      return;
    }

    try {
      const { error: rowError } = await supabase
        .from("audio_tracks")
        .delete()
        .eq("id", track.id)
        .eq("owner_id", currentUser.id);

      if (rowError) throw rowError;

      await supabase.storage
        .from(BUCKET)
        .remove([track.storage_path]);

      if (selectedTrackId === track.id) selectedTrackId = null;

      $("#grove-audio-status").textContent = "Track removed.";
      await loadAudioLibrary();
    } catch (error) {
      $("#grove-audio-status").textContent =
        error.message || "Could not remove that track.";
    }
  }

  function toggleProfileMusic() {
    musicEnabled = !musicEnabled;
    $("#grove-profile-music-toggle").textContent =
      musicEnabled ? "Disable profile music" : "Enable profile music";

    $("#grove-audio-status").textContent = musicEnabled
      ? "Profile music enabled. Save your profile to apply."
      : "Profile music disabled. Save your profile to apply.";
  }

  async function saveProfileMusic() {
    let track = audioTracks.find(item => item.id === selectedTrackId);

    if (!track && originalProfile.profile_music_url) {
      return {
        profile_music_url: originalProfile.profile_music_url,
        profile_music_title: originalProfile.profile_music_title || "",
        profile_music_artist: originalProfile.profile_music_artist || "",
        profile_music_enabled: musicEnabled
      };
    }

    if (!track) {
      return {
        profile_music_url: null,
        profile_music_title: null,
        profile_music_artist: null,
        profile_music_enabled: false
      };
    }

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(track.storage_path);

    return {
      profile_music_url: data.publicUrl,
      profile_music_title: track.title,
      profile_music_artist: track.artist,
      profile_music_enabled: musicEnabled
    };
  }

  async function logout() {
    if (busy) return;

    logoutButton.disabled = true;
    setStatus("Signing out…");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.replace("auth.html?mode=login");
    } catch (error) {
      setStatus(error.message || "Couldn't sign out.", "error");
      logoutButton.disabled = false;
    }
  }

  function initializePreviews() {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files[0];

      if (!file) {
        showImage(avatarPreview, originalProfile.avatar_url);
        avatarCrop = null;
        updateCropControls();
        return;
      }

      if (!validateImage(file, "Profile picture")) {
        avatarInput.value = "";
        return;
      }

      revokeObjectUrl("avatar");
      avatarObjectUrl = URL.createObjectURL(file);
      avatarPreview.src = avatarObjectUrl;
      avatarPreview.hidden = false;
      avatarCrop = { zoom: 1, x: 50, y: 50, applied: false };
      updateCropControls();
    });

    coverInput.addEventListener("change", () => {
      const file = coverInput.files[0];

      if (!file) {
        showImage(coverPreview, originalProfile.cover_url);
        coverCrop = null;
        updateCropControls();
        return;
      }

      if (!validateImage(file, "Cover image")) {
        coverInput.value = "";
        return;
      }

      revokeObjectUrl("cover");
      coverObjectUrl = URL.createObjectURL(file);
      coverPreview.src = coverObjectUrl;
      coverPreview.hidden = false;
      coverCrop = { zoom: 1, x: 50, y: 50, applied: false };
      updateCropControls();
    });
  }

  async function initialize() {
    if (!window.supabase?.createClient) {
      setStatus("Grove's Supabase library didn't load. Please refresh.", "error");
      return;
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    if (!form || !status || !saveButton || !logoutButton ||
        !usernameInput || !avatarInput || !coverInput ||
        !avatarPreview || !coverPreview) {
      console.error("Grove profile editor: expected form elements are missing.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      currentUser = data.session?.user;

      if (!currentUser) {
        window.location.replace("auth.html?mode=login");
        return;
      }

      createExtraEditor();
      initializePreviews();
      await loadProfile();
      await loadAudioLibrary();

      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy) return;

        const musicUpdates = await saveProfileMusic();
        await saveProfileWithMusic(event, musicUpdates);
      });

      logoutButton.addEventListener("click", logout);
      setStatus("Profile editor ready.", "success");
    } catch (error) {
      console.error("Grove profile initialization failed:", error);
      setStatus(error.message || "Couldn't load your profile editor.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileWithMusic(event, musicUpdates) {
    if (busy) return;

    const username = safeText(usernameInput.value).toLowerCase();
    const displayName = safeText($("#display-name")?.value);
    const bio = safeText($("#bio")?.value);
    const location = safeText($("#location")?.value);
    const website = safeText($("#website")?.value);
    const pronouns = safeText($("#pronouns")?.value);

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setStatus("Username must be 3–30 characters using lowercase letters, numbers, and underscores.", "error");
      usernameInput.focus();
      return;
    }

    if (!displayName) {
      setStatus("Please enter a display name.", "error");
      $("#display-name").focus();
      return;
    }

    if (!validWebsite(website)) {
      setStatus("Enter a valid website URL beginning with https:// or http://.", "error");
      $("#website").focus();
      return;
    }

    const avatarFile = avatarCrop?.applied ? avatarCrop.file : avatarInput.files[0];
    const coverFile = coverCrop?.applied ? coverCrop.file : coverInput.files[0];

    if (!validateImage(avatarFile, "Profile picture") ||
        !validateImage(coverFile, "Cover image")) return;

    setBusy(true);

    try {
      if (username !== (originalProfile.username || "").toLowerCase()) {
        if (!await usernameAvailable(username)) {
          setStatus("That username is already taken. Try another one.", "error");
          usernameInput.focus();
          return;
        }
      }

      let avatarUrl = originalProfile.avatar_url || null;
      let coverUrl = originalProfile.cover_url || null;

      if (avatarFile) avatarUrl = await uploadImage(avatarFile, "avatar");
      if (coverFile) coverUrl = await uploadImage(coverFile, "cover");

      const updates = {
        username,
        display_name: displayName,
        bio,
        location,
        website: website || null,
        pronouns,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        ...musicUpdates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUser.id)
        .select("*")
        .single();

      if (error) throw error;

      originalProfile = data;
      avatarInput.value = "";
      coverInput.value = "";
      avatarCrop = null;
      coverCrop = null;

      showImage(avatarPreview, data.avatar_url);
      showImage(coverPreview, data.cover_url);

      setStatus("Profile saved successfully! @" + data.username, "success");
    } catch (error) {
      console.error("Grove profile save failed:", error);

      if (error.code === "23505") {
        setStatus("That username is already taken.", "error");
      } else if (error.code === "42501") {
        setStatus("Permission denied. Check your Supabase profile and storage policies.", "error");
      } else {
        setStatus(error.message || "Couldn't save your profile.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  initialize().catch(error => {
    console.error("Grove initialization error:", error);
    setStatus("Grove couldn't initialize. Please refresh.", "error");
  });
})();
```
