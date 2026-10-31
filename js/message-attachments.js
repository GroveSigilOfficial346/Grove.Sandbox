
"use strict";

(() => {
  const BUCKET = "grove-private";
  const MAX_SIZE = 8 * 1024 * 1024;
  const PREFIX = "GROVE_ATTACHMENT:";

  const signedUrlCache = new Map();

  const $ = id => document.getElementById(id);

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  function getBridge() {
    return window.GroveChatBridge || null;
  }

  function parseAttachment(body) {
    if (
      typeof body !== "string" ||
      !body.startsWith(PREFIX)
    ) {
      return null;
    }

    try {
      const data = JSON.parse(body.slice(PREFIX.length));

      if (
        data.type !== "image" ||
        typeof data.path !== "string"
      ) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  async function getSignedImage(path, conversationId) {
    const parts = path.split("/");

    if (
      parts.length !== 3 ||
      parts[0] !== conversationId ||
      !/^[0-9a-f-]{36}$/i.test(parts[1])
    ) {
      return null;
    }

    const cached = signedUrlCache.get(path);

    if (cached && cached.expires > Date.now()) {
      return cached.url;
    }

    const bridge = getBridge();

    if (!bridge) return null;

    const { data, error } = await bridge.db.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.error("Unable to access message image:", error);
      return null;
    }

    signedUrlCache.set(path, {
      url: data.signedUrl,
      expires: Date.now() + 3300000
    });

    return data.signedUrl;
  }

  async function render(messages, conversationId) {
    const bridge = getBridge();

    if (!bridge) {
      return "";
    }

    const rendered = await Promise.all(
      (messages || []).map(async message => {
        const mine = message.sender_id === bridge.user?.id;
        const deleted = Boolean(message.deleted_for_everyone_at);

        const attachment = deleted
          ? null
          : parseAttachment(message.body);

        let content = "";

        if (deleted) {
          content = "Message deleted";
        } else if (attachment) {
          const imageUrl = await getSignedImage(
            attachment.path,
            conversationId
          );

          content = escapeHTML(attachment.text || "");

          if (imageUrl) {
            content += `
              <a href="${escapeHTML(imageUrl)}"
                 target="_blank"
                 rel="noopener noreferrer">
                <img
                  class="chat-image"
                  src="${escapeHTML(imageUrl)}"
                  alt="Message attachment"
                  loading="lazy">
              </a>
            `;
          } else {
            content += `
              <p class="muted">Image unavailable.</p>
            `;
          }
        } else {
          content = escapeHTML(message.body);
        }

        return `
          <div class="bubble ${mine ? "mine" : ""}">
            ${content}
            <small>
              ${new Date(message.created_at).toLocaleString()}
            </small>
          </div>
        `;
      })
    );

    return rendered.join("");
  }

  function initialize() {
    const fileInput = $("messageImageFile");
    const clearButton = $("clearMessageImage");
    const status = $("messageImageStatus");
    const form = $("sendMessageForm");

    if (!fileInput || !clearButton || !status || !form) {
      console.error(
        "Grove image messaging: required HTML controls are missing."
      );
      return;
    }

    function clearSelection() {
      fileInput.value = "";
      status.textContent = "";
      clearButton.hidden = true;
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];

      if (!file) {
        clearSelection();
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
      ];

      if (!allowedTypes.includes(file.type)) {
        clearSelection();
        status.textContent = "Unsupported image type.";
        return;
      }

      if (file.size > MAX_SIZE) {
        clearSelection();
        status.textContent = "Image must be 8 MB or smaller.";
        return;
      }

      status.textContent = file.name;
      clearButton.hidden = false;
    });

    clearButton.addEventListener("click", () => {
      clearSelection();
    });

    /*
      Capture the form submission before the existing text-only
      handler. If no image is selected, the existing handler
      continues to send the message normally.
    */

    form.addEventListener("submit", async event => {
      const file = fileInput.files?.[0];

      if (!file) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const bridge = getBridge();

      if (!bridge?.user || !bridge?.conversationId) {
        status.textContent = "Open a conversation first.";
        return;
      }

      const user = bridge.user;
      const conversationId = bridge.conversationId;
      const body = $("messageBody")?.value.trim() || "";
      const sendButton = $("sendMessage");

      if (!sendButton) return;

      const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
      };

      const extension = extensions[file.type];

      if (!extension) {
        status.textContent = "Unsupported image type.";
        return;
      }

      if (file.size > MAX_SIZE) {
        status.textContent = "Image must be 8 MB or smaller.";
        return;
      }

      sendButton.disabled = true;
      clearButton.disabled = true;

      status.textContent = "Uploading image…";

      const path =
        `${conversationId}/${user.id}/${crypto.randomUUID()}.${extension}`;

      let uploaded = false;

      try {
        const { error: uploadError } = await bridge.db.storage
          .from(BUCKET)
          .upload(path, file, {
            upsert: false,
            contentType: file.type
          });

        if (uploadError) {
          throw uploadError;
        }

        uploaded = true;

        const messageBody =
          PREFIX +
          JSON.stringify({
            type: "image",
            path,
            text: body
          });

        const { error: messageError } = await bridge.db
          .from("conversation_messages")
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            body: messageBody
          });

        if (messageError) {
          throw messageError;
        }

        $("messageBody").value = "";

        clearSelection();

        status.textContent = "Image sent.";

        await bridge.refresh();

      } catch (error) {
        console.error("Grove image message failed:", error);

        if (uploaded) {
          const { error: cleanupError } = await bridge.db.storage
            .from(BUCKET)
            .remove([path]);

          if (cleanupError) {
            console.error(
              "Uploaded image cleanup failed:",
              cleanupError
            );
          }
        }

        status.textContent =
          error.message || "Unable to send image.";

      } finally {
        sendButton.disabled = false;
        clearButton.disabled = false;
      }
    }, true);
  }

  window.GroveChatAttachments = {
    render,
    initialize
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
