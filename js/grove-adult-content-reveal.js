import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const CARD_SELECTOR = [
    "article[data-post-id]",
    'article[id^="post-"]'
  ].join(",");

  const CONTENT_SELECTOR = [
    ".post-body",
    ".post-images",
    ".feed-post-body",
    ".feed-post-gallery",
    ".profile-post-body",
    ".profile-post-gallery",
    ".profile-post-media-link",
    "audio",
    "video"
  ].join(",");

  const queued = new Set();
  let scheduled = false;

  function getPostId(card) {
    if (card.dataset.postId) {
      return card.dataset.postId;
    }

    if (card.id?.startsWith("post-")) {
      return card.id.slice(5);
    }

    return null;
  }

  function hidePostContent(card) {
    const content = [
      ...card.querySelectorAll(CONTENT_SELECTOR)
    ];

    for (const item of content) {
      item.hidden = true;
    }

    return content;
  }

  function addNotice(card, message, warning = false) {
    const notice = document.createElement("section");
    notice.className = warning
      ? "grove-adult-content-warning"
      : "grove-content-unavailable";

    const copy = document.createElement("p");
    copy.textContent = message;

    notice.append(copy);
    card.prepend(notice);

    return notice;
  }

  function protectAdultPost(card, post) {
    const content = hidePostContent(card);

    const warning = document.createElement("section");
    warning.className = "grove-adult-content-warning";

    const heading = document.createElement("strong");
    heading.textContent = "Age-restricted post";

    const copy = document.createElement("p");
    copy.textContent =
      post.content_warning ||
      "This post contains age-restricted material.";

    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.textContent = "Reveal post";
    reveal.setAttribute("aria-expanded", "false");

    let revealed = false;

    reveal.addEventListener("click", () => {
      revealed = !revealed;

      for (const item of content) {
        item.hidden = !revealed;
      }

      reveal.textContent = revealed
        ? "Hide post"
        : "Reveal post";

      reveal.setAttribute(
        "aria-expanded",
        String(revealed)
      );
    });

    warning.append(heading, copy, reveal);
    card.prepend(warning);
  }

  function protectUnavailablePost(card) {
    hidePostContent(card);

    addNotice(
      card,
      "Post access could not be verified. Refresh the page to try again."
    );
  }

  async function processQueue() {
    scheduled = false;

    const cards = [...queued];
    queued.clear();

    const validCards = cards.filter(card => {
      const id = getPostId(card);

      if (!id || card.dataset.groveContentChecked === "true") {
        return false;
      }

      card.dataset.groveContentChecked = "true";
      card.classList.add("grove-content-rating-checking");

      return true;
    });

    if (!validCards.length) return;

    const ids = validCards.map(getPostId);

    try {
      const { data, error } = await supabase
        .from("posts")
        .select("id,content_rating,content_warning")
        .in("id", ids);

      if (error) throw error;

      const metadata = new Map(
        (data || []).map(post => [post.id, post])
      );

      for (const card of validCards) {
        const post = metadata.get(getPostId(card));

        card.classList.remove("grove-content-rating-checking");

        if (!post) {
          protectUnavailablePost(card);
          continue;
        }

        if (post.content_rating === "adult") {
          protectAdultPost(card, post);
        }
      }

    } catch (error) {
      console.warn(
        "Grove could not verify post content ratings:",
        error
      );

      for (const card of validCards) {
        card.classList.remove("grove-content-rating-checking");
        protectUnavailablePost(card);
      }
    }
  }

  function enqueue(node) {
    if (!(node instanceof Element)) return;

    if (node.matches(CARD_SELECTOR)) {
      queued.add(node);
    }

    node.querySelectorAll(CARD_SELECTOR).forEach(card => {
      queued.add(card);
    });

    if (!queued.size || scheduled) return;

    scheduled = true;
    queueMicrotask(processQueue);
  }

  function initialize() {
    document.querySelectorAll(CARD_SELECTOR).forEach(card => {
      queued.add(card);
    });

    if (queued.size) {
      scheduled = true;
      queueMicrotask(processQueue);
    }

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          enqueue(added);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
