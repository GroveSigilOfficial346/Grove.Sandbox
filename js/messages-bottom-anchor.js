(() => {
  "use strict";

  const list = document.getElementById("message-list");

  if (!list || list.dataset.groveBottomAnchor === "installed") {
    return;
  }

  list.dataset.groveBottomAnchor = "installed";

  const BOTTOM_THRESHOLD = 120;

  let pinnedToBottom = true;
  let previousScrollTop = 0;
  let scheduled = false;
  let programmaticScroll = false;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const jumpButton = document.createElement("button");

  jumpButton.type = "button";
  jumpButton.id = "grove-jump-latest";
  jumpButton.className = "grove-jump-latest";
  jumpButton.textContent = "↓ Latest messages";
  jumpButton.setAttribute(
    "aria-label",
    "Scroll to latest messages"
  );
  jumpButton.hidden = true;

  list.insertAdjacentElement("afterend", jumpButton);

  function isNearBottom() {
    return (
      list.scrollHeight -
      list.scrollTop -
      list.clientHeight
    ) <= BOTTOM_THRESHOLD;
  }

  function updateJumpButton() {
    jumpButton.hidden = pinnedToBottom;
  }

  function scrollToBottom(behavior = "auto") {
    programmaticScroll = true;

    list.scrollTo({
      top: list.scrollHeight,
      behavior: reduceMotion.matches ? "auto" : behavior
    });

    pinnedToBottom = true;
    previousScrollTop = list.scrollTop;

    updateJumpButton();

    requestAnimationFrame(() => {
      programmaticScroll = false;
      previousScrollTop = list.scrollTop;
    });
  }

  function scheduleBottom() {
    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduled = false;

        if (pinnedToBottom) {
          scrollToBottom("auto");
        }
      });
    });
  }

  jumpButton.addEventListener("click", () => {
    scrollToBottom("smooth");
  });

  list.addEventListener("scroll", () => {
    if (programmaticScroll) return;

    pinnedToBottom = isNearBottom();
    previousScrollTop = list.scrollTop;

    updateJumpButton();
  }, { passive: true });

  /*
   * Observe new messages.
   *
   * If the reader was already at the bottom, follow new messages.
   * If the reader was browsing older messages, preserve their exact
   * scroll position and show the latest-message button.
   */
  const observer = new MutationObserver(records => {
    let directMessageChange = false;
    let historyReplaced = false;

    for (const record of records) {
      if (record.target !== list) continue;

      if (record.removedNodes.length) {
        historyReplaced = true;
      }

      if (record.addedNodes.length) {
        directMessageChange = true;
      }
    }

    if (historyReplaced) {
      pinnedToBottom = true;
      previousScrollTop = 0;

      updateJumpButton();
      scheduleBottom();
      return;
    }

    if (!directMessageChange) return;

    if (pinnedToBottom) {
      scheduleBottom();
    } else {
      programmaticScroll = true;

      list.scrollTop = previousScrollTop;

      requestAnimationFrame(() => {
        programmaticScroll = false;
        previousScrollTop = list.scrollTop;
      });

      jumpButton.hidden = false;
    }
  });

  observer.observe(list, {
    childList: true
  });

  /*
   * Keep the latest messages visible when the chat panel changes size,
   * provided the reader has not intentionally scrolled upward.
   */
  let resizeObserver = null;

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      if (pinnedToBottom) {
        scheduleBottom();
      }
    });

    resizeObserver.observe(list);
  }

  window.addEventListener("load", scheduleBottom);

  window.addEventListener(
    "resize",
    scheduleBottom,
    { passive: true }
  );

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pinnedToBottom) {
      scheduleBottom();
    }
  });

  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    resizeObserver?.disconnect();
  });

  scheduleBottom();
})();
