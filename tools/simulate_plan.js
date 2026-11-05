#!/usr/bin/env node
/* Plan engine check: 30 simulated days of answers on a debug clock.

     node tools/simulate_plan.js [--days 30] [--seed 7] [--quiet]

   Loads the real js/config, store, content, plan and session scripts in a VM (no browser),
   with data/content.zh-Hans.json, and plays a learner who gets better with practice, taps
   words for help, misses some days and adds a test date near the end (sprint week).
   Prints one line per day and fails (exit 1) when a session breaks a plan rule. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2);
function arg(name, def) { var i = args.indexOf('--' + name); return i === -1 ? def : args[i + 1]; }
var DAYS = +arg('days', 30), SEED = +arg('seed', 7), QUIET = args.indexOf('--quiet') !== -1;
// typical: about 75% right at first with the Chinese gist; weak: about 60%, to stress the repair paths.
var LEARNER = arg('learner', 'typical');
var BASE = {typical: 0.9, weak: 0.8}[LEARNER], SPREAD = {typical: 0.3, weak: 0.35}[LEARNER];
if (BASE == null) { console.error('learner must be typical or weak'); process.exit(2); }
var START = new Date(2026, 10, 9);          // a Monday
var MISSED = {6: 1, 13: 1, 14: 1, 22: 1};   // day 6 is forgiven; 13+14 end the streak; 22 forgiven again
var DATE_SET_ON = 22, TEST_IN = 9;          // on day 22 she adds a test date 9 days out -> sprint from day 24

// ---- a tiny browser ------------------------------------------------------------------------
var storage = {};
var sandbox = {
  console: console, Math: Math, Date: Date, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
  location: {hash: '#/session'},
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
['config', 'store', 'content', 'plan', 'session'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sandbox, {filename: f + '.js'});
});
var PM = sandbox.PM;

// ---- seeded learner ------------------------------------------------------------------------
var h = SEED >>> 0;
function rand() { h = (h + 0x6D2B79F5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
// Each word has a hidden difficulty; practice (right days, times seen) raises her chance.
// Less Chinese makes questions a little harder until she gets used to it.
var hard = {};
function skill(termId) {
  if (!(termId in hard)) hard[termId] = rand() * SPREAD;
  var r = PM.store.get().items[termId] || {}, stage = PM.store.get().stage || 1;
  var practice = Math.min(0.3, (r.rightDays || []).length * 0.07 + (r.n || 0) * 0.02);
  return BASE - hard[termId] + practice - (stage - 1) * 0.04;
}
var drilled = {};
function pRight(item, kind) {
  var p = skill(item.term_id);
  if (kind === 'q') {
    p -= ((item.difficulty || 2) - 1) * 0.05;
    (item.wording_focus || []).forEach(function (w) { if (!drilled[w]) p -= 0.08; });
  }
  return Math.max(0.2, Math.min(0.97, p));
}

// ---- checks ----------------------------------------------------------------------------------
var failures = [];
function fail(day, msg) { failures.push('day ' + day + ': ' + msg); }

function checkDraw(day, d, items, sprint) {
  var c = {word: 0, q: 0, scenario: 0}, ids = {}, stuck = 0, drills = 0, cfg = PM.config, items0 = PM.store.get().items;
  items.forEach(function (it) {
    c[it.kind === 'drill' ? 'q' : it.kind]++;
    if (ids[it.id]) fail(day, 'duplicate ' + it.id);
    ids[it.id] = 1;
    if (it.why === 'stuck' && it.kind === 'word') stuck++;
    if (it.kind === 'drill') drills++;
    if (it.why === 'repeat') {
      var r = items0[it.id];
      if (!r || !r.repeat || r.repeat.due > d) fail(day, 'repeat ' + it.id + ' drawn before it is due');
    }
    if (it.kind === 'q') {
      var q = PM.content.question(it.id);
      if (q.dup && items0[q.dup] && items0[q.dup].n) fail(day, it.id + ' drawn although its twin ' + q.dup + ' was seen');
      if (PM.store.get().stage === 1 && it.why === 'new' && q.difficulty > 2) fail(day, 'stage 1 drew difficulty 3 as new: ' + it.id);
    }
  });
  if (items.length > 11) fail(day, 'session has ' + items.length + ' items');
  if (c.word > 5 || c.q > 5 || c.scenario > 1) fail(day, 'shape ' + JSON.stringify(c));
  if (!sprint && (c.word !== 5 || c.q !== 5 || c.scenario !== 1)) fail(day, 'not a full 5/5/1 session: ' + JSON.stringify(c));
  if (sprint && items.some(function (it) { return it.why === 'new' && it.kind === 'word'; })) fail(day, 'new words in sprint week');
  if (stuck > cfg.plan.maxStuck) fail(day, stuck + ' stuck words');
  if (drills > cfg.plan.maxDrills) fail(day, drills + ' drills');
  // order: words, then questions, then the scenario
  var order = items.map(function (it) { return it.kind === 'word' ? 0 : it.kind === 'scenario' ? 2 : 1; });
  for (var i = 1; i < order.length; i++) if (order[i] < order[i - 1]) { fail(day, 'items out of order'); break; }
  return c;
}

// Overdue repeat mistakes: the "comes back 1 day later, then 3" promise, with slack for crowding.
// A weak learner misses more than the repair budget can bring back, so for her it is reported only.
var maxLate = 0;
function checkOverdue(day, d) {
  var items = PM.store.get().items;
  PM.plan.repeats().forEach(function (id) {
    var late = PM.dates.daysBetween(items[id].repeat.due, d);
    maxLate = Math.max(maxLate, late);
    if (late > 5 && LEARNER === 'typical') fail(day, 'repeat ' + id + ' is ' + late + ' days overdue');
  });
}

// ---- play ------------------------------------------------------------------------------------
function tally(list, key) {
  var o = {};
  list.forEach(function (x) { o[x[key]] = (o[x[key]] || 0) + 1; });
  return Object.keys(o).map(function (k) { return k + ':' + o[k]; }).join(' ');
}
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

PM.content.load('zh-Hans').then(function () {
  PM.store.set({welcomed: true, dateAnswered: true, script: 'zh-Hans'});
  var stageDays = {}, rows = [], streakSeen = {};

  for (var day = 0; day < DAYS; day++) {
    var now = new Date(START.getFullYear(), START.getMonth(), START.getDate() + day);
    PM.clock.now = function () { return new Date(now.getTime() + 9 * 3600000); };
    var d = PM.dates.iso();
    if (day === DATE_SET_ON) PM.store.set({testDate: PM.dates.add(d, TEST_IN)});
    var st = PM.plan.streak(d);
    streakSeen[day] = st.count;

    // Today: offered a step up? She accepts.
    var offer = PM.plan.offer(d);
    if (offer) { PM.plan.acceptStage(offer); stageDays[offer] = day; }

    if (MISSED[day]) { rows.push(pad(day, 3) + d + '  (missed)  streak ' + st.count); continue; }

    sandbox.location.hash = '#/session';
    var sprint = PM.plan.sprint(d);
    var run = PM.session.resume();
    var c = checkDraw(day, d, run.items, sprint);
    checkOverdue(day, d);
    var stage = PM.store.get().stage;

    var right = 0, asked = 0;
    while (run.i < run.items.length) {
      var it = run.items[run.i];
      if (it.kind === 'word') {
        var r0 = PM.store.get().items[it.id];
        var knew = rand() < (r0 && (r0.rightDays || []).length ? 0.85 : 0.45);
        if (stage > 1 && rand() < 0.5) PM.session.tap(it.id, true);
        PM.session.answerWord(it.id, knew);
      } else {
        var item = PM.plan.itemOf(it.id);
        var kind = it.kind;
        // taps on underlined words (help), more at stage 2, rarer at 3
        // She taps underlined words she is unsure of (stage 1 has the gist, so fewer taps).
        var anchors = [].concat((item.a && item.a.q) || [], [].concat.apply([], (item.a && item.a.o) || []));
        var tapScale = stage === 1 ? 0.25 : stage === 2 ? 0.5 : 0.2, tapped = {};
        anchors.forEach(function (sp) {
          if (!tapped[sp[2]] && rand() < (1 - skill(sp[2])) * tapScale) { tapped[sp[2]] = 1; PM.session.tap(sp[2]); }
        });
        if (stage === 2 && kind === 'q' && rand() < 0.15) PM.session.hint();
        var ok = rand() < pRight(item, kind === 'drill' ? 'drill' : kind);
        var picked = ok ? item.answer : (item.answer === 'a' ? 'b' : 'a');
        PM.session.answerChoice(kind, item, picked);
        if (kind === 'drill') drilled[item.term_id] = 1;
        if (kind !== 'scenario') { asked++; if (ok) right++; }
      }
      PM.session.advance();
    }
    PM.session.finish();

    // Some days she takes the optional 再练 5 道错题.
    var extraN = 0;
    if (day % 3 === 2 && PM.plan.repeats().length) {
      sandbox.location.hash = '#/session?extra=1';
      PM.session.startExtra();
      var ex = PM.session.current();
      ex.items.forEach(function (x) {
        var item = PM.plan.itemOf(x.id);
        PM.session.answerChoice(x.kind, item, rand() < pRight(item, x.kind) ? item.answer : (item.answer === 'a' ? 'b' : 'a'));
        PM.session.advance(); extraN++;
      });
      PM.session.finish();
      sandbox.location.hash = '#/session';
      if (PM.store.get().run.date !== d || PM.store.get().run.extra) fail(day, 'extra practice replaced the daily run');
    }

    var s = PM.store.get();
    rows.push(pad(day, 3) + d + '  st' + stage + (sprint ? ' SPRINT' : '       ') +
      '  streak ' + pad(s.streak.count, 3) +
      ' words[' + pad(tally(run.items.filter(function (x) { return x.kind === 'word'; }), 'why'), 30) + ']' +
      ' qs[' + pad(tally(run.items.filter(function (x) { return x.kind !== 'word' && x.kind !== 'scenario'; }), 'why'), 34) + ']' +
      ' sc:' + pad(run.items.filter(function (x) { return x.kind === 'scenario'; }).map(function (x) { return x.why; })[0] || '-', 7) +
      ' right ' + right + '/' + asked +
      '  met ' + pad(PM.plan.metCount(), 4) + 'mastered ' + pad(PM.plan.masteredCount(d), 4) +
      'stuck ' + pad(PM.plan.stuckIds().length, 3) + 'review ' + pad(PM.plan.repeats().length, 3) +
      (extraN ? '+extra ' + extraN : ''));
  }

  // Streak rules: day 6 is forgiven (streak carries on), days 13+14 end it, day 22 forgiven.
  if (streakSeen[7] < 6) fail(7, 'streak should survive the single missed day 6 (got ' + streakSeen[7] + ')');
  if (streakSeen[15] !== 0) fail(15, 'streak should be 0 after two missed days in a week (got ' + streakSeen[15] + ')');
  if (streakSeen[23] < 7) fail(23, 'streak should survive the single missed day 22 (got ' + streakSeen[23] + ')');

  var s = PM.store.get(), raw = storage[PM.config.storeKey] || '';
  if (!QUIET) rows.forEach(function (r) { console.log(r); });
  console.log('');
  console.log('stage 2 offered on day ' + (stageDays[2] == null ? '-' : stageDays[2]) + ', stage 3 on day ' + (stageDays[3] == null ? '-' : stageDays[3]));
  console.log('words met ' + PM.plan.metCount() + ' / ' + PM.config.totalWords + ', mastered ' + PM.plan.masteredCount() +
    ', stuck ' + PM.plan.stuckIds().join(' ') + ', review list ' + PM.plan.repeats().length);
  console.log('ready to sit: ' + PM.plan.readiness().list.map(function (c) { return c.key + (c.ok ? ' ✓' : ' ✗'); }).join('  '));
  console.log('learner ' + LEARNER + ', most overdue repeat mistake: ' + maxLate + ' days');
  console.log('store record ' + Math.round(raw.length / 1024) + ' KB');
  if (raw.length > 200 * 1024) fail(DAYS, 'store record is ' + Math.round(raw.length / 1024) + ' KB');
  if (failures.length) {
    console.log('\nFAILED (' + failures.length + '):');
    failures.slice(0, 40).forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('\nAll plan checks passed.');
}).catch(function (e) { console.error(e); process.exit(1); });
