/* Values gate and mock test: drawing, scoring and state. Pure logic, no DOM (BUILD_PLAN: Values
   gate, Mock test). Answers are recorded through PM.plan.recordChoice, so they feed mastery,
   the stage checks and the review list like any other answer.

   store.gate  {inARow, cleared, clearedAt, lastCheck, reopened, used[], run, history[]}
               run = {date, mode: 'gate' | 'recheck', ids[], answers[], i}
   store.mock  the mock in progress {date, started, deadline (ms), ids[], answers[], i} or null
   store.mocks finished mocks, newest last: {d, right, total, values, valuesTotal, pass, english,
               secs, timeUp}. plan.readiness() reads the last two. */
(function (PM) {
  'use strict';
  var D = PM.dates;
  function S() { return PM.store.get(); }
  function G() { return PM.config.values; }
  function M() { return PM.config.mock; }
  var HISTORY = 20;

  // Swappable for the scripted checks.
  var api = {rand: Math.random, now: function () { return Date.now(); }};

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(api.rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- drawing ----------------------------------------------------------------------------------
  // Order a pool: questions to avoid last, then never seen, then seen longest ago (random ties).
  function ranked(ids, avoid) {
    var items = S().items, skip = {};
    (avoid || []).forEach(function (id) { skip[id] = 1; });
    var order = {};
    shuffle(ids.slice()).forEach(function (id, k) { order[id] = k; });
    return ids.slice().sort(function (a, b) {
      var sa = skip[a] ? 1 : 0, sb = skip[b] ? 1 : 0;
      if (sa !== sb) return sa - sb;
      var la = (items[a] && items[a].last) || '', lb = (items[b] && items[b].last) || '';
      return la < lb ? -1 : la > lb ? 1 : order[a] - order[b];
    });
  }

  // A Rednote card question and the earlier question it repeats never sit in one test.
  function clashes(id, taken) {
    var twin = PM.plan.index().dup[id];
    return !!(twin && taken.indexOf(twin) !== -1);
  }

  // n Part 4 questions, each from a different booklet heading.
  function valuesPick(n, avoid, taken) {
    taken = taken || [];
    var groups = {};
    PM.content.list('questions').forEach(function (q) {
      if (q.part === 4) (groups[q.heading || '-'] = groups[q.heading || '-'] || []).push(q.id);
    });
    // The best question under each heading, then the headings ordered by that question's rank.
    var best = Object.keys(groups).map(function (hd) {
      var pool = ranked(groups[hd], avoid).filter(function (id) { return taken.indexOf(id) === -1; });
      return pool[0];
    }).filter(Boolean);
    var out = [];
    ranked(best, avoid).forEach(function (id) {
      if (out.length < n && !clashes(id, taken.concat(out))) out.push(id);
    });
    return out;
  }

  // Parts 1-3 in the bank's proportions (largest remainder), plus the values questions.
  function mockShape() {
    var n = {1: 0, 2: 0, 3: 0}, want = M().questions - M().valuesQuestions, total = 0;
    PM.content.list('questions').forEach(function (q) { if (q.part in n) { n[q.part]++; total++; } });
    var shape = {}, given = 0, rest = [];
    [1, 2, 3].forEach(function (p) {
      var exact = n[p] / total * want;
      shape[p] = Math.floor(exact); given += shape[p];
      rest.push({p: p, r: exact - shape[p]});
    });
    rest.sort(function (a, b) { return b.r - a.r || a.p - b.p; });
    for (var k = 0; given < want; k++, given++) shape[rest[k].p]++;
    shape[4] = M().valuesQuestions;
    return shape;
  }

  function partPick(part, n, taken) {
    var pool = PM.content.list('questions').filter(function (q) { return q.part === part; }).map(function (q) { return q.id; });
    var out = [];
    ranked(pool).forEach(function (id) {
      if (out.length < n && taken.indexOf(id) === -1 && !clashes(id, taken.concat(out))) out.push(id);
    });
    return out;
  }

  // ---- scoring (the real test's rules) ------------------------------------------------------------
  // Pass = at least passMark right AND every values question right. Unanswered = wrong.
  function score(ids, answers) {
    var right = 0, values = 0, valuesTotal = 0, total = 0, misses = [];
    ids.forEach(function (id, i) {
      var q = PM.content.question(id);
      if (!q) return;                       // removed from the bank since: not counted
      total++;
      var ok = answers[i] != null && answers[i] === q.answer;
      if (ok) right++;
      if (q.part === 4) { valuesTotal++; if (ok) values++; }
      if (!ok) misses.push(i);
    });
    return {right: right, total: total, values: values, valuesTotal: valuesTotal, misses: misses,
      pass: right >= M().passMark && values === valuesTotal};
  }

  function record(ids, answers, d) {
    ids.forEach(function (id, i) {
      var q = PM.content.question(id);
      if (q) PM.plan.recordChoice('q', q, answers[i] != null && answers[i] === q.answer, 0, d, false);
    });
  }

  function trim(a) { if (a.length > HISTORY) a.splice(0, a.length - HISTORY); }

  // ---- open from stage 2, or in sprint week whatever the stage ------------------------------------
  function isOpen(d) { return (S().stage || 1) >= 2 || PM.plan.sprint(d || D.iso()); }

  // ---- values gate ------------------------------------------------------------------------------
  function gate() {
    var s = S(), g = s.gate || (s.gate = {});
    if (g.inARow == null) g.inARow = 0;
    if (!g.used) g.used = [];
    if (!g.history) g.history = [];
    return g;
  }

  function gateStatus(d) {
    d = d || D.iso();
    var g = gate(), next = g.cleared && g.lastCheck ? D.add(g.lastCheck, G().recheckDays) : null;
    return {open: isOpen(d), cleared: !!g.cleared, inARow: g.inARow, need: G().gateRun,
      recheckDue: !!(next && next <= d), nextCheck: next, run: g.run || null};
  }

  // Starts (or returns) the run in progress. Once cleared, every run is the weekly re-check.
  function startGate(d) {
    var g = gate();
    if (!g.run) {
      var ids = valuesPick(G().gateQuestions, g.cleared ? [] : g.used);
      g.run = {date: d || D.iso(), mode: g.cleared ? 'recheck' : 'gate', ids: ids, answers: ids.map(function () { return null; }), i: 0};
      PM.store.save();
    }
    return g.run;
  }

  function finishGate(d) {
    var g = gate(), run = g.run;
    if (!run) return null;
    d = d || D.iso();
    var res = score(run.ids, run.answers), all = res.right === res.total && res.total > 0;
    record(run.ids, run.answers, d);
    var out = {kind: 'gate', mode: run.mode, ids: run.ids, answers: run.answers, right: res.right, total: res.total,
      misses: res.misses, ok: all};
    if (run.mode === 'gate') {
      if (all) {
        g.inARow++;
        g.used = g.used.concat(run.ids);
        if (g.inARow >= G().gateRun) { g.cleared = true; g.clearedAt = d; g.lastCheck = d; g.used = []; out.justCleared = true; }
      } else { g.inARow = 0; g.used = []; }
    } else if (all) {
      g.lastCheck = d;
    } else {
      g.cleared = false; g.inARow = 0; g.used = []; g.reopened = d; out.reopened = true;
    }
    out.inARow = g.inARow; out.cleared = !!g.cleared;
    out.nextCheck = g.cleared ? D.add(g.lastCheck, G().recheckDays) : null;
    g.history.push({d: d, mode: run.mode, right: res.right, total: res.total});
    trim(g.history);
    g.run = null;
    PM.store.save();
    return out;
  }

  // ---- mock test --------------------------------------------------------------------------------
  function mocks() { var s = S(); return s.mocks || (s.mocks = []); }

  function startMock(d) {
    var s = S();
    if (!s.mock) {
      var shape = mockShape(), ids = [];
      [1, 2, 3].forEach(function (p) { ids = ids.concat(partPick(p, shape[p], ids)); });
      ids = ids.concat(valuesPick(shape[4], [], ids));
      shuffle(ids);
      var now = api.now();
      s.mock = {date: d || D.iso(), started: now, deadline: now + M().minutes * 60000, ids: ids,
        answers: ids.map(function () { return null; }), i: 0};
      PM.store.save();
    }
    return s.mock;
  }

  function mockLeft() { var m = S().mock; return m ? Math.max(0, m.deadline - api.now()) : 0; }

  // Hand in (or time's up). Every answer is recorded once; misses join the review list.
  function finishMock(d) {
    var s = S(), m = s.mock;
    if (!m) return null;
    d = d || D.iso();
    var now = api.now(), res = score(m.ids, m.answers);
    record(m.ids, m.answers, d);
    var entry = {d: d, right: res.right, total: res.total, values: res.values, valuesTotal: res.valuesTotal,
      pass: res.pass, english: true, secs: Math.round((Math.min(now, m.deadline) - m.started) / 1000), timeUp: now >= m.deadline};
    var list = mocks();
    list.push(entry); trim(list);
    s.mock = null;
    PM.store.save();
    return {kind: 'mock', entry: entry, ids: m.ids, answers: m.answers, misses: res.misses};
  }

  // Leaving with "不计分": nothing is recorded.
  function dropMock() { S().mock = null; PM.store.save(); }

  // Passed English-only mocks at the end of the list, for "two in a row".
  function passesInARow() {
    var list = mocks(), n = 0;
    for (var i = list.length - 1; i >= 0 && list[i].pass && list[i].english; i--) n++;
    return n;
  }

  // Sprint week: Today suggests a mock every other day.
  function mockSuggested(d) {
    d = d || D.iso();
    if (!PM.plan.sprint(d)) return false;
    var last = mocks()[mocks().length - 1];
    return !last || D.daysBetween(last.d, d) >= 2;
  }

  PM.exam = {
    api: api, isOpen: isOpen, score: score, mockShape: mockShape, valuesPick: valuesPick,
    gateStatus: gateStatus, startGate: startGate, finishGate: finishGate,
    startMock: startMock, mockLeft: mockLeft, finishMock: finishMock, dropMock: dropMock,
    mocks: mocks, passesInARow: passesInARow, mockSuggested: mockSuggested
  };
})(window.PM = window.PM || {});
