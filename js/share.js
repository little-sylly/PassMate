/* Her channels back to Sam and out of the app: the Chinese-text flags as plain text, the daily
   reminder as a calendar file, the in-app browser check, and copy / share with fallbacks for old
   WebViews. Text building is pure (the Node checks call it); only copy/share/save touch the page. */
(function (PM) {
  'use strict';

  // ---- flags --------------------------------------------------------------------------------------
  // The Chinese she was reading when she flagged an item, field by field, named as in the
  // *_source.py files so a content session can find each one.
  var LETTERS = ['a', 'b', 'c'];
  function snapshot(id) {
    var k = PM.plan.kindOf(id), it = PM.plan.itemOf(id), zh = [];
    if (!it) return null;
    function add(field, text) { if (text) zh.push([field, String(text)]); }
    var en;
    if (k === 'word') {
      en = it.term; add('zh', it.zh); add('explain', it.explain); add('trap', it.trap);
    } else if (k === 'q') {
      en = it.question_en; add('gist_zh', it.gist_zh); add('explain_zh', it.explain_zh);
    } else if (k === 'drill') {
      en = it.question_en;
      if (it.decode) {
        add('decode.prompt_zh', it.decode.prompt_zh);
        (it.decode.options_zh || []).forEach(function (o, i) { add('decode.options_zh.' + LETTERS[i], o); });
      }
      add('tip_zh', it.tip_zh); add('explain_zh', it.explain_zh);
      if (it.twin) add('twin.explain_zh', it.twin.explain_zh);
    } else {
      en = it.scenario_en + ' / ' + it.question_en;
      add('scenario_zh', it.scenario_zh);
      (it.why_zh || []).forEach(function (w, i) { add('why_zh.' + LETTERS[i], w); });
      add('takeaway_zh', it.takeaway_zh);
    }
    return {en: en, zh: zh};
  }

  // where: card | sheet | q | drill | twin | scenario | gate | mock | review
  function makeFlag(id, note, where) {
    var s = PM.store.get(), snap = snapshot(id) || {en: '', zh: []};
    return {id: id, script: s.script || PM.config.defaultScript, note: note || '', at: new Date().toISOString(),
      where: where || '', en: snap.en, zh: snap.zh};
  }

  var KIND = {word: 'word (anchor term)', q: 'practice question', drill: 'question-wording drill', scenario: 'values scenario'};
  var SOURCE = {word: 'anchor_terms_source.py', q: 'practice_questions_source.py', drill: 'question_wording_drills_source.py',
    scenario: 'values_scenarios_source.py'};
  var WHERE = {card: 'word card', sheet: 'word sheet (tapped word)', q: 'answer feedback', drill: 'wording drill feedback',
    twin: 'wording drill, twin question', scenario: 'values scenario feedback', gate: 'values gate result',
    mock: 'mock test result', review: 'Review tab'};

  function localTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return PM.dates.iso(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Plain text for Sam: one block per flag, then the note, the English and every Chinese field.
  function flagsText(flags) {
    var meta = PM.content.meta() || {}, src = meta.sources || {}, out = [];
    out.push('PassMate Chinese-text flags: ' + flags.length + ' (' + PM.dates.iso(new Date()) + ')');
    out.push('App ' + PM.config.version + ' · data: ' + Object.keys(src).map(function (k) { return k + ' ' + src[k]; }).join(', '));
    out.push('Text below is what she saw. zh-Hant is generated from the Simplified source by OpenCC (s2hk): fix the Simplified source; a Hong Kong wording problem may need a conversion override.');
    flags.forEach(function (f, n) {
      var k = PM.plan.kindOf(f.id), zh = f.zh, en = f.en, note = '';
      if (!zh || !zh.length) {                       // flags saved before M5 carry no text: look it up now
        var snap = snapshot(f.id);
        if (snap) { zh = snap.zh; en = snap.en; note = ' (text looked up when sent, in ' + PM.content.meta().script + ')'; }
      }
      out.push('');
      out.push((n + 1) + ') ' + f.id + ' · ' + (KIND[k] || k) + ' · ' + f.script + ' · ' + localTime(f.at) +
        (f.where ? ' · from: ' + (WHERE[f.where] || f.where) : ''));
      out.push('Source: ' + (SOURCE[k] || '?') + note);
      out.push('Her note: ' + (f.note ? f.note : '(none)'));
      if (en) out.push('English: ' + en);
      (zh || []).forEach(function (z) { out.push(z[0] + ': ' + z[1]); });
    });
    return out.join('\n');
  }

  // ---- daily reminder (.ics) ------------------------------------------------------------------------
  // A daily event at her chosen time with an alert. No end date, or up to the test date.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // Lines longer than 75 octets fold onto the next line with a leading space (RFC 5545).
  function fold(line) {
    var out = [], cur = '', bytes = 0, limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i), code = line.charCodeAt(i), b;
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch += line.charAt(++i); b = 4; }
      else b = code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function stamp(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  // o: {start 'YYYY-MM-DD', time 'HH:MM', until 'YYYY-MM-DD' | null, title, body, url}
  function ics(o) {
    var day = o.start.replace(/-/g, ''), hm = (o.time || '20:00').replace(':', '');
    var rule = 'RRULE:FREQ=DAILY' + (o.until ? ';UNTIL=' + o.until.replace(/-/g, '') + 'T235959' : '');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little Sylly//PassMate//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:passmate-daily-' + day + hm + '@littlesylly',
      'DTSTAMP:' + stamp(new Date()),
      'DTSTART:' + day + 'T' + hm + '00',          // floating: her phone's own time zone
      'DURATION:PT10M',
      rule,
      'SUMMARY:' + icsEscape(o.title),
      'DESCRIPTION:' + icsEscape(o.body + (o.url ? '\n' + o.url : '')),
      o.url ? 'URL:' + o.url : null,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(o.title), 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean);
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // ---- in-app browsers (their stored data can be wiped) ------------------------------------------------
  function inApp(ua) {
    ua = ua == null ? (typeof navigator !== 'undefined' ? navigator.userAgent : '') : ua;
    if (/MicroMessenger/i.test(ua)) return 'wechat';
    if (/xhsdiscover|xiaohongshu/i.test(ua)) return 'rednote';
    if (/\bQQ\/|Weibo|FBAN|FBAV|Instagram|\bLine\//i.test(ua)) return 'other';
    return null;
  }

  // ---- copy / share / save -------------------------------------------------------------------------------
  function legacyCopy(text) {
    var ta = document.createElement('textarea'), ok = false;
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* old WebView */ }
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  // -> Promise<boolean>
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  // The phone's share sheet when there is one, else the clipboard.
  // -> Promise<'shared' | 'copied' | 'cancelled' | 'failed'>
  function send(title, text) {
    if (navigator.share) {
      return navigator.share({title: title, text: text}).then(function () { return 'shared'; }, function (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        return copy(text).then(function (ok) { return ok ? 'copied' : 'failed'; });
      });
    }
    return copy(text).then(function (ok) { return ok ? 'copied' : 'failed'; });
  }

  function saveFile(name, type, text) {
    var ua = navigator.userAgent || '', iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var standalone = navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    // iOS Safari opens a calendar file straight into "Add to Calendar"; a download link does not.
    if (iOS && !standalone) { location.href = 'data:' + type + ';charset=utf-8,' + encodeURIComponent(text); return; }
    var url = URL.createObjectURL(new Blob([text], {type: type + ';charset=utf-8'}));
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
  }

  PM.share = {snapshot: snapshot, makeFlag: makeFlag, flagsText: flagsText, ics: ics, inApp: inApp,
    copy: copy, send: send, saveFile: saveFile};
})(window.PM = window.PM || {});
