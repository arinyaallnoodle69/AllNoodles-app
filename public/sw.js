const CACHE_NAME = "T&Y Noodle-v3";
const APP_SHELL = [
  "/",
  "/login",
  "/offline",
  "/manifest.webmanifest",
  "/brand/192x192.png",
  "/brand/512x512.png",
  "/brand/1200x630.png",
];
const NAVIGATION_TIMEOUT_MS = 2500;
const DEFAULT_NOTIFICATION_URL = "/orders/incoming";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "มีออเดอร์ใหม่",
      body: "มีคำสั่งซื้อใหม่เข้ามาในระบบ",
      icon: "/brand/192x192.png",
      badge: "/brand/192x192.png",
      url: DEFAULT_NOTIFICATION_URL,
      tag: "new-order",
    };
  }

  try {
    const payload = event.data.json();

    return {
      title: payload?.title || "มีออเดอร์ใหม่",
      body: payload?.body || "มีคำสั่งซื้อใหม่เข้ามาในระบบ",
      icon: payload?.icon || "/brand/192x192.png",
      badge: payload?.badge || "/brand/192x192.png",
      url: payload?.url || DEFAULT_NOTIFICATION_URL,
      tag: payload?.tag || payload?.topic || "new-order",
    };
  } catch (error) {
    console.warn("[sw] Unable to parse push payload:", error);

    return {
      title: "มีออเดอร์ใหม่",
      body: "มีคำสั่งซื้อใหม่เข้ามาในระบบ",
      icon: "/brand/192x192.png",
      badge: "/brand/192x192.png",
      url: DEFAULT_NOTIFICATION_URL,
      tag: "new-order",
    };
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }

          return Promise.resolve(false);
        }),
      ),
    ),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([fetch(request), delay(NAVIGATION_TIMEOUT_MS).then(() => null)])
        .then(async (networkResponse) => {
          if (networkResponse) {
            return networkResponse;
          }

          const cachedLogin = await caches.match("/login");
          if (cachedLogin) {
            return cachedLogin;
          }

          return caches.match("/offline");
        })
        .catch(async () => {
          const cachedLogin = await caches.match("/login");
          if (cachedLogin) {
            return cachedLogin;
          }

          return caches.match("/offline");
        }),
    );
    return;
  }

  const isStaticAsset =
    url.origin === self.location.origin &&
    ["style", "script", "image", "font", "manifest"].includes(request.destination);

  if (!isStaticAsset) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match("/offline");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: true,
      data: {
        url: payload.url,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || DEFAULT_NOTIFICATION_URL;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!("focus" in client)) continue;

        const clientUrl = new URL(client.url);
        const nextUrl = new URL(targetUrl, self.location.origin);

        if (clientUrl.pathname === nextUrl.pathname) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
