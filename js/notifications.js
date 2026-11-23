(function () {
  "use strict";

  const client = window.supabaseClient;

  const statusElement = document.getElementById("notification-status");
  const listElement = document.getElementById("notification-list");
  const refreshButton = document.getElementById("refresh-button");
  const markAllButton = document.getElementById("mark-all-button");
  const logoutButton = document.getElementById("logout-button");

  let currentUser = null;
  let loading = false;

  const messages = {
    follow: "started following you.",
    follow_request: "sent you a follow request.",
    like: "liked your post.",
    comment: "commented on your post."
  };

  function setStatus(message, type) {
    statusElement.textContent = message || "";
    statusElement.dataset.type = type || "info";
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function formatDate(value) {
    if (!value) return "";

    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  async function loadNotifications() {
    if (loading || !currentUser) return;

    loading = true;
    refreshButton.disabled = true;
    markAllButton.disabled = true;

    setStatus("Loading notifications...", "info");
    listElement.replaceChildren();

    try {
      const { data: notifications, error } = await client
        .from("notifications")
        .select("id, recipient_id, actor_id, kind, post_id, read_at, created_at")
        .eq("recipient_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        listElement.appendChild(
          makeElement(
            "div",
            "empty-message",
            "You're all caught up. No notifications yet."
          )
        );

        setStatus("No notifications.", "success");
        return;
      }

      const actorIds = [
        ...new Set(
          notifications
            .map(item => item.actor_id)
            .filter(Boolean)
        )
      ];

      let profiles = new Map();

      if (actorIds.length) {
        const { data, error: profileError } = await client
          .from("profiles")
          .select("id, username, display_name")
          .in("id", actorIds);

        if (profileError) throw profileError;

        profiles = new Map(
          (data || []).map(profile => [profile.id, profile])
        );
      }

      notifications.forEach(notification => {
        renderNotification(notification, profiles);
      });

      const unreadCount = notifications.filter(
        item => !item.read_at
      ).length;

      setStatus(
        unreadCount
          ? unreadCount + " unread notification(s)."
          : "You're all caught up.",
        "success"
      );
    } catch (error) {
      console.error("Grove notifications error:", error);
      setStatus(
        error.message || "Could not load notifications.",
        "error"
      );
    } finally {
      loading = false;
      refreshButton.disabled = false;
      markAllButton.disabled = false;
    }
  }

  function renderNotification(notification, profiles) {
    const item = makeElement(
      "article",
      notification.read_at
        ? "notification-item"
        : "notification-item unread"
    );

    const content = makeElement("div", "notification-content");

    const actor = profiles.get(notification.actor_id);

    const actorName = actor
      ? actor.display_name || actor.username || "A Grove member"
      : "A Grove member";

    const message = messages[notification.kind] ||
      "interacted with your Grove account.";

    content.appendChild(
      makeElement(
        "p",
        "notification-title",
        actorName + " " + message
      )
    );

    content.appendChild(
      makeElement(
        "p",
        "notification-date",
        formatDate(notification.created_at)
      )
    );

    const actions = makeElement("div", "notification-actions");

    if (!notification.read_at) {
      const readButton = makeElement("button", "", "MARK READ");
      readButton.type = "button";

      readButton.addEventListener("click", function () {
        markRead(notification.id, readButton);
      });

      actions.appendChild(readButton);
    }

    if (notification.post_id) {
      const viewButton = makeElement("button", "", "VIEW POST");
      viewButton.type = "button";

      viewButton.addEventListener("click", function () {
        window.location.href =
          "feed.html#post-" + notification.post_id;
      });

      actions.appendChild(viewButton);
    }

    const deleteButton = makeElement(
      "button",
      "danger",
      "DELETE"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", function () {
      deleteNotification(notification.id, deleteButton);
    });

    actions.appendChild(deleteButton);

    item.append(content, actions);
    listElement.appendChild(item);
  }

  async function markRead(notificationId, button) {
    button.disabled = true;

    try {
      const { error } = await client
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("recipient_id", currentUser.id);

      if (error) throw error;

      await loadNotifications();
    } catch (error) {
      console.error("Mark notification read error:", error);
      setStatus(error.message || "Could not mark notification read.", "error");
      button.disabled = false;
    }
  }

  async function markAllRead() {
    markAllButton.disabled = true;

    try {
      const { error } = await client
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", currentUser.id)
        .is("read_at", null);

      if (error) throw error;

      setStatus("All notifications marked as read.", "success");
      await loadNotifications();
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      setStatus(error.message || "Could not update notifications.", "error");
      markAllButton.disabled = false;
    }
  }

  async function deleteNotification(notificationId, button) {
    if (!window.confirm("Delete this notification?")) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("recipient_id", currentUser.id);

      if (error) throw error;

      setStatus("Notification deleted.", "success");
      await loadNotifications();
    } catch (error) {
      console.error("Delete notification error:", error);
      setStatus(error.message || "Could not delete notification.", "error");
      button.disabled = false;
    }
  }

  async function initialize() {
    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      await loadNotifications();
    } catch (error) {
      console.error("Grove notification initialization:", error);
      setStatus(error.message || "Could not connect.", "error");
    }
  }

  refreshButton.addEventListener("click", loadNotifications);
  markAllButton.addEventListener("click", markAllRead);

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      setStatus(error.message || "Logout failed.", "error");
      logoutButton.disabled = false;
    }
  });

  if (!client) {
    setStatus("Supabase is not connected.", "error");
    return;
  }

  initialize();
})();
