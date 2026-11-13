export function installGroveActivityTab(supabase) {
  "use strict";

  if (window.__groveActivityTabInstalled) return;
  window.__groveActivityTabInstalled = true;

  const DEFAULTS = {
    notify_messages: true,
    notify_follows: true,
    notify_likes: true,
    notify_comments: true,
    notify_nudges: true,
    notify_mentions: true
  };

  let user = null;
  let preferences = { ...DEFAULTS };
  let unread = 0;
  let loading = false;
  let channel = null;

  const renderedIds = new Set();

  const style = document.createElement("style");
  style.id = "grove-activity-tab-styles";

  style.textContent = `
    .grove-activity-control {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 100001;
      font-family: inherit;
    }

    .grove-activity-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 46px;
      padding: 11px 16px;
      border: 1px solid rgba(5,201,244,.65);
      border-radius: 13px;
      background: linear-gradient(
        135deg,
        rgba(37,17,72,.98),
        rgba(12,7,31,.98)
      );
      color: #f7f5ff;
      font: inherit;
      font-size: .88rem;
      font-weight: 750;
      cursor: pointer;
      box-shadow:
        0 8px 28px rgba(0,0,0,.38),
        0 0 18px rgba(5,201,244,.09),
        inset 0 1px 0 rgba(255,255,255,.08);
      transition:
        border-color .18s ease,
        box-shadow .18s ease,
        transform .18s ease;
    }

    .grove-activity-trigger:hover {
      border-color: #eb36ed;
      box-shadow:
        0 10px 32px rgba(0,0,0,.42),
        0 0 20px rgba(235,54,237,.12);
      transform: translateY(-1px);
    }

    .grove-activity-trigger:focus-visible,
    .grove-activity-panel button:focus-visible,
    .grove-activity-item:focus-visible {
      outline: 2px solid #05c9f4;
      outline-offset: 3px;
    }

    .grove-activity-count {
      display: none;
      min-width: 21px;
      padding: 3px 7px;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 20px;
      background: #eb36ed;
      color: white;
      font-size: .7rem;
      font-weight: 850;
      line-height: 1.2;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .grove-activity-count.visible {
      display: inline-block;
    }

    .grove-activity-panel {
      display: none;
      position: absolute;
      right: 0;
      bottom: 58px;
      width: min(360px, calc(100vw - 36px));
      max-height: min(470px, 65vh);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px;
      border: 1px solid rgba(160,105,255,.48);
      border-radius: 16px;
      background: rgba(12,7,31,.985);
      color: #f7f5ff;
      box-shadow:
        0 18px 48px rgba(0,0,0,.52),
        0 0 24px rgba(133,30,255,.12);
      backdrop-filter: blur(18px);
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
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(190,155,255,.17);
    }

    .grove-activity-heading h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: -.02em;
    }

    .grove-activity-tools {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .grove-activity-panel button {
      border: 0;
      background: transparent;
      color: #8be8ff;
      cursor: pointer;
      font: inherit;
      font-size: .75rem;
      font-weight: 700;
    }

    .grove-activity-panel button:hover {
      color: white;
    }

    .grove-activity-list {
      display: grid;
      gap: 2px;
    }

    .grove-activity-item {
      display: block;
      padding: 12px 10px;
      border-top: 1px solid rgba(190,155,255,.12);
      border-radius: 8px;
      color: inherit;
      text-decoration: none;
      font-size: .85rem;
      line-height: 1.5;
      overflow-wrap: anywhere;
      transition: background .16s ease;
    }

    .grove-activity-item:hover {
      background: rgba(133,30,255,.12);
      color: white;
    }

    .grove-activity-item.unread {
      border-left: 3px solid #eb36ed;
      background: rgba(235,54,237,.055);
      padding-left: 10px;
    }

    .grove-activity-item.unread::before {
      content: "UNREAD";
      display: block;
      margin-bottom: 4px;
      color: #ff9df5;
      font-size: .59rem;
      font-weight: 850;
      letter-spacing: .12em;
    }

    .grove-activity-message {
      display: block;
    }

    .grove-activity-actor {
      color: #F4D6FF;
      font-weight: 850;
    }

    .grove-activity-time {
      display: block;
      margin-top: 5px;
      color: #aaa0c7;
      font-size: .7rem;
    }

    .grove-activity-empty {
      margin: 0;
      padding: 20px 8px;
      color: #c4bbd8;
      font-size: .84rem;
      line-height: 1.55;
      text-align: center;
    }

    @media (max-width: 600px) {
      .grove-activity-control {
        right: 18px;
        bottom: max(18px, env(safe-area-inset-bottom));
      }

      .grove-activity-trigger {
        min-height: 46px;
        padding: 11px 16px;
        font-size: .88rem;
      }

      .grove-activity-panel {
        width: min(360px, calc(100vw - 36px));
        max-height: min(470px, 65vh);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .grove-activity-trigger,
      .grove-activity-item {
        transition: none;
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
  trigger.setAttribute("aria-controls", "grove-activity-panel");

  const triggerLabel = document.createElement("span");
  triggerLabel.textContent = "Notifications";

  const count = document.createElement("span");
  count.className = "grove-activity-count";
  count.textContent = "0";

  trigger.append(triggerLabel, count);

  const panel = document.createElement("section");
  panel.id = "grove-activity-panel";
  panel.className = "grove-activity-panel";
  panel.setAttribute("aria-label", "Notification history");

  const heading = document.createElement("div");
  heading.className = "grove-activity-heading";

  const title = document.createElement("h2");
  title.textContent = "Notifications";

  const tools = document.createElement("div");
  tools.className = "grove-activity-tools";

  const markRead = document.createElement("button");
  markRead.type = "button";
  markRead.textContent = "Mark read";

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";

  tools.append(markRead, refresh);
  heading.append(title, tools);

  const list = document.createElement("div");
  list.className = "grove-activity-list";
  list.setAttribute("aria-live", "polite");

  panel.append(heading, list);
  control.append(trigger, panel);

  function updateCount() {
    count.textContent = String(unread);
    count.classList.toggle("visible", unread > 0);

    trigger.setAttribute(
      "aria-label",
      unread
        ? `Notifications, ${unread} unread`
        : "Notifications"
    );

    markRead.disabled = unread === 0;
    markRead.style.opacity = unread === 0 ? ".45" : "1";
  }

  function showEmpty(message) {
    const empty = document.createElement("p");
    empty.className = "grove-activity-empty";
    empty.textContent = message;
    list.replaceChildren(empty);
  }

  function categoryEnabled(kind) {
    switch (kind) {
      case "message":
        return preferences.notify_messages;

      case "follow":
      case "follow_request":
        return preferences.notify_follows;

      case "like":
        return preferences.notify_likes;

      case "comment":
        return preferences.notify_comments;

      case "nudge":
        return preferences.notify_nudges;

      case "mention":
        return preferences.notify_mentions;

      default:
        return true;
    }
  }

  const CATEGORY_KINDS = {
    notify_messages: ["message"],
    notify_follows: ["follow", "follow_request"],
    notify_likes: ["like"],
    notify_comments: ["comment"],
    notify_nudges: ["nudge"],
    notify_mentions: ["mention"]
  };

  function disabledCategoryKinds() {
    return Object.entries(CATEGORY_KINDS)
      .filter(([preference]) => preferences[preference] === false)
      .flatMap(([, kinds]) => kinds);
  }

  function applyEnabledCategoryFilter(query) {
    const disabledKinds = disabledCategoryKinds();

    if (!disabledKinds.length) return query;

    const values = disabledKinds
      .map(kind => '"' + kind + '"')
      .join(",");

    return query.not("kind", "in", "(" + values + ")");
  }

  async function loadPreferences() {
    if (!user) return;

    const { data, error } = await supabase
      .from("user_preferences")
      .select(
        "notify_messages,notify_follows,notify_likes," +
        "notify_comments,notify_nudges,notify_mentions"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    preferences = {
      ...DEFAULTS,
      ...(data || {})
    };
  }

  async function refreshUnreadCount() {
    if (!user) {
      unread = 0;
      updateCount();
      return;
    }

    let countQuery = supabase
      .from("notifications")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    countQuery = applyEnabledCategoryFilter(countQuery);

    const { count: exactCount, error } = await countQuery;

    if (error) throw error;

    unread = exactCount ?? 0;
    updateCount();
  }

  function destinationFor(row) {
    if (row.kind === "message") {
      return "/messages.html";
    }

    if (row.post_id) {
      return "/community.html?post=" +
        encodeURIComponent(row.post_id);
    }

    if (row.actor_id) {
      return "/profile.html?id=" +
        encodeURIComponent(row.actor_id);
    }

    return "/settings.html";
  }

  function renderNotification(row, prepend = true) {
    if (!row?.id || renderedIds.has(row.id)) return;
    if (!categoryEnabled(row.kind)) return;

    renderedIds.add(row.id);

    const link = document.createElement("a");
    link.className = "grove-activity-item";
    link.href = destinationFor(row);
    link.dataset.notificationId = row.id;

    if (!row.read_at) {
      link.classList.add("unread");
    }

    const message = document.createElement("span");
    message.className = "grove-activity-message";

    if (row.actor_name) {
      const actor = document.createElement("strong");
      actor.className = "grove-activity-actor";
      actor.textContent = row.actor_name;
      message.append(actor, document.createTextNode(" "));
    }

    const messageText = document.createElement("span");
    messageText.textContent =
      row.message || `New ${row.kind || "Grove"} activity`;

    message.append(messageText);

    const time = document.createElement("time");
    time.className = "grove-activity-time";

    if (row.created_at) {
      const date = new Date(row.created_at);

      if (!Number.isNaN(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleString();
      }
    }

    link.append(message, time);

    const empty = list.querySelector(".grove-activity-empty");
    if (empty) empty.remove();

    if (prepend) {
      list.prepend(link);
    } else {
      list.append(link);
    }
  }

  async function attachActorNames(rows) {
    const actorIds = [...new Set(
      rows.map(row => row.actor_id).filter(Boolean)
    )];

    if (!actorIds.length) return rows;

    const { data, error } = await supabase
      .from("profile_directory")
      .select("id,display_name,username")
      .in("id", actorIds);

    if (error) {
      console.warn(
        "Grove could not resolve notification actor names:",
        error
      );
      return rows;
    }

    const names = new Map(
      (data || []).map(profile => [
        profile.id,
        profile.display_name?.trim() ||
          (profile.username ? `@${profile.username}` : "Grove member")
      ])
    );

    return rows.map(row => ({
      ...row,
      actor_name: row.actor_id
        ? names.get(row.actor_id) || "Grove member"
        : ""
    }));
  }

  async function attachActorName(row) {
    if (!row?.actor_id) return row;

    const [enriched] = await attachActorNames([row]);
    return enriched || row;
  }

  async function loadHistory() {
    if (!user || loading) return;

    loading = true;
    showEmpty("Loading your notification history...");

    try {
      await loadPreferences();

      const [historyResult] = await Promise.all([
        supabase
          .from("notifications")
          .select(
            "id,actor_id,kind,message,post_id,created_at,read_at"
          )
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),

        refreshUnreadCount()
      ]);

      if (historyResult.error) throw historyResult.error;

      renderedIds.clear();
      list.replaceChildren();

      const rows = historyResult.data || [];
      const visibleRows = rows.filter(row =>
        categoryEnabled(row.kind)
      );

      if (!visibleRows.length) {
        showEmpty(
          rows.length
            ? "No notifications match your enabled categories."
            : "You're all caught up. No notifications yet."
        );

        updateCount();
        return;
      }

      const namedRows = await attachActorNames(visibleRows);

      namedRows.forEach(row =>
        renderNotification(row, false)
      );

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

    markRead.disabled = true;

    try {
      let markReadQuery = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .is("read_at", null);

      markReadQuery = applyEnabledCategoryFilter(markReadQuery);

      const { error } = await markReadQuery;

      if (error) throw error;

      list.querySelectorAll(".grove-activity-item.unread")
        .forEach(item => item.classList.remove("unread"));

      await refreshUnreadCount();

    } catch (error) {
      console.error("Could not mark notifications read:", error);
      showEmpty("Could not update read status. Please refresh.");
    } finally {
      markRead.disabled = unread === 0;
    }
  }

  async function openNotification(link) {
    const id = link.dataset.notificationId;
    const destination = link.href;

    if (link.classList.contains("unread") && user && id) {
      try {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_id", user.id)
          .eq("id", id)
          .is("read_at", null);

        if (error) throw error;

        link.classList.remove("unread");
        await refreshUnreadCount();

      } catch (error) {
        console.warn("Could not mark notification read:", error);
      }
    }

    window.location.assign(destination);
  }

  async function addRealtimeNotification(row) {
    if (!row || !row.id || !categoryEnabled(row.kind)) return;

    if (list.querySelector(".grove-activity-empty")) {
      list.replaceChildren();
    }

    const namedRow = await attachActorName(row);
    renderNotification(namedRow, true);

    try {
      await refreshUnreadCount();
    } catch (error) {
      console.warn("Could not refresh unread count:", error);
    }
  }

  function disconnectRealtime() {
    if (!channel) return;

    const previous = channel;
    channel = null;

    supabase.removeChannel(previous);
  }

  function connectRealtime() {
    disconnectRealtime();

    if (!user) return;

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

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      user = data.user || null;

      if (!user) {
        disconnectRealtime();
        unread = 0;
        updateCount();
        control.remove();
        return;
      }

      if (!control.isConnected) {
        document.body.append(control);
      }

      await loadHistory();
      connectRealtime();

    } catch (error) {
      console.error("Grove activity tab failed:", error);

      if (control.isConnected) {
        showEmpty("Notifications could not initialize. Try refreshing.");
      }
    }
  }

  trigger.addEventListener("click", () => {
    const open = panel.classList.toggle("open");

    trigger.setAttribute("aria-expanded", String(open));
  });

  markRead.addEventListener("click", markAllRead);
  refresh.addEventListener("click", loadHistory);

  list.addEventListener("click", event => {
    const link = event.target.closest(
      ".grove-activity-item[data-notification-id]"
    );

    if (!link) return;

    event.preventDefault();
    openNotification(link);
  });

  window.addEventListener(
    "grove:notification-preferences-updated",
    async event => {
      preferences = {
        ...preferences,
        ...(event.detail || {})
      };

      await loadHistory();
    }
  );

  supabase.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      user = null;
      unread = 0;
      disconnectRealtime();
      updateCount();
      control.remove();
    }

    if (event === "SIGNED_IN") {
      initialize();
    }
  });

  showEmpty("Loading your notification history...");
  initialize();
}
