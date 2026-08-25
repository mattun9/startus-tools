/**
 * Service Worker — 共有シートから受け取ったファイルを画面に橋渡しする
 *
 * Android の共有シートで本アプリを選ぶと、manifest の share_target に従って
 * ./share へ multipart/form-data の POST が飛んでくる。
 * ネットワークには出さず、ここで受け取って Cache に置き、
 * トップページへリダイレクトする。画面側は Cache から取り出して使う。
 */

const CACHE = 'minutes-uploader-v1';
const SHARED = 'shared-audio';           // 共有ファイルの一時置き場
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 共有シートからの POST を受け取る
  if (event.request.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const file = form.get('audio');
        if (file && file.size) {
          const cache = await caches.open(SHARED);
          // ファイル本体と、名前・種類・サイズを別々に保存する
          await cache.put('/__shared__/file', new Response(file, {
            headers: { 'Content-Type': file.type || 'audio/mp4' }
          }));
          await cache.put('/__shared__/meta', new Response(JSON.stringify({
            name: file.name || '',
            type: file.type || '',
            size: file.size,
            at: Date.now()
          }), { headers: { 'Content-Type': 'application/json' } }));
        }
      } catch (err) {
        // 受け取りに失敗してもアプリは開く（画面側でファイル選択できる）
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  // それ以外は「まずネットワーク、ダメならキャッシュ」
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./')))
  );
});
