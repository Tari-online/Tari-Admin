const CACHE_NAME = 'tari-admin-v23-launch'; // Updated version name
const ASSETS = [
  './index.html', // <--- FIXED: Matches your current file
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css', // Added missing assets
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// 1. INSTALL: Cache core assets immediately
self.addEventListener('install', (e) => {
  self.skipWaiting(); // <--- CRITICAL: Forces new version to take over immediately
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
  return self.clients.claim(); // <--- CRITICAL: Controls open tabs immediately
});

// 3. FETCH: Network First (Safe Mode)
// We ignore API calls (Supabase) so we never cache live data
self.addEventListener('fetch', (e) => {
  // Don't cache API calls or Supabase Realtime
  if (e.request.url.includes('supabase.co')) {
    return; // Let the network handle it directly
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Update cache with fresh version if successful
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
      // If the admin tab is open, focus it
      for (const client of clientList) {
        if (client.url.includes('admin') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not open, open it fresh
      if (clients.openWindow) {
        return clients.openWindow('./admin.v.23.html'); // <--- FIXED
      }
    })
  );
});
