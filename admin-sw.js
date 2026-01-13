const CACHE_NAME = 'tari-admin-v1';
const ASSETS = [
  './admin.v.14.html', // Make sure this matches your file name exactly
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// ⚡ NETWORK FIRST STRATEGY (Prevents Crashing)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // If internet works, clone & cache the fresh version
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request)) // Only use cache if internet fails
  );
});

// 🔔 NATIVE NOTIFICATION HANDLER
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Close the notification
  // Focus the open Admin tab
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then( windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes('admin') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not open, open it
      if (clients.openWindow) {
        return clients.openWindow('./admin.v.14.html');
      }
    })
  );
});
