#!/usr/bin/env node
/* Plan engine check: 30 simulated days of answers on a debug clock.

     node tools/simulate_plan.js [--days 30] [--seed 7] [--learner typical|weak|strong] [--quiet]
       [--fast]               she takes 快速通关 (the optional daily round) whenever it is offered
       [--guess]              she marks some right answers 我是猜的 (back tomorrow, no credit for the word)
       [--no-date]            she never sets a test date (pace runs: --days 180 --no-date)
       [--trace A141]         one line a day for that word (drawn items, box, squares)
       [--set path=value]     try other numbers, e.g. --set session.questions=8 (repeatable)

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
var TRACE = arg('trace', null);                       // --trace A141: one line a day for that word
var NO_DATE = args.indexOf('--no-date') !== -1;       // pace runs: she never adds a test date
// typical: about 75% right at first with the Chinese gist; weak: about 60%, to stress the repair
// paths; strong: about 90%+, the confident learner 快速通关 is for.
var LEARNER = arg('learner', 'typical');
var BASE = {typical: 0.9, weak: 0.8, strong: 1.1}[LEARNER], SPREAD = {typical: 0.3, weak: 0.35, strong: 0.15}[LEARNER];
if (BASE == null) { console.error('learner must be typical, weak or strong'); process.exit(2); }
var FAST = args.indexOf('--fast') !== -1;             // she takes 快速通关 whenever it is offered
var GUESS = args.indexOf('--guess') !== -1;           // she marks some right answers 我是猜的
var guesses = 0;
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
// --set session.questions=8 --set mastered.rightOnDays=2 ... : try other numbers (pace study).
args.forEach(function (a, i) {
  if (a !== '--set') return;
  var kv = args[i + 1].split('='), keys = kv[0].split('.'), o = PM.config;
  keys.slice(0, -1).forEach(function (k) { o = o[k]; });
  o[keys[keys.length - 1]] = JSON.parse(kv[1]);
});
var SESS = PM.config.session;

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
  if (items.length > SESS.words + SESS.questions + SESS.scenarios) fail(day, 'session has ' + items.length + ' items');
  if (c.word > SESS.words || c.q > SESS.questions || c.scenario > SESS.scenarios) fail(day, 'shape ' + JSON.stringify(c));
  // Once every word is met, a card needs a question on its word today, so a day whose questions
  // share words can have a card or two fewer (never fewer than 3).
  var allMet = PM.plan.metCount() >= PM.config.totalWords;
  var cardsOk = allMet ? c.word >= SESS.words - 2 : c.word === SESS.words;
  if (!sprint && (!cardsOk || c.q !== SESS.questions || c.scenario !== SESS.scenarios)) fail(day, 'not a full session: ' + JSON.stringify(c));
  if (sprint && items.some(function (it) { return it.why === 'new' && it.kind === 'word'; })) fail(day, 'new words in sprint week');
  // A review card always comes with a question on that word (认识 alone never moves it on).
  items.forEach(function (it) {
    if (it.kind === 'word' && (it.why === 'review' || it.why === 'stuck') && !reviewedToday(it, items)) fail(day, it.why + ' card ' + it.id + ' has no question on it');
  });
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
    // With --guess she adds repeats of her own (我是猜的) on top of the repair budget, and only one
    // drill fits a session, so a waiting drill can slip one more day (seen: 6, with 2 missed days).
    if (late > (GUESS ? 6 : 5) && LEARNER === 'typical') fail(day, 'repeat ' + id + ' is ' + late + ' days overdue');
  });
}

// 快速通关's draw, checked before she answers: questions only, at most config.plan.fast.questions,
// one a word, nothing stuck, mastered, waiting as a repeat, a seen twin, or in today's run.
function checkFast(day, d, fitems, daily) {
  var items = PM.store.get().items, cfg = PM.config.plan.fast, ids = {}, words = {}, dailyIds = {}, dailyWords = {};
  daily.forEach(function (it) {
    dailyIds[it.id] = 1;
    dailyWords[it.kind === 'word' ? it.id : PM.plan.itemOf(it.id).term_id] = 1;
  });
  var stuck = {};
  PM.plan.stuckIds().forEach(function (id) { stuck[id] = 1; });
  if (!fitems.length || fitems.length > cfg.questions) fail(day, '快速通关 has ' + fitems.length + ' items');
  fitems.forEach(function (it) {
    var q = PM.content.question(it.id);
    if (it.kind !== 'q' || !q) { fail(day, '快速通关 drew a ' + it.kind + ' ' + it.id); return; }
    if (ids[it.id]) fail(day, '快速通关 duplicate ' + it.id);
    ids[it.id] = 1;
    if (words[q.term_id]) fail(day, '快速通关 two questions on ' + q.term_id);
    words[q.term_id] = 1;
    if (dailyIds[it.id] || dailyWords[q.term_id]) fail(day, '快速通关 ' + it.id + ' is from today\'s run');
    if (stuck[q.term_id] || (q.wording_focus || []).some(function (w) { return stuck[w]; })) fail(day, '快速通关 ' + it.id + ' is on a stuck word');
    if (PM.plan.isMastered(q.term_id, d)) fail(day, '快速通关 ' + it.id + ' is on mastered ' + q.term_id);
    if (items[it.id] && items[it.id].repeat) fail(day, '快速通关 ' + it.id + ' is waiting as a repeat');
    if (q.dup && items[q.dup] && items[q.dup].n) fail(day, '快速通关 ' + it.id + ' drawn although its twin was seen');
  });
}

// Does answering this drawn item count for word `id`? (the item's own word, or its wording focus)
function counts(it, id) {
  if (it.kind === 'word') return false;
  var item = PM.plan.itemOf(it.id);
  return item.term_id === id || (it.kind === 'q' && (item.wording_focus || []).indexOf(id) !== -1);
}

function cardOnly(id) {
  return !PM.content.list('questions').some(function (q) { return q.term_id === id || (q.wording_focus || []).indexOf(id) !== -1; }) &&
    !PM.content.list('drills').some(function (q) { return q.term_id === id; });
}
function reviewedToday(card, items) {
  return cardOnly(card.id) || items.some(function (it) { return counts(it, card.id); });
}

// Stuck spells: how long each stuck word stays stuck, and on how many of those days the session
// drew nothing that could unstick it (a question, drill or scenario on that word).
var spells = {}, longest = [], stuckDays = 0, stuckNoQ = 0;
function stuckReport(day, items, before) {
  before.forEach(function (id) {
    stuckDays++;
    if (!items.some(function (it) { return counts(it, id); })) stuckNoQ++;
  });
  var now = {};
  PM.plan.stuckIds().forEach(function (id) { now[id] = 1; if (spells[id] == null) spells[id] = day; });
  Object.keys(spells).forEach(function (id) {
    if (!now[id]) { longest.push({id: id, from: spells[id], days: day - spells[id], open: false}); delete spells[id]; }
  });
}
function openSpells(day) {
  return longest.concat(Object.keys(spells).map(function (id) { return {id: id, from: spells[id], days: day - spells[id], open: true}; }))
    .sort(function (a, b) { return b.days - a.days; });
}

// Pace: words mastered at the checkpoints (Sam's session-size / mastery-bar decision).
var PACE_AT = [30, 60, 90, 120, 150, 180], pace = {}, reached = null;
function paceRow(day, d) {
  var m = PM.plan.masteredCount(d);
  if (reached == null && m >= PM.config.readyToSit.wordsMastered) reached = day + 1;
  if (PACE_AT.indexOf(day + 1) !== -1) pace[day + 1] = {mastered: PM.plan.masteredCount(d), met: PM.plan.metCount(), stuck: PM.plan.stuckIds().length};
}

// ---- rule checks on a fresh store (after the run; they wipe it) --------------------------------
function ruleChecks() {
  var P = PM.plan, n = 0, D = PM.dates, d0 = '2027-03-01';
  function day(k) { return D.add(d0, k); }
  function at(k) { var t = D.parse(day(k)); PM.clock.now = function () { return new Date(t.getTime() + 9 * 3600000); }; }
  function rec(id) { return PM.store.get().items[id] || {}; }
  function expect(ok, msg) { n++; if (!ok) fail('rule', msg); }
  function makeStuck(id) {
    PM.store.reset(); PM.store.set({welcomed: true, stage: 2});
    P.recordWord(id, true, day(0));
    [1, 2, 3].forEach(function (k) { P.recordWord(id, false, day(k)); });
    expect(rec(id).stuck, id + ' should be stuck after 还不熟 on 3 days');
  }
  var only = 'A141', q = PM.content.question('PQ082');

  // A141 'only': 还不熟 on the stuck card every time, but the question right on 3 days -> unstuck.
  makeStuck(only);
  [4, 5, 6].forEach(function (k) { P.recordWord(only, false, day(k)); P.recordChoice('q', q, true, 0, day(k)); });
  expect(!rec(only).stuck, 'A141 still stuck after its question was right on 3 days (squares ' + JSON.stringify(rec(only).stuckRight) + ')');

  // A missed answer still wipes the squares (a content word: a miss on a wording focus like
  // A141's goes to the wording-trap count, by design).
  var canberra = PM.content.question('PQ018');
  makeStuck('A017');
  P.recordChoice('q', canberra, true, 0, day(4)); P.recordChoice('q', canberra, true, 0, day(5)); P.recordChoice('q', canberra, false, 0, day(6));
  expect(rec('A017').stuck && rec('A017').stuckRight.length === 0, 'a miss should wipe a stuck word\'s squares');

  // Every question on A141 waiting as a repeat mistake (not due yet): the stuck card still gets one.
  makeStuck(only);
  ['PQ082', 'PQ139', 'PQ171'].forEach(function (id) { P.recordChoice('q', PM.content.question(id), false, 0, day(4)); });
  P.recordChoice('drill', PM.content.drill('QW19'), false, 0, day(4));
  at(4);
  var dr = P.draw(day(4));
  expect(dr.some(function (it) { return it.id === only && it.why === 'stuck'; }), 'A141 not drawn while stuck');
  expect(dr.some(function (it) { return counts(it, only); }), 'stuck A141 drawn with no question on it');

  // 认识 on a review card does not move the Leitner box (only an answer does).
  PM.store.reset();
  P.recordWord('A002', true, day(0));
  var before = JSON.stringify([rec('A002').box, rec('A002').due]);
  P.recordWord('A002', true, day(5));
  expect(JSON.stringify([rec('A002').box, rec('A002').due]) === before, '认识 moved A002\'s box: ' + before + ' -> ' + JSON.stringify([rec('A002').box, rec('A002').due]));

  // 我是猜的: a right answer marked as a guess comes back tomorrow and gives the word nothing.
  function guessed(kind, item, k) {
    var snap = P.snapshot(kind, item);
    P.recordChoice(kind, item, true, 0, day(k));
    return P.recordGuess(kind, item, snap, day(k));
  }
  PM.store.reset(); PM.store.set({welcomed: true});
  P.recordWord('A017', true, day(0));
  P.recordChoice('q', canberra, true, 0, day(1));                       // a real right day first
  var logN = PM.store.get().log.length;
  expect(guessed('q', canberra, 2), '我是猜的 refused after a right answer');
  expect(rec('PQ018').repeat && rec('PQ018').repeat.due === day(3) && rec('PQ018').guessed === day(2), '我是猜的: PQ018 should be back tomorrow');
  expect(JSON.stringify(rec('A017').rightDays) === JSON.stringify([day(1)]) && rec('A017').box === 1 && rec('A017').due === day(3),
    '我是猜的: A017 got credit ' + JSON.stringify([rec('A017').rightDays, rec('A017').box, rec('A017').due]));
  expect(PM.store.get().log.length === logN + 1 && PM.store.get().log[logN].ok === true, '我是猜的: the log keeps the answer as right');
  expect(!(rec('A017').troubleDays || []).length && !rec('A017').stuck, '我是猜的 is not a trouble day');
  expect(!P.recordGuess('q', canberra, P.snapshot('q', PM.content.question('PQ082')), day(2)), '我是猜的 accepted with another item\'s snapshot');
  // a word first met by the guessed answer: met today, no right day
  var q82 = PM.content.question('PQ082');
  guessed('q', q82, 5);
  [q82.term_id].concat(q82.wording_focus || []).forEach(function (w) {
    expect(rec(w).met === day(5) && !(rec(w).rightDays || []).length && rec(w).box === 1, '我是猜的: ' + w + ' (first met) ' + JSON.stringify([rec(w).met, rec(w).rightDays]));
  });
  // a stuck word gets no square from a guess, and stays stuck
  makeStuck('A017');
  P.recordChoice('q', canberra, true, 0, day(4));
  guessed('q', canberra, 5);
  expect(rec('A017').stuck && JSON.stringify(rec('A017').stuckRight) === JSON.stringify([day(4)]), '我是猜的 moved a stuck word\'s squares: ' + JSON.stringify(rec('A017').stuckRight));
  expect(P.answered()[0] === 'PQ018' && P.answered().every(function (id) { return !/^A/.test(id); }), '做过的题: newest first, questions only');

  // Every word met: all cards are reviews, each with a question; with nothing due, the same.
  [true, false].forEach(function (anyDue) {
    PM.store.reset(); PM.store.set({welcomed: true, stage: 2});
    PM.content.list('terms').forEach(function (t) { P.recordWord(t.id, true, day(0)); if (!anyDue) rec(t.id).due = day(100); });
    at(10);
    var items = P.draw(day(10)), cards = items.filter(function (it) { return it.kind === 'word'; });
    expect(cards.length === PM.config.session.words, 'all met' + (anyDue ? '' : ', none due') + ': ' + cards.length + ' cards');
    cards.forEach(function (c) { expect(c.why === 'review' && reviewedToday(c, items), 'all met: card ' + c.id + ' (' + c.why + ') has no question'); });
  });

  // ---- 快速通关 -------------------------------------------------------------------------------
  // Open/close thresholds on the last 20 question/drill answers (scenarios do not count).
  function log(right, of, k) {
    var s = PM.store.get(); s.log = [];
    for (var i = 0; i < of; i++) s.log.push({d: day(0), k: k || 'q', id: 'PQ001', ok: i < right, h: 0, p: 1, st: 1});
  }
  function open(k) { return P.fastCheck(day(k || 0)).open; }
  PM.store.reset(); PM.store.set({welcomed: true, dateAnswered: true});
  log(19, 19); expect(!open(), '快速通关 opened on 19 answers (needs 20)');
  log(17, 20, 'scenario'); expect(!open(), '快速通关 opened on scenario answers');
  log(16, 20); expect(!open(), '快速通关 opened at 80%');
  log(17, 20); expect(open(), '快速通关 not open at 85%');
  log(16, 20); expect(open(), '快速通关 closed at 80% (closes only below 75%)');
  log(15, 20); expect(open(), '快速通关 closed at 75% (closes only below 75%)');
  log(14, 20); expect(!open(1), '快速通关 still open at 70%');
  log(16, 20); expect(!open(1), '快速通关 reopened at 80% (needs 85%)');
  var st = PM.store.get();
  st.mocks = [{d: day(0), right: 19, total: 20, values: 5, valuesTotal: 5, pass: true, english: true}];
  expect(!open(2), '快速通关 reopened by a mock taken before it closed');
  st.mocks.push({d: day(2), right: 17, total: 20, values: 5, valuesTotal: 5, pass: true, english: true});
  expect(!open(2), '快速通关 opened by a 17/20 mock');
  st.mocks.push({d: day(2), right: 18, total: 20, values: 4, valuesTotal: 5, pass: false, english: true});
  expect(!open(2), '快速通关 opened by a failed mock');
  log(14, 20); st.mocks.push({d: day(2), right: 18, total: 20, values: 5, valuesTotal: 5, pass: true, english: true});
  expect(!open(2), '快速通关 opened by a mock while the last 20 are below 75% (it would flicker)');
  log(16, 20); expect(open(2), '快速通关 not opened by a passed 18/20 mock');

  // Only after today's daily run, one round a day, never in sprint week, never the streak.
  PM.store.reset(); PM.store.set({welcomed: true, dateAnswered: true});
  ['A001', 'A002', 'A003', 'A004', 'A005', 'A006'].forEach(function (id) { P.recordWord(id, true, day(0)); });
  log(20, 20);
  at(3);
  expect(open(3) && !P.fastAvailable(day(3)), '快速通关 offered before the daily run');
  expect(P.fastRun() === null, '快速通关 round made before the daily run');
  var daily = P.todayRun();
  daily.done = true; P.finishDay(day(3));
  expect(P.fastAvailable(day(3)), '快速通关 not offered after the daily run');
  var guard = PM.config.plan.fast.maxStuck, its = PM.store.get().items;
  ['A001', 'A002', 'A003'].slice(0, guard + 1).forEach(function (id) { its[id].stuck = true; });
  expect(!P.fastAvailable(day(3)), '快速通关 offered with ' + (guard + 1) + ' stuck words (max ' + guard + ')');
  ['A001', 'A002', 'A003'].forEach(function (id) { its[id].stuck = false; });
  PM.store.set({testDate: day(8)});
  expect(!P.fastAvailable(day(3)), '快速通关 offered in sprint week');
  PM.store.set({testDate: null});
  var streakBefore = JSON.stringify(PM.store.get().streak);
  sandbox.location.hash = '#/session?fast=1';
  var fr = PM.session.resume();
  expect(fr.fast && fr.items.length === PM.config.plan.fast.questions && PM.plan.fastRun() === fr, '快速通关 round: ' + fr.items.length + ' items, kept in the store');
  checkFast('rule', day(3), fr.items, daily.items);
  // The word a question counts for: its term, or its wording focus (NOT, EXCEPT...).
  function wordsOf(id) { var q = PM.content.question(id); return [q.term_id].concat(q.wording_focus || []); }
  var unmet = fr.items.filter(function (it) { return wordsOf(it.id).some(function (w) { return !rec(w).met; }); }).length;
  expect(unmet === fr.items.length, '快速通关 at the start: every question on a word not yet met (' + unmet + ')');
  fr.items.forEach(function (it) { PM.session.answerChoice('q', PM.content.question(it.id), PM.content.question(it.id).answer); PM.session.advance(); });
  PM.session.finish();
  expect(JSON.stringify(PM.store.get().streak) === streakBefore && !fr.streakAdded, '快速通关 touched the streak');
  expect(!P.fastAvailable(day(3)) && P.fastRun() === fr && fr.done, '快速通关 offered twice in a day');
  expect(fr.items.every(function (it) { return wordsOf(it.id).some(function (w) { return rec(w).met === day(3) && rec(w).rightDays.length === 1; }); }),
    '快速通关: an unmet word answered right is met today with one right day');
  at(4);
  expect(!P.fastAvailable(day(4)) && P.fastRun() === null, '快速通关 offered the next day before the daily run');
  sandbox.location.hash = '#/session';
  return n;
}

var traceRows = [];
function traceLine(day, d, items) {
  var r = PM.store.get().items[TRACE] || {};
  var drawn = items.filter(function (it) { return it.id === TRACE || counts(it, TRACE); })
    .map(function (it) { return it.kind + ':' + it.id + '(' + it.why + ')'; }).join(' ');
  return pad(day, 3) + d + '  ' + pad(drawn || '-', 44) + ' box ' + (r.box || '-') + ' due ' + (r.due || '-') +
    ' right ' + (r.rightDays || []).length + ' trouble ' + (r.troubleDays || []).slice(-3).join(',') +
    (r.stuck ? '  STUCK right ' + (r.stuckRight || []).length : '') + (PM.plan.isMastered(TRACE, d) ? '  mastered' : '');
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
  var fastOpenDays = 0, fastRounds = 0, fastQs = 0, fastRightAll = 0;

  for (var day = 0; day < DAYS; day++) {
    var now = new Date(START.getFullYear(), START.getMonth(), START.getDate() + day);
    PM.clock.now = function () { return new Date(now.getTime() + 9 * 3600000); };
    var d = PM.dates.iso();
    if (day === DATE_SET_ON && !NO_DATE) PM.store.set({testDate: PM.dates.add(d, TEST_IN)});
    var st = PM.plan.streak(d);
    streakSeen[day] = st.count;

    // Today: offered a step up? She accepts.
    var offer = PM.plan.offer(d);
    if (offer) { PM.plan.acceptStage(offer); stageDays[offer] = day; }

    if (MISSED[day]) { rows.push(pad(day, 3) + d + '  (missed)  streak ' + st.count); continue; }

    sandbox.location.hash = '#/session';
    var sprint = PM.plan.sprint(d);
    var run = PM.session.resume();
    var stuckBefore = PM.plan.stuckIds();
    var c = checkDraw(day, d, run.items, sprint);
    checkOverdue(day, d);
    if (PM.plan.fastAvailable(d) || PM.plan.fastToday(d)) fail(day, '快速通关 offered before the daily run is finished');
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
        // rand() before pRight(), as before 0.7.1: pRight can draw too (a new word's difficulty),
        // and keeping the order keeps the pace runs comparable across versions.
        var roll = rand(), p = pRight(item, kind === 'drill' ? 'drill' : kind), ok = roll < p;
        var picked = ok ? item.answer : (item.answer === 'a' ? 'b' : 'a');
        var tid = item.term_id, had = ((PM.store.get().items[tid] || {}).rightDays || []).slice();
        PM.session.answerChoice(kind, item, picked);
        // --guess: a right answer she was unsure of, she marks 我是猜的 (more likely when it was hard).
        if (GUESS && ok && rand() < (1 - p) * 0.6) {
          if (!PM.session.guess(kind, item)) fail(day, '我是猜的 refused on ' + item.id);
          var ir = PM.store.get().items[item.id], tr = PM.store.get().items[tid] || {};
          if (!ir.repeat || ir.repeat.due !== PM.dates.add(d, 1) || ir.guessed !== d) fail(day, '我是猜的: ' + item.id + ' not back tomorrow');
          if (JSON.stringify(tr.rightDays || []) !== JSON.stringify(had) || tr.box !== 1) fail(day, '我是猜的: ' + tid + ' still got credit');
          guesses++;
        }
        if (kind === 'drill') drilled[item.term_id] = 1;
        if (kind !== 'scenario') { asked++; if (ok) right++; }
      }
      PM.session.advance();
    }
    if (!PM.store.get().streak.days[d]) fail(day, 'the day is not credited to the streak after the last answer');
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

    // 快速通关: offered after the daily run when open (never in sprint week); with --fast she takes it.
    var fastAvail = PM.plan.fastAvailable(d), fastLine = '';
    if (PM.plan.fastCheck(d).open) fastOpenDays++;
    if (fastAvail && sprint) fail(day, '快速通关 offered in sprint week');
    if (fastAvail && FAST) {
      var streakBefore = JSON.stringify(PM.store.get().streak.days), dailyRun = PM.store.get().run;
      sandbox.location.hash = '#/session?fast=1';
      var fr = PM.session.resume();
      checkFast(day, d, fr.items, dailyRun.items);
      var nBefore = {}, fRight = 0;
      fr.items.forEach(function (x) { nBefore[x.id] = (PM.store.get().items[x.id] || {}).n || 0; });
      while (fr.i < fr.items.length) {
        var fq = PM.content.question(fr.items[fr.i].id);
        // English only: she taps underlined words she is unsure of, like stage 3.
        ((fq.a && fq.a.q) || []).forEach(function (sp) { if (rand() < (1 - skill(sp[2])) * 0.2) PM.session.tap(sp[2]); });
        var fok = rand() < pRight(fq, 'q') - 0.04 * (3 - stage);
        PM.session.answerChoice('q', fq, fok ? fq.answer : (fq.answer === 'a' ? 'b' : 'a'));
        if (fok) fRight++;
        // A reload mid-round, after an answer and before 下一题: the round resumes, nothing twice.
        if (fr.i === 3) {
          PM.store.replace(JSON.parse(storage[PM.config.storeKey]));
          var again = PM.session.resume();
          if (again.i !== 4 || again.results.length !== 4) fail(day, '快速通关 did not resume after a reload (i ' + again.i + ')');
          fr = again;
          continue;
        }
        PM.session.advance();
      }
      PM.session.finish();
      var after = PM.store.get().items;
      fr.items.forEach(function (x) { if ((after[x.id].n || 0) !== nBefore[x.id] + 1) fail(day, '快速通关 recorded ' + x.id + ' ' + (after[x.id].n - nBefore[x.id]) + ' times'); });
      if (JSON.stringify(PM.store.get().streak.days) !== streakBefore || fr.streakAdded) fail(day, '快速通关 touched the streak');
      if (PM.plan.fastAvailable(d) || PM.plan.fastRun() !== PM.store.get().fast.run) fail(day, '快速通关 offered twice in a day');
      sandbox.location.hash = '#/session';
      if (PM.store.get().run.date !== d || PM.store.get().run.fast || !PM.store.get().run.done) fail(day, '快速通关 replaced the daily run');
      fastRounds++; fastQs += fr.items.length; fastRightAll += fRight;
      fastLine = '+fast ' + fRight + '/' + fr.items.length;
    }

    var s = PM.store.get();
    stuckReport(day, run.items, stuckBefore);
    paceRow(day, d);
    if (TRACE) traceRows.push(traceLine(day, d, run.items));
    rows.push(pad(day, 3) + d + '  st' + stage + (sprint ? ' SPRINT' : '       ') +
      '  streak ' + pad(s.streak.count, 3) +
      ' words[' + pad(tally(run.items.filter(function (x) { return x.kind === 'word'; }), 'why'), 30) + ']' +
      ' qs[' + pad(tally(run.items.filter(function (x) { return x.kind !== 'word' && x.kind !== 'scenario'; }), 'why'), 34) + ']' +
      ' sc:' + pad(run.items.filter(function (x) { return x.kind === 'scenario'; }).map(function (x) { return x.why; })[0] || '-', 7) +
      ' right ' + right + '/' + asked +
      '  met ' + pad(PM.plan.metCount(), 4) + 'mastered ' + pad(PM.plan.masteredCount(d), 4) +
      'stuck ' + pad(PM.plan.stuckIds().length, 3) + 'review ' + pad(PM.plan.repeats().length, 3) +
      (extraN ? '+extra ' + extraN + ' ' : '') + fastLine);
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
  console.log('快速通关 open on ' + fastOpenDays + ' days' + (FAST ? ', taken ' + fastRounds + ' times, ' + fastQs + ' questions, ' +
    (fastQs ? Math.round(fastRightAll / fastQs * 100) : 0) + '% right' : ' (not taken: run with --fast)'));
  if (GUESS) console.log('我是猜的 marked ' + guesses + ' times');
  var sp = openSpells(DAYS);
  console.log('stuck spells ' + sp.length + ', longest: ' + sp.slice(0, 6).map(function (x) { return x.id + ' ' + x.days + 'd' + (x.open ? '+' : ''); }).join(', ') +
    '; stuck-word days with nothing drawn that could unstick it: ' + stuckNoQ + ' / ' + stuckDays);
  console.log('pace (mastered / met / stuck): ' + PACE_AT.filter(function (n) { return pace[n]; }).map(function (n) {
    return 'day ' + n + ' ' + pace[n].mastered + '/' + pace[n].met + '/' + pace[n].stuck; }).join('   ') + '   ' + PM.config.readyToSit.wordsMastered + ' mastered on day ' + (reached || '-') + (NO_DATE ? '   (no test date)' : ''));
  if (TRACE) { console.log('\ntrace ' + TRACE + ':'); traceRows.forEach(function (r) { console.log(r); }); }
  if (raw.length > 200 * 1024) fail(DAYS, 'store record is ' + Math.round(raw.length / 1024) + ' KB');
  if (!TRACE) {
    var nRules = ruleChecks();
    if (sp[0] && sp[0].days > 28 && LEARNER === 'typical') fail(DAYS, sp[0].id + ' stuck for ' + sp[0].days + ' days');
    console.log('rule checks: ' + nRules + ' (stuck word clears with 还不熟 on its card, a miss still wipes the squares, ' +
      'stuck word with every question waiting, 认识 does not move the box, review cards come with questions)');
  }
  if (failures.length) {
    console.log('\nFAILED (' + failures.length + '):');
    failures.slice(0, 40).forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('\nAll plan checks passed.');
}).catch(function (e) { console.error(e); process.exit(1); });
