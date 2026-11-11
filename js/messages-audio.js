import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const BUCKET = "grove-private";
  const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
  const MAX_RECORDING_TIME = 120000;
  const SIGNED_URL_LIFETIME = 3600;

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

  function getExtension(file) {
    const mime = (file.type || "")
      .toLowerCase()
      .split(";")[0]
      .trim();

    if (AUDIO_TYPES[mime]) {
      return AUDIO_TYPES[mime];
    }

    const match = (file.name || "").toLowerCase().match(
      /\.(mp3|m4a|wav|ogg|webm|aac)$/
    );

    return match?.[1] || null;
  }

  function getContentType(file, extension) {
    const mime = (file.type || "")
      .toLowerCase()
      .split(";")[0]
      .trim();

    if (AUDIO_TYPES[mime]) {
      return mime;
    }

    const fallback = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
      aac: "audio/aac"
    };

    return fallback[extension] || "";
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
      // Keep the stop control usable while a recording is active.
      recordButton.disabled = recording
        ? false
        : (!enabled || uploading);
    }
  }

  function wait(milliseconds) {
    return new Promise(resolve => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  async function uploadAudio(file, conversationIdOverride = null) {
    if (!user) {
      throw new Error("Sign in before sending audio.");
    }

    const conversationId =
      conversationIdOverride || activeConversationId();

    if (!conversationId) {
      throw new Error("Choose a conversation first.");
    }

    const extension = getExtension(file);

    if (!extension) {
      throw new Error(
        "Choose MP3, M4A, WAV, OGG, WebM, or AAC audio."
      );
    }

    if (file.size <= 0 || file.size > MAX_AUDIO_SIZE) {
      throw new Error(
        "Audio files must be larger than 0 and no more than 20 MB."
      );
    }

    const contentType = getContentType(file, extension);

    if (!contentType) {
      throw new Error("This audio format is not supported.");
    }

    const safeName = crypto.randomUUID() + "." + extension;
    const path = `${conversationId}/${user.id}/${safeName}`;

    uploading = true;
    setControlsEnabled(false);
    status("Uploading private audio...");

    let uploaded = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      uploaded = true;
      status("Sending audio message...");

      const { data, error } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: "Audio message",
          attachment_path: path,
          attachment_mime_type: contentType,
          attachment_filename: (
            file.name || `Grove-audio.${extension}`
          ).slice(0, 180)
        })
        .select("id")
        .single();

      if (error) throw error;

      if (!data?.id) {
        throw new Error("The audio message could not be saved.");
      }

      status("Audio message sent.");

      await enhanceMessage(data.id, 12);

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
      uploading = false;
      setControlsEnabled(Boolean(activeConversationId()));
    }
  }

  async function getAudioUrl(path) {
    const cached = signedUrlCache.get(path);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_LIFETIME);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("Audio playback link could not be created.");
    }

    signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_LIFETIME - 60) * 1000
    });

    return data.signedUrl;
  }

  async function enhanceMessage(messageId, attempts = 1) {
    if (
      !messageId ||
      enhanced.has(messageId) ||
      enhancing.has(messageId)
    ) {
      return;
    }

    let article = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (!article && attempts > 0) {
      await wait(250);
      return enhanceMessage(messageId, attempts - 1);
    }

    if (!article) return;

    enhancing.add(messageId);

    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select(
          "attachment_path,attachment_mime_type,attachment_filename"
        )
        .eq("id", messageId)
        .maybeSingle();

      if (error) throw error;

      if (!data?.attachment_path) {
        enhanced.add(messageId);
        return;
      }

      const url = await getAudioUrl(data.attachment_path);

      article = document.querySelector(
        `[data-message-id="${messageId}"]`
      );

      if (!article || article.querySelector(".message-audio-player")) {
        enhanced.add(messageId);
        return;
      }

      const player = document.createElement("audio");
      player.className = "message-audio-player";
      player.controls = true;
      player.preload = "metadata";
      player.src = url;
      player.setAttribute("aria-label", "Audio message");

      const label = document.createElement("span");
      label.className = "message-audio-label";
      label.textContent =
        data.attachment_filename || "Audio attachment";

      const body = article.querySelector("p");

      if (body) {
        body.insertAdjacentElement("afterend", player);
        player.insertAdjacentElement("afterend", label);
      } else {
        article.prepend(player, label);
      }

      enhanced.add(messageId);

    } catch (error) {
      console.warn("Audio attachment could not load:", error);

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
        min-height: 42px;
        padding: 8px 12px;
        border: 1px solid rgba(235, 54, 237, .45);
        border-radius: 10px;
        background: rgba(133, 30, 255, .16);
        color: #f7f5ff;
        font: inherit;
        font-weight: 750;
        cursor: pointer;
        transition: background .2s, border-color .2s;
      }

      .audio-record-button:hover:not(:disabled) {
        background: rgba(133, 30, 255, .3);
      }

      .audio-record-button.recording {
        border-color: #ff8585;
        background: rgba(255, 80, 100, .18);
        color: #ffb0b0;
      }

      .audio-record-button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .message-audio-player {
        display: block;
        width: 100%;
        max-width: 340px;
        margin: 10px 0;
      }

      .message-audio-label {
        display: block;
        font-size: .78rem;
        opacity: .7;
        margin-top: 4px;
      }

      @media (max-width: 640px) {
        .audio-record-button {
          min-height: 40px;
          padding: 7px 9px;
          font-size: .78rem;
        }

        .message-audio-player {
          max-width: 100%;
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
    recordButton.disabled =
      !activeConversationId() || uploading;
  }

  async function startVoiceRecording() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder
    ) {
      throw new Error(
        "Voice recording is not supported by this browser."
      );
    }

    const conversationId = activeConversationId();

    if (!conversationId) {
      throw new Error("Choose a conversation before recording.");
    }

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
    } catch (error) {
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
      if (event.data?.size) {
        recordingChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("error", () => {
      status("The microphone recording encountered an error.", true);

      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      const chunks = recordingChunks;
      const targetConversationId = recordingConversationId;
      const recordedType =
        mediaRecorder?.mimeType || mimeType || "audio/webm";

      recordingChunks = [];
      recordingConversationId = null;
      recording = false;
      mediaRecorder = null;

      stopRecordingTracks();
      resetRecorderButton();

      if (!chunks.length) {
        status("No audio was captured. Try recording again.", true);
        setControlsEnabled(Boolean(activeConversationId()));
        return;
      }

      try {
        const blob = new Blob(chunks, { type: recordedType });

        if (blob.size > MAX_AUDIO_SIZE) {
          throw new Error(
            "This recording exceeds the 20 MB audio limit."
          );
        }

        const normalizedType = recordedType
          .split(";")[0]
          .toLowerCase();

        const extension = normalizedType.includes("ogg") ? "ogg"
          : normalizedType.includes("mp4") ? "m4a"
          : normalizedType.includes("mpeg") ? "mp3"
          : "webm";

        const file = new File(
          [blob],
          "Grove-voice-message-" +
            new Date().toISOString().replace(/[:.]/g, "-") +
            "." + extension,
          {
            type: normalizedType || "audio/webm"
          }
        );

        await uploadAudio(file, targetConversationId);

      } catch (error) {
        console.error("Voice message send failed:", error);

        status(
          error.message || "Voice message could not be sent.",
          true
        );

      } finally {
        setControlsEnabled(Boolean(activeConversationId()));
        resetRecorderButton();
      }
    }, { once: true });

    recordingTimer = window.setTimeout(() => {
      if (mediaRecorder?.state === "recording") {
        status(
          "Two-minute recording limit reached. Sending voice message..."
        );
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

    recordButton.setAttribute(
      "aria-label",
      "Record a voice message"
    );

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

        status(
          error.message || "Microphone access was unavailable.",
          true
        );

        recording = false;
        mediaRecorder = null;
        recordingChunks = [];
        recordingConversationId = null;

        stopRecordingTracks();
        resetRecorderButton();
        setControlsEnabled(Boolean(activeConversationId()));
      }
    });

    return recordButton;
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
      if (!uploading && activeConversationId()) {
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";

      if (!file || uploading) return;

      try {
        await uploadAudio(file);

      } catch (error) {
        console.error("Audio upload failed:", error);
        status(error.message || "Audio could not be sent.", true);
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
            if (node instanceof Element) {
              scanMessages(node);
            }
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
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }

    stopRecordingTracks();
  });

  initialize().catch(error => {
    console.error("Grove audio module failed:", error);

    status(
      error.message || "Audio messaging could not initialize.",
      true
    );
  });

})();
