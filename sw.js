/* Offline shell and complete audio library. All URLs are relative to this scope. */
'use strict';

importScripts('./sw-assets.js');

const SCOPE = new URL(self.registration.scope);
const CONFIG = self.PHOTO_PWA_ASSETS;
const CACHE_PREFIX = `photo-notes-pwa-v1:${encodeURIComponent(SCOPE.pathname)}:`;
const CONCURRENCY = 6;
const COMPLETE_URL = new URL('./.__photo_pwa_complete__', SCOPE).href;

function inScope(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

if (!CONFIG || typeof CONFIG.version !== 'string' || !CONFIG.version ||
    !Array.isArray(CONFIG.files) || !CONFIG.files.length) {
  throw new Error('Offline asset list is unavailable.');
}

const VERSION = CONFIG.version;
const ASSETS = [...new Set(CONFIG.files.map(file => {
  if (typeof file !== 'string' || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(file)) {
    throw new Error('Offline asset list is invalid.');
  }
  const url = new URL(file, SCOPE);
  url.hash = '';
  if (!inScope(url) || url.href === COMPLETE_URL) {
    throw new Error('Offline asset list is invalid.');
  }
  return url.href;
}))];
const TOTAL = ASSETS.length;
const CANONICAL = new Map();
for (const url of ASSETS) {
  const pathname = new URL(url).pathname;
  if (!CANONICAL.has(pathname)) CANONICAL.set(pathname, url);
}
const INDEX_URL = CANONICAL.get(new URL('./index.html', SCOPE).pathname);
if (!INDEX_URL) throw new Error('Offline start page is unavailable.');

let selectedCacheName = null;
let downloaded = 0;

function readyMessage() {
  return { type: 'PHOTO_PWA_READY', version: VERSION, total: TOTAL };
}

async function broadcast(message) {
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        if (client.url && inScope(new URL(client.url))) client.postMessage(message);
      } catch (_) { /* A closing tab must not interrupt the download. */ }
    }
  } catch (_) { /* The worker can install without an open window. */ }
}

async function inspectCache(name) {
  const cache = await caches.open(name);
  const marker = await cache.match(COMPLETE_URL);
  if (!marker) return null;
  let metadata;
  try { metadata = await marker.json(); } catch (_) { return null; }
  if (metadata.version !== VERSION || metadata.total !== TOTAL ||
      metadata.completed !== TOTAL) return null;
  const keys = new Set((await cache.keys()).map(request => request.url));
  const completed = ASSETS.reduce((count, url) => count + Number(keys.has(url)), 0);
  return { name, cache, completed, installedAt: Number(metadata.installedAt) || 0 };
}

// The completion marker is written only after every full response is cached.
// Looking up by marker also works after the browser stops/restarts this worker.
async function findCompleteCache() {
  const names = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
  if (selectedCacheName && names.includes(selectedCacheName)) {
    const selected = await inspectCache(selectedCacheName);
    if (selected && selected.completed === TOTAL) return selected;
  }
  const candidates = await Promise.all(names.map(inspectCache));
  const available = candidates.filter(Boolean).sort((a, b) =>
    b.completed - a.completed || b.installedAt - a.installedAt);
  const complete = available.find(item => item.completed === TOTAL);
  // A partially evicted committed cache can still serve its remaining files,
  // but it must never be advertised as ready for offline use.
  selectedCacheName = complete ? complete.name : (available[0] ? available[0].name : null);
  return complete || null;
}

async function installAll() {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const name = `${CACHE_PREFIX}${encodeURIComponent(VERSION)}:${nonce}`;
  const cache = await caches.open(name);
  let next = 0;
  let failed = false;
  let progress = Promise.resolve();
  downloaded = 0;
  await broadcast({ type: 'PHOTO_PWA_CACHE_PROGRESS', completed: 0, total: TOTAL, version: VERSION });
  try {
    async function download() {
      while (!failed && next < TOTAL) {
        const url = ASSETS[next++];
        try {
          const response = await fetch(new Request(url, {
            credentials: 'same-origin', cache: 'reload', redirect: 'error'
          }));
          if (response.status !== 200 || response.type === 'opaque' ||
              (response.url && !inScope(new URL(response.url)))) {
            throw new Error('Offline response is incomplete.');
          }
          await cache.put(url, response);
          const completed = ++downloaded;
          progress = progress.then(() => broadcast({
            type: 'PHOTO_PWA_CACHE_PROGRESS', completed, total: TOTAL, version: VERSION
          }));
        } catch (_) {
          failed = true;
        }
      }
    }
    // All workers settle before removing a failed stage, so no late writer races it.
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, TOTAL) }, download));
    await progress;
    if (failed || downloaded !== TOTAL) throw new Error('Offline download incomplete.');
    await cache.put(COMPLETE_URL, new Response(JSON.stringify({
      version: VERSION, total: TOTAL, completed: TOTAL, installedAt: Date.now()
    }), { headers: { 'Content-Type': 'application/json' } }));
    selectedCacheName = name;
  } catch (_) {
    await caches.delete(name);
    await broadcast({
      type: 'PHOTO_PWA_CACHE_ERROR',
      message: 'Offline download did not finish. Please try again online.'
    });
    throw new Error('Offline download incomplete.');
  }
}

self.addEventListener('install', event => {
  // Updates wait for the user; install never calls skipWaiting().
  event.waitUntil(installAll());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = await findCompleteCache();
    if (!current) throw new Error('Offline download incomplete.');
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== current.name)
      .map(name => caches.delete(name)));
    await self.clients.claim();
    await broadcast(readyMessage());
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data.type === 'PHOTO_PWA_STATUS') {
    event.waitUntil((async () => {
      const current = await findCompleteCache();
      const message = current ? readyMessage() : {
        type: 'PHOTO_PWA_STATUS', ready: false, version: VERSION,
        completed: Math.min(downloaded, TOTAL - 1), total: TOTAL
      };
      const target = event.ports && event.ports[0] ? event.ports[0] : event.source;
      if (target && typeof target.postMessage === 'function') target.postMessage(message);
    })());
  }
});

function rangeResponse(fullResponse, rangeHeader) {
  return fullResponse.arrayBuffer().then(buffer => {
    const size = buffer.byteLength;
    const match = /^bytes\s*=\s*(\d*)-(\d*)\s*$/i.exec(rangeHeader.trim());
    const headers = new Headers(fullResponse.headers);
    headers.delete('Content-Encoding');
    headers.delete('Transfer-Encoding');
    headers.set('Accept-Ranges', 'bytes');
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg');
    let start;
    let end;
    let valid = !!match && size > 0 && !!(match[1] || match[2]);
    if (valid && !match[1]) {
      const suffix = Number(match[2]);
      valid = Number.isSafeInteger(suffix) && suffix > 0;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else if (valid) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
      valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
        start < size && end >= start;
      end = Math.min(end, size - 1);
    }
    if (!valid) {
      headers.set('Content-Range', `bytes */${size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(buffer.slice(start, end + 1), {
      status: 206, statusText: 'Partial Content', headers
    });
  });
}

function rangeApplies(request, response) {
  const condition = request.headers.get('If-Range');
  if (!condition) return true;
  if (condition.startsWith('W/')) return false;
  return condition === response.headers.get('ETag') ||
    condition === response.headers.get('Last-Modified');
}

async function servingCache() {
  // Fetches avoid enumerating the whole library once this worker has a cache.
  if (selectedCacheName && await caches.has(selectedCacheName)) {
    return caches.open(selectedCacheName);
  }
  await findCompleteCache();
  return selectedCacheName ? caches.open(selectedCacheName) : null;
}

async function serveAsset(request, canonicalURL) {
  const cache = await servingCache();
  let response = cache && (await cache.match(request.url) || await cache.match(canonicalURL));
  if (response && response.status !== 200) response = null;
  if (!response) {
    // Fetch the full object even when the media element requested only a range.
    const headers = new Headers(request.headers);
    headers.delete('Range');
    headers.delete('If-Range');
    const fullRequest = new Request(request, { headers, redirect: 'error' });
    response = await fetch(fullRequest);
    if (cache && response.status === 200 && response.type !== 'opaque' &&
        (!response.url || inScope(new URL(response.url)))) {
      await cache.put(canonicalURL, response.clone());
    }
  }
  const range = request.headers.get('Range');
  if (range && response.status === 200 && rangeApplies(request, response)) {
    return rangeResponse(response, range);
  }
  return response;
}

async function serveNavigation(request) {
  // Keep the HTML, scripts and data on the active version until the user accepts
  // an installed update. A network-first shell could mix two app versions.
  const cache = await servingCache();
  const shell = cache && await cache.match(INDEX_URL);
  if (shell) return shell;
  try {
    return await fetch(request);
  } catch (_) {
    return new Response('Connect to the internet to finish downloading this app.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !inScope(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request));
    return;
  }
  const canonicalURL = CANONICAL.get(url.pathname);
  if (canonicalURL) event.respondWith(serveAsset(request, canonicalURL));
});
