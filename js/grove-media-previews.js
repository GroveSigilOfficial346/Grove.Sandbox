(() => {
  "use strict";

  if (window.__groveMediaPreviewsInstalled) return;
  window.__groveMediaPreviewsInstalled = true;

  const CONTENT_SELECTORS = [
    ".message-bubble",
    ".community-feed",
    ".post-card",
    ".comment-body",
    ".feed-post",
    ".profile-post",
    "#following-feed",
    "#community-feed",
    "#pinned-community-feed",
    "#posts-list"
  ].join(",");

  const VIDEO_TYPES = {
    mp4: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    ogg: "video/ogg",
    mov: "video/quicktime"
  };

  const AUDIO_TYPES = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac"
  };

  const STYLE = `
    .grove-media-preview {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      max-width: 560px;
      margin: 10px 0;
      padding: 13px;
      box-sizing: border-box;
      border: 1px solid rgba(160,105,255,.3);
      border-radius: 13px;
      background: rgba(20,12,43,.9);
      color: #f7f5ff;
    }

    .grove-media-preview-info {
      flex: 1;
      min-width: 0;
    }

    .grove-media-preview-title {
      display: block;
      font-size: .85rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .grove-media-preview-type {
      display: block;
      margin-top: 4px;
      color: #8be8ff;
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .grove-media-play {
      flex: 0 0 auto;
      min-width: 92px;
      min-height: 42px;
      padding: 9px 13px;
      border: 0;
      border-radius: 10px;
      background: linear-gradient(120deg, #851eff, #eb36ed);
      color: white;
      font: inherit;
      font-size: .8rem;
      font-weight: 800;
      cursor: pointer;
    }

    .grove-media-play:hover {
      filter: brightness(1.12);
    }

    .grove-media-player {
      display: block;
      width: 100%;
      max-width: 560px;
      margin: 10px 0;
      border-radius: 12px;
      background: #080512;
    }

    video.grove-media-player {
      max-height: 420px;
    }

    audio.grove-media-player {
      min-height: 42px;
    }

    .grove-media-error {
      display: block;
      margin-top: 8px;
      color: #ff8585;
      font-size: .78rem;
    }

    @media (max-width: 600px) {
      .grove-media-preview {
        gap: 8px;
        padding: 10px;
      }

      .grove-media-play {
        min-width: 78px;
        padding: 8px;
      }

      video.grove-media-player {
        max-height: 280px;
      }
    }
  `;

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);

      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (url.username || url.password) return null;

      return url;
    } catch {
      return null;
    }
  }

  function getMediaType(url) {
    const extension = url.pathname
      .split(".")
      .pop()
      .toLowerCase();

    if (VIDEO_TYPES[extension]) {
      return {
        kind: "video",
        mime: VIDEO_TYPES[extension],
        label: "Video"
      };
    }

    if (AUDIO_TYPES[extension]) {
      return {
        kind: "audio",
        mime: AUDIO_TYPES[extension],
        label: "Audio"
      };
    }

    return null;
  }

  function installStyles() {
    if (document.getElementById("grove-media-preview-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-media-preview-styles";
    style.textContent = STYLE;
    document.head.append(style);
  }

  function findContentRoot(anchor) {
    return anchor.closest(CONTENT_SELECTORS);
  }

  function findInsertionPoint(anchor) {
    return anchor.closest(
      "p,.message-body,.post-body,.profile-post-body,.feed-post-body,.comment-body"
    ) || anchor;
  }

  function createPreview(anchor, url, media) {
    const wrapper = document.createElement("section");
    wrapper.className = "grove-media-preview";
    wrapper.dataset.groveMediaUrl = url.href;

    const info = document.createElement("div");
    info.className = "grove-media-preview-info";

    const title = document.createElement("span");
    title.className = "grove-media-preview-title";
    title.textContent = media.kind === "video"
      ? "Video attachment"
      : "Audio attachment";

    const type = document.createElement("span");
    type.className = "grove-media-preview-type";
    type.textContent = media.label;

    info.append(title, type);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "grove-media-play";
    button.textContent = "▶ Play";
    button.setAttribute(
      "aria-label",
      `Play ${media.label.toLowerCase()}`
    );

    button.addEventListener("click", () => {
      if (!wrapper.isConnected) return;

      const player = document.createElement(
        media.kind === "video" ? "video" : "audio"
      );

      player.className = "grove-media-player";
      player.controls = true;
      player.preload = "none";
      player.playsInline = true;

      const source = document.createElement("source");
      source.src = url.href;
      source.type = media.mime;

      player.append(source);

      player.addEventListener("error", () => {
        let error = wrapper.querySelector(".grove-media-error");

        if (!error) {
          error = document.createElement("span");
          error.className = "grove-media-error";
          error.setAttribute("role", "status");
          wrapper.append(error);
        }

        error.textContent =
          "This media format could not be played in this browser.";
      });

      wrapper.replaceWith(player);

      const playback = player.play();

      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          player.controls = true;
        });
      }
    });

    wrapper.append(info, button);

    return wrapper;
  }

  function processAnchor(anchor) {
    if (
      !anchor ||
      !anchor.isConnected ||
      anchor.dataset.groveMediaPreview ||
      anchor.closest(".grove-link-preview, .grove-media-preview")
    ) {
      return;
    }

    if (!findContentRoot(anchor)) return;

    const url = safeUrl(anchor.href);
    if (!url) return;

    const media = getMediaType(url);
    if (!media) return;

    anchor.dataset.groveMediaPreview = "done";

    const preview = createPreview(anchor, url, media);
    findInsertionPoint(anchor).insertAdjacentElement(
      "afterend",
      preview
    );
  }

  function scan(root = document) {
    if (!root) return;

    if (
      root.nodeType === Node.ELEMENT_NODE &&
      root.matches?.("a[href]")
    ) {
      processAnchor(root);
    }

    if (!root.querySelectorAll) return;

    root.querySelectorAll("a[href]").forEach(processAnchor);
  }

  function startObserver() {
    if (!document.body) return;

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.TEXT_NODE
          ) {
            scan(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function start() {
    installStyles();
    scan();
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.GroveMediaPreviews = Object.freeze({
    refresh: () => scan()
  });
})();
