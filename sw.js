const CACHE_NAME = 'tari-pos-v41-cache-first'; // 🟢 Bumped version to force the update
const ASSETS = [
  './index.html', // 🟢 Updated to index.html
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// 1. INSTALL: Cache core assets immediately
self.addEventListener('install', (e) => {
  self.skipWaiting(); 
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// 2. ACTIVATE: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  return self.clients.claim(); 
});

// 3. FETCH: Smart Caching Strategy
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 🛑 1. IGNORE LIVE DATA (Never cache database or auth calls)
  if (url.includes('supabase.co') && (url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/realtime/'))) {
    return; // Let the network handle it natively
  }

  // 🖼️ 2. CACHE-FIRST FOR IMAGES (Protects Supabase Egress!)
  if (url.includes('supabase.co/storage/v1/')) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        // 🟢 If we already downloaded this image, use it instantly! (0 bandwidth used)
        if (cachedResponse) {
          return cachedResponse; 
        }
        // 🔴 If we don't have it yet, fetch it from Supabase, then save it forever.
        return fetch(e.request).then((networkResponse) => {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          return networkResponse;
        }).catch(() => console.log("Offline and image not found"));
      })
    );
    return; // Stop here so it doesn't run the code below
  }

  // 🌐 3. NETWORK-FIRST FOR EVERYTHING ELSE (HTML, CSS, JS)
  // Ensures you always get the latest app updates when online.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request)) // Fallback to cache if offline
  );
});

// 4. NOTIFICATIONS: The "Native App" Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // 🟢 Check for index.html or the base domain (if the URL just ends in /)
        if ((client.url.includes('index') || client.url.endsWith('/')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html'); // 🟢 Updated to open index.html
      }
    })
  );
});
