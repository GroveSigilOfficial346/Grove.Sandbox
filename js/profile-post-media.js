(() => {
  "use strict";

  if (window.__groveProfilePostMediaInstalled) return;
  window.__groveProfilePostMediaInstalled = true;

  const AUDIO_EXTENSIONS = new Set([
    "mp3", "m4a", "wav", "ogg", "webm", "aac"
  ]);

  const MIME_TYPES = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    aac: "audio/aac"
  };

  function getAudioType(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const extension = parsed.pathname.split(".").pop().toLowerCase();

      if (!AUDIO_EXTENSIONS.has(extension)) return null;

      return {
        url: parsed.href,
        mime: MIME_TYPES[extension]
      };
    } catch {
      return null;
    }
  }

  function enhancePostMedia(root = document) {
    if (!root) return;

    const links = [];

    if (
      root.nodeType === Node.ELEMENT_NODE &&
      root.matches?.(".profile-post-gallery a.profile-post-media-link")
    ) {
      links.push(root);
    }

    if (root.querySelectorAll) {
      links.push(
        ...root.querySelectorAll(
          ".profile-post-gallery a.profile-post-media-link"
        )
      );
    }

    for (const link of links) {
      if (
        !link.isConnected ||
        link.dataset.groveProfileMediaReady === "true"
      ) {
        continue;
      }

      const media = getAudioType(link.href);
      if (!media) continue;

      const player = document.createElement("audio");
      player.className = "profile-post-audio";
      player.controls = true;
      player.preload = "none";
      player.setAttribute("aria-label", "Audio post");

      const source = document.createElement("source");
      source.src = media.url;
      source.type = media.mime;

      player.append(source);

      link.dataset.groveProfileMediaReady = "true";
      link.replaceWith(player);
    }
  }

  function start() {
    enhancePostMedia();

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            enhancePostMedia(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.GroveProfilePostMedia = Object.freeze({
      refresh: () => enhancePostMedia()
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
