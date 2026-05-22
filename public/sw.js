const CACHE_NAME = "T&Y Noodle-v4";
const APP_SHELL = [
  "/",
  "/login",
  "/offline",
  "/manifest.webmanifest",
  "/brand/192x192.png",
  "/brand/512x512.png",
  "/brand/1200x630.png",
];
const DEFAULT_NOTIFICATION_URL = "/orders/incoming";

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
    // Determine the best cache key to look up (either the exact request, or "/" or "/login")
    let cacheKey = request;
    const path = url.pathname;
    
    if (path === "/" || path === "/login" || path.startsWith("/login")) {
      // These are core shells, we want to look them up by their clean paths
      cacheKey = path === "/" ? "/" : "/login";
    }

    event.respondWith(
      caches.match(cacheKey, { ignoreSearch: true }).then((cachedResponse) => {
        // Prepare network fetch promise to run in background or foreground
        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          // Stale-While-Revalidate: Return cache immediately, update cache in background
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // Network-First with quick fallback:
        // If there's no cache match, try network first.
        return fetchPromise.then(async (networkResponse) => {
          if (networkResponse) {
            return networkResponse;
          }

          // Fallback if offline / network failed
          const cachedLogin = await caches.match("/login");
          if (cachedLogin) {
            return cachedLogin;
          }

          return caches.match("/offline");
        });
      })
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
      const nextUrl = new URL(targetUrl, self.location.origin);

      for (const client of clientList) {
        if (!("focus" in client)) continue;

        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === nextUrl.pathname) {
          if ("navigate" in client && clientUrl.href !== nextUrl.href) {
            return client.navigate(nextUrl.href).then((navigatedClient) => {
              if (navigatedClient && "focus" in navigatedClient) {
                return navigatedClient.focus();
              }

              return client.focus();
            });
          }

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
