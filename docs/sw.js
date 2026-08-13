// VERSION 由 build.js 用 index.html 的内容哈希替换，本地开发时保持 'dev'
var VERSION = 'ffd46eb9';
var CACHE = 'salary-calc-' + VERSION;
var ASSETS = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var accept = req.headers.get('accept') || '';
  var isDoc = req.mode === 'navigate' || accept.indexOf('text/html') > -1;

  if (isDoc) {
    // 页面本身走 network-first：有网就拿最新，没网才回退缓存
    e.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(r) {
          return r || caches.match('index.html');
        });
      })
    );
  } else {
    // 图标等静态资源走 cache-first
    e.respondWith(
      caches.match(req).then(function(r) {
        return r || fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        });
      })
    );
  }
});
