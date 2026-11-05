"use strict";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Grove",
      body: event.data?.text() || "You have a new notification."
    };
  }

  const title = payload.title || "Grove";

  const options = {
    body: payload.body || "You have a new notification.",
    icon: payload.icon || "/assets/neural-tree.svg",
    badge: payload.badge || "/assets/neural-tree.svg",
    tag: payload.tag || "grove-notification",
    renotify: false,
    data: {
      url: payload.url || "/settings.html"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const destination =
    event.notification.data?.url || "/settings.html";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(destination);
          return client.focus();
        }
      }

      return self.clients.openWindow(destination);
    })
  );
});
