/* Hash router. Routes: #/welcome #/date #/today #/session #/gate #/mock #/review #/progress */
(function (PM) {
  'use strict';
  var routes = {};
  var rootEl = null;
  var rendering = 0;
  var BANNER = {welcome: 1, date: 1, today: 1, review: 1, progress: 1, settings: 1, restore: 1};

  function parse() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return h || '';
  }

  // Which routes the learner may see yet. Returns the route to use instead, or null.
  function guard(name) {
    var s = PM.store.get();
    if (name === 'restore' && routes.restore) return null;   // a wiped phone starts on Welcome
    if (!s.welcomed && name !== 'welcome') return 'welcome';
    if (s.welcomed && !s.dateAnswered && name !== 'date' && name !== 'welcome') return 'date';
    if (s.welcomed && name === 'welcome' && s.dateAnswered) return 'today';
    if (!name) return s.welcomed ? 'today' : 'welcome';
    if (!routes[name]) return 'today';
    return null;
  }

  function render() {
    // Debug clock: #/today?clock=3 moves "today" 3 days on; clock=0 puts it back.
    var clock = /[?&]clock=(-?\d+)/.exec(location.hash || '');
    if (clock) { PM.clock.set(+clock[1]); location.replace('#/' + (parse() || 'today')); return; }
    var name = parse();
    var redirect = guard(name);
    if (redirect) { location.replace('#/' + redirect); return; }
    var token = ++rendering;
    var s = PM.store.get();
    var script = s.script || PM.config.defaultScript;
    var view = routes[name];

    function paint() {
      if (token !== rendering) return; // a newer navigation took over
      var node = view(name);
      // In WeChat / Rednote: one closable line on the main pages (not inside a session or test).
      var bar = BANNER[name] && PM.tabsUI && PM.tabsUI.banner();
      if (bar) node.insertBefore(bar, node.firstChild);
      PM.dom.mount(rootEl, node);
      window.scrollTo(0, 0);
      var h1 = node.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({preventScroll: true}); }
      document.title = PM.content.ui('app.name');
      document.documentElement.lang = script;
    }

    PM.content.load(script).then(paint, function () {
      if (token !== rendering) return;
      PM.dom.mount(rootEl, PM.views.loadError(render));
    });
  }

  PM.router = {
    define: function (name, fn) { routes[name] = fn; },
    has: function (name) { return !!routes[name]; },
    start: function (el) {
      rootEl = el;
      window.addEventListener('hashchange', render);
      render();
    },
    go: function (name) { if (parse() === name) render(); else location.hash = '#/' + name; },
    refresh: render
  };
})(window.PM = window.PM || {});
