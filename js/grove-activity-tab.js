import { supabase } from "./supabase.js";

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
      width: min(350px, calc(100vw - 30px));
      max-height: min(460px, 65vh);
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
      display: block;
      padding: 12px 0;
      border-top: 1px solid rgba(190,155,255,.15);
      color: inherit;
      text-decoration: none;
      font-size: .86rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .grove-activity-item:hover {
      color: #05c9f4;
    }

    .grove-activity-item.unread {
      border-left: 2px solid #eb36ed;
      padding-left: 10px;
    }

    .grove-activity-time {
      display: block;
      margin-top: 5px;
      color: #aaa0c7;
      font-size: .72rem;
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

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "grove-activity-clear";
  refresh.textContent = "Refresh";

  heading.append(title, refresh);

  const list = document.createElement("div");
  list.className = "grove-activity-list";

  panel.append(heading, list);
  control.append(trigger, panel);
  document.body.append(control);

  let user = null;
  let unread = 0;
  let loading = false;
  let channel = null;

  const renderedIds = new Set();

  function updateCount() {
    count.textContent = String(unread);
    count.classList.toggle("visible", unread > 0);
    trigger.setAttribute(
      "aria-label",
      unread ? `Notifications, ${unread} unread` : "Notifications"
    );
  }

  function showEmpty(message) {
    const empty = document.createElement("p");
    empty.className = "grove-activity-empty";
    empty.textContent = message;
    list.replaceChildren(empty);
  }

  function destinationFor(row) {
    if (row.kind === "message") {
      return "/messages.html";
    }

    if (row.post_id) {
      return `/community.html?post=${encodeURIComponent(row.post_id)}`;
    }

    if (row.actor_id) {
      return `/profile.html?id=${encodeURIComponent(row.actor_id)}`;
    }

    return "/settings.html";
  }

  function renderNotification(row, prepend = true) {
    if (!row?.id || renderedIds.has(row.id)) return;

    renderedIds.add(row.id);

    const link = document.createElement("a");
    link.className = "grove-activity-item";
    link.href = destinationFor(row);

    if (!row.read_at) {
      link.classList.add("unread");
      unread += 1;
    }

    const message = document.createElement("span");
    message.textContent =
      row.message || `New ${row.kind || "Grove"} activity`;

    const time = document.createElement("time");
    time.className = "grove-activity-time";
    time.dateTime = row.created_at || "";

    const date = new Date(row.created_at);

    time.textContent = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString();

    link.append(message, time);

    const empty = list.querySelector(".grove-activity-empty");
    if (empty) empty.remove();

    if (prepend) {
      list.prepend(link);
    } else {
      list.append(link);
    }

    updateCount();
  }

  async function loadHistory() {
    if (!user || loading) return;

    loading = true;
    showEmpty("Loading notifications...");

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id,actor_id,kind,message,post_id,created_at,read_at"
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      renderedIds.clear();
      unread = 0;
      list.replaceChildren();

      if (!data?.length) {
        showEmpty("You're all caught up.");
        updateCount();
        return;
      }

      data.forEach(row => renderNotification(row, false));
      updateCount();

    } catch (error) {
      console.error("Notification history failed:", error);
      showEmpty("Notifications could not load. Try refreshing.");
    } finally {
      loading = false;
    }
  }

  async function markAllRead() {
    if (!user || unread === 0) return;

    const timestamp = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: timestamp })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (error) {
      console.warn("Could not mark notifications read:", error);
      return;
    }

    unread = 0;

    list.querySelectorAll(".grove-activity-item.unread")
      .forEach(item => item.classList.remove("unread"));

    updateCount();
  }

  function addRealtimeNotification(row) {
    if (!row || !row.id) return;

    if (list.querySelector(".grove-activity-empty")) {
      list.replaceChildren();
    }

    renderNotification(row, true);
  }

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    user = data.user || null;

    if (!user) {
      control.remove();
      return;
    }

    await loadHistory();

    channel = supabase
      .channel(`grove-activity-history-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`
        },
        payload => addRealtimeNotification(payload.new)
      )
      .subscribe(status => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.warn("Notification history realtime:", status);
        }
      });
  }

  trigger.addEventListener("click", async () => {
    const open = panel.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));

    if (open) {
      await markAllRead();
    }
  });

  refresh.addEventListener("click", loadHistory);

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      user = null;
      if (channel) supabase.removeChannel(channel);
      control.remove();
    }
  });

  initialize().catch(error => {
    console.error("Grove activity tab failed:", error);
    showEmpty("Notifications could not initialize.");
  });
}
