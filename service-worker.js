/* ─────────────────────────────────────────────────────────────────────────
   LiftTrack Service Worker
   Strategy:
     • App shell + CDN scripts  → cache-first, update in background
     • Google Fonts CSS          → network-first (short timeout), fall to cache
     • Everything else           → network-first, fall to cache
   ───────────────────────────────────────────────────────────────────────── */

const VERSION     = 'lifttrack-v3-calendar';
const CACHE_SHELL = VERSION + '-shell';
const CACHE_CDN   = VERSION + '-cdn';

// Files that must be cached on install for offline use
const SHELL_ASSETS = [
  './',
  './index.html',
  './LiftTrack.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// CDN assets (cached after first fetch — not blocking install)
const CDN_ASSETS = [
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500;600;700;800;900&display=swap',
];

// ── Install ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      // Cache shell synchronously — app won't work offline without these
      const shellCache = await caches.open(CACHE_SHELL);
      await shellCache.addAll(SHELL_ASSETS);

      // Pre-cache CDN assets in background (best-effort)
      const cdnCache = await caches.open(CACHE_CDN);
      await Promise.allSettled(CDN_ASSETS.map(url => cdnCache.add(url)));

      await self.skipWaiting();
    })()
  );
});

// ── Activate ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Remove all caches that belong to older LiftTrack versions
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.startsWith('lifttrack-') && k !== CACHE_SHELL && k !== CACHE_CDN)
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  const isShell = SHELL_ASSETS.some(a => request.url.endsWith(a.replace('./', '')));
  const isCDN   = CDN_ASSETS.includes(request.url) || url.hostname.includes('fonts.g');

  if (isShell) {
    // Cache-first for app shell; update in background
    const cached = await caches.match(request);
    if (cached) {
      // Background refresh
      updateCache(CACHE_SHELL, request);
      return cached;
    }
    return fetchAndCache(CACHE_SHELL, request);
  }

  if (isCDN) {
    // Cache-first for CDN — scripts rarely change
    const cached = await caches.match(request);
    if (cached) return cached;
    return fetchAndCache(CACHE_CDN, request);
  }

  // Network-first for everything else
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_CDN);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline — open LiftTrack to reconnect.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function fetchAndCache(cacheName, request) {
  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function updateCache(cacheName, request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response);
    }
  } catch (_) { /* network unavailable — silently skip */ }
}

// ── Message: force refresh (triggered by in-app "Check for Updates") ─────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
