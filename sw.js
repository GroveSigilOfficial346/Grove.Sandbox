"use strict";

const CACHE_NAME = "grove-shell-v1";

const APP_FILES = [
  "/",
  "/index.html",
  "/auth.html",
  "/profile.html",
  "/settings.html",
  "/css/global.css",
  "/assets/grove-logo.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/storage/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/index.html");
        return cached || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (
          response.ok &&
          (
            url.pathname.startsWith("/css/") ||
            url.pathname.startsWith("/js/") ||
            url.pathname.startsWith("/assets/")
          )
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }

        return response;
      });
    })
  );
});
