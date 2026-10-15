// Service worker: receives push notifications for order changes.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Frusangar', body: event.data ? event.data.text() : '' };
  }
  // "Seen by": replaces the pending notification of that order without sound or vibration
  const ack = data.type === 'ack';
  const critical = data.priority === 'critico' && !ack;
  event.waitUntil(self.registration.showNotification(data.title || 'Cambio en pedido', {
    body: data.body || '',
    tag: data.tag,
    renotify: !ack,
    silent: ack,
    requireInteraction: critical,
    vibrate: ack ? [] : critical ? [300, 100, 300, 100, 300] : [200],
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        return client.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});
