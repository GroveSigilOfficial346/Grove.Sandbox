import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const BUCKET = "grove-private";
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

  let user = null;
  let uploading = false;
  const enhanced = new Set();
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
    if (AUDIO_TYPES[file.type]) return AUDIO_TYPES[file.type];

    const name = file.name.toLowerCase();
    const match = name.match(/\.(mp3|m4a|wav|ogg|webm|aac)$/);

    return match?.[1] || null;
  }

  function setControlsEnabled(enabled) {
    const button = $("#audio-attach-button");
    const input = $("#audio-file-input");

    if (button) button.disabled = !enabled || uploading;
    if (input) input.disabled = !enabled || uploading;
  }

  async function uploadAudio(file) {
    if (!user) throw new Error("Sign in before sending audio.");

    const conversationId = activeConversationId();

    if (!conversationId) {
      throw new Error("Choose a conversation first.");
    }

    const extension = getExtension(file);

    if (!extension) {
      throw new Error("Choose an MP3, M4A, WAV, OGG, WebM, or AAC file.");
    }

    if (!file.type.startsWith("audio/")) {
      throw new Error("The selected file is not recognized as audio.");
    }

    if (file.size <= 0 || file.size > MAX_AUDIO_SIZE) {
      throw new Error("Audio files must be larger than 0 and no more than 20 MB.");
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
          contentType: file.type,
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
          attachment_mime_type: file.type,
          attachment_filename: file.name.slice(0, 180)
        })
        .select("id")
        .single();

      if (error) throw error;

      if (!data?.id) {
        throw new Error("The audio message could not be saved.");
      }

      status("Audio message sent.");
      enhanceMessage(data.id);

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
    if (signedUrlCache.has(path)) {
      return signedUrlCache.get(path);
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("Audio playback link could not be created.");
    }

    signedUrlCache.set(path, data.signedUrl);
    return data.signedUrl;
  }

  async function enhanceMessage(messageId) {
    if (!messageId || enhanced.has(messageId)) return;

    const article = document.querySelector(
      `[data-message-id="${messageId}"]`
    );

    if (!article) return;

    enhanced.add(messageId);

    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("attachment_path,attachment_mime_type,attachment_filename")
        .eq("id", messageId)
        .maybeSingle();

      if (error) throw error;

      if (!data?.attachment_path) return;

      const url = await getAudioUrl(data.attachment_path);

      const currentArticle = document.querySelector(
        `[data-message-id="${messageId}"]`
      );

      if (!currentArticle) return;

      const player = document.createElement("audio");
      player.className = "message-audio-player";
      player.controls = true;
      player.preload = "metadata";
      player.src = url;

      if (data.attachment_mime_type) {
        player.type = data.attachment_mime_type;
      }

      const label = document.createElement("span");
      label.className = "message-audio-label";
      label.textContent = data.attachment_filename || "Audio attachment";

      const body = currentArticle.querySelector("p");

      if (body) {
        body.insertAdjacentElement("afterend", player);
        player.insertAdjacentElement("afterend", label);
      } else {
        currentArticle.prepend(player, label);
      }

    } catch (error) {
      console.warn("Audio attachment could not load:", error);
      enhanced.delete(messageId);
    }
  }

  function scanMessages(root = document) {
    root.querySelectorAll("[data-message-id]").forEach(article => {
      enhanceMessage(article.dataset.messageId);
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

  initialize().catch(error => {
    console.error("Grove audio module failed:", error);
    status(error.message || "Audio messaging could not initialize.", true);
  });
})();
