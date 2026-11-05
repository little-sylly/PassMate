/* One versioned JSON record in localStorage. No account, no cookies.
   Falls back to memory when storage is blocked (private mode, some in-app browsers). */
(function (PM) {
  'use strict';
  var KEY = PM.config.storeKey;
  var memory = null;
  var state = null;

  function fresh() {
    return {
      v: PM.config.storeVersion,
      created: new Date().toISOString(),
      script: null,          // 'zh-Hans' | 'zh-Hant' | null until chosen
      welcomed: false,
      dateAnswered: false,
      testDate: null,        // 'YYYY-MM-DD' or null (optional)
      stage: 1,
      largeText: false,
      streak: {count: 0, days: {}, saved: {}},   // days/saved: {'YYYY-MM-DD': 1}
      items: {}              // per-item box, last result, dates (M3)
    };
  }

  // Migrations: each takes a record at version n and returns version n+1.
  var migrations = {};

  function migrate(rec) {
    if (!rec || typeof rec !== 'object' || typeof rec.v !== 'number') return fresh();
    while (rec.v < PM.config.storeVersion) {
      var step = migrations[rec.v];
      if (!step) return fresh();
      rec = step(rec);
    }
    if (rec.v > PM.config.storeVersion) return rec; // written by a newer build: keep, don't touch
    var base = fresh();
    for (var k in base) if (!(k in rec)) rec[k] = base[k];
    return rec;
  }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* blocked or corrupt */ }
    return memory ? migrate(JSON.parse(memory)) : fresh();
  }

  function write() {
    var raw = JSON.stringify(state);
    memory = raw;
    try { window.localStorage.setItem(KEY, raw); } catch (e) { /* keep memory copy */ }
  }

  PM.store = {
    get: function () { if (!state) state = read(); return state; },
    set: function (patch) {
      var s = this.get();
      for (var k in patch) s[k] = patch[k];
      write();
      return s;
    },
    save: function () { this.get(); write(); },
    reset: function () { state = fresh(); write(); }
  };

  // Local calendar dates (the learner's day, not UTC)
  PM.dates = {
    iso: function (d) {
      d = d || new Date();
      var m = d.getMonth() + 1, day = d.getDate();
      return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    },
    parse: function (s) {
      var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
      return p ? new Date(+p[1], +p[2] - 1, +p[3]) : null;
    },
    daysBetween: function (fromIso, toIso) {
      var a = this.parse(fromIso), b = this.parse(toIso);
      return Math.round((b - a) / 86400000);
    },
    // Monday-first week containing `d`: array of 7 Date objects
    week: function (d) {
      d = d || new Date();
      var dow = (d.getDay() + 6) % 7, out = [];
      for (var i = 0; i < 7; i++) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + i));
      return out;
    }
  };
})(window.PM = window.PM || {});
