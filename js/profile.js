(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const BUCKET = "grove-media";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const $ = (selector) => document.querySelector(selector);

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

  function setStatus(message, kind = "info") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    saveButton.disabled = value;
    logoutButton.disabled = value;
    saveButton.textContent = value ? "Saving…" : "Save profile";
  }

  function setField(selector, value) {
    $(selector).value = value ?? "";
  }

  function validateImage(file, label) {
    if (!file) return true;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus(`${label} must be JPG, PNG, WebP, or GIF.`, "error");
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatus(`${label} must be no larger than 5 MB.`, "error");
      return false;
    }

    return true;
  }

  function replacePreview(image, file, type) {
    const oldUrl = type === "avatar" ? avatarObjectUrl : coverObjectUrl;

    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const url = URL.createObjectURL(file);
    image.src = url;
    image.hidden = false;

    if (type === "avatar") avatarObjectUrl = url;
    else coverObjectUrl = url;
  }

  function showImage(image, url) {
    image.hidden = !url;

    if (url) image.src = url;
    else image.removeAttribute("src");
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, cover_url, location, website, pronouns")
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

    const username = usernameInput.value.trim().toLowerCase();
    const displayName = $("#display-name").value.trim();
    const bio = $("#bio").value.trim();
    const location = $("#location").value.trim();
    const website = $("#website").value.trim();
    const pronouns = $("#pronouns").value.trim();

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

    const avatarFile = avatarInput.files[0];
    const coverFile = coverInput.files[0];

    if (
      !validateImage(avatarFile, "Profile picture") ||
      !validateImage(coverFile, "Cover image")
    ) return;

    setBusy(true);

    try {
      if (username !== (originalProfile.username || "").toLowerCase()) {
        const available = await usernameAvailable(username);

        if (!available) {
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
        .select("id, username, display_name, bio, avatar_url, cover_url, location, website, pronouns")
        .single();

      if (error) throw error;

      originalProfile = data;
      avatarInput.value = "";
      coverInput.value = "";

      showImage(avatarPreview, data.avatar_url);
      showImage(coverPreview, data.cover_url);

      setStatus("Profile saved successfully! Your username is @" + data.username, "success");

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
        return;
      }

      if (!validateImage(file, "Profile picture")) {
        avatarInput.value = "";
        return;
      }

      replacePreview(avatarPreview, file, "avatar");
    });

    coverInput.addEventListener("change", () => {
      const file = coverInput.files[0];

      if (!file) {
        showImage(coverPreview, originalProfile.cover_url);
        return;
      }

      if (!validateImage(file, "Cover image")) {
        coverInput.value = "";
        return;
      }

      replacePreview(coverPreview, file, "cover");
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

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      currentUser = data.session?.user;

      if (!currentUser) {
        window.location.replace("auth.html?mode=login");
        return;
      }

      await loadProfile();
      initializePreviews();

      form.addEventListener("submit", saveProfile);
      logoutButton.addEventListener("click", logout);

      setStatus("Profile editor ready.", "success");
    } catch (error) {
      console.error("Grove profile initialization failed:", error);
      setStatus(error.message || "Couldn't load your profile editor.", "error");
    } finally {
      setBusy(false);
    }
  }

  initialize().catch((error) => {
    console.error("Grove initialization error:", error);
    setStatus("Grove couldn't initialize. Please refresh.", "error");
  });
})();
