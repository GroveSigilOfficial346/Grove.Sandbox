import { supabase } from "./supabase.js";

(() => {
  "use strict";

  if (window.__groveLiveChatPreviewsInstalled) return;
  window.__groveLiveChatPreviewsInstalled = true;

  const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

  const MEDIA_TYPES = {
    mp3: ["audio", "audio/mpeg"],
    m4a: ["audio", "audio/mp4"],
    aac: ["audio", "audio/aac"],
    wav: ["audio", "audio/wav"],
    ogg: ["audio", "audio/ogg"],
    opus: ["audio", "audio/ogg"],
    webm: ["video", "video/webm"],
    mp4: ["video", "video/mp4"],
    mov: ["video", "video/quicktime"],
    ogv: ["video", "video/ogg"]
  };

  const cache = new Map();

  const STYLE = `
    .grove-live-link {
      color: #8be8ff;
      overflow-wrap: anywhere;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .grove-live-preview {
      display: block;
      width: 100%;
      max-width: 440px;
      margin: 9px 0;
      padding: 12px;
      border: 1px solid rgba(160,105,255,.3);
      border-radius: 12px;
      background: rgba(20,12,43,.9);
      color: #f7f5ff;
      text-decoration: none;
      box-sizing: border-box;
    }

    .grove-live-preview strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: .84rem;
    }

    .grove-live-preview small {
      display: block;
      margin-top: 5px;
      color: #8be8ff;
      overflow-wrap: anywhere;
    }

    .grove-live-play {
      display: inline-block;
      margin-top: 8px;
      padding: 8px 13px;
      border: 0;
      border-radius: 9px;
      background: linear-gradient(120deg,#851eff,#eb36ed);
      color: white;
      font-weight: 800;
      cursor: pointer;
    }

    .grove-live-player {
      display: block;
      width: 100%;
      max-width: 440px;
      margin: 9px 0;
      border-radius: 10px;
    }

    .grove-live-preview-error {
      display: block;
      margin-top: 7px;
      color: #ff8585;
      font-size: .75rem;
    }
  `;

  function safeUrl(value) {
    try {
      const url = new URL(value);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      if (url.username || url.password) return null;

      return url;
    } catch {
      return null;
    }
  }

  function installStyles() {
    if (document.getElementById("grove-live-preview-styles")) return;

    const style = document.createElement("style");
    style.id = "grove-live-preview-styles";
    style.textContent = STYLE;
    document.head.append(style);
  }

  function mediaType(url) {
    const extension = url.pathname.split(".").pop().toLowerCase();
    return MEDIA_TYPES[extension] || null;
  }

  function createMediaPreview(url, type) {
    const card = document.createElement("div");
    card.className = "grove-live-preview";

    const title = document.createElement("strong");
    title.textContent = type[0] === "audio"
      ? "Audio attachment"
      : "Video attachment";

    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "grove-live-link";
    link.textContent = url.hostname;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "grove-live-play";
    button.textContent = "▶ Play";

    button.addEventListener("click", () => {
      const player = document.createElement(type[0]);

      player.className = "grove-live-player";
      player.controls = true;
      player.preload = "none";
      player.playsInline = true;

      const source = document.createElement("source");
      source.src = url.href;
      source.type = type[1];

      player.append(source);

      player.addEventListener("error", () => {
        const error = document.createElement("span");
        error.className = "grove-live-preview-error";
        error.textContent = "This media could not be played here.";
        card.append(error);
      }, { once: true });

      card.replaceWith(player);

      const playback = player.play();
      playback?.catch?.(() => {
        player.controls = true;
      });
    });

    card.append(title, link, button);
    return card;
  }

  async function fetchPreview(url) {
    if (cache.has(url)) return cache.get(url);

    try {
      const { data, error } = await supabase.functions.invoke(
        "get-link-preview",
        { body: { url } }
      );

      if (error || !data || data.error) {
        cache.set(url, null);
        return null;
      }

      cache.set(url, data);
      return data;
    } catch (error) {
      console.warn("Grove Live preview unavailable:", error);
      cache.set(url, null);
      return null;
    }
  }

  async function createLinkPreview(anchor, url) {
    if (anchor.dataset.groveLivePreview === "done") return;

    anchor.dataset.groveLivePreview = "done";

    const data = await fetchPreview(url.href);

    if (!data || !anchor.isConnected) return;

    const card = document.createElement("a");
    card.className = "grove-live-preview";
    card.href = url.href;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const title = document.createElement("strong");
    title.textContent = data.title || data.domain || url.hostname;

    const domain = document.createElement("small");
    domain.textContent = data.domain || url.hostname;

    card.append(title, domain);

    if (data.description) {
      const description = document.createElement("small");
      description.textContent = data.description;
      card.append(description);
    }

    anchor.insertAdjacentElement("afterend", card);
  }

  function linkifyTextNode(node) {
    if (
      !node ||
      node.nodeType !== Node.TEXT_NODE ||
      !node.isConnected ||
      node.parentElement?.closest("a,button,script,style,code,pre")
    ) {
      return;
    }

    const value = node.nodeValue || "";
    URL_PATTERN.lastIndex = 0;

    const matches = [...value.matchAll(URL_PATTERN)];
    if (!matches.length) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      const raw = match[0];
      let candidate = raw;
      let trailing = "";

      while (/[),.!?;:]$/.test(candidate)) {
        trailing = candidate.slice(-1) + trailing;
        candidate = candidate.slice(0, -1);
      }

      if (match.index > cursor) {
        fragment.append(
          document.createTextNode(value.slice(cursor, match.index))
        );
      }

      const url = safeUrl(candidate);

      if (!url) {
        fragment.append(document.createTextNode(candidate));
      } else {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "grove-live-link";
        link.textContent = candidate;
        fragment.append(link);
      }

      if (trailing) {
        fragment.append(document.createTextNode(trailing));
      }

      cursor = match.index + raw.length;
    }

    if (cursor < value.length) {
      fragment.append(document.createTextNode(value.slice(cursor)));
    }

    node.replaceWith(fragment);
  }

  function processAnchor(anchor) {
    if (
      !anchor ||
      !anchor.isConnected ||
      anchor.closest(".grove-live-preview")
    ) {
      return;
    }

    const url = safeUrl(anchor.href);
    if (!url) return;

    const type = mediaType(url);

    if (type) {
      if (anchor.dataset.groveLiveMedia === "done") return;

      anchor.dataset.groveLiveMedia = "done";
      anchor.insertAdjacentElement(
        "afterend",
        createMediaPreview(url, type)
      );

      return;
    }

    createLinkPreview(anchor, url);
  }

  function scan(root = document) {
    const chat = root.matches?.("#live-chat-list")
      ? root
      : root.closest?.("#live-chat-list") ||
        root.querySelector?.("#live-chat-list");

    if (!chat) return;

    const walker = document.createTreeWalker(
      chat,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    nodes.forEach(linkifyTextNode);

    chat.querySelectorAll("a[href]").forEach(processAnchor);
  }

  function start() {
    installStyles();
    scan();

    const chat = document.getElementById("live-chat-list");
    if (!chat) return;

    const observer = new MutationObserver(() => scan(chat));

    observer.observe(chat, {
      childList: true,
      subtree: true
    });

    window.GroveLiveChatPreviews = Object.freeze({
      refresh: () => scan(chat)
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
