export function installGroveActivityTab() {
  "use strict";

  if (window.__groveActivityTabInstalled) return;
  window.__groveActivityTabInstalled = true;

  const style = document.createElement("style");
  style.textContent = `
    .grove-activity-control {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 100001;
      font-family: inherit;
    }

    .grove-activity-trigger {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 46px;
      padding: 11px 16px;
      border: 1px solid rgba(5,201,244,.55);
      border-radius: 14px;
      background: rgba(16,8,39,.97);
      color: #f7f5ff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 28px rgba(0,0,0,.35);
    }

    .grove-activity-trigger:hover {
      border-color: #eb36ed;
      transform: translateY(-1px);
    }

    .grove-activity-count {
      display: none;
      min-width: 20px;
      padding: 2px 6px;
      border-radius: 20px;
      background: #eb36ed;
      color: white;
      font-size: 11px;
      text-align: center;
    }

    .grove-activity-count.visible {
      display: inline-block;
    }

    .grove-activity-panel {
      display: none;
      position: absolute;
      right: 0;
      bottom: 58px;
      width: min(340px, calc(100vw - 36px));
      max-height: min(440px, 65vh);
      overflow-y: auto;
      padding: 16px;
      border: 1px solid rgba(133,30,255,.55);
      border-radius: 16px;
      background: rgba(12,7,31,.98);
      color: #f7f5ff;
      box-shadow: 0 14px 42px rgba(0,0,0,.5);
    }

    .grove-activity-panel.open {
      display: block;
    }

    .grove-activity-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }

    .grove-activity-heading h2 {
      margin: 0;
      font-size: 1rem;
    }

    .grove-activity-clear {
      border: 0;
      background: transparent;
      color: #05c9f4;
      cursor: pointer;
      font: inherit;
      font-size: .78rem;
    }

    .grove-activity-item {
      padding: 11px 0;
      border-top: 1px solid rgba(190,155,255,.15);
      font-size: .86rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .grove-activity-empty {
      color: #b9b2d0;
      font-size: .86rem;
    }

    @media (max-width: 600px) {
      .grove-activity-control {
        right: 12px;
        bottom: 12px;
      }

      .grove-activity-trigger {
        min-height: 42px;
        padding: 9px 13px;
      }
    }
  `;
  document.head.append(style);

  const control = document.createElement("div");
  control.className = "grove-activity-control";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "grove-activity-trigger";
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML =
    '<span>Notifications</span><span class="grove-activity-count">0</span>';

  const count = trigger.querySelector(".grove-activity-count");

  const panel = document.createElement("section");
  panel.className = "grove-activity-panel";
  panel.setAttribute("aria-label", "Notifications");

  const heading = document.createElement("div");
  heading.className = "grove-activity-heading";

  const title = document.createElement("h2");
  title.textContent = "Notifications";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "grove-activity-clear";
  clear.textContent = "Clear";

  heading.append(title, clear);

  const list = document.createElement("div");
  list.className = "grove-activity-list";

  const empty = document.createElement("p");
  empty.className = "grove-activity-empty";
  empty.textContent = "No new notifications in this session.";

  list.append(empty);
  panel.append(heading, list);
  control.append(trigger, panel);
  document.body.append(control);

  let unread = 0;
  const entries = [];

  function updateCount() {
    count.textContent = String(unread);
    count.classList.toggle("visible", unread > 0);
  }

  function addNotification(detail) {
    const message =
      typeof detail?.message === "string" && detail.message.trim()
        ? detail.message.trim()
        : `New ${detail?.kind || "Grove"} activity`;

    const item = document.createElement("article");
    item.className = "grove-activity-item";
    item.textContent = message;

    const time = document.createElement("small");
    time.style.display = "block";
    time.style.marginTop = "5px";
    time.style.color = "#aaa0c7";

    const date = detail?.created_at
      ? new Date(detail.created_at)
      : new Date();

    time.textContent = Number.isNaN(date.getTime())
      ? "Just now"
      : date.toLocaleString();

    item.append(time);

    if (entries.length === 0) list.replaceChildren();

    list.prepend(item);
    entries.unshift(item);

    while (entries.length > 30) {
      entries.pop()?.remove();
    }

    unread += 1;
    updateCount();
  }

  trigger.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));

    if (open) {
      unread = 0;
      updateCount();
    }
  });

  clear.addEventListener("click", () => {
    entries.splice(0).forEach(item => item.remove());

    const message = document.createElement("p");
    message.className = "grove-activity-empty";
    message.textContent = "No new notifications in this session.";

    list.replaceChildren(message);
    unread = 0;
    updateCount();
  });

  window.addEventListener(
    "grove:notification-received",
    event => addNotification(event.detail || {})
  );
}
