/* Loads only the chosen script's data file; looks up interface strings and items. */
(function (PM) {
  'use strict';
  var cache = {};      // script -> data
  var current = null;  // active data
  var maps = null;

  function index(data) {
    var m = {terms: {}, questions: {}, scenarios: {}, drills: {}};
    data.terms.forEach(function (x) { m.terms[x.id] = x; });
    data.questions.forEach(function (x) { m.questions[x.id] = x; });
    data.scenarios.forEach(function (x) { m.scenarios[x.id] = x; });
    data.drills.forEach(function (x) { m.drills[x.id] = x; });
    return m;
  }

  // The first load happens before the service worker controls the page, so store
  // the chosen script's file for offline use ourselves (same cache the worker reads).
  function keepOffline(url) {
    if (!('caches' in window)) return;
    caches.open('passmate-data').then(function (c) {
      return c.match(url).then(function (hit) { return hit || c.add(url); });
    }).catch(function () { /* offline use is best effort */ });
  }

  PM.content = {
    load: function (script) {
      if (cache[script]) { current = cache[script].data; maps = cache[script].maps; return Promise.resolve(current); }
      return fetch(PM.config.dataFiles[script]).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        cache[script] = {data: data, maps: index(data)};
        current = data; maps = cache[script].maps;
        keepOffline(PM.config.dataFiles[script]);
        return data;
      });
    },
    ready: function () { return !!current; },
    // ui('today.title') or ui('today.countdown', {n: 5})
    ui: function (path, vars) {
      var node = current && current.ui, parts = path.split('.');
      for (var i = 0; node && i < parts.length; i++) node = node[parts[i]];
      if (typeof node !== 'string') return path;
      if (vars) node = node.replace(/\{(\w+)\}/g, function (_, k) { return k in vars ? vars[k] : ''; });
      return node;
    },
    term: function (id) { return maps && maps.terms[id]; },
    question: function (id) { return maps && maps.questions[id]; },
    scenario: function (id) { return maps && maps.scenarios[id]; },
    drill: function (id) { return maps && maps.drills[id]; },
    // The loaded item lists ('terms', 'questions', 'drills', 'scenarios'); ids match in both scripts.
    list: function (k) { return current ? current[k] : []; },
    // "pledge (of commitment)" -> "pledge"; "enrol / enrolment" -> "enrol"
    shortTerm: function (t) { return t.term.replace(/\s*\(.*?\)/g, '').split(' / ')[0]; },
    count: function (k) { return current ? current.meta.counts[k] : 0; },
    meta: function () { return current ? current.meta : null; }
  };
})(window.PM = window.PM || {});
