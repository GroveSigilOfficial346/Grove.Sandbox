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
      selector: ".post-card[data-post-id]",
      attribute: "postId"
    },
    {
      type: "comment",
      selector: ".comment[data-comment-id]",
      attribute: "commentId"
    },
    {
      type: "message",
      selector: ".message-bubble[data-message-id]",
      attribute: "messageId"
    },
    {
      type: "channel_post",
      selector: "[data-channel-post-id]",
      attribute: "channelPostId"
    },
    {
      type: "live_chat_message",
      selector: "[data-live-chat-message-id]",
      attribute: "liveChatMessageId"
    }
  ];

  let user = null;
  let realtimeChannel = null;
  let refreshTimer = null;
  let refreshRunning = false;
  let refreshAgain = false;

  const widgets = new Map();

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function targetKey(type, id) {
    return `${type}:${id}`;
  }

  function getTargetFromElement(element, config) {
    const id = element.dataset[config.attribute];

    if (!id) return null;

    return {
      type: config.type,
      id,
      key: targetKey(config.type, id),
      element
    };
  }

  function findTargets() {
    const found = [];

    for (const config of TARGETS) {
      document.querySelectorAll(config.selector).forEach(element => {
        const target = getTargetFromElement(element, config);

        if (target && !element.querySelector(":scope > [data-grove-reactions]")) {
          found.push(target);
        } else if (target) {
          const existing = widgets.get(target.key);

          if (existing) existing.element = element;
        }
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
      count.textContent = "0";

      button.append(icon, count);
      buttons.append(button);
    }

    wrapper.append(buttons);

    const anchor =
      target.element.querySelector(".post-actions") ||
      target.element.querySelector(".message-compose-action-row") ||
      target.element.querySelector(".message-action-row") ||
      target.element;

    if (anchor === target.element) {
      target.element.append(wrapper);
    } else {
      anchor.insertAdjacentElement("afterend", wrapper);
    }

    widgets.set(target.key, {
      ...target,
      wrapper
    });

    return wrapper;
  }

  function ensureWidgets() {
    const targets = findTargets();

    for (const target of targets) {
      if (widgets.has(target.key)) continue;
      createWidget(target);
    }

    if (targets.length) scheduleRefresh();
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
          ? `${emoji} ${matches.length}`
          : `React ${emoji}`;
      });
  }

  async function refreshWidgets() {
    if (refreshRunning) {
      refreshAgain = true;
      return;
    }

    refreshRunning = true;

    try {
      const activeWidgets = [...widgets.values()].filter(
        widget => widget.element.isConnected &&
          widget.wrapper.isConnected
      );

      for (const type of [...new Set(
        activeWidgets.map(widget => widget.type)
      )]) {
        const group = activeWidgets.filter(
          widget => widget.type === type
        );

        const ids = [...new Set(group.map(widget => widget.id))];

        if (!ids.length) continue;

        const { data, error } = await supabase
          .from("content_reactions")
          .select("id,target_type,target_id,user_id,reaction")
          .eq("target_type", type)
          .in("target_id", ids);

        if (error) throw error;

        const rowsByTarget = new Map();

        for (const row of data || []) {
          if (!rowsByTarget.has(row.target_id)) {
            rowsByTarget.set(row.target_id, []);
          }

          rowsByTarget.get(row.target_id).push(row);
        }

        for (const widget of group) {
          renderWidget(
            widget,
            rowsByTarget.get(widget.id) || []
          );
        }
      }
    } catch (error) {
      console.error("Grove reactions could not refresh:", error);
    } finally {
      refreshRunning = false;

      if (refreshAgain) {
        refreshAgain = false;
        scheduleRefresh();
      }
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);

    refreshTimer = window.setTimeout(() => {
      refreshWidgets();
    }, 140);
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
      const { data: existing, error: lookupError } = await supabase
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

      const status = $(
        "#messages-status"
      ) || $("#community-status");

      if (status) {
        status.textContent =
          error.message || "Could not update reaction.";
        status.style.color = "#ff8585";
      }
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest(
      ".grove-reaction[data-reaction]"
    );

    if (!button) return;

    event.preventDefault();
    toggleReaction(button);
  });

  const observer = new MutationObserver(records => {
    let shouldScan = false;

    for (const record of records) {
      if (record.type === "childList" && record.addedNodes.length) {
        shouldScan = true;
        break;
      }

      if (
        record.type === "attributes" &&
        record.target.matches?.(
          ".post-card, .message-bubble, .comment"
        )
      ) {
        shouldScan = true;
        break;
      }
    }

    if (shouldScan) ensureWidgets();
  });

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;
    if (!data.user) return;

    user = data.user;

    ensureWidgets();

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-post-id",
        "data-comment-id",
        "data-message-id",
        "data-channel-post-id",
        "data-live-chat-message-id"
      ]
    });

    realtimeChannel = supabase
      .channel(`grove-content-reactions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "content_reactions"
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();
  }

  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    window.clearTimeout(refreshTimer);

    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
  });

  initialize().catch(error => {
    console.error("Grove reactions failed to initialize:", error);
  });
})();
