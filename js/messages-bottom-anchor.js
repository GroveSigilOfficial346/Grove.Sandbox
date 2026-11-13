(() => {
  "use strict";

  const list = document.getElementById("message-list");
  if (!list || list.dataset.groveBottomAnchor === "installed") return;

  list.dataset.groveBottomAnchor = "installed";

  const THRESHOLD = 120;

  let pinnedToBottom = true;
  let previousHeight = list.scrollHeight;
  let previousTop = list.scrollTop;
  let scheduled = false;

  function isNearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight <= THRESHOLD;
  }

  function scrollToBottom(behavior = "auto") {
    list.scrollTo({
      top: list.scrollHeight,
      behavior
    });

    previousHeight = list.scrollHeight;
    previousTop = list.scrollTop;
    pinnedToBottom = true;
    jumpButton.hidden = true;
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

  const jumpButton = document.createElement("button");
  jumpButton.type = "button";
  jumpButton.id = "grove-jump-latest";
  jumpButton.className = "grove-jump-latest";
  jumpButton.textContent = "↓ Latest messages";
  jumpButton.setAttribute("aria-label", "Scroll to latest messages");
  jumpButton.hidden = true;

  jumpButton.addEventListener("click", () => {
    scrollToBottom("smooth");
  });

  list.insertAdjacentElement("afterend", jumpButton);

  list.addEventListener("scroll", () => {
    if (pinnedToBottom && isNearBottom()) {
      previousTop = list.scrollTop;
      previousHeight = list.scrollHeight;
      jumpButton.hidden = true;
      return;
    }

    pinnedToBottom = isNearBottom();
    previousTop = list.scrollTop;
    previousHeight = list.scrollHeight;
    jumpButton.hidden = pinnedToBottom;
  }, { passive: true });

  const observer = new MutationObserver(records => {
    let added = false;
    let removed = false;

    for (const record of records) {
      if (record.addedNodes.length) added = true;
      if (record.removedNodes.length) removed = true;
    }

    if (!added && !removed) return;

    /*
     * Replacing the conversation history means a different
     * conversation was opened. Start that conversation at its end.
     */
    if (removed) {
      pinnedToBottom = true;
      jumpButton.hidden = true;
      scheduleBottom();
      previousHeight = list.scrollHeight;
      previousTop = list.scrollTop;
      return;
    }

    const newHeight = list.scrollHeight;
    const heightDifference = newHeight - previousHeight;

    if (pinnedToBottom) {
      scheduleBottom();
    } else if (heightDifference > 0) {
      /*
       * messages.js currently forces scrollTop to the bottom after
       * appending. Restore the reader's previous viewport instead.
       */
      list.scrollTop = previousTop + heightDifference;
      jumpButton.hidden = false;
    }

    previousHeight = list.scrollHeight;
    previousTop = list.scrollTop;
  });

  observer.observe(list, {
    childList: true,
    subtree: true
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      if (pinnedToBottom) {
        scheduleBottom();
      }
    });

    resizeObserver.observe(list);
  }

  window.addEventListener("load", scheduleBottom);
  window.addEventListener("resize", scheduleBottom, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pinnedToBottom) {
      scheduleBottom();
    }
  });

  scheduleBottom();
})();
