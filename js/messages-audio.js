import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const BUCKET = "grove-private";
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_FILES_PER_SEND = 5;
  const MAX_RECORDING_TIME = 120000;
  const SIGNED_URL_LIFETIME = 3600;

  const MIME_BY_EXTENSION = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip"
  };

  const ALLOWED_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "webp", "gif",
    "mp4", "webm", "mov",
    "mp3", "m4a", "wav", "ogg", "aac",
    "pdf", "txt", "csv", "doc", "docx",
    "xls", "xlsx", "ppt", "pptx", "zip"
  ]);

  let user = null;
  let uploading = false;
  let recording = false;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let recordingConversationId = null;
  let recordingTimer = null;
  let recordButton = null;

  const enhanced = new Set();
  const enhancing = new Set();
  const signedUrlCache = new Map();

  function status(message, error = false) {
    const node = $("#audio-upload-status");
    if (!node) return;

    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  function activeConversationId() {
    return document.querySelector(
      ".conversation-item.active[data-conversation-id]"
    )?.dataset.conversationId || null;
  }

  function extensionOf(file) {
    return String(file.name || "")
      .toLowerCase()
      .split(".")
      .pop();
  }

  function mimeOf(file) {
    const supplied = String(file.type || "")
      .toLowerCase()
      .split(";")[0]
      .trim();

    if (supplied && supplied !== "application/octet-stream") {
      return supplied;
    }

    const extension = extensionOf(file);

    if (extension === "webm") {
      return "video/webm";
    }

    return MIME_BY_EXTENSION[extension] || "";
  }

  function classify(mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "file";
  }

  function setControlsEnabled(enabled) {
    const attachButton = $("#audio-attach-button");
    const fileInput = $("#audio-file-input");

    if (attachButton) {
      attachButton.disabled = !enabled || uploading;
    }

    if (fileInput) {
      fileInput.disabled = !enabled || uploading;
    }

    if (recordButton) {
      recordButton.disabled = recording
        ? false
        : (!enabled || uploading);
    }
  }

  function validateFile(file) {
    const extension = extensionOf(file);
    const mime = mimeOf(file);

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error("That file type is not supported.");
    }

    if (!mime) {
      throw new Error("Grove could not identify this file type.");
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new Error(
        `${file.name} must be larger than 0 bytes and no more than 25 MB.`
      );
    }

    return {
      extension,
      mime,
      category: classify(mime)
    };
  }

  async function uploadOne(file, conversationId) {
    const details = validateFile(file);
    const safeName = crypto.randomUUID() + "." + details.extension;
    const path = `${conversationId}/${user.id}/${safeName}`;

    let uploaded = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: details.mime,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      uploaded = true;

      const body = `Shared a ${details.category} attachment`;

      const { data, error } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body,
          attachment_path: path,
          attachment_mime_type: details.mime,
          attachment_filename: String(file.name || safeName).slice(0, 180)
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error("The attachment message was not saved.");

      await enhanceMessage(data.id, 12);
      return data.id;

    } catch (error) {
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove([path]);

        if (cleanupError) {
          console.warn("Attachment cleanup failed:", cleanupError);
        }
      }

      throw error;
    }
  }

  async function sendFiles(files, conversationOverride = null) {
    if (!user) throw new Error("Sign in before sending attachments.");

    const conversationId =
      conversationOverride || activeConversationId();

    if (!conversationId) {
      throw new Error("Choose a conversation first.");
    }

    if (!files.length) return;

    if (files.length > MAX_FILES_PER_SEND) {
      throw new Error(`Choose no more than ${MAX_FILES_PER_SEND} files at once.`);
    }

    files.forEach(validateFile);

    uploading = true;
    setControlsEnabled(false);

    try {
      for (let index = 0; index < files.length; index += 1) {
        status(`Uploading file ${index + 1} of ${files.length}...`);
        await uploadOne(files[index], conversationId);
      }

      status(
        files.length === 1
          ? "Attachment sent."
          : `${files.length} attachments sent.`
      );

    } finally {
      uploading = false;
      setControlsEnabled(Boolean(activeConversationId()));
    }
  }

  async function getSignedUrl(path) {
    const cached = signedUrlCache.get(path);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_LIFETIME);

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new Error("The private attachment link could not be created.");
    }

    signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_LIFETIME - 60) * 1000
    });

    return data.signedUrl;
  }

  function attachmentElement(url, data) {
    const mime = String(data.attachment_mime_type || "").toLowerCase();
    const category = classify(mime);
    const filename = data.attachment_filename || "Grove attachment";

    const wrap = document.createElement("div");
    wrap.className = "message-attachment";

    if (category === "image") {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "message-attachment-image-link";

      const image = document.createElement("img");
      image.src = url;
      image.alt = filename;
      image.loading = "lazy";
      image.className = "message-attachment-image";

      link.append(image);
      wrap.append(link);

    } else if (category === "video") {
      const video = document.createElement("video");
      video.className = "message-attachment-video";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";

      const source = document.createElement("source");
      source.src = url;
      source.type = mime;

      video.append(source);
      wrap.append(video);

    } else if (category === "audio") {
      const audio = document.createElement("audio");
      audio.className = "message-audio-player";
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = url;
      audio.setAttribute("aria-label", "Audio attachment");
      wrap.append(audio);

    } else {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "message-file-download";
      link.textContent = `Download ${filename}`;
      link.download = filename;
      wrap.append(link);
    }

    const label = document.createElement("span");
    label.className = "message-attachment-label";
    label.textContent = filename;
    wrap.append(label);

    return wrap;
  }

  async function enhanceMessage(messageId, attempts = 1) {
    if (!messageId || enhanced.has(messageId) || enhancing.has(messageId)) {
      return;
    }

    let article = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (!article && attempts > 0) {
      await new Promise(resolve => window.setTimeout(resolve, 250));
      return enhanceMessage(messageId, attempts - 1);
    }

    if (!article) return;

    enhancing.add(messageId);

    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("attachment_path,attachment_mime_type,attachment_filename")
        .eq("id", messageId)
        .maybeSingle();

      if (error) throw error;

      if (!data?.attachment_path) {
        enhanced.add(messageId);
        return;
      }

      const url = await getSignedUrl(data.attachment_path);

      article = document.querySelector(
        `[data-message-id="${messageId}"]`
      );

      if (!article || article.querySelector(".message-attachment")) {
        enhanced.add(messageId);
        return;
      }

      const body = article.querySelector("p");
      const media = attachmentElement(url, data);

      if (body) {
        body.insertAdjacentElement("afterend", media);
      } else {
        article.prepend(media);
      }

      enhanced.add(messageId);

    } catch (error) {
      console.warn("Message attachment could not load:", error);

    } finally {
      enhancing.delete(messageId);
    }
  }

  function scanMessages(root = document) {
    if (root.matches?.("[data-message-id]")) {
      enhanceMessage(root.dataset.messageId);
    }

    root.querySelectorAll?.("[data-message-id]").forEach(article => {
      enhanceMessage(article.dataset.messageId);
    });
  }

  function installRecorderStyles() {
    if ($("#grove-audio-recorder-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-audio-recorder-styles";
    style.textContent = `
      .audio-record-button {
        min-height: 44px;
        padding: 8px 12px;
        border: 1px solid rgba(233,163,75,.4);
        border-radius: 10px;
        background: rgba(233,163,75,.10);
        color: #f7f5ff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .audio-record-button:hover:not(:disabled) {
        border-color: rgba(233,163,75,.8);
        background: rgba(233,163,75,.17);
      }
      .audio-record-button.recording {
        border-color: #ff8585;
        background: rgba(255,80,100,.16);
        color: #ffb0b0;
      }
      .audio-record-button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }
      @media(max-width:640px) {
        .audio-record-button {
          min-height: 42px;
          padding: 7px 9px;
          font-size: .75rem;
        }
      }
    `;

    document.head.append(style);
  }

  function stopRecordingTracks() {
    if (recordingTimer) {
      window.clearTimeout(recordingTimer);
      recordingTimer = null;
    }

    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
      recordingStream = null;
    }
  }

  function resetRecorderButton() {
    if (!recordButton) return;

    recordButton.classList.remove("recording");
    recordButton.textContent = "🎙 Record voice";
    recordButton.disabled = !activeConversationId() || uploading;
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Voice recording is not supported by this browser.");
    }

    const conversationId = activeConversationId();
    if (!conversationId) throw new Error("Choose a conversation first.");

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];

    const mimeType = candidates.find(type =>
      MediaRecorder.isTypeSupported?.(type)
    );

    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    recordingConversationId = conversationId;
    recordingChunks = [];

    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream);
    } catch {
      stopRecordingTracks();
      throw new Error("This browser could not start audio recording.");
    }

    recording = true;
    recordButton.classList.add("recording");
    recordButton.textContent = "■ Stop & send";
    recordButton.disabled = false;

    setControlsEnabled(true);
    status("Recording voice message... Maximum 2 minutes.");

    mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data?.size) recordingChunks.push(event.data);
    });

    mediaRecorder.addEventListener("error", () => {
      status("The microphone recording encountered an error.", true);
      if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    });

    mediaRecorder.addEventListener("stop", async () => {
      const chunks = recordingChunks;
      const targetConversationId = recordingConversationId;
      const recordedType = mediaRecorder?.mimeType || mimeType || "audio/webm";

      recordingChunks = [];
      recordingConversationId = null;
      recording = false;
      mediaRecorder = null;

      stopRecordingTracks();
      resetRecorderButton();

      if (!chunks.length) {
        status("No audio was captured. Try again.", true);
        setControlsEnabled(Boolean(activeConversationId()));
        return;
      }

      try {
        const blob = new Blob(chunks, { type: recordedType });

        if (blob.size > 20 * 1024 * 1024) {
          throw new Error("This recording exceeds the 20 MB voice limit.");
        }

        const mime = recordedType.split(";")[0].toLowerCase();
        const extension = mime.includes("ogg") ? "ogg"
          : mime.includes("mp4") ? "m4a"
          : "webm";

        const file = new File(
          [blob],
          `Grove-voice-${Date.now()}.${extension}`,
          { type: mime }
        );

        uploading = true;
        setControlsEnabled(false);
        status("Sending voice message...");
        await uploadOne(file, targetConversationId);
        status("Voice message sent.");

      } catch (error) {
        console.error("Voice message send failed:", error);
        status(error.message || "Voice message could not be sent.", true);

      } finally {
        uploading = false;
        setControlsEnabled(Boolean(activeConversationId()));
        resetRecorderButton();
      }
    }, { once: true });

    recordingTimer = window.setTimeout(() => {
      if (mediaRecorder?.state === "recording") {
        status("Two-minute recording limit reached. Sending...");
        mediaRecorder.stop();
      }
    }, MAX_RECORDING_TIME);
  }

  function installVoiceRecorder(attachButton) {
    installRecorderStyles();

    recordButton = document.createElement("button");
    recordButton.type = "button";
    recordButton.id = "audio-record-button";
    recordButton.className = "audio-record-button";
    recordButton.textContent = "🎙 Record voice";
    recordButton.disabled = true;
    recordButton.setAttribute("aria-label", "Record a voice message");

    attachButton.insertAdjacentElement("afterend", recordButton);

    recordButton.addEventListener("click", async () => {
      if (recording && mediaRecorder?.state === "recording") {
        status("Finishing voice message...");
        recordButton.disabled = true;
        mediaRecorder.stop();
        return;
      }

      if (recording || uploading) return;

      recordButton.disabled = true;

      try {
        await startVoiceRecording();
      } catch (error) {
        console.error("Microphone recording could not start:", error);
        status(error.message || "Microphone access was unavailable.", true);
        recording = false;
        mediaRecorder = null;
        recordingChunks = [];
        recordingConversationId = null;
        stopRecordingTracks();
        resetRecorderButton();
        setControlsEnabled(Boolean(activeConversationId()));
      }
    });
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    user = data.user || null;
    if (!user) return;

    const attachButton = $("#audio-attach-button");
    const fileInput = $("#audio-file-input");

    if (!attachButton || !fileInput) return;

    installVoiceRecorder(attachButton);

    attachButton.addEventListener("click", () => {
      if (!uploading && activeConversationId()) fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = "";

      if (!files.length || uploading) return;

      try {
        await sendFiles(files);
      } catch (error) {
        console.error("Message attachment upload failed:", error);
        status(error.message || "Attachments could not be sent.", true);
      }
    });

    const conversationList = $("#conversation-list");
    const messageList = $("#message-list");

    if (conversationList) {
      new MutationObserver(() => {
        setControlsEnabled(Boolean(activeConversationId()));
      }).observe(conversationList, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });
    }

    if (messageList) {
      new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element) scanMessages(node);
          }
        }
      }).observe(messageList, {
        childList: true,
        subtree: true
      });

      scanMessages(messageList);
    }

    setControlsEnabled(Boolean(activeConversationId()));
  }

  window.addEventListener("beforeunload", () => {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    stopRecordingTracks();
  });

  initialize().catch(error => {
    console.error("Grove message attachments failed to initialize:", error);
    status(error.message || "Message attachments could not initialize.", true);
  });
})();
