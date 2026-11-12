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
  const MAX_WARNING_LENGTH = 120;

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
  let canPublishAdult = false;
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

    return {
      extension,
      contentType: AUDIO_TYPES[file.type] || ({
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        wav: "audio/wav",
        ogg: "audio/ogg",
        webm: "audio/webm",
        aac: "audio/aac"
      })[extension]
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

  function updateContentRatingControls() {
    const rating = $("#profile-post-rating");
    const warningWrap = $("#profile-post-warning-wrap");
    const warning = $("#profile-post-content-warning");
    const hint = $("#profile-post-rating-hint");

    if (!rating) return;

    const adultOption = rating.querySelector(
      'option[value="adult"]'
    );

    if (adultOption) {
      adultOption.disabled = !canPublishAdult;
    }

    if (!canPublishAdult && rating.value === "adult") {
      rating.value = "general";
    }

    const isAdult = rating.value === "adult";

    if (warningWrap) warningWrap.hidden = !isAdult;
    if (warning) warning.required = isAdult;

    if (hint) {
      hint.textContent = canPublishAdult
        ? "Adult posts require a content warning and are only visible to verified Adult accounts."
        : "Adult posting requires verified Adult account access.";
    }
  }

  async function resolveOwnProfile() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    currentUser = auth.user || null;
    if (!currentUser) return false;

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");
    const requestedUsername = params.get("username");

    if (requestedId && requestedId !== currentUser.id) {
      return false;
    }

    if (requestedUsername) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", requestedUsername.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      if (data?.id !== currentUser.id) return false;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.account_type === "adult") {
      const { data: access, error: accessError } = await supabase
        .from("grove_adult_access")
        .select("verification_status")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (accessError) throw accessError;

      canPublishAdult =
        access?.verification_status === "verified";
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
    const rating = $("#profile-post-rating")?.value || "general";
    const warning =
      $("#profile-post-content-warning")?.value.trim() || "";

    const submit = $("#profile-post-submit");

    if (
      !body &&
      !selectedImages.length &&
      !selectedAudio &&
      !selectedVideo
    ) {
      setStatus(
        "Write something or choose an attachment first.",
        true
      );
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

    if (!["general", "adult"].includes(rating)) {
      setStatus("Choose a valid content rating.", true);
      return;
    }

    if (rating === "adult" && !canPublishAdult) {
      setStatus(
        "Verified Adult access is required to publish Adult posts.",
        true
      );
      return;
    }

    if (
      rating === "adult" &&
      (warning.length < 3 || warning.length > MAX_WARNING_LENGTH)
    ) {
      setStatus(
        "Adult posts need a content warning between 3 and 120 characters.",
        true
      );
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
          content_rating: rating,
          content_warning: rating === "adult" ? warning : ""
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "The post was not saved. Please try again."
        );
      }

      $("#profile-post-body").value = "";
      $("#profile-post-visibility").value = "public";

      if ($("#profile-post-rating")) {
        $("#profile-post-rating").value = "general";
      }

      if ($("#profile-post-content-warning")) {
        $("#profile-post-content-warning").value = "";
      }

      selectedImages = [];
      selectedAudio = null;
      selectedVideo = null;

      $("#profile-post-images").value = "";
      $("#profile-post-audio").value = "";
      $("#profile-post-video").value = "";

      renderPreviews();
      updateCounter();
      updateContentRatingControls();
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
          console.warn(
            "Temporary upload cleanup failed:",
            cleanupError
          );
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
    const rating = $("#profile-post-rating");

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

        if (rating) {
          rating.addEventListener(
            "change",
            updateContentRatingControls
          );
        }

        updateContentRatingControls();

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
              selectedAudio
                ? "Audio selected: " + selectedAudio.name
                : ""
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
              selectedVideo
                ? "Video selected: " + selectedVideo.name
                : ""
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
        console.error(
          "Profile composer initialization failed:",
          error
        );

        setStatus(
          error.message || "The post composer could not load.",
          true
        );
      });
  }

  window.addEventListener("beforeunload", revokePreviews);
  install();
})();
