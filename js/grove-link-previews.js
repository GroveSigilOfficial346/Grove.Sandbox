import { supabase } from "./supabase.js";

(() => {
  "use strict";

  if (window.__groveLinkPreviewsInstalled) return;
  window.__groveLinkPreviewsInstalled = true;

  const cache = new Map();
  const pending = new Set();

  const STYLE = `
    .grove-link-preview {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 12px;
      max-width: 560px;
      margin: 10px 0 5px;
      overflow: hidden;
      border: 1px solid rgba(160,105,255,.28);
      border-radius: 12px;
      background: rgba(20,12,43,.82);
      color: #f7f5ff;
      text-decoration: none;
      transition: border-color .18s ease, background .18s ease;
    }

    .grove-link-preview:hover {
      border-color: rgba(5,201,244,.7);
      background: rgba(31,19,60,.95);
    }

    .grove-link-preview-image {
      width: 112px;
      height: 100%;
      min-height: 104px;
      max-height: 132px;
      object-fit: cover;
      background: #160d30;
    }

    .grove-link-preview-content {
      min-width: 0;
      padding: 11px 11px 11px 0;
    }

    .grove-link-preview-domain {
      display: block;
      margin-bottom: 5px;
      color: #8be8ff;
      font-size: .68rem;
      font-weight: 800;
      letter-spacing: .06em;
      overflow-wrap: anywhere;
    }

    .grove-link-preview-title {
      display: -webkit-box;
      overflow: hidden;
      color: #fff;
      font-size: .86rem;
      font-weight: 800;
      line-height: 1.35;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .grove-link-preview-description {
      display: -webkit-box;
      margin-top: 5px;
      overflow: hidden;
      color: #bdb3d5;
      font-size: .75rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .grove-link-preview-fallback {
      grid-template-columns: minmax(0, 1fr);
      padding-left: 12px;
    }

    @media (max-width: 600px) {
      .grove-link-preview {
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 10px;
        max-width: 100%;
      }

      .grove-link-preview-image {
        width: 88px;
        min-height: 96px;
      }

      .grove-link-preview-content {
        padding-top: 9px;
        padding-bottom: 9px;
      }

      .grove-link-preview-title {
        font-size: .8rem;
      }

      .grove-link-preview-description {
        font-size: .7rem;
      }
    }
  `;

  const style = document.createElement("style");
  style.id = "grove-link-preview-styles";
  style.textContent = STYLE;
  document.head.append(style);

  function safeUrl(value) {
    try {
      const url = new URL(value);

      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (url.username || url.password) return null;

      return url;
    } catch {
      return null;
    }
  }

  function isPreviewArea(anchor) {
    return Boolean(
      anchor.closest(
        ".message-bubble, .community-post, .profile-post, " +
        ".feed-post, .grove-post, .post-card"
      )
    );
  }

  function getCandidateAnchors(root = document) {
    return root.querySelectorAll(
      ".message-bubble a[href], .community-post a[href], " +
      ".profile-post a[href], .feed-post a[href], " +
      ".grove-post a[href], .post-card a[href]"
    );
  }

  function createCard(data, originalUrl) {
    const card = document.createElement("a");
    card.className = "grove-link-preview";
    card.href = originalUrl;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.setAttribute("aria-label", `Preview: ${data.title || data.domain}`);

    if (data.image) {
      const image = document.createElement("img");
      image.className = "grove-link-preview-image";
      image.src = data.image;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      image.addEventListener("error", () => {
        image.remove();
        card.classList.add("grove-link-preview-fallback");
      }, { once: true });

      card.append(image);
    } else {
      card.classList.add("grove-link-preview-fallback");
    }

    const content = document.createElement("div");
    content.className = "grove-link-preview-content";

    const domain = document.createElement("span");
    domain.className = "grove-link-preview-domain";
    domain.textContent = data.domain || "";

    const title = document.createElement("span");
    title.className = "grove-link-preview-title";
    title.textContent = data.title || data.domain || "Open website";

    content.append(domain, title);

    if (data.description) {
      const description = document.createElement("span");
      description.className = "grove-link-preview-description";
      description.textContent = data.description;
      content.append(description);
    }

    card.append(content);
    return card;
  }

  async function fetchPreview(url) {
    if (cache.has(url)) return cache.get(url);
    if (pending.has(url)) return null;

    pending.add(url);

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
      console.warn("Grove link preview unavailable:", error);
      cache.set(url, null);
      return null;

    } finally {
      pending.delete(url);
    }
  }

  async function processAnchor(anchor) {
    if (
      !anchor.isConnected ||
      anchor.dataset.grovePreview === "done" ||
      !isPreviewArea(anchor)
    ) {
      return;
    }

    const url = safeUrl(anchor.href);
    if (!url) return;

    anchor.dataset.grovePreview = "done";

    const card = await fetchPreview(url.href);

    if (!card || !anchor.isConnected) return;

    const parent = anchor.closest(
      ".message-bubble, .community-post, .profile-post, " +
      ".feed-post, .grove-post, .post-card"
    );

    if (!parent) return;

    if (
      parent.querySelector(
        `[data-grove-preview-url="${CSS.escape(url.href)}"]`
      )
    ) {
      return;
    }

    const preview = createCard(card, url.href);
    preview.dataset.grovePreviewUrl = url.href;

    const textContainer = anchor.closest("p, .message-body, .post-body") || anchor;
    textContainer.insertAdjacentElement("afterend", preview);
  }

  function scan(root = document) {
    getCandidateAnchors(root).forEach(anchor => {
      processAnchor(anchor);
    });
  }

  scan();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.matches?.("a[href]")) {
          processAnchor(node);
        }

        scan(node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.GroveLinkPreviews = Object.freeze({
    refresh: () => scan(),
    clearCache: () => cache.clear()
  });
})();
