/* Plan engine: what she studies today, and what her answers mean.
   Mastery drives the plan, not a test date (BUILD_PLAN: Plan engine). Pure logic, no DOM.

   Item records (store.items[id]) keep the M2 fields {n, right, taps, last, lastRight, know}
   and gain, where they apply:
     terms      met (first day seen), box (Leitner 1-3), due, rightDays[], troubleDays[],
                lastTrouble, stuck, stuckAt, stuckRight[], stuckShown, again (word card back on)
     questions, drills, scenarios
                repeat {step, due}: a missed item coming back (+1 day, then +3)
   A "trouble day" is a day she missed the word's question, said 还不熟 to a word she had met
   before, or tapped it for help after the day she met it. */
(function (PM) {
  'use strict';
  var D = PM.dates;
  function C() { return PM.config.plan; }
  function S() { return PM.store.get(); }
  function today() { return D.iso(); }

  // ---- content index (ids only, so one index serves both scripts) -------------------------
  var ix = null;
  function index() {
    var terms = PM.content.list('terms');
    if (ix && ix.n === terms.length && ix.first === terms[0]) return ix;
    var questions = PM.content.list('questions'), drills = PM.content.list('drills');
    var x = {n: terms.length, first: terms[0], term: {}, qByTerm: {}, qByFocus: {}, qByAnchor: {}, drillByTerm: {},
      part4: [], scenarios: [], dup: {}, wordingNew: [], contentNew: []};
    function push(map, k, v) { (map[k] = map[k] || []).push(v); }
    terms.forEach(function (t) { x.term[t.id] = t; });
    questions.forEach(function (q) {
      push(x.qByTerm, q.term_id, q.id);
      (q.wording_focus || []).forEach(function (w) { push(x.qByFocus, w, q.id); });
      var a = q.a || {}, seen = {};
      [].concat.apply(a.q || [], a.o || []).forEach(function (sp) {
        if (!seen[sp[2]]) { seen[sp[2]] = 1; push(x.qByAnchor, sp[2], q.id); }
      });
      if (q.part === 4) x.part4.push(q.id);
      if (q.dup) { x.dup[q.id] = q.dup; x.dup[q.dup] = q.id; }
    });
    drills.forEach(function (d) { push(x.drillByTerm, d.term_id, d.id); });
    x.scenarios = PM.content.list('scenarios').map(function (s) { return s.id; });

    // New-word order: question-wording terms by how often they decide a question, then the
    // Rednote card terms, then the terms with the most questions.
    function n(map, id) { return (map[id] || []).length; }
    var wordingSeen = {};
    questions.forEach(function (q) { (q.wording_terms || []).forEach(function (w) { wordingSeen[w] = (wordingSeen[w] || 0) + 1; }); });
    x.wordingNew = terms.filter(function (t) { return t.part === 5; }).map(function (t) { return t.id; }).sort(function (a, b) {
      return n(x.qByFocus, b) - n(x.qByFocus, a) || (wordingSeen[b] || 0) - (wordingSeen[a] || 0) || (a < b ? -1 : 1);
    });
    x.contentNew = terms.filter(function (t) { return t.part !== 5; }).map(function (t) { return t.id; }).sort(function (a, b) {
      var ca = x.term[a].card || 99, cb = x.term[b].card || 99;
      return ca - cb || n(x.qByTerm, b) - n(x.qByTerm, a) || (a < b ? -1 : 1);
    });
    ix = x;
    return x;
  }

  function kindOf(id) { return /^PQ/.test(id) ? 'q' : /^QW/.test(id) ? 'drill' : /^VS/.test(id) ? 'scenario' : 'word'; }
  function itemOf(id) {
    var k = kindOf(id);
    return k === 'q' ? PM.content.question(id) : k === 'drill' ? PM.content.drill(id)
      : k === 'scenario' ? PM.content.scenario(id) : PM.content.term(id);
  }

  // ---- records ------------------------------------------------------------------------------
  function rec(id) {
    var items = S().items;
    return items[id] || (items[id] = {n: 0, right: 0, taps: 0, last: null, lastRight: null, know: null});
  }
  function peek(id) { return S().items[id] || null; }
  function addDay(r, key, d) {
    var a = r[key] || (r[key] = []);
    if (a[a.length - 1] !== d) a.push(d);
    if (a.length > 12) a.splice(0, a.length - 12);
  }
  function before(a, b) { return a && a < b; }

  function meet(id, d) {
    var r = rec(id);
    if (!r.met) { r.met = d; r.box = 1; r.due = D.add(d, C().boxDays[1]); }
    return r;
  }

  function trouble(id, d) {
    var r = rec(id);
    addDay(r, 'troubleDays', d);
    r.lastTrouble = d;
    if (r.stuck) r.stuckRight = [];
    else if (r.troubleDays.length >= C().stuckDays) { r.stuck = true; r.stuckAt = d; r.stuckRight = []; }
  }

  function termResult(id, ok, d, extra) {
    if (!PM.content.term(id)) return;
    var r = meet(id, d), boxDays = C().boxDays;
    if (ok) {
      addDay(r, 'rightDays', d);
      if (r.stuck) {
        addDay(r, 'stuckRight', d);
        if (r.stuckRight.length >= C().stuckClearDays) {
          r.stuck = false; r.stuckRight = []; r.troubleDays = []; r.unstuck = d;
        }
      }
      if (!extra && r.due && r.due <= d) {
        r.box = Math.min(boxDays.length - 1, (r.box || 1) + 1);
        r.due = D.add(d, boxDays[r.box]);
      }
    } else {
      trouble(id, d);
      r.box = 1; r.due = D.add(d, boxDays[1]);
    }
  }

  // Terms with no question or drill (e.g. A079 'term') can only be checked on the word card.
  function cardOnly(id) {
    var x = index();
    return !(x.qByTerm[id] || x.qByFocus[id] || x.drillByTerm[id]);
  }

  function logAnswer(entry) {
    var log = S().log || (S().log = []);
    log.push(entry);
    if (log.length > C().logSize) log.splice(0, log.length - C().logSize);
  }

  // ---- events (called by the session; d is the run's day) -------------------------------------
  function recordWord(id, knew, d) {
    var r = rec(id), metBefore = before(r.met, d);
    r.n++; r.know = knew; r.last = d;
    if (r.stuck) r.stuckShown = d;        // rotation: other stuck words go first next time
    meet(id, d);
    if (!knew) {
      r.again = D.add(d, 1);                 // the card itself comes back tomorrow
      if (metBefore) { trouble(id, d); r.box = 1; r.due = D.add(d, C().boxDays[1]); }
    } else {
      r.again = null;
      if (cardOnly(id)) termResult(id, true, d);
    }
  }

  // A tap on an underlined word (or the word card's 看中文). Only counts as trouble after the
  // day she met the word: looking up a word on its first day is how she learns it.
  function recordTap(id, d, onCard) {
    var r = rec(id);
    r.taps++;
    if (!onCard && before(r.met, d)) trouble(id, d);
  }

  // kind: 'q' | 'drill' | 'scenario'. help = taps + hint on this item. extra = 再练 run.
  function recordChoice(kind, item, ok, help, d, extra) {
    var r = rec(item.id), rep = C().repeatDays, s = S();
    r.n++; if (ok) r.right++; r.last = d; r.lastRight = ok;
    if (!ok) r.repeat = {step: 0, due: D.add(d, rep[0])};
    else if (r.repeat && r.repeat.due <= d) {             // due: counts in 再练 too
      var step = r.repeat.step + 1;
      r.repeat = step < rep.length ? {step: step, due: D.add(d, rep[step])} : null;
    }
    logAnswer({d: d, k: kind, id: item.id, ok: ok, h: help || 0, p: item.part || (kind === 'scenario' ? 4 : 0), st: s.stage || 1});

    termResult(item.term_id, ok, d, extra);
    // The question's wording (NOT, EXCEPT...): a right answer counts for it; a miss goes to the
    // wording-trap count (3 brings a drill), not to "stuck", since the miss may be the fact.
    if (kind === 'q') {
      (item.wording_focus || []).forEach(function (w) {
        if (w === item.term_id) return;
        if (ok) termResult(w, true, d, extra);
        else s.wording[w] = (s.wording[w] || 0) + 1;
      });
    }
    if (kind === 'drill') s.wording[item.term_id] = 0;
  }

  // ---- state queries -------------------------------------------------------------------------
  function isMastered(id, d) {
    var r = peek(id), m = PM.config.mastered;
    if (!r || r.stuck || !r.rightDays || r.rightDays.length < m.rightOnDays) return false;
    return !r.lastTrouble || D.daysBetween(r.lastTrouble, d || today()) >= m.noMissInLastDays;
  }
  function masteredCount(d) {
    var items = S().items, n = 0;
    for (var id in items) if (/^A\d/.test(id) && isMastered(id, d)) n++;
    return n;
  }
  function metCount() {
    var items = S().items, n = 0;
    for (var id in items) if (/^A\d/.test(id) && items[id].met) n++;
    return n;
  }
  function stuckIds() {
    var items = S().items, out = [];
    for (var id in items) if (items[id].stuck && PM.content.term(id)) out.push(id);
    return out;
  }
  // Missed questions, drills and scenarios still on their way back (the review list).
  function repeats() {
    var items = S().items, out = [];
    for (var id in items) if (items[id].repeat && itemOf(id)) out.push(id);
    return out.sort(function (a, b) { return items[a].repeat.due < items[b].repeat.due ? -1 : items[a].repeat.due > items[b].repeat.due ? 1 : (a < b ? -1 : 1); });
  }

  function sprint(d) {
    var t = S().testDate;
    if (!t) return false;
    var n = D.daysBetween(d || today(), t);
    return n >= 0 && n <= PM.config.sprintDays;
  }

  // ---- seeded random, so a day's draw is stable -----------------------------------------------
  function rng(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- the daily draw --------------------------------------------------------------------------
  // Returns [{kind, id, why}] : words, then questions (and drills), then the scenario.
  // why: stuck | confuse | again | new | review | weak  (words)
  //      stuck | repeat | wording | review | new | more | values  (questions)
  // No side effects, so Done can preview tomorrow with draw(tomorrow).
  function draw(d) {
    var x = index(), s = S(), cfg = C(), sess = PM.config.session;
    var stage = s.stage || 1, inSprint = sprint(d), rand = rng('pm' + d);
    var used = {}, words = [], qs = [], scenario = null, drills = 0;
    var items = s.items;

    // Repair work (stuck words, repeat mistakes, 还不熟 cards) has a budget, so new words and
    // reviews keep moving and a bad week never becomes a wall of failures. Sprint week lifts it.
    var unmetLeft = x.wordingNew.concat(x.contentNew).some(function (id) { return !(items[id] && items[id].met); });
    var wordRepair = inSprint || !unmetLeft ? sess.words : sess.words - cfg.minNewWords;
    var qRepair = inSprint ? sess.questions : cfg.repairQuestions;
    var REPAIR = {stuck: 1, confuse: 1, again: 1, repeat: 1, wording: 1};
    var nWordRepair = 0, nQRepair = 0;

    function addWord(id, why) {
      if (used[id] || words.length >= sess.words || !x.term[id]) return false;
      if (REPAIR[why]) { if (nWordRepair >= wordRepair) return false; nWordRepair++; }
      used[id] = 1; words.push({kind: 'word', id: id, why: why});
      return true;
    }
    function addQ(id, why) {
      if (!id || used[id] || qs.length >= sess.questions) return false;
      var k = kindOf(id);
      if (REPAIR[why] && nQRepair >= qRepair) return false;
      if (k === 'drill') { if (drills >= cfg.maxDrills) return false; drills++; }
      if (REPAIR[why]) nQRepair++;
      used[id] = 1; qs.push({kind: k, id: id, why: why});
      return true;
    }
    function seen(id) { var r = items[id]; return !!(r && r.n); }
    function pending(id) { var r = items[id]; return !!(r && r.repeat); }
    function dupTaken(id) { var o = x.dup[id]; return !!(o && (seen(o) || used[o])); }

    function wantDifficulty() {
      if (stage === 1) return rand() < 0.4 ? 1 : 2;
      var mix = cfg.difficultyMix, r = rand(), acc = 0;
      for (var k in mix) { acc += mix[k]; if (r < acc) return +k; }
      return 2;
    }

    // A question (or drill) for term `id`: unseen first at the right difficulty, else the one
    // seen longest ago. Items waiting as repeat mistakes come back by their own schedule.
    function questionFor(id, o) {
      o = o || {};
      var t = x.term[id];
      if (!t) return null;
      var c = [];
      if (t.part === 5 && o.drill !== false && drills < cfg.maxDrills) c = c.concat(x.drillByTerm[id] || []);
      c = c.concat(t.part === 5 ? (x.qByFocus[id] || []) : (x.qByTerm[id] || []));
      if (!c.length && o.anchor) c = x.qByAnchor[id] || [];
      c = c.filter(function (q) {
        return !used[q] && !pending(q) && !dupTaken(q) && !(o.maxDiff && (itemOf(q).difficulty || 1) > o.maxDiff);
      });
      if (!c.length) return null;
      var fresh = c.filter(function (q) { return !seen(q); });
      if (fresh.length) {
        var want = wantDifficulty();
        fresh.sort(function (a, b) {
          var ia = itemOf(a), ib = itemOf(b);
          var da = Math.abs((ia.difficulty || 2) - want), db = Math.abs((ib.difficulty || 2) - want);
          if (stage === 1) { da += (ia.difficulty || 2) > 2 ? 5 : 0; db += (ib.difficulty || 2) > 2 ? 5 : 0; }
          return da - db || (a < b ? -1 : 1);
        });
        return fresh[0];
      }
      c.sort(function (a, b) { return items[a].last < items[b].last ? -1 : items[a].last > items[b].last ? 1 : (a < b ? -1 : 1); });
      return c[0];
    }

    // 1. Stuck words first: the word, a question that uses it, and the words it gets confused with.
    var stuck = stuckIds().sort(function (a, b) {
      var ra = items[a], rb = items[b];
      return (ra.stuckShown || '') < (rb.stuckShown || '') ? -1 : (ra.stuckShown || '') > (rb.stuckShown || '') ? 1
        : (ra.stuckAt < rb.stuckAt ? -1 : ra.stuckAt > rb.stuckAt ? 1 : 0);
    }).slice(0, cfg.maxStuck);
    var confuseEach = stuck.length > 1 ? 1 : cfg.confusePerStuck;
    var dueReps = repeats().filter(function (id) { return items[id].repeat.due <= d; });
    stuck.forEach(function (id) {
      addWord(id, 'stuck');
      // Its own missed question when one is due (one item does both jobs), else a fresh one.
      var own = dueReps.filter(function (q) {
        var it = itemOf(q);
        return kindOf(q) !== 'scenario' && (it.term_id === id || (it.wording_focus || []).indexOf(id) !== -1);
      })[0];
      addQ(own || questionFor(id, {anchor: true, drill: false}) || questionFor(id, {anchor: true}), 'stuck');
    });
    stuck.forEach(function (id) {
      (x.term[id].confuse || []).slice(0, confuseEach).forEach(function (c) { addWord(c, 'confuse'); });
    });

    // A wording trap missed 3 times brings its drill (before plain repeats: it fixes several).
    Object.keys(s.wording || {}).filter(function (w) { return s.wording[w] >= cfg.wordingTrapMisses; })
      .sort(function (a, b) { return s.wording[b] - s.wording[a]; })
      .forEach(function (w) {
        var dr = (x.drillByTerm[w] || []).filter(function (q) { return !used[q] && !pending(q); });
        dr.sort(function (a, b) {
          var la = (items[a] || {}).last || '', lb = (items[b] || {}).last || '';
          return la < lb ? -1 : la > lb ? 1 : (a < b ? -1 : 1);   // never seen ('') first
        });
        if (dr.length) addQ(dr[0], 'wording');
      });

    // 2. Repeat mistakes that are due (questions, drills; a scenario takes the scenario slot).
    dueReps.forEach(function (id) {
      if (kindOf(id) === 'scenario') { if (!scenario) scenario = {kind: 'scenario', id: id, why: 'repeat'}; return; }
      addQ(id, 'repeat');
    });

    // Word cards she said 还不熟 to come back the next day.
    Object.keys(items).filter(function (id) { var r = items[id]; return r.again && r.again <= d && x.term[id]; })
      .sort(function (a, b) { return items[a].again < items[b].again ? -1 : 1; })
      .forEach(function (id) { addWord(id, 'again'); });

    function metNotMastered() {
      return Object.keys(items).filter(function (id) { return x.term[id] && items[id].met && !isMastered(id, d); });
    }
    function weakest(list) {
      return list.sort(function (a, b) {
        var ra = items[a], rb = items[b];
        var ta = ra.lastTrouble || '', tb = rb.lastTrouble || '';
        return (ra.rightDays || []).length - (rb.rightDays || []).length || (ta > tb ? -1 : ta < tb ? 1 : (a < b ? -1 : 1));
      });
    }

    if (inSprint) {
      // Final week: only stuck words, repeat mistakes and values; shaky words fill the cards.
      weakest(metNotMastered()).forEach(function (id) { addWord(id, 'weak'); });
      var p4 = x.part4.filter(function (q) { return !used[q] && !pending(q); });
      p4.sort(function (a, b) {
        var la = (items[a] || {}).last || '', lb = (items[b] || {}).last || '';
        return la < lb ? -1 : la > lb ? 1 : (a < b ? -1 : 1);
      });
      p4.forEach(function (q) { addQ(q, 'values'); });
    } else {
      // 3. New words (question-wording and card terms first), only while today has room.
      var newWords = [], wordingLeft = cfg.newWordingPerSession;
      x.wordingNew.forEach(function (id) {
        if (wordingLeft > 0 && !(items[id] && items[id].met) && addWord(id, 'new')) { newWords.push(id); wordingLeft--; }
      });
      x.contentNew.forEach(function (id) {
        if (!(items[id] && items[id].met) && addWord(id, 'new')) newWords.push(id);
      });
      // Everything met: word cards review the shakiest words.
      if (words.length < sess.words) weakest(metNotMastered()).forEach(function (id) { addWord(id, 'review'); });

      // 4. Reviews due (Leitner): one question per due word, taking boxes in turn so new
      // words' first check and older words' longer checks both keep moving.
      var due = {1: [], 2: [], 3: []};
      Object.keys(items).forEach(function (id) {
        var r = items[id];
        if (x.term[id] && r.met && r.due && r.due <= d && due[r.box]) due[r.box].push(id);
      });
      [1, 2, 3].forEach(function (b) {
        due[b].sort(function (p, q) { return items[p].due < items[q].due ? -1 : items[p].due > items[q].due ? 1 : (p < q ? -1 : 1); });
      });
      var turn = 0;
      while (qs.length < sess.questions && (due[1].length || due[2].length || due[3].length)) {
        var b = [1, 2, 3][turn++ % 3];
        if (!due[b].length) continue;
        var tid = due[b].shift();
        if (!addQ(questionFor(tid), 'review') && cardOnly(tid)) addWord(tid, 'review');
      }

      // 5. New questions: today's new words first, then more on words already met.
      newWords.forEach(function (id) { addQ(questionFor(id, {maxDiff: stage === 1 ? 2 : 0}), 'new'); });
      if (qs.length < sess.questions) {
        weakest(metNotMastered()).forEach(function (id) { addQ(questionFor(id), 'more'); });
      }
    }
    // Last resort: any question not yet seen (stage 1: difficulty 1-2 only).
    if (qs.length < sess.questions) {
      PM.content.list('questions').forEach(function (q) {
        if (!seen(q.id) && !pending(q.id) && !dupTaken(q.id) && (stage > 1 || q.difficulty < 3)) addQ(q.id, 'more');
      });
    }

    // 6. The values scenario: a missed one when due, else one not yet seen, else the oldest.
    if (!scenario) {
      var sc = x.scenarios.filter(function (id) { return !pending(id); });
      var unseen = sc.filter(function (id) { return !seen(id); });
      var pick = null;
      if (unseen.length) {
        // prefer a scenario on a word she has met; otherwise the next in order
        var metOnes = unseen.filter(function (id) { var t = PM.content.scenario(id).term_id; return items[t] && items[t].met; });
        pick = (metOnes.length ? metOnes : unseen)[0];
      } else if (sc.length) {
        sc.sort(function (a, b) { return items[a].last < items[b].last ? -1 : items[a].last > items[b].last ? 1 : 0; });
        pick = sc[0];
      }
      if (pick) scenario = {kind: 'scenario', id: pick, why: seen(pick) ? 'review' : 'new'};
    }

    return words.concat(qs, scenario ? [scenario] : []);
  }

  // Today's run: drawn once per day and kept, so a refresh resumes where she was.
  function todayRun() {
    var s = S(), d = today();
    if (!s.run || s.run.date !== d) {
      s.run = {date: d, items: draw(d), i: 0, results: [], taps: 0, hints: 0, done: false,
        streakAdded: false, masteredAtStart: masteredCount(d)};
      PM.store.save();
    }
    return s.run;
  }

  // 再练 5 道错题: from the review list; never touches the streak or the schedule (except misses).
  function extraRun() {
    var d = today();
    var ids = repeats().slice(0, C().extraQuestions);
    return {date: d, extra: true, items: ids.map(function (id) { return {kind: kindOf(id), id: id, why: 'repeat'}; }),
      i: 0, results: [], taps: 0, hints: 0, done: false, streakAdded: false, masteredAtStart: masteredCount(d)};
  }

  // ---- streak with weekly forgiveness ---------------------------------------------------------
  // Walk back from today (unfinished today is not a miss). A missed day is forgiven when no
  // other forgiven day is within 7 days of it; a second miss ends the streak.
  function streak(d) {
    d = d || today();
    var st = S().streak, days = st.days, keys = Object.keys(days).sort(), every = PM.config.streak.forgiveEvery;
    var n = 0, saved = [], cur = days[d] ? d : D.add(d, -1);
    if (keys.length) {
      while (cur >= keys[0]) {
        if (days[cur]) n++;
        else if (!saved.length || D.daysBetween(cur, saved[saved.length - 1]) >= every) saved.push(cur);
        else break;
        cur = D.add(cur, -1);
      }
    }
    // A forgiven day only shows while there is a streak it saved (and never past the first day).
    while (saved.length && saved[saved.length - 1] < keys[0]) saved.pop();
    st.count = n;
    st.saved = {};
    if (n) saved.forEach(function (k) { st.saved[k] = 1; });
    return st;
  }

  function finishDay(d) {
    var st = S().streak;
    var added = !st.days[d];
    st.days[d] = 1;
    streak(d);
    return added;
  }

  // ---- stages ---------------------------------------------------------------------------------
  // Questions answered at `minStage` or later (stage 3 is judged on answers without the gist).
  function recentQuestions(n, minStage) {
    var log = (S().log || []).filter(function (e) { return (e.k === 'q' || e.k === 'drill') && (e.st || 1) >= minStage; });
    return log.slice(-n);
  }
  function eligible(stage) {
    var rule = PM.config.stages[stage];
    if (!rule) return false;
    var last = recentQuestions(rule.overLast, stage - 1);
    if (last.length < rule.overLast) return false;
    var right = last.filter(function (e) { return e.ok; }).length / last.length;
    if (right < rule.minRight) return false;
    if (rule.minWordsMet && metCount() < rule.minWordsMet) return false;
    if (rule.maxTapsPerQuestion != null) {
      var help = last.reduce(function (a, e) { return a + (e.h || 0); }, 0) / last.length;
      if (help >= rule.maxTapsPerQuestion) return false;
    }
    return true;
  }
  // The step up to offer on Today, or null. She accepts it; "先不用" snoozes it for a few days.
  function offer(d) {
    var s = S(), next = (s.stage || 1) + 1;
    if (next > 3 || !eligible(next)) return null;
    if (s.offer && s.offer.stage === next && s.offer.declined && D.daysBetween(s.offer.declined, d || today()) < C().offerSnoozeDays) return null;
    return next;
  }
  function acceptStage(n) { PM.store.set({stage: n, offer: null}); }
  function declineStage(n) { PM.store.set({offer: {stage: n, declined: today()}}); }

  // ---- ready to sit (the checklist; Progress tab in M5) -----------------------------------------
  function readiness(d) {
    var s = S(), r = PM.config.readyToSit, log = s.log || [];
    var parts = [1, 2, 3, 4].map(function (p) {
      var a = log.filter(function (e) { return e.p === p; }).slice(-r.partOverLast);
      var ok = a.filter(function (e) { return e.ok; }).length;
      return {part: p, answers: a.length, right: a.length ? ok / a.length : 0,
        ok: a.length >= r.partMinAnswers && ok / a.length >= r.partRight};
    });
    var mocks = (s.mocks || []).slice(-r.mocksInARow);
    var list = [
      {key: 'parts', ok: parts.every(function (p) { return p.ok; }), parts: parts},
      {key: 'gate', ok: !!(s.gate && s.gate.cleared)},
      {key: 'mocks', ok: mocks.length === r.mocksInARow && mocks.every(function (m) { return m.pass && m.english; })},
      {key: 'stuck', ok: stuckIds().length === 0, n: stuckIds().length},
      {key: 'mastered', ok: masteredCount(d) >= r.wordsMastered, n: masteredCount(d), need: r.wordsMastered}
    ];
    return {ready: list.every(function (c) { return c.ok; }), list: list};
  }

  PM.plan = {
    index: index, draw: draw, todayRun: todayRun, extraRun: extraRun,
    recordWord: recordWord, recordTap: recordTap, recordChoice: recordChoice,
    isMastered: isMastered, masteredCount: masteredCount, metCount: metCount,
    stuckIds: stuckIds, repeats: repeats, sprint: sprint,
    streak: streak, finishDay: finishDay,
    eligible: eligible, offer: offer, acceptStage: acceptStage, declineStage: declineStage,
    readiness: readiness, kindOf: kindOf, itemOf: itemOf
  };
})(window.PM = window.PM || {});
