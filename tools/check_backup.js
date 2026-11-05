#!/usr/bin/env node
/* Backup code and flag export check (M5): does progress survive a backup and restore?

     node tools/check_backup.js [--days 30] [--seed 11]

   Loads the real js/ scripts in a VM (no browser) with data/content.zh-Hans.json, then:
     - plays 30 days of sessions on the debug clock (missed days, stage 2 from day 10),
       values gate runs and mock tests on some days, a gate run and a mock left half done,
       flags with notes, settings (test date, 繁, large text, reminder, banner);
     - makes a backup code, restores it into a fresh store in a second VM and into a store that
       already holds other progress, and deep-compares the records; mastery, streak, readiness
       and the review list must come out the same;
     - checks the code survives line breaks and text around it, and that a code cut short,
       changed by one character, or from a newer version is refused; a v1 record migrates;
     - checks the flag export carries what a content session needs (id, script, note, source
       file, every Chinese field), the reminder .ics and the in-app browser detection.
   Exits 1 on any failure. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2);
function arg(name, def) { var i = args.indexOf('--' + name); return i === -1 ? def : args[i + 1]; }
var DAYS = +arg('days', 30), SEED = +arg('seed', 11);
var FILES = ['config', 'store', 'content', 'plan', 'backup', 'share', 'session', 'exam'];

function makeApp() {
  var storage = {};
  var sandbox = {
    console: console, Math: Math, Date: Date, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
    location: {hash: '#/session'},
    navigator: {userAgent: 'node'},
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
  FILES.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sandbox, {filename: f + '.js'});
  });
  return {PM: sandbox.PM, storage: storage, sandbox: sandbox};
}

var failures = [], checks = 0;
function check(ok, msg) { checks++; if (!ok) { failures.push(msg); console.log('  FAIL ' + msg); } }

// Deep equality on plain JSON data; returns the first difference as a path, or null.
function diff(a, b, at) {
  at = at || '$';
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return at + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
  if (Array.isArray(a) !== Array.isArray(b)) return at + ': array vs object';
  var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return at + ': keys [' + ka.join() + '] vs [' + kb.join() + ']';
  for (var i = 0; i < ka.length; i++) { var d = diff(a[ka[i]], b[ka[i]], at + '.' + ka[i]); if (d) return d; }
  return null;
}
function plain(x) { return JSON.parse(JSON.stringify(x)); }

var h = SEED >>> 0;
function rand() { h = (h + 0x6D2B79F5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

async function main() {
  // ---- 1. thirty days of real use -------------------------------------------------------------
  var A = makeApp(), PM = A.PM;
  await PM.content.load('zh-Hans');
  PM.store.set({welcomed: true, dateAnswered: true, script: 'zh-Hans'});
  var MISSED = {6: 1, 13: 1, 14: 1};
  var gates = 0, mocks = 0;
  for (var day = 0; day < DAYS; day++) {
    PM.clock.set(day);
    var d = PM.dates.iso();
    if (MISSED[day]) continue;
    if (day === 10) PM.plan.acceptStage(2);
    var run = PM.session.resume();
    while (run.i < run.items.length) {
      var it = run.items[run.i];
      if (it.kind === 'word') PM.session.answerWord(it.id, rand() < 0.75);
      else {
        var item = PM.plan.itemOf(it.id);
        if (rand() < 0.25 && item.term_id) PM.session.tap(item.term_id);
        var pick = rand() < 0.72 ? item.answer : (item.answer === 'a' ? 'b' : 'a');
        PM.session.answerChoice(it.kind, item, pick);
      }
      PM.session.advance();
    }
    PM.session.finish();
    PM.session.leave();
    if (day >= 12 && day % 2 === 0) {          // values gate runs
      var g = PM.exam.startGate(d);
      g.ids.forEach(function (id, i) { var q = PM.content.question(id); g.answers[i] = rand() < 0.85 ? q.answer : (q.answer === 'a' ? 'c' : 'a'); });
      PM.exam.finishGate(d); gates++;
    }
    if (day >= 15 && day % 5 === 0) {          // mock tests
      var m = PM.exam.startMock(d);
      m.ids.forEach(function (id, i) { var q = PM.content.question(id); m.answers[i] = rand() < 0.8 ? q.answer : rand() < 0.5 ? null : 'b'; });
      PM.exam.finishMock(d); mocks++;
    }
  }
  // Left half done, as she might on the day she backs up.
  var lastDay = PM.dates.iso();
  var gr = PM.exam.startGate(lastDay); gr.answers[0] = PM.content.question(gr.ids[0]).answer; gr.i = 1;
  var mk = PM.exam.startMock(lastDay); mk.answers[0] = 'a'; mk.answers[3] = 'c'; mk.i = 4;
  PM.session.flag('PQ001', '“原住民”这里读起来不太自然', 'q');
  PM.session.flag('A092', '', 'sheet');
  PM.session.flag('QW01', '对照题的解释有错字', 'twin');
  PM.session.flag('VS01', 'why 选项 b 的说法太硬', 'scenario');
  PM.store.set({testDate: PM.dates.add(lastDay, 40), largeText: true, script: 'zh-Hant', banner: lastDay,
    reminder: {offered: lastDay, time: '19:30', added: lastDay}});
  PM.store.save();

  var s = PM.store.get();
  console.log('Simulated ' + DAYS + ' days: streak ' + s.streak.count + ', days done ' + Object.keys(s.streak.days).length +
    ', items ' + Object.keys(s.items).length + ', log ' + s.log.length + ', stage ' + s.stage + ', mastered ' + PM.plan.masteredCount() +
    ', stuck ' + PM.plan.stuckIds().length + ', review list ' + PM.plan.repeats().length +
    ', gate runs ' + s.gate.history.length + ' (cleared ' + s.gate.cleared + '), mocks ' + s.mocks.length + ', flags ' + s.flags.length);
  check(Object.keys(s.streak.days).length === DAYS - 3, 'days done = ' + (DAYS - 3));
  check(s.gate.history.length === gates && s.mocks.length === mocks && gates > 0 && mocks > 0, 'gate and mock history recorded');
  check(!!s.gate.run && !!s.mock, 'a gate run and a mock in progress');
  check(PM.plan.repeats().length > 0, 'the review list has items');

  // ---- 2. backup -> restore into a fresh store ----------------------------------------------------
  var code = PM.backup.make();
  var raw = A.storage['passmate.v1'];
  console.log('Backup code: ' + code.length + ' characters for ' + raw.length + ' characters of store JSON (' +
    (raw.length / code.length).toFixed(1) + 'x smaller)');
  check(/^PM1\.[A-Za-z0-9_-]+$/.test(code), 'code is one line of base64url');
  check(code.length < raw.length / 2, 'code is shorter than half the JSON');

  var B = makeApp();
  await B.PM.content.load('zh-Hans');
  check(!B.PM.store.get().welcomed, 'B starts fresh');
  var r = B.PM.backup.restore(code);
  check(r.ok, 'restore ok: ' + r.error);
  var d1 = diff(plain(PM.store.get()), plain(B.PM.store.get()));
  check(!d1, 'restored record deep-equals the original' + (d1 ? ' (' + d1 + ')' : ''));
  var d2 = diff(JSON.parse(raw), JSON.parse(B.storage['passmate.v1']));
  check(!d2, 'restored localStorage deep-equals the original' + (d2 ? ' (' + d2 + ')' : ''));
  // A fresh load of the stored record (as after a reload) is the same too.
  var C = makeApp();
  C.storage['passmate.v1'] = B.storage['passmate.v1'];
  await C.PM.content.load('zh-Hans');
  var d3 = diff(plain(PM.store.get()), plain(C.PM.store.get()));
  check(!d3, 'reloaded after restore deep-equals the original' + (d3 ? ' (' + d3 + ')' : ''));
  // What she sees: same mastery, streak, readiness, review list, stage offer, gate and mock state.
  [B, C].forEach(function (X, n) {
    X.PM.clock.set(PM.clock.offset);
    var same = [
      ['masteredCount', PM.plan.masteredCount(), X.PM.plan.masteredCount()],
      ['streak', PM.plan.streak().count, X.PM.plan.streak().count],
      ['readiness', JSON.stringify(PM.plan.readiness()), JSON.stringify(X.PM.plan.readiness())],
      ['repeats', PM.plan.repeats().join(), X.PM.plan.repeats().join()],
      ['stuck', PM.plan.stuckIds().join(), X.PM.plan.stuckIds().join()],
      ['stageProgress', JSON.stringify(PM.plan.stageProgress()), JSON.stringify(X.PM.plan.stageProgress())],
      ['gateStatus', JSON.stringify(PM.exam.gateStatus()), JSON.stringify(X.PM.exam.gateStatus())],
      ['mockLeft', Math.round(PM.exam.mockLeft() / 1000), Math.round(X.PM.exam.mockLeft() / 1000)],
      ['tomorrow draw', JSON.stringify(PM.plan.draw(PM.dates.add(PM.dates.iso(), 1))), JSON.stringify(X.PM.plan.draw(X.PM.dates.add(X.PM.dates.iso(), 1)))]
    ];
    same.forEach(function (x) { check(x[1] === x[2], (n ? 'reloaded' : 'restored') + ': ' + x[0] + ' differs: ' + x[1] + ' vs ' + x[2]); });
  });

  // ---- 3. restore over other progress replaces it completely ----------------------------------------
  var D = makeApp();
  await D.PM.content.load('zh-Hans');
  D.PM.store.set({welcomed: true, dateAnswered: true, stage: 3, testDate: '2027-01-01'});
  D.PM.plan.recordChoice('q', D.PM.content.question('PQ400'), false, 0, '2026-01-01');
  D.PM.store.get().extraField = 'should vanish';
  D.PM.store.save();
  check(D.PM.backup.restore(code).ok, 'restore over other progress');
  var d4 = diff(plain(PM.store.get()), plain(D.PM.store.get()));
  check(!d4, 'restore over other progress deep-equals the original' + (d4 ? ' (' + d4 + ')' : ''));

  // ---- 4. how the code travels ------------------------------------------------------------------------
  var wrapped = '我的 PassMate 备份：\n' + code.replace(/(.{60})/g, '$1\n  ') + '\n（11月5日）';
  var rw = B.PM.backup.read(wrapped);
  check(rw.ok && !diff(plain(rw.rec), plain(PM.store.get())), 'line breaks and text around the code are ignored');
  check(B.PM.backup.read('').error === 'empty' && B.PM.backup.read('   \n').error === 'empty', 'empty paste');
  check(B.PM.backup.read(code.slice(0, code.length - 40)).error === 'bad', 'a code cut short is refused');
  check(B.PM.backup.read(code.slice(0, 30)).error === 'bad', 'a code cut very short is refused');
  var mid = 4 + Math.floor((code.length - 4) / 2), ch = code.charAt(mid);
  check(B.PM.backup.read(code.slice(0, mid) + (ch === 'A' ? 'B' : 'A') + code.slice(mid + 1)).error === 'bad', 'one changed character is refused');
  check(B.PM.backup.read('hello').error === 'bad', 'random text is refused');
  check(B.PM.backup.read('PM9.' + code.slice(4)).error === 'newer', 'a newer code format is refused as newer');
  var future = plain(PM.store.get()); future.v = 99;
  check(B.PM.backup.read(B.PM.backup.make(future)).error === 'newer', 'a store from a newer app is refused as newer');
  var notStore = B.PM.backup.make({hello: 1});
  check(B.PM.backup.read(notStore).error === 'bad', 'a code that is not a PassMate store is refused');
  // Unicode in notes survives (incl. characters outside the BMP).
  var uni = plain(PM.store.get()); uni.flags[0].note = '繁體 ok · emoji 😀 · 𠮷';
  var ru = B.PM.backup.read(B.PM.backup.make(uni));
  check(ru.ok && ru.rec.flags[0].note === uni.flags[0].note, 'Chinese and emoji in a note survive');
  // An old v1 record (M1-M2) restores through the migration.
  var v1 = {v: 1, created: '2026-11-01T00:00:00Z', script: 'zh-Hans', welcomed: true, dateAnswered: true, stage: 1, largeText: false,
    streak: {count: 1, days: {'2026-11-01': 1}, saved: {}}, items: {A001: {n: 1, right: 1, taps: 0, last: '2026-11-01', lastRight: true, know: true},
      PQ002: {n: 1, right: 0, taps: 0, last: '2026-11-01', lastRight: false, know: null}}};
  var E = makeApp();
  await E.PM.content.load('zh-Hans');
  check(E.PM.backup.restore(E.PM.backup.make(v1)).ok, 'a v1 backup restores');
  var ev = E.PM.store.get();
  check(ev.v === 2 && ev.items.A001.met === '2026-11-01' && ev.items.PQ002.repeat && Array.isArray(ev.flags) && ev.gate && ev.mocks,
    'a v1 backup is migrated to v2 with the new fields');
  // A big store (90 days' worth) still makes a usable code.
  var big = plain(PM.store.get());
  for (var k = 1; k <= 400; k++) { var id = 'PQ' + ('00' + k).slice(-3); big.items[id] = big.items[id] || {n: 3, right: 2, taps: 1, last: '2027-01-0' + (k % 9 + 1), lastRight: true, know: null}; }
  var bigCode = B.PM.backup.make(big), rb = B.PM.backup.read(bigCode);
  console.log('Big store: ' + JSON.stringify(big).length + ' characters -> code ' + bigCode.length);
  check(rb.ok && !diff(plain(rb.rec), big), 'a big store round-trips');

  // ---- 5. flag export ------------------------------------------------------------------------------------
  var flags = PM.store.get().flags, text = PM.share.flagsText(flags);
  console.log('\nFlag export (first 2 of ' + flags.length + '):\n' + text.split('\n\n').slice(0, 1).join('') + '\n' + text.split('\n\n').slice(1, 3).join('\n\n') + '\n');
  flags.forEach(function (f) {
    check(text.indexOf(f.id + ' · ') !== -1, 'export names ' + f.id);
    check(f.zh && f.zh.length > 0, f.id + ' keeps the Chinese she saw');
    f.zh.forEach(function (z) { check(text.indexOf(z[0] + ': ' + z[1]) !== -1, f.id + ' export carries ' + z[0]); });
    check(text.indexOf(f.note || '(none)') !== -1, f.id + ' export carries her note');
  });
  check(/PQ001 · practice question · zh-Hans .* from: answer feedback/.test(text), 'kind, script and where are named');
  check(text.indexOf('Source: practice_questions_source.py') !== -1 && text.indexOf('Source: anchor_terms_source.py') !== -1 &&
    text.indexOf('Source: question_wording_drills_source.py') !== -1 && text.indexOf('Source: values_scenarios_source.py') !== -1, 'source files named');
  check(text.indexOf('English: Who were the first people to live in Australia?') !== -1, 'the English is included');
  check(/twin\.explain_zh: /.test(text) && /decode\.options_zh\.a: /.test(text) && /why_zh\.b: /.test(text) && /trap: /.test(text), 'drill, scenario and word fields');
  check(/App \d+\.\d+\.\d+ · data: anchor-terms v/.test(text), 'app and data versions');
  // A flag saved before M5 (no text kept) is looked up when sent.
  var old = {id: 'PQ010', script: 'zh-Hans', note: 'old', at: '2026-11-04T10:00:00Z'};
  var oldText = PM.share.flagsText([old]);
  check(/explain_zh: \S/.test(oldText) && /looked up when sent/.test(oldText), 'a pre-M5 flag is looked up');

  // ---- 6. reminder .ics -------------------------------------------------------------------------------------
  var ics1 = PM.share.ics({start: '2026-11-05', time: '20:00', until: null, title: 'PassMate · 今天的 10 分钟', body: '打开 PassMate，做今天的学习。', url: 'https://example.org/PassMate/'});
  var ics2 = PM.share.ics({start: '2026-11-05', time: '07:30', until: '2026-12-01', title: 'T, ok; yes', body: 'B'});
  check(/\r\nRRULE:FREQ=DAILY\r\n/.test(ics1), 'no test date: repeats daily with no end');
  check(/\r\nRRULE:FREQ=DAILY;UNTIL=20261201T235959\r\n/.test(ics2), 'test date: repeats until the test day');
  check(/DTSTART:20261105T200000\r\n/.test(ics1) && /DTSTART:20261105T073000\r\n/.test(ics2), 'start time in her own time zone');
  check(/BEGIN:VALARM[\s\S]*TRIGGER:PT0M[\s\S]*END:VALARM/.test(ics1), 'alarm at the time');
  check(ics1.split('\r\n').every(function (l) { return Buffer.byteLength(l, 'utf8') <= 75; }), 'lines folded at 75 octets');
  check(/SUMMARY:PassMate · 今天的 10 分钟\r\n/.test(ics1) &&
    ics1.replace(/\r\n /g, '').indexOf('DESCRIPTION:打开 PassMate，做今天的学习。\\nhttps://example.org/PassMate/\r\n') !== -1, 'title and body with the link');
  check(/SUMMARY:T\\, ok\\; yes\r\n/.test(ics2), 'commas and semicolons escaped');
  check(/^BEGIN:VCALENDAR\r\n/.test(ics1) && /END:VCALENDAR\r\n$/.test(ics1), 'calendar wrapper with CRLF');

  // ---- 7. in-app browsers -----------------------------------------------------------------------------------
  var UA = {
    wechat: 'Mozilla/5.0 (Linux; Android 13; V2148A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0 Mobile Safari/537.36 XWEB/1110 MMWEBSDK/20231002 MicroMessenger/8.0.43.2480(0x28002B37) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN',
    wechatIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2d) NetType/WIFI Language/zh_CN',
    rednote: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 xhsdiscover/8.12 (iPhone; iOS 17.0; zh_CN) Resolution/1170*2532 Version/8.12 Build/8120234 Device/(Apple Inc.;iPhone14,5) NetType/WiFi',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  };
  check(PM.share.inApp(UA.wechat) === 'wechat' && PM.share.inApp(UA.wechatIos) === 'wechat', 'WeChat detected (Android, iOS)');
  check(PM.share.inApp(UA.rednote) === 'rednote', 'Rednote detected');
  check(PM.share.inApp(UA.safari) === null && PM.share.inApp(UA.chrome) === null, 'Safari and Chrome are not in-app');

  // ---- 8. stage step-back ----------------------------------------------------------------------------------
  B.PM.store.set({stage: 3});
  check(B.PM.plan.stepBack() === 2 && B.PM.store.get().stage === 2 && B.PM.store.get().offer.stage === 3, 'step back 3 -> 2 snoozes the stage-3 offer');
  check(B.PM.plan.offer() !== 3, 'no stage-3 offer the same day after stepping back');
  B.PM.store.set({stage: 1});
  check(B.PM.plan.stepBack() === 1 && B.PM.store.get().stage === 1, 'stage 1 cannot step back');

  console.log('\n' + checks + ' checks, ' + failures.length + ' failed');
  if (failures.length) { console.log('FAILED'); process.exit(1); }
  console.log('BACKUP CHECK PASSED');
}
main().catch(function (e) { console.error(e); process.exit(1); });
