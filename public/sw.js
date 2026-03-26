self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || "Neue Nachricht";
  const body = data.body || "Du hast eine neue Nachricht.";
  const url = data.url || "/dashboard/chat";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/brand/apple-touch-icon.png",
      badge: "/brand/apple-touch-icon.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/dashboard/chat";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return client;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});