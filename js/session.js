/* Session run: which items, where she is, what she did. Memory only until finished.
   M2 runs the fixed sample from config; M3 swaps `buildItems` for the plan engine's daily draw. */
(function (PM) {
  'use strict';

  // Debug: #/session?stage=2 previews a stage without saving it.
  function stage() {
    var m = /[?&]stage=([123])\b/.exec(location.hash || '');
    return m ? +m[1] : (PM.store.get().stage || 1);
  }

  function buildItems() {
    var s = PM.config.sample, out = [];
    s.terms.forEach(function (id) { out.push({kind: 'word', id: id}); });
    s.questions.forEach(function (id) { out.push({kind: 'q', id: id}); });
    out.push({kind: 'scenario', id: s.scenario});
    return out.filter(function (it) {
      return it.kind === 'word' ? PM.content.term(it.id)
        : it.kind === 'q' ? PM.content.question(it.id) : PM.content.scenario(it.id);
    });
  }

  function rec(id) {
    var items = PM.store.get().items;
    return items[id] || (items[id] = {n: 0, right: 0, taps: 0, last: null, lastRight: null, know: null});
  }

  var run = null;

  PM.session = {
    stage: stage,
    // The current run if it is from today and unfinished; otherwise a new one.
    current: function () {
      var today = PM.dates.iso();
      if (!run || run.date !== today || run.done) {
        run = {date: today, items: buildItems(), i: 0, results: [], taps: 0, hints: 0, done: false, streakAdded: false};
      }
      return run;
    },
    leave: function () { run = null; },

    tap: function (termId) {
      var r = this.current();
      r.taps++;
      rec(termId).taps++;
      PM.store.save();
    },
    hint: function () { this.current().hints++; },

    answerWord: function (id, knew) {
      var it = rec(id), r = this.current();
      it.n++; it.know = knew; it.last = r.date;
      r.results.push({kind: 'word', id: id, knew: knew});
      PM.store.save();
    },
    // picked/answer are letters 'a'..'c'. Records the question and its term.
    answerChoice: function (kind, item, picked, hintUsed) {
      var r = this.current(), ok = picked === item.answer, it = rec(item.id);
      it.n++; if (ok) it.right++; it.last = r.date; it.lastRight = ok;
      if (item.term_id) {
        var t = rec(item.term_id);
        t.n++; if (ok) t.right++; t.last = r.date; t.lastRight = ok;
      }
      r.results.push({kind: kind, id: item.id, ok: ok, hint: !!hintUsed});
      PM.store.save();
      return ok;
    },
    flag: function (id, note) {
      var s = PM.store.get();
      (s.flags = s.flags || []).push({id: id, script: s.script || PM.config.defaultScript, note: note || '', at: new Date().toISOString()});
      PM.store.save();
    },

    // Mark the day done. Streak: consecutive finished days. The weekly forgiveness is M3.
    finish: function () {
      var r = this.current(), s = PM.store.get(), today = r.date;
      r.done = true;
      if (!s.streak.days[today]) {
        s.streak.days[today] = 1;
        r.streakAdded = true;
      }
      var n = 0, d = PM.dates.parse(today);
      while (true) {
        var k = PM.dates.iso(d);
        if (s.streak.days[k]) n++;
        else if (!s.streak.saved[k]) break;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      }
      s.streak.count = n;
      PM.store.save();
      return r;
    }
  };
})(window.PM = window.PM || {});
