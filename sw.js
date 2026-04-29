// ═══════════════════════════════════════════════════════════════════
//  TARI ADMIN APP — SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════
//  Changes from previous version:
//    🔥 Removed auto-skipWaiting — lets the page show "Update" banner
//    🔥 Added message handler that responds to BOTH 'SKIP_WAITING' formats
//        (string from new code, {type: 'SKIP_WAITING'} from legacy code)
//    🔥 Switched HTML strategy from stale-while-revalidate → network-first
//        with timeout. Combined with the banner, users now ACTUALLY see
//        new versions instead of being one session behind.
//    🔥 Wrapped clients.claim() inside waitUntil for cleaner async
//    🔥 Added logging for cache cleanup so you can verify in DevTools
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME = 'tari-pos-v49';
const CACHE_NAME_IMAGES = 'tari-images-v1'; // Separate image cache so it never gets wiped

// How long to wait for fresh HTML before falling back to cache
const NAVIGATION_TIMEOUT_MS = 3000;

// Core app shell — everything needed to load the POS offline
const ASSETS = [
  './index.html',
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

// ── 1. INSTALL: Pre-cache shell, but DON'T auto-activate ─────────
// 🔥 CRITICAL CHANGE: removed self.skipWaiting() so the banner can
// prompt the user before activation. The page-side code calls
// skipWaiting via postMessage when the user taps "Update".
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual adds so one CDN hiccup doesn't break everything
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
    })
  );
});

// ── 2. ACTIVATE: Clean up old caches, claim clients ──────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keyList) =>
        Promise.all(
          keyList
            .filter(key => key !== CACHE_NAME && key !== CACHE_NAME_IMAGES)
            .map(key => {
              console.log('🧹 Clearing Old Cache:', key);
              return caches.delete(key);
            })
        )
      ),
      // 🔥 FIX: Moved inside waitUntil for proper async ordering
      self.clients.claim()
    ])
  );
});

// ── 3. MESSAGE HANDLER — accepts BOTH skipWaiting message formats ─
// 🔥 NEW: Without this, the banner's "Update" button would do nothing.
// String format: page sends 'SKIP_WAITING'
// Object format: page sends {type: 'SKIP_WAITING'} (legacy admin code)
self.addEventListener('message', (event) => {
  if (
    event.data === 'SKIP_WAITING' ||
    (event.data && event.data.type === 'SKIP_WAITING')
  ) {
    self.skipWaiting();
  }
});

// ── 4. FETCH: Smart strategy per request type ────────────────────
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

  // 🏠 App HTML — NETWORK-FIRST with timeout (was: stale-while-revalidate)
  // 🔥 CRITICAL CHANGE: With the new banner flow, we WANT to fetch fresh HTML
  // immediately so the SW lifecycle correctly detects new versions and shows
  // the update prompt. Stale-while-revalidate was causing users to be one
  // session behind every deploy.
  //
  // Strategy: try network first (3s timeout), fall back to cache if slow/offline.
  // Cache is updated in the background on every successful network fetch.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      Promise.race([
        fetch(e.request).then((res) => {
          // Cache the fresh response for offline fallback
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Navigation timeout')), NAVIGATION_TIMEOUT_MS)
        )
      ]).catch(() =>
        caches.match(e.request).then(cached =>
          cached || caches.match('./index.html')
        )
      )
    );
    return;
  }

  // Anything else — try cache then network (safe default)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => cached);
    })
  );
});

// ── 5. Notification click handler ────────────────────────────────
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
