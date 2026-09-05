self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: "HomeSync", body: event.data?.text() || "" };
  }

  const title = payload.title || "HomeSync";
  const options = {
    body: payload.body || "Tienes una nueva notificación",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || `homesync-${Date.now()}`,
    renotify: Boolean(payload.tag),
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: payload.vibrate || [120, 60, 120],
    timestamp: payload.timestamp || Date.now(),
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "HOMESYNC_SHOW_TEST_NOTIFICATION") return;

  event.waitUntil(
    self.registration.showNotification(data.title || "Prueba de HomeSync", {
      body: data.body || "Las notificaciones locales funcionan en este dispositivo.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "homesync-local-test",
      renotify: true,
      vibrate: [140, 70, 140],
      timestamp: Date.now(),
      data: { url: data.url || "/settings/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
