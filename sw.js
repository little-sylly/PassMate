/* PassMate service worker. Bump VERSION whenever a shell file changes (and PM.config.version). */
'use strict';
var VERSION = '0.2.0';
var SHELL = 'passmate-shell-' + VERSION;
var DATA = 'passmate-data';

var SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/session.css',
  'js/config.js', 'js/dom.js', 'js/store.js', 'js/content.js', 'js/router.js', 'js/session.js', 'js/session-ui.js', 'js/views.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('passmate-shell-') === 0 && k !== SHELL; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // Content files: serve the cached copy at once, refresh it in the background.
  if (url.pathname.indexOf('/data/') !== -1) {
    e.respondWith(caches.open(DATA).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res.ok) cache.put(req, res.clone());
          return res;
        });
        return hit || fresh;
      });
    }));
    return;
  }

  // Page loads: the shell, from cache first; fall back to the network, then to the cached index.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(function (hit) {
      return hit || fetch(req);
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
