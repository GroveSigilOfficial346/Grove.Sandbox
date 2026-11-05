"use strict";

// =========================================
// GROVE SERVICE WORKER
// Handles browser notifications and clicks.
// =========================================

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Receive a push event if a push sender is configured.
self.addEventListener("push", event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : "You have a new Grove notification."
    };
  }

  const title = payload.title || "Grove";

  const options = {
    body: payload.body || "You have a new notification.",
    icon: "/assets/neural-tree.svg",
    badge: "/assets/neural-tree.svg",
    tag: payload.tag || "grove-notification",
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Open the relevant Grove page when an alert is clicked.
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  );

  if (target.origin !== self.location.origin) {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.navigate(target.href);
          return client.focus();
        }
      }

      return self.clients.openWindow(target.href);
    })
  );
});
