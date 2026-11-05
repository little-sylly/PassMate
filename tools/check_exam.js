#!/usr/bin/env node
/* Values gate and mock test check: do they draw and score exactly like the real test rules?

     node tools/check_exam.js

   Loads the real js/config, store, content, plan and exam scripts in a VM (no browser) with
   data/content.zh-Hans.json and checks:
     - mock shape: 20 questions, Parts 1-3 in the bank's proportions + 5 values questions from
       5 different headings, no repeats, no Rednote twin pairs (over many draws)
     - mock pass rule for every possible result: pass <=> at least 15 of 20 AND all 5 values right;
       unanswered counts as wrong; time up hands in what is answered
     - mock history feeds readiness(): two English-only passes in a row, a fail breaks the run
     - gate: 5 Part 4 questions from 5 headings; 5/5 three runs in a row clears it; one miss
       restarts the count; no question repeats inside a run of three; weekly re-check due after
       7 days; failing it reopens the gate
     - answers go through plan.recordChoice once (misses join the review list)
     - open from stage 2, or in sprint week whatever the stage
   Exits 1 on any failure. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');

var storage = {};
var sandbox = {
  console: console, Math: Math, Date: Date, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
  location: {hash: '#/today'},
  localStorage: {
    getItem: function (k) { return k in storage ? storage[k] : null; },
    setItem: function (k, v) { storage[k] = String(v); },
    removeItem: function (k) { delete storage[k]; }
  },
  fetch: function (url) {
    var body = fs.readFileSync(path.join(ROOT, url), 'utf8');
    return Promise.resolve({ok: true, json: function () { return Promise.resolve(JSON.parse(body)); }});
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
['config', 'store', 'content', 'plan', 'exam'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sandbox, {filename: f + '.js'});
});
var PM = sandbox.PM;

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }
function section(t) { console.log('\n' + t); }

// seeded random so a failure can be replayed
var seed = 12345;
PM.exam.api.rand = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
var clockMs = Date.UTC(2026, 10, 9, 0, 0, 0);
PM.exam.api.now = function () { return clockMs; };

function fresh(stage) {
  PM.store.reset();
  PM.store.set({welcomed: true, dateAnswered: true, script: 'zh-Hans', stage: stage || 2});
}
function Q(id) { return PM.content.question(id); }
function wrong(q) { return q.answer === 'a' ? 'b' : 'a'; }

PM.content.load('zh-Hans').then(function () {
  var C = PM.config, qs = PM.content.list('questions');
  var D0 = '2026-11-09';

  // ---- mock shape ------------------------------------------------------------------------------
  section('Mock: shape over 300 draws');
  var bank = {1: 0, 2: 0, 3: 0};
  qs.forEach(function (q) { if (q.part in bank) bank[q.part]++; });
  var shape = PM.exam.mockShape();
  console.log('  bank parts 1-3: ' + JSON.stringify(bank) + ' -> mock shape ' + JSON.stringify(shape));
  ok(shape[1] + shape[2] + shape[3] === 15 && shape[4] === 5, 'shape is 15 + 5');
  var tot = bank[1] + bank[2] + bank[3];
  [1, 2, 3].forEach(function (p) { ok(Math.abs(shape[p] - bank[p] / tot * 15) < 1, 'part ' + p + ' within 1 of its bank share'); });
  var dupPairs = 0;
  for (var t = 0; t < 300; t++) {
    fresh(2);
    var m = PM.exam.startMock(D0);
    var parts = {1: 0, 2: 0, 3: 0, 4: 0}, heads = {}, seen = {};
    m.ids.forEach(function (id) {
      var q = Q(id); parts[q.part]++; seen[id] = 1;
      if (q.part === 4) heads[q.heading] = 1;
      if (q.dup && m.ids.indexOf(q.dup) !== -1) dupPairs++;
    });
    if (t < 3 || m.ids.length !== 20 || Object.keys(seen).length !== 20 || Object.keys(heads).length !== 5 ||
        parts[1] !== shape[1] || parts[2] !== shape[2] || parts[3] !== shape[3] || parts[4] !== 5) {
      ok(m.ids.length === 20, 'draw ' + t + ': 20 questions (got ' + m.ids.length + ')');
      ok(Object.keys(seen).length === 20, 'draw ' + t + ': no repeats');
      ok(Object.keys(heads).length === 5, 'draw ' + t + ': 5 values headings');
      ok(parts[1] === shape[1] && parts[2] === shape[2] && parts[3] === shape[3] && parts[4] === 5, 'draw ' + t + ': parts ' + JSON.stringify(parts));
    }
    ok(m.deadline - m.started === 45 * 60000, 'timer is 45 minutes');
  }
  ok(dupPairs === 0, 'no Rednote twin pair in one mock (' + dupPairs + ')');

  // Fresh questions first: a second mock avoids the first one's questions when the pool allows.
  fresh(2);
  var first = PM.exam.startMock(D0);
  first.answers = first.ids.map(function (id) { return Q(id).answer; });
  PM.exam.finishMock(D0);
  var second = PM.exam.startMock('2026-11-10');
  var overlap = second.ids.filter(function (id) { return first.ids.indexOf(id) !== -1; }).length;
  ok(overlap === 0, 'second mock repeats ' + overlap + ' questions of the first');
  PM.exam.dropMock();

  // ---- mock scoring: every possible result ----------------------------------------------------
  section('Mock: pass rule for every (right of 15 non-values, right of 5 values, unanswered) combination');
  var combos = 0;
  for (var nv = 0; nv <= 15; nv++) {
    for (var v = 0; v <= 5; v++) {
      [false, true].forEach(function (blank) {
        fresh(2);
        var m = PM.exam.startMock(D0), a = 0, b = 0;
        m.ids.forEach(function (id, i) {
          var q = Q(id);
          if (q.part === 4) { m.answers[i] = b++ < v ? q.answer : (blank ? null : wrong(q)); }
          else { m.answers[i] = a++ < nv ? q.answer : (blank ? null : wrong(q)); }
        });
        var res = PM.exam.finishMock(D0), e = res.entry, want = nv + v >= 15 && v === 5;
        combos++;
        if (e.right !== nv + v || e.values !== v || e.pass !== want || res.misses.length !== 20 - nv - v) {
          ok(false, 'non-values ' + nv + ', values ' + v + (blank ? ' (blanks)' : '') + ': got ' + JSON.stringify(e));
        } else checks++;
      });
    }
  }
  console.log('  ' + combos + ' results scored');
  // The boundary cases named in the rules, spelled out
  var cases = [[15, 5, true], [14, 5, false], [19, 4, false], [20, 5, true], [16, 5, true], [15, 4, false]];
  cases.forEach(function (c) {
    fresh(2);
    var m = PM.exam.startMock(D0), right = c[0], v = c[1], nv = right - v, a = 0, b = 0;
    m.ids.forEach(function (id, i) {
      var q = Q(id);
      m.answers[i] = q.part === 4 ? (b++ < v ? q.answer : wrong(q)) : (a++ < nv ? q.answer : wrong(q));
    });
    var e = PM.exam.finishMock(D0).entry;
    ok(e.pass === c[2], right + '/20 with ' + v + '/5 values should ' + (c[2] ? 'pass' : 'fail'));
    console.log('  ' + right + '/20, values ' + v + '/5 -> ' + (e.pass ? 'pass' : 'fail'));
  });

  // ---- time up -------------------------------------------------------------------------------
  section('Mock: time up');
  fresh(2);
  var tm = PM.exam.startMock(D0);
  tm.ids.forEach(function (id, i) { if (i < 16) tm.answers[i] = Q(id).answer; });
  clockMs -= 3 * 3600 * 1000;            // phone clock set back: never more than the full 45 minutes
  ok(PM.exam.mockLeft() === 45 * 60000, 'clock set back: left stays at 45 minutes (' + PM.exam.mockLeft() + ')');
  clockMs += 3 * 3600 * 1000;
  clockMs += 44 * 60000;
  ok(PM.exam.mockLeft() === 60000, '1 minute left after 44 (' + PM.exam.mockLeft() + ')');
  clockMs += 5 * 60000;
  ok(PM.exam.mockLeft() === 0, 'nothing left after 49 minutes');
  var tr = PM.exam.finishMock(D0);
  ok(tr.entry.timeUp && tr.entry.secs === 45 * 60, 'time-up mock is marked and capped at 45 min: ' + JSON.stringify(tr.entry));
  ok(tr.entry.right === 16 - (tm.ids.slice(0, 16).length - 16), 'answered questions still count');
  ok(PM.store.get().mock === null, 'mock cleared after hand-in');
  ok(PM.exam.finishMock(D0) === null, 'a second hand-in does nothing');

  // ---- recording -----------------------------------------------------------------------------
  section('Mock: answers recorded once, misses on the review list');
  fresh(2);
  var rm = PM.exam.startMock(D0);
  rm.answers = rm.ids.map(function (id, i) { return i < 3 ? wrong(Q(id)) : Q(id).answer; });
  var logBefore = (PM.store.get().log || []).length;
  PM.exam.finishMock(D0);
  var s = PM.store.get();
  ok(s.log.length - logBefore === 20, '20 answers logged (' + (s.log.length - logBefore) + ')');
  ok(rm.ids.slice(0, 3).every(function (id) { return s.items[id].repeat && s.items[id].repeat.due === '2026-11-10'; }), 'the 3 misses come back tomorrow');
  ok(rm.ids.slice(3).every(function (id) { return s.items[id].n === 1 && s.items[id].right === 1 && !s.items[id].repeat; }), 'right answers recorded once, no repeat');
  ok(s.log.slice(-20).every(function (e) { return e.h === 0 && e.k === 'q'; }), 'logged with no help');
  ok(PM.plan.repeats().length === 3, 'review list has the 3 misses');

  // ---- readiness: two English-only passes in a row ------------------------------------------------
  section('Mock: readiness (two passes in a row)');
  function mockWith(pass) {
    var m = PM.exam.startMock(D0);
    m.answers = m.ids.map(function (id, i) { return pass || i > 0 || Q(id).part !== 4 ? Q(id).answer : wrong(Q(id)); });
    if (!pass) { var k = m.ids.map(Q).findIndex(function (q) { return q.part === 4; }); m.answers[k] = wrong(Q(m.ids[k])); }
    return PM.exam.finishMock(D0).entry.pass;
  }
  function mocksOk() { return PM.plan.readiness(D0).list.filter(function (c) { return c.key === 'mocks'; })[0].ok; }
  fresh(2);
  ok(mockWith(true) === true && !mocksOk(), 'one pass is not enough');
  ok(mockWith(false) === false && !mocksOk(), 'a pass then a fail (one values miss) is not enough');
  ok(mockWith(true) && !mocksOk() && PM.exam.passesInARow() === 1, 'fail then pass: 1 in a row');
  ok(mockWith(true) && mocksOk() && PM.exam.passesInARow() === 2, 'two passes in a row tick the checklist');
  ok(PM.store.get().mocks.every(function (m) { return m.english === true; }), 'every mock is English-only');

  // ---- gate ----------------------------------------------------------------------------------
  section('Gate: draw, three runs in a row, weekly re-check');
  for (var g = 0; g < 200; g++) {
    fresh(2);
    var run = PM.exam.startGate(D0), hs = {};
    run.ids.forEach(function (id) { hs[Q(id).heading] = 1; });
    if (run.ids.length !== 5 || Object.keys(hs).length !== 5 || !run.ids.every(function (id) { return Q(id).part === 4; })) {
      ok(false, 'gate draw ' + g + ': ' + JSON.stringify(run.ids));
    } else checks++;
  }
  function gateRun(d, missAt) {
    var r = PM.exam.startGate(d);
    r.answers = r.ids.map(function (id, i) { return i === missAt ? wrong(Q(id)) : Q(id).answer; });
    return PM.exam.finishGate(d);
  }
  function gateOk() { return PM.plan.readiness(D0).list.filter(function (c) { return c.key === 'gate'; })[0].ok; }

  fresh(2);
  var used = [];
  var r1 = gateRun(D0); used = used.concat(r1.ids);
  ok(r1.ok && r1.inARow === 1 && !r1.cleared, 'run 1: 5/5 -> 1 of 3');
  var r2 = gateRun(D0); used = used.concat(r2.ids);
  ok(r2.ok && r2.inARow === 2 && !r2.cleared, 'run 2: 5/5 -> 2 of 3');
  var r3m = gateRun(D0, 2);
  ok(!r3m.ok && r3m.inARow === 0 && r3m.right === 4 && r3m.misses.length === 1 && r3m.misses[0] === 2, 'a miss restarts the count');
  ok(!gateOk(), 'not cleared after a miss');
  var a1 = gateRun(D0), a2 = gateRun(D0), a3 = gateRun(D0);
  var streakIds = a1.ids.concat(a2.ids, a3.ids), uniq = {};
  streakIds.forEach(function (id) { uniq[id] = 1; });
  ok(Object.keys(uniq).length === 15, 'no question repeats inside one run of three (' + Object.keys(uniq).length + ' of 15 distinct)');
  ok(a3.justCleared && a3.cleared && gateOk(), 'three 5/5 runs in a row clear the gate');
  var st = PM.exam.gateStatus(D0);
  ok(st.cleared && !st.recheckDue && st.nextCheck === '2026-11-16', 'next re-check in 7 days: ' + st.nextCheck);
  ok(!PM.exam.gateStatus('2026-11-15').recheckDue && PM.exam.gateStatus('2026-11-16').recheckDue, 're-check due on day 7, not day 6');
  var rc = gateRun('2026-11-16');
  ok(rc.mode === 'recheck' && rc.ok && rc.cleared && PM.exam.gateStatus('2026-11-16').nextCheck === '2026-11-23', 'passed re-check moves the next one a week on');
  var rf = gateRun('2026-11-23', 0);
  ok(rf.mode === 'recheck' && rf.reopened && !rf.cleared && rf.inARow === 0, 'failed re-check reopens the gate');
  ok(!gateOk(), 'readiness drops the gate after a failed re-check');
  var back = gateRun('2026-11-24');
  ok(back.mode === 'gate' && back.inARow === 1, 'after reopening, runs count from 0 again');

  // gate answers go through recordChoice once
  fresh(2);
  var gr = PM.exam.startGate(D0);
  gr.answers = gr.ids.map(function (id, i) { return i === 0 ? null : Q(id).answer; });
  var gres = PM.exam.finishGate(D0), gs = PM.store.get();
  ok(!gres.ok && gres.misses[0] === 0, 'an unanswered gate question is a miss');
  ok(gs.log.length === 5 && gs.log.every(function (e) { return e.p === 4; }), 'gate logs 5 Part 4 answers');
  ok(gs.items[gr.ids[0]].repeat && !gs.items[gr.ids[1]].repeat, 'the gate miss joins the review list');
  ok(PM.exam.finishGate(D0) === null, 'a second hand-in does nothing');

  // ---- open rules ------------------------------------------------------------------------------
  section('Open rules');
  fresh(1);
  ok(!PM.exam.isOpen(D0), 'stage 1: closed');
  PM.store.set({testDate: '2026-11-14'});
  ok(PM.exam.isOpen(D0), 'stage 1 in sprint week: open');
  ok(PM.exam.mockSuggested(D0), 'sprint: mock suggested with none done');
  var sm = PM.exam.startMock(D0); sm.answers = sm.ids.map(function (id) { return Q(id).answer; }); PM.exam.finishMock(D0);
  ok(!PM.exam.mockSuggested(D0) && !PM.exam.mockSuggested('2026-11-10') && PM.exam.mockSuggested('2026-11-11'), 'sprint: suggested every other day');
  fresh(2);
  ok(PM.exam.isOpen(D0), 'stage 2: open');

  console.log('\n' + checks + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(1); });
