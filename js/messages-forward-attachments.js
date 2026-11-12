import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const BUCKET = "grove-private";
  const $ = (selector, root = document) => root.querySelector(selector);

  const ALLOWED_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "webp", "gif",
    "mp4", "webm", "mov",
    "mp3", "m4a", "wav", "ogg", "aac",
    "pdf", "txt", "csv", "doc", "docx",
    "xls", "xlsx", "ppt", "pptx", "zip"
  ]);

  let user = null;
  let dialog = null;
  let activeMessageId = null;

  const busyMessages = new Set();

  function setStatus(message, isError = false) {
    const node = $("#messages-status");
    if (!node) return;

    node.textContent = message || "";
    node.style.color = isError ? "#ff8585" : "";
  }

  function getConversationOptions(sourceConversationId) {
    return [
      ...document.querySelectorAll(
        "#conversation-list .conversation-item[data-conversation-id]"
      )
    ]
      .map((item) => ({
        id: item.dataset.conversationId,
        label:
          $(".conversation-name", item)?.textContent?.trim() ||
          item.textContent.trim() ||
          "Grove conversation"
      }))
      .filter(
        (item) =>
          item.id &&
          item.id !== sourceConversationId
      );
  }

  function buildDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "grove-forward-dialog";
    dialog.setAttribute(
      "aria-labelledby",
      "grove-forward-title"
    );

    const form = document.createElement("form");
    form.className = "grove-forward-form";

    const heading = document.createElement("h2");
    heading.id = "grove-forward-title";
    heading.textContent = "Forward attachment";

    const description = document.createElement("p");
    description.className = "grove-forward-description";
    description.textContent =
      "Choose a conversation to receive a private copy of this attachment.";

    const label = document.createElement("label");
    label.htmlFor = "grove-forward-destination";
    label.textContent = "Destination conversation";

    const select = document.createElement("select");
    select.id = "grove-forward-destination";
    select.required = true;

    const error = document.createElement("p");
    error.className = "grove-forward-error";
    error.setAttribute("role", "alert");

    const actions = document.createElement("div");
    actions.className = "grove-forward-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "grove-forward-cancel";
    cancel.textContent = "Cancel";

    cancel.addEventListener("click", () => {
      dialog.close("cancel");
    });

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "grove-forward-submit";
    submit.textContent = "Forward attachment";

    actions.append(cancel, submit);

    form.append(
      heading,
      description,
      label,
      select,
      error,
      actions
    );

    dialog.append(form);
    document.body.append(dialog);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const destinationId = select.value;
      const messageId = activeMessageId;

      if (!destinationId || !messageId) return;

      submit.disabled = true;
      cancel.disabled = true;
      error.textContent = "";
      submit.textContent = "Forwarding...";

      try {
        await forwardAttachment(messageId, destinationId);

        dialog.close("success");
        setStatus("Attachment forwarded successfully.");
      } catch (cause) {
        console.error(
          "Attachment forwarding failed.",
          cause
        );

        error.textContent =
          cause?.message ||
          "The attachment could not be forwarded.";
      } finally {
        submit.disabled = false;
        cancel.disabled = false;
        submit.textContent = "Forward attachment";
      }
    });

    return dialog;
  }

  function openForwardDialog(messageId, sourceConversationId) {
    const options = getConversationOptions(sourceConversationId);
    const modal = buildDialog();

    const select = $("#grove-forward-destination", modal);
    const error = $(".grove-forward-error", modal);

    select.replaceChildren();
    error.textContent = "";

    activeMessageId = messageId;

    if (!options.length) {
      setStatus(
        "Start another conversation before forwarding an attachment.",
        true
      );
      return;
    }

    for (const option of options) {
      const element = document.createElement("option");

      element.value = option.id;
      element.textContent = option.label;

      select.append(element);
    }

    modal.showModal();
  }

  function ensureForwardButton(article) {
    if (!article?.dataset.messageId) return;

    if (
      article.classList.contains(
        "message-unsent-placeholder"
      )
    ) {
      return;
    }

    if ($(".message-forward-attachment", article)) return;

    const attachment = $(".message-attachment", article);

    if (!attachment) return;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "message-forward-attachment";
    button.textContent = "Forward attachment";
    button.dataset.forwardMessageId =
      article.dataset.messageId;

    button.addEventListener("click", async () => {
      const messageId = article.dataset.messageId;

      if (!messageId || busyMessages.has(messageId)) {
        return;
      }

      button.disabled = true;

      try {
        const { data: message, error } = await supabase
          .from("conversation_messages")
          .select(
            "id,conversation_id,attachment_path,attachment_mime_type,attachment_filename,deleted_for_everyone_at"
          )
          .eq("id", messageId)
          .maybeSingle();

        if (error) throw error;

        if (
          !message ||
          !message.attachment_path ||
          message.deleted_for_everyone_at
        ) {
          throw new Error(
            "This attachment is no longer available."
          );
        }

        openForwardDialog(
          message.id,
          message.conversation_id
        );
      } catch (error) {
        console.error(
          "Could not prepare attachment forwarding.",
          error
        );

        setStatus(
          error?.message ||
            "This attachment cannot be forwarded.",
          true
        );
      } finally {
        button.disabled = false;
      }
    });

    attachment.append(button);
  }

  function scan(root = document) {
    if (
      root instanceof Element &&
      root.matches(".message-bubble[data-message-id]")
    ) {
      ensureForwardButton(root);
    }

    root
      .querySelectorAll?.(
        ".message-bubble[data-message-id]"
      )
      .forEach(ensureForwardButton);
  }

  function getExtension(filename, path) {
    const source = String(filename || path || "");
    const extension = source.split(".").pop().toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error(
        "This attachment's file type cannot be forwarded."
      );
    }

    return extension;
  }

  function attachmentCategory(mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";

    return "file";
  }

  async function forwardAttachment(
    messageId,
    destinationConversationId
  ) {
    if (!user) {
      throw new Error(
        "Sign in before forwarding attachments."
      );
    }

    if (busyMessages.has(messageId)) {
      throw new Error(
        "This attachment is already being forwarded."
      );
    }

    busyMessages.add(messageId);

    let uploadedPath = null;

    try {
      const { data: source, error: sourceError } =
        await supabase
          .from("conversation_messages")
          .select(
            "id,conversation_id,attachment_path,attachment_mime_type,attachment_filename,deleted_for_everyone_at"
          )
          .eq("id", messageId)
          .maybeSingle();

      if (sourceError) throw sourceError;

      if (
        !source?.attachment_path ||
        source.deleted_for_everyone_at
      ) {
        throw new Error(
          "The original attachment is no longer available."
        );
      }

      if (
        source.conversation_id ===
        destinationConversationId
      ) {
        throw new Error(
          "Choose a different conversation."
        );
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("conversation_id", destinationConversationId)
          .eq("user_id", user.id)
          .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        throw new Error(
          "You are no longer a member of that conversation."
        );
      }

      const { data: fileBlob, error: downloadError } =
        await supabase.storage
          .from(BUCKET)
          .download(source.attachment_path);

      if (downloadError) throw downloadError;

      if (!fileBlob || !fileBlob.size) {
        throw new Error(
          "The original attachment could not be downloaded."
        );
      }

      const extension = getExtension(
        source.attachment_filename,
        source.attachment_path
      );

      const filename = String(
        source.attachment_filename ||
          `Grove-attachment.${extension}`
      ).slice(0, 180);

      uploadedPath =
        `${destinationConversationId}/${user.id}/${crypto.randomUUID()}.${extension}`;

      const mime = String(
        source.attachment_mime_type ||
          fileBlob.type ||
          "application/octet-stream"
      ).toLowerCase();

      const { error: uploadError } =
        await supabase.storage
          .from(BUCKET)
          .upload(uploadedPath, fileBlob, {
            contentType: mime,
            cacheControl: "3600",
            upsert: false
          });

      if (uploadError) throw uploadError;

      const category = attachmentCategory(mime);

      const { data: inserted, error: insertError } =
        await supabase
          .from("conversation_messages")
          .insert({
            conversation_id: destinationConversationId,
            sender_id: user.id,
            body: `Forwarded a ${category} attachment`,
            attachment_path: uploadedPath,
            attachment_mime_type: mime,
            attachment_filename: filename
          })
          .select("id")
          .single();

      if (insertError) throw insertError;

      if (!inserted?.id) {
        throw new Error(
          "The forwarded attachment message was not saved."
        );
      }

      uploadedPath = null;
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } =
          await supabase.storage
            .from(BUCKET)
            .remove([uploadedPath]);

        if (cleanupError) {
          console.warn(
            "Forwarded attachment cleanup failed.",
            cleanupError
          );
        }
      }

      throw error;
    } finally {
      busyMessages.delete(messageId);
    }
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user;

    if (!user) return;

    const messageList = $("#message-list");

    if (!messageList) return;

    scan(messageList);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            scan(node);
          }
        }
      }
    });

    observer.observe(messageList, {
      childList: true,
      subtree: true
    });

    window.addEventListener("beforeunload", () => {
      observer.disconnect();

      if (dialog?.open) {
        dialog.close();
      }
    });
  }

  initialize().catch((error) => {
    console.error(
      "Grove attachment forwarding did not initialize.",
      error
    );

    setStatus(
      error?.message ||
        "Attachment forwarding could not initialize.",
      true
    );
  });
})();
