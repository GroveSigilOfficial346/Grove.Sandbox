import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const BUCKET = "post-media-private";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  const MAX_IMAGES = 10;
  const MAX_BODY_LENGTH = 5000;

  const IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

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

  const VIDEO_TYPES = {
    "video/mp4": "mp4",
    "video/webm": "webm"
  };

  let currentUser = null;
  let selectedImages = [];
  let selectedAudio = null;
  let selectedVideo = null;

  function setStatus(message, error = false) {
    const node = $("#profile-post-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  function setAudioStatus(message, error = false) {
    const node = $("#profile-post-audio-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  function setVideoStatus(message, error = false) {
    const node = $("#profile-post-video-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  function imageExtension(file) {
    return IMAGE_TYPES[file.type] || null;
  }

  function audioExtension(file) {
    const mime = String(file.type || "").toLowerCase();

    if (AUDIO_TYPES[mime]) return AUDIO_TYPES[mime];

    const extension = String(file.name || "")
      .toLowerCase()
      .split(".")
      .pop();

    return Object.values(AUDIO_TYPES).includes(extension)
      ? extension
      : null;
  }

  function videoExtension(file) {
    const mime = String(file.type || "").toLowerCase();

    if (VIDEO_TYPES[mime]) return VIDEO_TYPES[mime];

    const extension = String(file.name || "")
      .toLowerCase()
      .split(".")
      .pop();

    return ["mp4", "webm"].includes(extension)
      ? extension
      : null;
  }

  function revokePreviews() {
    document.querySelectorAll(
      "#profile-post-preview img[data-preview-url]"
    ).forEach(image => {
      URL.revokeObjectURL(image.dataset.previewUrl);
    });
  }

  function renderPreviews() {
    const container = $("#profile-post-preview");
    if (!container) return;

    revokePreviews();
    container.replaceChildren();

    selectedImages.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "profile-post-preview-item";

      const image = document.createElement("img");
      const previewUrl = URL.createObjectURL(file);

      image.src = previewUrl;
      image.alt = "Selected post image";
      image.dataset.previewUrl = previewUrl;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove selected image");

      remove.addEventListener("click", () => {
        selectedImages.splice(index, 1);
        renderPreviews();
      });

      item.append(image, remove);
      container.append(item);
    });
  }

  function validateImages(files) {
    if (files.length > MAX_IMAGES) {
      throw new Error("You can upload up to 10 images per post.");
    }

    for (const file of files) {
      if (!imageExtension(file)) {
        throw new Error("Use JPG, PNG, WebP, or GIF images.");
      }

      if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
        throw new Error(
          `${file.name} must be larger than 0 bytes and 5 MB or smaller.`
        );
      }
    }
  }

  function validateAudio(file) {
    if (!file) return null;

    const extension = audioExtension(file);

    if (!extension) {
      throw new Error("Use MP3, M4A, WAV, OGG, WebM, or AAC audio.");
    }

    if (file.size <= 0 || file.size > MAX_AUDIO_SIZE) {
      throw new Error(
        "Audio must be larger than 0 bytes and 20 MB or smaller."
      );
    }

    const fallbackTypes = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
      aac: "audio/aac"
    };

    return {
      extension,
      contentType: AUDIO_TYPES[file.type] || fallbackTypes[extension]
    };
  }

  function validateVideo(file) {
    if (!file) return null;

    const extension = videoExtension(file);

    if (!extension) {
      throw new Error("Use MP4 or WebM video files.");
    }

    if (file.size <= 0 || file.size > MAX_VIDEO_SIZE) {
      throw new Error(
        "Video must be larger than 0 bytes and 50 MB or smaller."
      );
    }

    return {
      extension,
      contentType: VIDEO_TYPES[file.type] || `video/${extension}`
    };
  }

  async function resolveOwnProfile() {
    const { data: auth, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = auth.user || null;
    if (!currentUser) return false;

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    if (requestedId && requestedId !== currentUser.id) {
      return false;
    }

    if (requestedUsername) {
      const { data, error: usernameError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", requestedUsername.toLowerCase())
        .maybeSingle();

      if (usernameError) throw usernameError;
      if (data?.id !== currentUser.id) return false;
    }

    return true;
  }

  async function uploadSelectedFiles(postId, uploadedPaths) {
    const files = selectedImages.map(file => ({
      file,
      extension: imageExtension(file),
      contentType: file.type
    }));

    if (selectedAudio) {
      const audio = validateAudio(selectedAudio);
      files.push({
        file: selectedAudio,
        extension: audio.extension,
        contentType: audio.contentType
      });
    }

    if (selectedVideo) {
      const video = validateVideo(selectedVideo);
      files.push({
        file: selectedVideo,
        extension: video.extension,
        contentType: video.contentType
      });
    }

    for (const item of files) {
      const filename = crypto.randomUUID() + "." + item.extension;
      const path = `${currentUser.id}/${postId}/${filename}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, item.file, {
          contentType: item.contentType,
          cacheControl: "3600",
          upsert: false
        });

      if (error) throw error;

      uploadedPaths.push(path);
    }

    return uploadedPaths;
  }

  async function publishPost(event) {
    event.preventDefault();

    const body = $("#profile-post-body").value.trim();
    const visibility = $("#profile-post-visibility").value;
    const submit = $("#profile-post-submit");

    if (
      !body &&
      !selectedImages.length &&
      !selectedAudio &&
      !selectedVideo
    ) {
      setStatus("Write something or choose an attachment first.", true);
      return;
    }

    if (body.length > MAX_BODY_LENGTH) {
      setStatus("Your post is too long.", true);
      return;
    }

    if (!["public", "followers", "private"].includes(visibility)) {
      setStatus("Choose a valid post visibility setting.", true);
      return;
    }

    try {
      validateImages(selectedImages);
      validateAudio(selectedAudio);
      validateVideo(selectedVideo);
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    submit.disabled = true;
    setStatus("Preparing your post...");

    const postId = crypto.randomUUID();
    const uploadedPaths = [];

    try {
      await uploadSelectedFiles(postId, uploadedPaths);

      setStatus("Publishing...");

      const { data, error } = await supabase
        .from("posts")
        .insert({
          id: postId,
          author_id: currentUser.id,
          body,
          media_urls: uploadedPaths,
          visibility,
          content_rating: "general",
          content_warning: ""
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("The post was not saved. Please try again.");
      }

      $("#profile-post-body").value = "";
      $("#profile-post-visibility").value = "public";

      selectedImages = [];
      selectedAudio = null;
      selectedVideo = null;

      $("#profile-post-images").value = "";
      $("#profile-post-audio").value = "";
      $("#profile-post-video").value = "";

      renderPreviews();
      updateCounter();
      setAudioStatus("");
      setVideoStatus("");

      setStatus("Post published successfully.");
      window.location.reload();

    } catch (error) {
      console.error("Profile post publishing failed:", error);

      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove(uploadedPaths);

        if (cleanupError) {
          console.warn("Temporary upload cleanup failed:", cleanupError);
        }
      }

      setStatus(
        error.message || "Your post could not be published.",
        true
      );

      submit.disabled = false;
    }
  }

  function updateCounter() {
    const body = $("#profile-post-body");
    const counter = $("#profile-post-counter");

    if (!body || !counter) return;

    counter.textContent =
      body.value.length + " / " + MAX_BODY_LENGTH;
  }

  function install() {
    const composer = $("#profile-post-composer");
    const form = $("#profile-post-form");
    const imageInput = $("#profile-post-images");
    const audioInput = $("#profile-post-audio");
    const videoInput = $("#profile-post-video");
    const body = $("#profile-post-body");

    if (
      !composer ||
      !form ||
      !imageInput ||
      !audioInput ||
      !videoInput ||
      !body
    ) {
      return;
    }

    composer.hidden = true;

    resolveOwnProfile()
      .then(isOwner => {
        if (!isOwner) return;

        composer.hidden = false;

        form.addEventListener("submit", publishPost);
        body.addEventListener("input", updateCounter);

        imageInput.addEventListener("change", () => {
          try {
            const incoming = Array.from(imageInput.files || []);
            const combined = [...selectedImages, ...incoming];

            validateImages(combined);

            selectedImages = combined;
            renderPreviews();
            setStatus("");

          } catch (error) {
            setStatus(error.message, true);
          }

          imageInput.value = "";
        });

        audioInput.addEventListener("change", () => {
          const file = audioInput.files?.[0] || null;

          try {
            selectedAudio = file;
            validateAudio(selectedAudio);

            setAudioStatus(
              selectedAudio ? "Audio selected: " + selectedAudio.name : ""
            );

            setStatus("");

          } catch (error) {
            selectedAudio = null;
            audioInput.value = "";
            setAudioStatus(error.message, true);
          }
        });

        videoInput.addEventListener("change", () => {
          const file = videoInput.files?.[0] || null;

          try {
            selectedVideo = file;
            validateVideo(selectedVideo);

            setVideoStatus(
              selectedVideo ? "Video selected: " + selectedVideo.name : ""
            );

            setStatus("");

          } catch (error) {
            selectedVideo = null;
            videoInput.value = "";
            setVideoStatus(error.message, true);
          }
        });

        updateCounter();
      })
      .catch(error => {
        console.error("Profile composer initialization failed:", error);

        setStatus(
          error.message || "The post composer could not load.",
          true
        );
      });
  }

  window.addEventListener("beforeunload", revokePreviews);
  install();
})();
