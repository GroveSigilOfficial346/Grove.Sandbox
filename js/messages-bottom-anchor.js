(() => {
  "use strict";

  const list = document.getElementById("message-list");
  if (!list) return;

  let pinnedToBottom = true;
  let scheduled = false;

  const threshold = 120;

  function isNearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
  }

  function scrollToBottom(behavior = "auto") {
    list.scrollTo({
      top: list.scrollHeight,
      behavior
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

  const jumpButton = document.createElement("button");
  jumpButton.type = "button";
  jumpButton.id = "grove-jump-latest";
  jumpButton.className = "grove-jump-latest";
  jumpButton.textContent = "↓ Latest messages";
  jumpButton.hidden = true;
  jumpButton.addEventListener("click", () => {
    pinnedToBottom = true;
    scrollToBottom("smooth");
    jumpButton.hidden = true;
  });

  list.insertAdjacentElement("afterend", jumpButton);

  list.addEventListener("scroll", () => {
    pinnedToBottom = isNearBottom();
    jumpButton.hidden = pinnedToBottom;
  }, { passive: true });

  const observer = new MutationObserver(records => {
    let added = false;

    for (const record of records) {
      if (record.addedNodes.length) added = true;
    }

    if (added) {
      pinnedToBottom = true;
      jumpButton.hidden = true;
      scheduleBottom();
    }
  });

  observer.observe(list, {
    childList: true,
    subtree: true
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      if (pinnedToBottom) scheduleBottom();
    });

    resizeObserver.observe(list);
  }

  window.addEventListener("load", scheduleBottom);
  window.addEventListener("resize", scheduleBottom, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pinnedToBottom) scheduleBottom();
  });

  scheduleBottom();
})();
