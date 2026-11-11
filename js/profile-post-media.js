(() => {
  "use strict";

  if (window.__groveProfilePostMediaInstalled) return;
  window.__groveProfilePostMediaInstalled = true;

  const AUDIO_TYPES = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    aac: "audio/aac"
  };

  const VIDEO_TYPES = {
    mp4: "video/mp4",
    webm: "video/webm"
  };

  function mediaInfo(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const extension = parsed.pathname.split(".").pop().toLowerCase();

      if (AUDIO_TYPES[extension]) {
        return {
          kind: "audio",
          mime: AUDIO_TYPES[extension],
          url: parsed.href
        };
      }

      if (VIDEO_TYPES[extension]) {
        return {
          kind: "video",
          mime: VIDEO_TYPES[extension],
          url: parsed.href
        };
      }

      return null;
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

    root.querySelectorAll?.(
      ".profile-post-gallery a.profile-post-media-link"
    ).forEach(link => links.push(link));

    for (const link of links) {
      if (
        !link.isConnected ||
        link.dataset.groveProfileMediaReady === "true"
      ) {
        continue;
      }

      const media = mediaInfo(link.href);
      if (!media) continue;

      let player;

      if (media.kind === "audio") {
        player = document.createElement("audio");
        player.className = "profile-post-audio";
        player.controls = true;
        player.preload = "metadata";
        player.setAttribute("aria-label", "Audio post");
      } else {
        player = document.createElement("video");
        player.className = "profile-post-video";
        player.controls = true;
        player.playsInline = true;
        player.preload = "metadata";
        player.setAttribute("aria-label", "Video post");
      }

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
