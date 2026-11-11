import { supabase } from "./supabase.js";

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
const bodyInput = document.getElementById("post-body");
const imageInput = document.getElementById("post-images");
const audioInput = document.getElementById("post-audio");
const audioStatus = document.getElementById("selected-audio");
const imageStatus = document.getElementById("selected-images");
const visibilityInput = document.getElementById("post-visibility");
const publishButton = document.getElementById("publish-post");
const composerStatus = document.getElementById("composer-status");
const refreshButton = document.getElementById("refresh-feed");

function setStatus(message, isError = false) {
  if (!composerStatus) return;

  composerStatus.textContent = message || "";
  composerStatus.classList.toggle("error", isError);
}

function getAudioExtension(file) {
  const mime = (file.type || "").toLowerCase();

  if (AUDIO_TYPES[mime]) {
    return AUDIO_TYPES[mime];
  }

  const name = file.name.toLowerCase();
  const extension = name.split(".").pop();

  const supportedExtensions = [
    "mp3",
    "m4a",
    "wav",
    "ogg",
    "webm",
    "aac"
  ];

  return supportedExtensions.includes(extension)
    ? extension
    : null;
}

function getAudioContentType(file, extension) {
  const mime = (file.type || "").toLowerCase();

  if (Object.prototype.hasOwnProperty.call(AUDIO_TYPES, mime)) {
    return mime;
  }

  const fallbackTypes = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    aac: "audio/aac"
  };

  return fallbackTypes[extension] || "";
}

function validateAudio(file) {
  if (!file) {
    throw new Error("Choose an audio file first.");
  }

  if (file.size <= 0) {
    throw new Error("The selected audio file is empty.");
  }

  if (file.size > MAX_AUDIO_SIZE) {
    throw new Error("Audio files must be 20 MB or smaller.");
  }

  const extension = getAudioExtension(file);

  if (!extension) {
    throw new Error(
      "Use MP3, M4A, WAV, OGG, WebM, or AAC audio."
    );
  }

  const contentType = getAudioContentType(file, extension);

  if (!contentType) {
    throw new Error("The selected audio format is not supported.");
  }

  return { extension, contentType };
}

function isAudioUrl(value) {
  try {
    const url = new URL(value, window.location.origin);

    return /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function renderAudioPlayers(root = document) {
  const links = root.querySelectorAll(
    ".post-card .post-images a"
  );

  for (const link of links) {
    if (link.dataset.groveAudioReady === "true") {
      continue;
    }

    const source = link.href;

    if (!source || !isAudioUrl(source)) {
      continue;
    }

    const player = document.createElement("audio");

    player.controls = true;
    player.preload = "metadata";
    player.src = source;
    player.className = "grove-audio-player";
    player.setAttribute("aria-label", "Audio post");

    link.dataset.groveAudioReady = "true";
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.replaceChildren(player);
  }
}

function watchFeed(container) {
  if (!container) return;

  renderAudioPlayers(container);

  const observer = new MutationObserver(() => {
    renderAudioPlayers(container);
  });

  observer.observe(container, {
    childList: true,
    subtree: true
  });
}

function initializeAudioPlayers() {
  watchFeed(document.getElementById("community-feed"));
  watchFeed(document.getElementById("pinned-community-feed"));
}

if (audioInput) {
  audioInput.addEventListener("change", () => {
    const file = audioInput.files?.[0];

    if (!file) {
      audioStatus.textContent = "";
      return;
    }

    try {
      validateAudio(file);

      audioStatus.textContent =
        `Audio selected: ${file.name}`;

      setStatus("");

    } catch (error) {
      audioInput.value = "";
      audioStatus.textContent = "";
      setStatus(error.message, true);
    }
  });
}

if (form && audioInput) {
  form.addEventListener("submit", async event => {
    const file = audioInput.files?.[0];

    // Let the existing community.js handler publish ordinary posts.
    if (!file) return;

    // Audio posts are handled here so the existing image-only
    // submit handler does not also try to publish this post.
    event.preventDefault();
    event.stopImmediatePropagation();

    const body = bodyInput?.value.trim() || "";
    const visibility = visibilityInput?.value || "public";
    const imageFiles = Array.from(imageInput?.files || []);

    if (imageFiles.length) {
      setStatus(
        "Publish images and audio in separate posts for now.",
        true
      );
      return;
    }

    if (!body && !file) {
      setStatus("Write something or choose an audio file.", true);
      return;
    }

    if (body.length > 5000) {
      setStatus("Posts cannot exceed 5,000 characters.", true);
      return;
    }

    if (!["public", "followers", "private"].includes(visibility)) {
      setStatus("Choose a valid post visibility setting.", true);
      return;
    }

    let audioInfo;

    try {
      audioInfo = validateAudio(file);
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    if (publishButton) {
      publishButton.disabled = true;
    }

    setStatus("Publishing audio post...");

    let uploadedPath = "";

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData?.user;

      if (!user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const postId = crypto.randomUUID();
      const fileName =
        `${crypto.randomUUID()}.${audioInfo.extension}`;

      uploadedPath = `${user.id}/${postId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadedPath, file, {
          contentType: audioInfo.contentType,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("posts")
        .insert({
          id: postId,
          author_id: user.id,
          body,
          media_urls: [uploadedPath],
          visibility
        });

      if (insertError) throw insertError;

      form.reset();

      if (audioStatus) {
        audioStatus.textContent = "";
      }

      if (imageStatus) {
        imageStatus.textContent = "";
      }

      setStatus("Audio post published.");

      if (refreshButton) {
        refreshButton.click();
      }

    } catch (error) {
      console.error("Grove audio post failed:", error);

      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.warn(
            "Could not remove the unused audio upload:",
            cleanupError
          );
        }
      }

      setStatus(
        error.message || "Could not publish the audio post.",
        true
      );

    } finally {
      if (publishButton) {
        publishButton.disabled = false;
      }
    }
  }, true);
}

initializeAudioPlayers();
