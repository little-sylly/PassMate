/* Session run: which items, where she is, what she did.
   The daily run comes from the plan engine and lives in the store (a refresh resumes it);
   the optional 再练 run lives in memory and never touches the streak. */
(function (PM) {
  'use strict';

  // Debug: #/session?stage=2 previews a stage without saving it.
  function stage() {
    var m = /[?&]stage=([123])\b/.exec(location.hash || '');
    return m ? +m[1] : (PM.store.get().stage || 1);
  }
  function wantsExtra() { return /[?&]extra=1\b/.test(location.hash || ''); }

  function exists(it) {
    var k = it.kind;
    return k === 'word' ? PM.content.term(it.id) : k === 'q' ? PM.content.question(it.id)
      : k === 'drill' ? PM.content.drill(it.id) : PM.content.scenario(it.id);
  }

  var extra = null;
  var active = null;   // the run on screen: answers go to it even if midnight passes mid-session

  function run() { return active || PM.session.current(); }

  // Help used on the item on screen (taps + hint), for the stage-3 check.
  function cur(r) {
    if (!r.cur || r.cur.i !== r.i) r.cur = {i: r.i, taps: 0, hint: 0};
    return r.cur;
  }

  // The day counts as soon as the last item is answered, so leaving before the results screen
  // does not lose the streak. 看今天的结果 (finish) then only marks the run done.
  function creditLast(r) {
    if (r.extra || r.streakCredited || r.i !== r.items.length - 1) return;
    r.streakAdded = PM.plan.finishDay(r.date);
    r.streakCredited = true;
  }

  PM.session = {
    stage: stage,
    current: function () {
      if (!wantsExtra()) return PM.plan.todayRun();
      if (!extra || extra.date !== PM.dates.iso()) extra = PM.plan.extraRun();
      return extra;
    },
    // On entering the session screen: drop items the content no longer has, and step past an
    // item answered just before a refresh so it is not shown (or recorded) twice.
    resume: function () {
      var r = active = this.current();
      if (!r.done) {
        r.items = r.items.filter(exists);
        while (r.i < r.items.length && r.results.some(function (x) { return x.i === r.i; })) r.i++;
      }
      return r;
    },
    isExtra: function () { return wantsExtra(); },
    startExtra: function () { active = extra = PM.plan.extraRun(); },
    leave: function () { if (active && active.extra) extra = null; active = null; PM.store.save(); },
    advance: function () { run().i++; PM.store.save(); },

    // A tap on an underlined word or the word card's 看中文 (onCard).
    tap: function (termId, onCard) {
      var r = run();
      r.taps++; cur(r).taps++;
      PM.plan.recordTap(termId, r.date, onCard);
      PM.store.save();
    },
    hint: function () { var r = run(); r.hints++; cur(r).hint = 1; },

    answerWord: function (id, knew) {
      var r = run();
      PM.plan.recordWord(id, knew, r.date);
      r.results.push({i: r.i, kind: 'word', id: id, knew: knew});
      creditLast(r);
      PM.store.save();
    },
    // picked/answer are letters 'a'..'c'. kind: 'q' | 'drill' | 'scenario' | 'twin' (twin: not recorded).
    answerChoice: function (kind, item, picked) {
      var r = run(), ok = picked === item.answer, c = cur(r);
      if (kind !== 'twin') {
        PM.plan.recordChoice(kind, item, ok, c.taps + c.hint, r.date, !!r.extra);
        r.results.push({i: r.i, kind: kind, id: item.id, ok: ok, hint: !!c.hint});
        creditLast(r);
      }
      PM.store.save();
      return ok;
    },
    // A flag keeps the Chinese she was reading (PM.share.snapshot), so Sam gets the text itself.
    flag: function (id, note, where) {
      var s = PM.store.get();
      (s.flags = s.flags || []).push(PM.share.makeFlag(id, note, where));
      PM.store.save();
    },

    // Mark the day done (the daily run only). The streak forgives one missed day a week.
    finish: function () {
      var r = run();
      r.done = true;
      if (!r.extra && !r.streakCredited) { r.streakAdded = PM.plan.finishDay(r.date); r.streakCredited = true; }
      PM.store.save();
      return r;
    }
  };
})(window.PM = window.PM || {});
