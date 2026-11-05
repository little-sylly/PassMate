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
      streak: {count: 0, days: {}, saved: {}},   // days/saved: {'YYYY-MM-DD': 1}; saved is recomputed
      items: {},             // by content id; see PM.plan for the fields
      log: [],               // recent answers {d, k, id, ok, h, p}, newest last (stage checks)
      wording: {},           // wording term id -> wording-trap misses since its last drill
      offer: null,           // {stage, declined: 'YYYY-MM-DD'} when a step up was put off
      run: null,             // today's session: the draw plus where she is in it
      gate: {inARow: 0, cleared: false, clearedAt: null, lastCheck: null, reopened: null, used: [], run: null, history: []},
      mock: null,            // the mock test in progress (see PM.exam)
      mocks: []              // finished mocks {d, right, total, values, valuesTotal, pass, english, secs, timeUp}
    };
  }

  // Migrations: each takes a record at version n and returns version n+1.
  var migrations = {
    // v1 (M1-M2, fixed sample) -> v2 (plan engine). Item records keep their fields and gain
    // the plan's: met, box, due, rightDays, troubleDays. The M2 sample run is not kept.
    1: function (rec) {
      var items = rec.items || {};
      for (var id in items) {
        var r = items[id];
        if (!r || !r.last) continue;
        if (/^A\d/.test(id)) {
          r.met = r.last; r.box = 1; r.due = r.last;
          r.rightDays = r.lastRight ? [r.last] : [];
          r.troubleDays = r.lastRight === false || r.know === false ? [r.last] : [];
          if (r.troubleDays.length) r.lastTrouble = r.last;
        } else if (r.lastRight === false) {
          r.repeat = {step: 0, due: r.last};
        }
      }
      rec.v = 2;
      return rec;
    }
  };

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

  // Debug clock: shifts "today" by whole days so 30 days can be tried in one sitting.
  // Set with #/today?clock=3 (or clock=0 to clear); Today shows a pill while it is on.
  var CLOCK_KEY = 'passmate.debug.clock';
  PM.clock = {
    offset: 0,
    now: function () { return new Date(Date.now() + this.offset * 86400000); },
    set: function (days) {
      this.offset = days | 0;
      try {
        if (this.offset) window.localStorage.setItem(CLOCK_KEY, String(this.offset));
        else window.localStorage.removeItem(CLOCK_KEY);
      } catch (e) { /* memory only */ }
    }
  };
  try { PM.clock.offset = parseInt(window.localStorage.getItem(CLOCK_KEY), 10) || 0; } catch (e) { /* none */ }

  // Local calendar dates (the learner's day, not UTC)
  PM.dates = {
    iso: function (d) {
      d = d || PM.clock.now();
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
    // 'YYYY-MM-DD' plus n days
    add: function (iso, n) {
      var d = this.parse(iso);
      return this.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
    },
    // Monday-first week containing `d`: array of 7 Date objects
    week: function (d) {
      d = d || PM.clock.now();
      var dow = (d.getDay() + 6) % 7, out = [];
      for (var i = 0; i < 7; i++) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + i));
      return out;
    }
  };
})(window.PM = window.PM || {});
