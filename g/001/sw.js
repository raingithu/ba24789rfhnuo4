// ChatCAT Service Worker（離線快取）
// 每次更新 chat.html 請把 CACHE 版號遞增一碼（例如 chatcat-v1 → chatcat-v2），
// activate 時會自動砍掉舊快取。
const CACHE = 'chatcat-v13';
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com'];

// 預先快取 app shell：開機時離線仍能開啟
// 部署到 GitHub Pages 時是 index.html；本機直接開則可能是 chat.html chatcat.html，都嘗試
const APP_SHELL = ['./', './index.html', './chat.html', './chatcat.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 逐項快取，單一項目 404（例如 chat.html 不存在）不會讓整個 install 失敗
    await Promise.all(APP_SHELL.map(async (u) => {
      try {
        const r = await fetch(u, { cache: 'no-cache' });
        if (r && r.ok) await c.put(u, r.clone());
      } catch (_) {}
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST / API 絕不快取
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || CDN_HOSTS.some((h) => url.hostname.endsWith(h));
  if (!cacheable) return;                           // 第三方（例如 API 端）直接走網路
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) {
      // stale-while-revalidate：只有同源才背景更新，避免每次都打 CDN
      if (url.origin === self.location.origin) {
        fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); }).catch(() => {});
      }
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r && r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      // 離線且快取沒有 → 同源導覽回 app shell（index.html / chat.html / chatcat.html 都試）
      if (url.origin === self.location.origin && req.mode === 'navigate') {
        const shell = (await c.match('./index.html')) || (await c.match('./chat.html')) || (await c.match('./chatcat.html')) || (await c.match('./'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
