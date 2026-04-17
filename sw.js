const CACHE_NAME = 'tari-pos-v45';
const CACHE_NAME_IMAGES = 'tari-images-v1'; // Separate image cache so it never gets wiped

// Core app shell — everything needed to load the POS offline
const ASSETS = [
  './index.html', // ✅ actual app file
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/apexcharts',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap',
];

// 1. INSTALL: Pre-cache everything immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails if even one asset fails — use individual adds so one CDN hiccup doesn't break everything
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
    })
  );
});

// 2. ACTIVATE: Clean up old caches, keep image cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key !== CACHE_NAME_IMAGES) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. FETCH: Smart strategy per request type
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 🛑 Never cache Supabase live data
  if (url.includes('supabase.co') && (
    url.includes('/rest/v1/') || 
    url.includes('/auth/v1/') || 
    url.includes('/realtime/')
  )) {
    return;
  }

  // 🖼️ Supabase images — cache-first, permanent (separate cache, never wiped)
  if (url.includes('supabase.co/storage/v1/')) {
    e.respondWith(
      caches.open(CACHE_NAME_IMAGES).then((cache) => {
        return cache.match(e.request).then((cached) => {
          if (cached) return cached; // Instant, zero egress
          return fetch(e.request).then((res) => {
            cache.put(e.request, res.clone());
            return res;
          }).catch(() => new Response('', { status: 408 }));
        });
      })
    );
    return;
  }

  // 🔤 Google Fonts — cache-first (fonts never change)
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // 📦 CDN assets — cache-first (versioned URLs never change)
  if (
    url.includes('cdnjs.cloudflare.com') || 
    url.includes('cdn.jsdelivr.net') || 
    url.includes('cdn.tailwindcss.com')
  ) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res.clone()));
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // 🏠 App HTML — cache-first with background update (stale-while-revalidate)
  // This means: load instantly from cache, quietly update cache in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((res) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);

      return cached || networkFetch; // ✅ Serve cache instantly, update silently
    })
  );
});

// 4. Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ((client.url.includes('index') || client.url.endsWith('/')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
