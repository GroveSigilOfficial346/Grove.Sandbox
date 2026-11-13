import { supabase } from "./supabase.js";

(() => {
  "use strict";

  if (window.__groveReactionsInstalled) return;
  window.__groveReactionsInstalled = true;

  const REACTIONS = [
    "👍", "❤️", "😂", "😮", "😢", "🔥", "👏",
    "🎉", "💯", "🤔", "😍", "👀", "🙏", "⚡"
  ];

  const TARGETS = [
    {
      type: "post",
      selector: ".post-card[data-post-id], .feed-post[id^='post-']",
      getId: element =>
        element.dataset.postId ||
        element.id.replace(/^post-/, "")
    },
    {
      type: "comment",
      selector: ".comment[data-comment-id]",
      getId: element => element.dataset.commentId
    },
    {
      type: "message",
      selector: ".message-bubble[data-message-id]",
      getId: element => element.dataset.messageId
    },
    {
      type: "channel_post",
      selector: "[data-channel-post-id]",
      getId: element => element.dataset.channelPostId
    },
    {
      type: "live_chat_message",
      selector: "[data-live-chat-message-id]",
      getId: element => element.dataset.liveChatMessageId
    }
  ];

  let user = null;
  let realtimeChannel = null;
  let authSubscription = null;
  let observer = null;

  let refreshTimer = null;
  let refreshRunning = false;
  let refreshAgain = false;
  let instanceCounter = 0;

  const widgets = new Map();

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function makeInstanceKey(type, id, element) {
    if (!element.dataset.groveReactionInstance) {
      instanceCounter += 1;
      element.dataset.groveReactionInstance =
        String(instanceCounter);
    }

    return `${type}:${id}:${element.dataset.groveReactionInstance}`;
  }

  function scanTargets() {
    const found = [];

    for (const config of TARGETS) {
      document.querySelectorAll(config.selector).forEach(element => {
        const id = config.getId(element);

        if (!id) return;

        const key = makeInstanceKey(
          config.type,
          id,
          element
        );

        const existing = widgets.get(key);

        if (
          existing &&
          existing.element === element &&
          existing.wrapper.isConnected
        ) {
          return;
        }

        found.push({
          type: config.type,
          id,
          key,
          element
        });
      });
    }

    return found;
  }

  function createWidget(target) {
    const wrapper = document.createElement("div");

    wrapper.className = "grove-reactions";
    wrapper.dataset.groveReactions = "true";
    wrapper.dataset.targetType = target.type;
    wrapper.dataset.targetId = target.id;

    const buttons = document.createElement("div");

    buttons.className = "grove-reaction-buttons";
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", "React to this content");

    for (const emoji of REACTIONS) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "grove-reaction";
      button.dataset.reaction = emoji;
      button.dataset.targetType = target.type;
      button.dataset.targetId = target.id;

      button.setAttribute("aria-label", `React ${emoji}`);
      button.setAttribute("aria-pressed", "false");

      const icon = document.createElement("span");
      icon.className = "grove-reaction-emoji";
      icon.textContent = emoji;

      const count = document.createElement("span");
      count.className = "grove-reaction-count";

      button.append(icon, count);
      buttons.append(button);
    }

    wrapper.append(buttons);

    const anchor =
      target.element.querySelector(".post-actions") ||
      target.element.querySelector(".feed-actions") ||
      target.element.querySelector(".message-compose-action-row") ||
      target.element.querySelector(".message-action-row");

    if (anchor) {
      anchor.insertAdjacentElement("afterend", wrapper);
    } else {
      target.element.append(wrapper);
    }

    widgets.set(target.key, {
      ...target,
      wrapper
    });
  }

  function ensureWidgets() {
    if (!user) return;

    for (const target of scanTargets()) {
      const existing = widgets.get(target.key);

      if (existing?.wrapper?.isConnected) {
        existing.wrapper.remove();
      }

      createWidget(target);
    }

    pruneDisconnectedWidgets();
    scheduleRefresh();
  }

  function pruneDisconnectedWidgets() {
    for (const [key, widget] of widgets.entries()) {
      if (
        !widget.element.isConnected ||
        !widget.wrapper.isConnected
      ) {
        widgets.delete(key);
      }
    }
  }

  function removeAllWidgets() {
    for (const widget of widgets.values()) {
      widget.wrapper.remove();
    }

    widgets.clear();
  }

  function renderWidget(widget, rows) {
    const grouped = new Map();

    for (const row of rows) {
      if (!grouped.has(row.reaction)) {
        grouped.set(row.reaction, []);
      }

      grouped.get(row.reaction).push(row);
    }

    widget.wrapper
      .querySelectorAll(".grove-reaction")
      .forEach(button => {
        const emoji = button.dataset.reaction;
        const matches = grouped.get(emoji) || [];

        const mine = matches.some(
          row => row.user_id === user.id
        );

        const count = $(".grove-reaction-count", button);

        button.classList.toggle("is-selected", mine);
        button.setAttribute("aria-pressed", String(mine));

        if (count) {
          count.textContent = matches.length
            ? String(matches.length)
            : "";
        }

        button.title = matches.length
          ? `${emoji} · ${matches.length}`
          : `React ${emoji}`;
      });
  }

  async function loadReactionRows(type, ids) {
    const rows = [];
    const batchSize = 50;

    for (let start = 0; start < ids.length; start += batchSize) {
      const batch = ids.slice(start, start + batchSize);

      const { data, error } = await supabase
        .from("content_reactions")
        .select("id,target_type,target_id,user_id,reaction")
        .eq("target_type", type)
        .in("target_id", batch);

      if (error) throw error;

      rows.push(...(data || []));
    }

    return rows;
  }

  async function refreshWidgets() {
    if (!user) return;

    if (refreshRunning) {
      refreshAgain = true;
      return;
    }

    refreshRunning = true;

    try {
      pruneDisconnectedWidgets();

      const active = [...widgets.values()].filter(widget =>
        widget.element.isConnected &&
        widget.wrapper.isConnected
      );

      const types = [...new Set(
        active.map(widget => widget.type)
      )];

      for (const type of types) {
        const group = active.filter(
          widget => widget.type === type
        );

        const ids = [...new Set(
          group.map(widget => widget.id)
        )];

        if (!ids.length) continue;

        const rows = await loadReactionRows(type, ids);
        const byTarget = new Map();

        for (const row of rows) {
          if (!byTarget.has(row.target_id)) {
            byTarget.set(row.target_id, []);
          }

          byTarget.get(row.target_id).push(row);
        }

        for (const widget of group) {
          if (!widget.wrapper.isConnected) continue;

          renderWidget(
            widget,
            byTarget.get(widget.id) || []
          );
        }
      }
    } catch (error) {
      console.error(
        "Grove reactions could not refresh:",
        error
      );
    } finally {
      refreshRunning = false;

      if (refreshAgain) {
        refreshAgain = false;
        scheduleRefresh();
      }
    }
  }

  function scheduleRefresh() {
    if (!user) return;

    window.clearTimeout(refreshTimer);

    refreshTimer = window.setTimeout(
      refreshWidgets,
      180
    );
  }

  async function toggleReaction(button) {
    if (!user || button.disabled) return;

    const type = button.dataset.targetType;
    const id = button.dataset.targetId;
    const emoji = button.dataset.reaction;

    if (
      !TARGETS.some(target => target.type === type) ||
      !id ||
      !REACTIONS.includes(emoji)
    ) {
      return;
    }

    button.disabled = true;

    try {
      const { data: existing, error: lookupError } =
        await supabase
          .from("content_reactions")
          .select("id")
          .eq("target_type", type)
          .eq("target_id", id)
          .eq("user_id", user.id)
          .eq("reaction", emoji)
          .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        const { error } = await supabase
          .from("content_reactions")
          .delete()
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("content_reactions")
          .insert({
            target_type: type,
            target_id: id,
            user_id: user.id,
            reaction: emoji
          });

        if (error) throw error;
      }

      await refreshWidgets();

    } catch (error) {
      console.error("Grove reaction failed:", error);

      const status =
        $("#messages-status") ||
        $("#community-status") ||
        $("#feed-status") ||
        $("#broadcast-status") ||
        $("#live-status");

      if (status) {
        status.textContent =
          error.message || "Could not update reaction.";

        status.style.color = "#ff8585";
      }
    } finally {
      button.disabled = false;
    }
  }

  async function removeRealtimeChannel() {
    if (!realtimeChannel) return;

    const channel = realtimeChannel;
    realtimeChannel = null;

    try {
      await supabase.removeChannel(channel);
    } catch (error) {
      console.warn(
        "Could not remove Grove reaction realtime channel:",
        error
      );
    }
  }

  async function applyUser(nextUser) {
    const nextId = nextUser?.id || null;
    const currentId = user?.id || null;

    if (nextId === currentId) return;

    user = nextUser || null;

    window.clearTimeout(refreshTimer);
    refreshAgain = false;

    await removeRealtimeChannel();

    if (!user) {
      removeAllWidgets();
      return;
    }

    ensureWidgets();

    realtimeChannel = supabase
      .channel(`grove-content-reactions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "content_reactions"
        },
        scheduleRefresh
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Grove reaction realtime connection issue:",
            error || status
          );
        }
      });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest(
      ".grove-reaction[data-reaction]"
    );

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    toggleReaction(button);
  });

  observer = new MutationObserver(records => {
    const changed = records.some(record =>
      record.type === "childList" &&
      record.addedNodes.length > 0
    );

    if (changed) ensureWidgets();
  });

  async function initialize() {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    await applyUser(data.user || null);

    const { data: authListener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
          applyUser(session?.user || null).catch(error => {
            console.error(
              "Grove reaction authentication update failed:",
              error
            );
          });
        }, 0);
      });

    authSubscription = authListener.subscription;
  }

  window.addEventListener("beforeunload", () => {
    observer?.disconnect();
    window.clearTimeout(refreshTimer);

    if (authSubscription) {
      authSubscription.unsubscribe();
    }

    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
  });

  initialize().catch(error => {
    console.error(
      "Grove reactions failed to initialize:",
      error
    );

    window.__groveReactionsInstalled = false;
  });
})();
