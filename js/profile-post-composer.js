import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const BUCKET = "post-media-private";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_FILES = 10;
  const MAX_BODY_LENGTH = 5000;

  const IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  let currentUser = null;
  let selectedFiles = [];

  function setStatus(message, error = false) {
    const node = $("#profile-post-status");
    if (!node) return;

    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  function getExtension(file) {
    return IMAGE_TYPES[file.type] || null;
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

    selectedFiles.forEach((file, index) => {
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
        selectedFiles.splice(index, 1);
        renderPreviews();
      });

      item.append(image, remove);
      container.append(item);
    });
  }

  function validateFiles(files) {
    if (files.length > MAX_FILES) {
      throw new Error("You can upload up to 10 images per post.");
    }

    for (const file of files) {
      if (!getExtension(file)) {
        throw new Error(
          "Unsupported image type. Use JPG, PNG, WebP, or GIF."
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          file.name + " is larger than the 5 MB limit."
        );
      }

      if (file.size === 0) {
        throw new Error(file.name + " is empty.");
      }
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
        .eq("username", requestedUsername)
        .maybeSingle();

      if (error) throw error;

      if (data?.id !== currentUser.id) return false;
    }

    return true;
  }

  async function uploadImages(postId) {
    const paths = [];

    for (const file of selectedFiles) {
      const extension = getExtension(file);
      const filename =
        crypto.randomUUID() + "." + extension;

      const path =
        currentUser.id + "/" + postId + "/" + filename;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (error) throw error;

      paths.push(path);
    }

    return paths;
  }

  async function publishPost(event) {
    event.preventDefault();

    const body = $("#profile-post-body").value.trim();
    const visibility = $("#profile-post-visibility").value;
    const submit = $("#profile-post-submit");

    if (!body && !selectedFiles.length) {
      setStatus("Write something or choose an image first.", true);
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

    submit.disabled = true;
    setStatus("Preparing your post...");

    const postId = crypto.randomUUID();
    let uploadedPaths = [];

    try {
      uploadedPaths = await uploadImages(postId);

      setStatus("Publishing...");

      const { data, error } = await supabase
        .from("posts")
        .insert({
          id: postId,
          author_id: currentUser.id,
          body,
          media_urls: uploadedPaths,
          visibility
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("The post was not saved. Please try again.");
      }

      $("#profile-post-body").value = "";
      $("#profile-post-visibility").value = "public";

      selectedFiles = [];
      renderPreviews();
      updateCounter();

      setStatus("Post published successfully.");

      window.location.reload();

    } catch (error) {
      console.error("Profile post publishing failed:", error);

      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove(uploadedPaths);

        if (cleanupError) {
          console.warn("Temporary image cleanup failed:", cleanupError);
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
    const fileInput = $("#profile-post-images");
    const body = $("#profile-post-body");

    if (!composer || !form || !fileInput || !body) return;

    composer.hidden = true;

    resolveOwnProfile()
      .then(isOwner => {
        if (!isOwner) return;

        composer.hidden = false;

        form.addEventListener("submit", publishPost);

        body.addEventListener("input", updateCounter);

        fileInput.addEventListener("change", () => {
          try {
            const incoming = Array.from(fileInput.files || []);
            const combined = [...selectedFiles, ...incoming];

            validateFiles(combined);

            selectedFiles = combined;
            renderPreviews();
            setStatus("");

          } catch (error) {
            setStatus(error.message, true);
          }

          fileInput.value = "";
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

  install();
})();
