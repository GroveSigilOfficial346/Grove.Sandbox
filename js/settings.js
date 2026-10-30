```javascript
(() => {
  "use strict";

  const URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const BUCKET = "grove-media";
  const $ = id => document.getElementById(id);

  let db, user, selectedTheme = "midnight-violet";
  let customBackgroundUrl = null;

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

  async function loadSettings() {
    const [profileResult, prefResult] = await Promise.all([
      db.from("profiles").select("is_private,comment_privacy,allow_image_saves,allow_image_downloads").eq("id", user.id).maybeSingle(),
      db.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle()
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
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${user.id}/backgrounds/${crypto.randomUUID()}.${extension}`;
      const { error } = await db.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;

      const { data } = db.storage.from(BUCKET).getPublicUrl(path);
      customBackgroundUrl = data.publicUrl;
      applyPreview(customBackgroundUrl);
      say("Background uploaded. Select Save all settings to keep it.", "success");
    } catch (error) {
      console.error("Grove background upload:", error);
      say(error.message || "Background upload failed.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function removeBackground() {
    customBackgroundUrl = null;
    $("custom-background").value = "";
    applyPreview(null);
    say("Custom background cleared. Save all settings to apply the change.", "success");
  }

  async function updateEmail() {
    const email = $("email").value.trim();
    if (!email || email === user.email) {
      say("Enter a different valid email address.", "error");
      return;
    }
    const { error } = await db.auth.updateUser({ email });
    if (error) throw error;
    say("Email change requested. Check your inbox to confirm the new address.", "success");
  }

  async function updatePassword() {
    const password = $("password").value;
    if (password.length < 8) {
      say("Use a password with at least 8 characters.", "error");
      return;
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
      console.error("Grove account setting:", error);
      say(error.message || "That action failed.", "error");
    }
  }

  async function start() {
    if (!window.supabase) {
      say("Supabase could not load. Check your connection and reload.", "error");
      return;
    }

    db = window.supabase.createClient(URL, KEY);
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    user = data.session?.user;
    if (!user) {
      location.replace("auth.html?mode=login");
      return;
    }

    document.querySelectorAll(".theme-choice").forEach(button => {
      button.addEventListener("click", () => setTheme(button.dataset.theme));
    });

    $("save-settings").addEventListener("click", saveSettings);
    $("upload-background").addEventListener("click", () => runAction(uploadBackground));
    $("remove-background").addEventListener("click", removeBackground);
    $("change-email").addEventListener("click", () => runAction(updateEmail));
    $("change-password").addEventListener("click", () => runAction(updatePassword));

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

    await loadSettings();
    say("Settings loaded.", "success");
  }

  start().catch(error => {
    console.error("Grove settings initialization:", error);
    say(error.message || "Could not load settings.", "error");
  });
})();
```
