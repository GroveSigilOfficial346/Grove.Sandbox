import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const BUCKET = "post-media-private";
  const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

  const AUDIO_TYPES = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/aac": "aac"
  };

  const form = document.getElementById("post-form");
  const options = document.querySelector(".composer-options");
  const imageInput = document.getElementById("post-images");
  const bodyInput = document.getElementById("post-body");
  const visibilityInput = document.getElementById("post-visibility");
  const publishButton = document.getElementById("publish-post");
  const status = document.getElementById("composer-status");

  if (!form || !options || !publishButton || !status) return;

  let currentUser = null;
  let audioInput = null;
  let busy = false;

  function setStatus(message, error = false) {
    status.textContent = message || "";
    status.classList.toggle("error", error);
  }

  function createStyles() {
    if (document.getElementById("grove-audio-post-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-audio-post-styles";

    style.textContent = `
      .audio-post-picker {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 8px 12px;
        border: 1px solid rgba(235,54,237,.4);
        border-radius: 10px;
        color: #f7f5ff;
        background: rgba(133,30,255,.15);
        cursor: pointer;
        font: inherit;
      }

      .audio-post-picker:hover {
        background: rgba(133,30,255,.28);
      }

      .audio-post-selection {
        flex-basis: 100%;
        font-size: .82rem;
        opacity: .8;
      }

      .post-audio-player {
        display: block;
        width: 100%;
        max-width: 460px;
        margin: 10px 0;
      }

      .post-images:has(.post-audio-player) {
        display: block;
      }

      @media (max-width: 640px) {
        .audio-post-picker {
          min-height: 40px;
          padding: 7px 9px;
          font-size: .82rem;
        }

        .post-audio-player {
          max-width: 100%;
        }
      }
    `;

    document.head.append(style);
  }

  function installPicker() {
    createStyles();

    const label = document.createElement("label");
    label.className = "audio-post-picker";
    label.htmlFor = "post-audio";
    label.textContent = "🎵 Add audio";

    audioInput = document.createElement("input");
    audioInput.id = "post-audio";
    audioInput.type = "file";
    audioInput.accept = Object.keys(AUDIO_TYPES).join(",");
    audioInput.hidden = true;

    const selection = document.createElement("p");
    selection.id = "selected-audio";
    selection.className = "audio-post-selection";

    options.insertBefore(label, options.querySelector("#post-visibility"));
    options.append(audioInput, selection);

    audioInput.addEventListener("change", () => {
      const file = audioInput.files?.[0];

      if (!file) {
        selection.textContent = "";
        return;
      }

      try {
        validateAudio(file);

        if (imageInput?.files?.length) {
          throw new Error(
            "Choose either images or audio for one post, not both."
          );
        }

        selection.textContent =
          `${file.name} · ${formatSize(file.size)}`;

        setStatus("");

      } catch (error) {
        audioInput.value = "";
        selection.textContent = "";
        setStatus(error.message, true);
      }
    });

    imageInput?.addEventListener("change", () => {
      if (imageInput.files?.length && audioInput.files?.length) {
        audioInput.value = "";
        selection.textContent = "";
        setStatus(
          "Choose either images or audio for one post, not both.",
          true
        );
      }
    });
  }

  function formatSize(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function validateAudio(file) {
    if (!AUDIO_TYPES[file.type]) {
      throw new Error(
        "Use MP3, M4A, WAV, OGG, WebM, or AAC audio."
      );
    }

    if (file.size <= 0 || file.size > MAX_AUDIO_SIZE) {
      throw new Error(
        "Audio must be larger than 0 bytes and no more than 20 MB."
      );
    }
  }

  async function publishAudioPost(file) {
    if (!currentUser) {
      throw new Error("Sign in before publishing.");
    }

    validateAudio(file);

    const body = bodyInput.value.trim();
    const visibility = visibilityInput.value;

    if (body.length > 5000) {
      throw new Error("Posts cannot exceed 5,000 characters.");
    }

    if (!["public", "followers", "private"].includes(visibility)) {
      throw new Error("Choose a valid post visibility.");
    }

    const postId = crypto.randomUUID();
    const extension = AUDIO_TYPES[file.type];
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const path = `${currentUser.id}/${postId}/${fileName}`;

    let uploaded = false;

    publishButton.disabled = true;
    busy = true;
    setStatus("Uploading private audio...");

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      uploaded = true;
      setStatus("Publishing audio post...");

      const { data, error } = await supabase
        .from("posts")
        .insert({
          id: postId,
          author_id: currentUser.id,
          body,
          media_urls: [path],
          visibility
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error("Post could not be confirmed.");

      form.reset();

      const selectedAudio = document.getElementById("selected-audio");
      if (selectedAudio) selectedAudio.textContent = "";

      setStatus("Audio post published.");

      document.getElementById("refresh-feed")?.click();

    } catch (error) {
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove([path]);

        if (cleanupError) {
          console.warn("Audio cleanup failed:", cleanupError);
        }
      }

      throw error;

    } finally {
      busy = false;
      publishButton.disabled = false;
    }
  }

  function handleAudioSubmit(event) {
    if (busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const file = audioInput?.files?.[0];

    if (!file) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    publishAudioPost(file).catch(error => {
      console.error("Audio post failed:", error);
      setStatus(
        error.message || "Could not publish audio post.",
        true
      );
    });
  }

  function upgradeAudioPlayers(root = document) {
    const images = [];

    if (root.matches?.(".post-images img")) {
      images.push(root);
    }

    root.querySelectorAll?.(".post-images img").forEach(image => {
      images.push(image);
    });

    for (const image of images) {
      const link = image.closest("a");
      if (!link || link.dataset.audioConverted === "true") continue;

      let pathname = "";

      try {
        pathname = new URL(link.href).pathname.toLowerCase();
      } catch {
        continue;
      }

      if (!/\.(mp3|m4a|wav|ogg|webm|aac)$/.test(pathname)) {
        continue;
      }

      const player = document.createElement("audio");
      player.className = "post-audio-player";
      player.controls = true;
      player.preload = "metadata";
      player.src = link.href;
      player.setAttribute("aria-label", "Audio post playback");

      link.dataset.audioConverted = "true";
      link.replaceWith(player);
    }
  }

  function watchFeeds() {
    const targets = [
      document.getElementById("community-feed"),
      document.getElementById("pinned-community-feed")
    ].filter(Boolean);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            upgradeAudioPlayers(node);
          }
        }
      }
    });

    targets.forEach(target => {
      observer.observe(target, {
        childList: true,
        subtree: true
      });

      upgradeAudioPlayers(target);
    });
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user;

    if (!currentUser) return;

    installPicker();

    // Capture phase handles audio before the existing image-post handler.
    form.addEventListener("submit", handleAudioSubmit, true);

    watchFeeds();
  }

  initialize().catch(error => {
    console.error("Community audio module failed:", error);
    setStatus(
      error.message || "Audio posting could not initialize.",
      true
    );
  });
})();
