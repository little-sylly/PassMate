(function (PM) {
  'use strict';
  var s = PM.store.get();
  if (s.largeText) document.documentElement.setAttribute('data-large', '');

  PM.router.define('welcome', PM.views.welcome);
  PM.router.define('date', PM.views.date);
  PM.router.define('today', PM.views.today);
  PM.router.define('session', PM.views.session);
  PM.router.define('gate', PM.examUI.gate);
  PM.router.define('mock', PM.examUI.mock);
  PM.router.define('review', PM.tabsUI.review);
  PM.router.define('progress', PM.tabsUI.progress);
  PM.router.define('settings', PM.tabsUI.settings);
  PM.router.define('restore', PM.tabsUI.restore);
  PM.router.start(document.getElementById('app'));

  // Offline: register after load so it never competes with first paint.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works online */ });
    });
  }
})(window.PM = window.PM || {});
