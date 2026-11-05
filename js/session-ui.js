/* Session screens: word card, question, values scenario, done, plus the word sheet and flag sheet. */
(function (PM) {
  'use strict';
  var h = PM.dom.h, icon = PM.dom.icon, mixed = PM.dom.mixed;
  var T = function (p, v) { return PM.content.ui(p, v); };
  var LETTERS = ['a', 'b', 'c'];

  // ---- anchored English text: underline the spans, each a tap target ----------------
  // Spans, not <button>s: a button is an atomic box, so a long term ("Aboriginal and Torres
  // Strait Islander peoples") could not wrap with the sentence. `seen` keeps the tapped tint.
  function anchored(text, spans, onTap, seen) {
    var out = [], pos = 0;
    (spans || []).slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (sp) {
      if (sp[0] < pos || sp[1] > text.length || !PM.content.term(sp[2])) return;
      if (sp[0] > pos) out.push(text.slice(pos, sp[0]));
      var go = function (e) { e.stopPropagation(); if (seen) seen[sp[2]] = 1; e.currentTarget.classList.add('anchor-seen'); onTap(sp[2], e.currentTarget); };
      out.push(h('span', {
        class: 'anchor' + (seen && seen[sp[2]] ? ' anchor-seen' : ''), role: 'button', tabindex: '0',
        onclick: go,
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }
      }, text.slice(sp[0], sp[1])));
      pos = sp[1];
    });
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }

  // ---- bottom sheet (word sheet, flag, exit confirm) --------------------------------
  var openSheetEl = null;
  function closeSheet() {
    if (!openSheetEl) return;
    var s = openSheetEl; openSheetEl = null;
    document.removeEventListener('keydown', s.key);
    var app = document.getElementById('app');
    app.removeAttribute('aria-hidden');
    if (s.opener && document.body.contains(s.opener)) s.opener.focus({preventScroll: true});
    if (s.node.parentNode) s.node.parentNode.removeChild(s.node);
  }

  function openSheet(label, body, opener) {
    closeSheet();
    var panel = h('div', {class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': label}, [
      h('div', {class: 'sheet-grip', 'aria-hidden': 'true'}), body
    ]);
    var layer = h('div', {class: 'sheet-layer'}, [
      h('div', {class: 'sheet-backdrop', onclick: closeSheet}), panel
    ]);
    var key = function (e) { if (e.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', key);
    document.body.appendChild(layer);
    document.getElementById('app').setAttribute('aria-hidden', 'true');
    openSheetEl = {node: layer, key: key, opener: opener};
    var first = panel.querySelector('.sheet-focus') || panel.querySelector('button, textarea');
    if (first) first.focus({preventScroll: true});
  }

  // lookOnly: opened from the Review tab, so it is not a tap for help (no trouble day).
  function wordSheet(termId, opener, lookOnly) {
    var t = PM.content.term(termId);
    if (!t) return;
    if (!lookOnly) PM.session.tap(termId);
    var head = PM.content.shortTerm(t);
    openSheet(head, h('div', {class: 'sheet-body'}, [
      h('div', {class: 'headword-row'}, [h('h2', {class: 'headword' + (head.length > 16 ? ' headword-long' : ''), lang: 'en'}, head),
        t.term !== head ? h('span', {class: 'headword-full', lang: 'en'}, t.term) : null]),
      entry(t),
      h('button', {class: 'btn btn-quiet sheet-focus', type: 'button', onclick: closeSheet}, T('session.sheetClose')),
      flagLink(termId, lookOnly ? 'review' : 'sheet')
    ]), opener);
  }

  // Numbered senses: ① meaning, ② trap
  function entry(t) {
    return h('div', {class: 'entry'}, [
      h('div', {class: 'sense'}, [
        h('span', {class: 'sense-num', 'aria-hidden': 'true'}, '1'),
        h('div', null, [h('div', {class: 'sense-zh'}, mixed(t.zh)), h('p', null, mixed(t.explain))])
      ]),
      t.trap ? h('div', {class: 'sense'}, [
        h('span', {class: 'sense-num', 'aria-hidden': 'true'}, '2'),
        h('div', null, [h('span', {class: 'label-tag'}, T('session.trapLabel')), h('p', {class: 'sense-trap'}, mixed(t.trap))])
      ]) : null
    ]);
  }

  function flagSheet(itemId, opener, where) {
    var note = h('textarea', {class: 'field note-field', rows: '3', maxlength: '400', 'aria-label': T('session.flagNote'), placeholder: T('session.flagNote')});
    var body = h('div', {class: 'sheet-body'}, [
      h('h2', {class: 'sheet-title'}, T('session.flagTitle')),
      note,
      h('button', {
        class: 'btn', type: 'button',
        onclick: function () {
          PM.session.flag(itemId, note.value.trim(), where);
          body.removeChild(note); body.removeChild(save);
          body.appendChild(h('p', {role: 'status'}, T('session.flagSaved')));
          body.appendChild(h('button', {class: 'btn btn-quiet sheet-focus', type: 'button', onclick: closeSheet}, T('session.sheetClose')));
          body.lastChild.focus();
        }
      }, T('session.flagSave'))
    ]);
    var save = body.lastChild;
    openSheet(T('session.flagTitle'), body, opener);
  }

  function exitSheet(opener) {
    openSheet(T('session.exitTitle'), h('div', {class: 'sheet-body'}, [
      h('h2', {class: 'sheet-title'}, T('session.exitTitle')),
      h('p', null, T('session.exitBody')),
      h('button', {class: 'btn sheet-focus', type: 'button', onclick: closeSheet}, T('session.exitStay')),
      h('button', {
        class: 'btn btn-quiet', type: 'button',
        onclick: function () { closeSheet(); PM.session.leave(); PM.router.go('today'); }
      }, T('session.exitGo'))
    ]), opener);
  }

  // ---- screen chrome ---------------------------------------------------------------
  function slot(kind) { return kind === 'drill' ? 'q' : kind; }
  function counts(run) {
    var c = {word: 0, q: 0, scenario: 0};
    run.items.forEach(function (it) { c[slot(it.kind)]++; });
    return c;
  }

  function position(run) {
    var it = run.items[run.i], k = slot(it.kind), c = counts(run), n = 0;
    for (var j = 0; j <= run.i; j++) if (slot(run.items[j].kind) === k) n++;
    var key = k === 'word' ? 'posWord' : k === 'q' ? 'posQuestion' : 'posScenario';
    return T('session.' + key, {n: n, m: c[k]});
  }

  function topBar(run) {
    var segs = run.items.map(function (_, j) {
      return h('span', {class: 'seg' + (j < run.i ? ' seg-done' : j === run.i ? ' seg-now' : '')});
    });
    return h('div', {class: 'topbar'}, [
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': T('session.exitAria'),
        onclick: function (e) { exitSheet(e.currentTarget); }
      }, icon(24, ['M6 6l12 12M18 6L6 18'])),
      h('div', {
        class: 'segs', role: 'progressbar', 'aria-label': T('session.progressAria'),
        'aria-valuemin': '0', 'aria-valuemax': String(run.items.length), 'aria-valuenow': String(run.i)
      }, segs),
      h('span', {class: 'pos num'}, position(run))
    ]);
  }

  // where (for Sam's list): card | sheet | q | drill | twin | scenario | gate | mock | review
  function flagLink(id, where) {
    return h('button', {
      class: 'flag-link', type: 'button',
      onclick: function (e) { flagSheet(id, e.currentTarget, where); }
    }, [icon(16, ['M5 21V4M5 4h11l-2 4 2 4H5']), T('session.flag')]);
  }

  // The current stage as one thumb-index tab on the right edge (A2).
  function stageTab(stage) {
    return h('div', {class: 'stages sess-stage', role: 'note', 'aria-label': T('stages.aria') + '：' + T('stages.' + stage)},
      [h('div', {class: 'stage stage-on', 'aria-hidden': 'true'}, T('stages.' + stage))]);
  }

  // `foot` = node pinned to the bottom
  function frame(run, main, foot, stage) {
    return [topBar(run), h('main', {class: 'sess-main'}, [stageTab(stage)].concat(main)), h('div', {class: 'foot'}, foot)];
  }

  // ---- word card -------------------------------------------------------------------
  function wordCard(run, it, next, stage) {
    var t = PM.content.term(it.id), head = PM.content.shortTerm(t);
    var revealed = stage === 1, picked = false;
    var detail = h('div', {class: 'word-detail'});
    var foot = h('div', {class: 'foot-inner'});

    function paint() {
      while (detail.firstChild) detail.removeChild(detail.firstChild);
      if (revealed) { detail.appendChild(entry(t)); detail.appendChild(flagLink(it.id, 'card')); }
      else detail.appendChild(h('button', {
        class: 'btn btn-quiet', type: 'button',
        onclick: function () { PM.session.tap(it.id, true); revealed = true; paint(); }
      }, [icon(20, ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z']), ' ' + T('session.showZh')]));
      while (foot.firstChild) foot.removeChild(foot.firstChild);
      if (!picked) {
        foot.appendChild(h('div', {class: 'two'}, [
          h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () { answer(false); }}, T('session.unsure')),
          h('button', {class: 'btn', type: 'button', onclick: function () { answer(true); }}, T('session.know'))
        ]));
      } else {
        foot.appendChild(h('button', {class: 'btn', type: 'button', onclick: next}, nextLabel(run)));
      }
    }
    function answer(knew) {
      PM.session.answerWord(it.id, knew);
      if (knew || revealed) { next(); return; }
      revealed = true; picked = true; paint();   // not sure: show the answer, then move on
    }
    paint();

    var main = [
      whyLine(run, it),
      h('h1', {class: 'headword headword-card' + (head.length > 16 ? ' headword-long' : ''), lang: 'en'}, head),
      t.term !== head ? h('div', {class: 'headword-full', lang: 'en'}, t.term) : null,
      stage > 1 && !revealed ? h('p', {class: 'muted ask'}, T('session.wordAsk')) : null,
      detail
    ];
    return frame(run, main, foot, stage);
  }

  // Why this card is in today's session: a stuck word, a word it gets confused with, a review.
  function whyLine(run, it) {
    var key = {stuck: 'whyStuck', confuse: 'whyConfuse', again: 'whyAgain', review: 'whyReview', weak: 'whyReview'}[it.why];
    if (!key) return null;
    var vars = {};
    if (it.why === 'confuse') {
      var stuck = run.items.filter(function (x) {
        return x.kind === 'word' && x.why === 'stuck' && (PM.content.term(x.id).confuse || []).indexOf(it.id) !== -1;
      })[0];
      if (!stuck) return null;
      vars.word = PM.content.shortTerm(PM.content.term(stuck.id));
    }
    return h('div', {class: 'why why-' + it.why}, mixed(T('session.' + key, vars)));
  }

  function nextLabel(run) {
    var cur = run.items[run.i], nxt = run.items[run.i + 1];
    if (!nxt) return T('session.finish');
    var a = slot(cur.kind), b = slot(nxt.kind);
    if (a === 'word') return b === 'word' ? T('session.nextWord') : b === 'q' ? T('session.startQuestions') : T('session.toScenario');
    if (a === 'q') return b === 'q' ? T('session.nextQuestion') : T('session.toScenario');
    return T('session.finish');
  }

  // ---- question and scenario (one multiple-choice screen) -----------------------------
  // spec (drills): {item, kind: 'drill' | 'twin', kicker, nextText, onNext, flagId}
  function choiceScreen(run, it, next, stage, spec) {
    spec = spec || {};
    var kind = spec.kind || it.kind, isS = kind === 'scenario';
    var item = spec.item || (isS ? PM.content.scenario(it.id) : PM.content.question(it.id));
    var a = item.a || {};
    var picked = null, checked = false, hinted = false, seen = {};
    var root = h('div', {class: 'choice'});

    function tap(id, el) { wordSheet(id, el); }
    function en(text, spans) { return anchored(text, spans, tap, seen); }

    // The gist (Chinese support): shown at stage 1, behind a button at stage 2, absent at stage 3.
    // Drills have no gist: their Chinese step (decode) comes first.
    var gistText = isS ? item.scenario_zh : item.gist_zh;
    function gistBlock() {
      if (!gistText) return null;
      if (stage === 1 || hinted) return h('div', {class: 'gist'}, [h('span', {class: 'gist-label'}, T('session.gistLabel')), mixed(gistText)]);
      if (stage === 2 && !checked) {
        return h('button', {
          class: 'hint-btn', type: 'button',
          onclick: function () { hinted = true; PM.session.hint(); paint(); }
        }, [icon(18, ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z']), T('session.hint')]);
      }
      return null;
    }

    function optionRow(i) {
      var letter = LETTERS[i], text = item.options_en[i];
      var state = '';
      if (checked) state = letter === item.answer ? 'right' : letter === picked ? 'wrong' : 'dim';
      else if (letter === picked) state = 'picked';
      var tag = checked && letter === item.answer ? T('session.correct') : checked && letter === picked ? T('session.yourPick') : null;
      var mark = state === 'right' ? h('span', {class: 'opt-mark'}, icon(16, ['M5 12.5l4.5 4.5L19 7.5']))
        : state === 'wrong' ? h('span', {class: 'opt-mark'}, icon(16, ['M7 7l10 10M17 7L7 17'])) : h('span', {class: 'opt-letter'}, letter);
      var pick = function () { if (!checked) { picked = letter; paint(); } };
      var row = h('div', {class: 'opt opt-' + (state || 'idle'), onclick: pick}, [
        h('button', {
          class: 'opt-btn', type: 'button', disabled: checked ? true : null,
          'aria-pressed': String(letter === picked),
          'aria-label': T('session.optionAria', {letter: letter, text: text}), onclick: function (e) { e.stopPropagation(); pick(); }
        }, mark),
        h('div', {class: 'opt-main'}, [
          tag ? h('span', {class: 'opt-tag opt-tag-top'}, tag) : null,
          h('span', {class: 'opt-text', lang: 'en'}, en(text, a.o && a.o[i])),
          isS && checked ? h('p', {class: 'opt-why'}, mixed(item.why_zh[i])) : null
        ]),
      ]);
      return row;
    }

    function chip() {
      if (!item.chip || !item.term_id) return null;
      var t = PM.content.term(item.term_id);
      if (!t) return null;
      return h('div', {class: 'chip-row'}, [
        h('span', {class: 'chip-label'}, T('session.chipLabel')),
        h('button', {class: 'chip', type: 'button', lang: 'en', onclick: function (e) { tap(item.term_id, e.currentTarget); }}, PM.content.shortTerm(t))
      ]);
    }

    // Verdict, explanation and the review note read as one block under the options (A3).
    // The flag link sits at its end, not in the pinned footer, so the footer stays one button tall.
    function feedback() {
      var ok = picked === item.answer;
      return h('section', {class: 'explain'}, [
        h('div', {class: 'verdict ' + (ok ? 'verdict-ok' : 'verdict-bad'), role: 'status'},
          [icon(18, ok ? ['M5 12.5l4.5 4.5L19 7.5'] : ['M7 7l10 10M17 7L7 17']), ok ? T('session.gotIt') : T('session.missed')]),
        h('h2', {class: 'explain-title'}, isS ? T('session.takeaway') : T('session.whyPick', {letter: item.answer})),
        h('p', {class: 'explain-text'}, mixed(isS ? item.takeaway_zh : item.explain_zh)),
        ok || kind === 'twin' ? null : h('div', {class: 'review-note'}, [icon(18, ['M4 12a8 8 0 108-8 8 8 0 00-5.7 2.4L4 8', 'M4 4v4h4']), T('session.missedNote')]),
        flagLink(spec.flagId || item.id, kind)
      ]);
    }

    function paint() {
      while (root.firstChild) root.removeChild(root.firstChild);
      var stem = isS ? [
        h('div', {class: 'kicker'}, T('session.scenarioLabel')),
        h('p', {class: 'situation', lang: 'en'}, en(item.scenario_en, a.s))
      ] : [h('div', {class: 'kicker'}, spec.kicker || T('session.tapNote'))];
      root.appendChild(h('div', {class: 'stem'}, stem));
      var qEl = h('h1', {class: 'question', lang: 'en', tabindex: '-1'}, en(item.question_en, a.q));
      root.appendChild(qEl);
      var g = gistBlock(); if (g) root.appendChild(g);
      var c = chip(); if (c) root.appendChild(c);
      root.appendChild(h('div', {class: 'opts', role: 'group', 'aria-label': T('session.scenarioQ')}, item.options_en.map(function (_, i) { return optionRow(i); })));
      if (checked) root.appendChild(feedback());

      var foot = footEl;
      while (foot.firstChild) foot.removeChild(foot.firstChild);
      if (!checked) {
        foot.appendChild(h('button', {
          class: 'btn', type: 'button', disabled: picked ? null : true,
          onclick: function () {
            checked = true;
            PM.session.answerChoice(kind, item, picked);
            paint();
            reveal();
          }
        }, T('session.check')));
      } else {
        foot.appendChild(h('button', {class: 'btn', type: 'button', onclick: spec.onNext || next}, spec.nextText || nextLabel(run)));
      }
    }

    // After checking: a scenario's per-option whys are long, so bring the options to the top;
    // a question keeps its stem in view and only scrolls far enough to show the explanation.
    function reveal() {
      var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var target = isS ? root.querySelector('.opts') : root.querySelector('.explain-title');
      if (target) target.scrollIntoView({block: isS ? 'start' : 'nearest', behavior: calm ? 'auto' : 'smooth'});
    }

    var footEl = h('div', {class: 'foot-inner'});
    paint();
    return frame(run, [root], footEl, stage);
  }

  // ---- wording drill: decode the question in Chinese, then answer it, then its twin -------
  function drillScreen(run, it, next, stage, swap) {
    var dr = PM.content.drill(it.id), dc = dr.decode, picked = null, seen = {};
    var tap = function (id, el) { wordSheet(id, el); };
    var box = h('div', {class: 'decode'});
    var foot = h('div', {class: 'foot-inner'});

    function paint() {
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(h('h2', {class: 'decode-q'}, mixed(dc.prompt_zh)));
      box.appendChild(h('div', {class: 'opts', role: 'group', 'aria-label': dc.prompt_zh}, dc.options_zh.map(function (text, i) {
        var letter = LETTERS[i], state = !picked ? 'idle' : letter === dc.answer ? 'right' : letter === picked ? 'wrong' : 'dim';
        var mark = state === 'right' ? h('span', {class: 'opt-mark'}, icon(16, ['M5 12.5l4.5 4.5L19 7.5']))
          : state === 'wrong' ? h('span', {class: 'opt-mark'}, icon(16, ['M7 7l10 10M17 7L7 17'])) : h('span', {class: 'opt-letter'}, letter);
        var pick = function () { if (!picked) { picked = letter; paint(); } };
        return h('div', {class: 'opt opt-' + state, onclick: pick}, [
          h('button', {class: 'opt-btn', type: 'button', disabled: picked ? true : null, 'aria-label': letter + '：' + text,
            onclick: function (e) { e.stopPropagation(); pick(); }}, mark),
          h('div', {class: 'opt-main'}, h('span', {class: 'opt-text'}, mixed(text)))
        ]);
      })));
      if (picked) {
        box.appendChild(h('div', {class: 'gist', role: 'status'}, [
          h('span', {class: 'gist-label'}, picked === dc.answer ? T('session.decodeRight') : T('session.decodeWrong')),
          mixed(dr.tip_zh)
        ]));
      }
      while (foot.firstChild) foot.removeChild(foot.firstChild);
      foot.appendChild(h('button', {class: 'btn', type: 'button', disabled: picked ? null : true, onclick: answer}, T('session.decodeGo')));
    }

    function answer() {
      swap(choiceScreen(run, it, next, stage, {
        item: dr, kind: 'drill', kicker: T('session.drillAnswer'),
        nextText: dr.twin ? T('session.twinGo') : null, onNext: dr.twin ? twin : null
      }));
    }
    function twin() {
      var tw = dr.twin, item = {id: dr.id + '.twin', term_id: dr.term_id, question_en: tw.question_en, options_en: tw.options_en,
        answer: tw.answer, explain_zh: tw.explain_zh, a: tw.a, chip: tw.chip};
      swap(choiceScreen(run, it, next, stage, {
        item: item, kind: 'twin', flagId: dr.id,
        kicker: T(tw.kind === 'flip' ? 'session.twinFlip' : 'session.twinContrast')
      }));
    }

    paint();
    var main = [
      h('div', {class: 'kicker'}, T('session.drillKicker')),
      h('h1', {class: 'question', lang: 'en', tabindex: '-1'}, anchored(dr.question_en, (dr.a || {}).q, tap, seen)),
      box
    ];
    return frame(run, main, foot, stage);
  }

  // ---- done (A4) ------------------------------------------------------------------------
  function squares(n, m) {
    var out = [];
    for (var k = 0; k < m; k++) out.push(h('span', {class: 'sq' + (k < n ? ' sq-on' : '')}));
    return h('span', {class: 'squares', 'aria-hidden': 'true'}, out);
  }

  // Stuck words and wording drills from today's run, each with where it stands now.
  function tackled(run) {
    var s = PM.store.get(), need = PM.config.plan.stuckClearDays, rows = [];
    run.items.forEach(function (it) {
      if (it.why === 'stuck' && it.kind === 'word') {
        var r = s.items[it.id] || {}, t = PM.content.term(it.id);
        var cleared = !r.stuck, n = cleared ? need : (r.stuckRight || []).length;
        rows.push(h('li', {class: 'tk'}, [
          h('span', {class: 'tk-text'}, [
            h('span', {class: 'tk-term', lang: 'en'}, PM.content.shortTerm(t)),
            h('span', {class: 'tk-sub'}, cleared ? T('session.stuckCleared')
              : n ? T('session.stuckProgress', {n: n, m: need - n}) : T('session.stuckStart', {m: need}))
          ]),
          squares(n, need)
        ]));
      }
    });
    run.results.forEach(function (r) {
      var it = run.items[r.i];
      if (r.kind !== 'drill' || !it || it.why !== 'wording') return;
      var w = PM.content.term(PM.content.drill(r.id).term_id);
      rows.push(h('li', {class: 'tk'}, [
        h('span', {class: 'tk-text'}, [
          h('span', {class: 'tk-term'}, mixed(T('session.drillRow', {word: PM.content.shortTerm(w)}))),
          h('span', {class: 'tk-sub'}, r.ok ? T('session.drillOk') : T('session.drillAgain'))
        ]),
        r.ok ? h('span', {class: 'tk-ok'}, icon(18, ['M5 12.5l4.5 4.5L19 7.5'])) : null
      ]));
    });
    return rows;
  }

  // "明天先练 Premier 和 Commonwealth", from a preview of tomorrow's draw.
  function tomorrowLine(run) {
    var items = PM.plan.draw(PM.dates.add(run.date, 1));
    var stuck = items.filter(function (x) { return x.why === 'stuck' && x.kind === 'word'; })
      .map(function (x) { return PM.content.shortTerm(PM.content.term(x.id)); });
    if (stuck.length) return T('session.tomorrowStuck', {words: stuck.join(T('session.and'))});
    var reps = items.filter(function (x) { return x.why === 'repeat'; }).length;
    if (reps) return T('session.tomorrowRepeat', {n: reps});
    var fresh = items.filter(function (x) { return x.kind === 'word' && x.why === 'new'; }).length;
    return fresh ? T('session.tomorrowNew', {n: fresh}) : T('session.tomorrowReview');
  }

  // After her first finished session: a daily reminder (Settings makes the calendar file).
  // Offered once; Settings keeps it for later.
  function reminderOffer(s) {
    if (s.reminder && s.reminder.offered) return null;
    s.reminder = {offered: PM.dates.iso(), time: null, added: null};
    PM.store.save();
    return h('a', {class: 'nav-row remind-row', href: '#/settings', onclick: function () { PM.session.leave(); }}, [
      h('span', null, [h('span', {class: 'nav-title'}, T('session.remindOffer')), h('span', {class: 'nav-sub'}, T('session.remindOfferSub'))]),
      icon(20, ['M9 5l7 7-7 7'])
    ]);
  }

  function done(run) {
    var s = PM.store.get();
    var qs = run.results.filter(function (r) { return r.kind === 'q' || r.kind === 'drill'; });
    var ss = run.results.filter(function (r) { return r.kind === 'scenario'; });
    function right(a) { return a.filter(function (r) { return r.ok; }).length; }
    function stat(main, label) {
      return h('div', {class: 'stat'}, [h('div', {class: 'stat-n num'}, main), h('div', {class: 'stat-l'}, label)]);
    }
    var mastered = PM.plan.masteredCount(run.date), gained = Math.max(0, mastered - (run.masteredAtStart || 0));
    var stats = h('div', {class: 'stats'}, [
      stat(right(qs) + ' / ' + qs.length, T('session.doneQ')),
      ss.length ? stat(right(ss) + ' / ' + ss.length, T('session.doneS')) : null,
      stat(String(mastered), gained ? T('session.doneMasteredUp', {n: gained}) : T('session.doneMastered'))
    ]);
    var extraLeft = Math.min(PM.plan.repeats().length, PM.config.plan.extraQuestions);
    var extraBtn = extraLeft ? h('a', {
      class: 'btn btn-quiet', href: '#/session?extra=1',
      onclick: function () { PM.session.startExtra(); }
    }, T('session.extraGo', {n: extraLeft})) : null;
    var home = h('a', {class: 'btn', href: '#/today', onclick: function () { PM.session.leave(); }}, T('session.doneHome'));

    if (run.extra) {
      return h('div', {class: 'page page-plain'}, [
        h('header', {class: 'cover cover-slim'}, [
          h('div', {class: 'done-title'}, [h('span', {class: 'done-mark'}, icon(20, ['M5 12.5l4.5 4.5L19 7.5'])), h('h1', null, T('session.extraDone'))])
        ]),
        h('main', {class: 'body'}, [stats, h('p', {class: 'fine'}, T('session.extraNote')),
          h('a', {class: 'btn', href: '#/today', onclick: function () { PM.session.leave(); }}, T('session.home'))])
      ]);
    }

    var rows = tackled(run), words = run.results.filter(function (r) { return r.kind === 'word'; });
    var list = rows.length ? [h('h2', {class: 'section-h'}, T('session.doneTackled')), h('ul', {class: 'tk-list'}, rows)]
      : [h('h2', {class: 'section-h'}, T('session.doneWords')), h('ul', {class: 'done-words'}, words.map(function (r) {
        var t = PM.content.term(r.id);
        return h('li', {class: 'done-word'}, [
          h('span', {class: 'done-term', lang: 'en'}, PM.content.shortTerm(t)),
          h('span', {class: 'done-zh'}, mixed(t.zh)),
          h('span', {class: 'done-flag' + (r.knew ? ' done-knew' : '')}, r.knew ? T('session.doneKnew') : T('session.doneNew'))
        ]);
      }))];

    return h('div', {class: 'page page-plain'}, [
      h('header', {class: 'cover'}, [
        h('div', {class: 'done-title'}, [h('span', {class: 'done-mark'}, icon(20, ['M5 12.5l4.5 4.5L19 7.5'])), h('h1', null, T('session.doneTitle'))]),
        h('div', {class: 'cover-muted done-streak-label'}, run.streakAdded ? T('session.doneStreak') : T('session.doneStreakAgain')),
        h('div', {class: 'streak-row'}, [
          h('div', {class: 'streak'}, [h('span', {class: 'streak-n'}, String(s.streak.count)), h('span', {class: 'streak-u'}, T('today.days'))]),
          PM.views.weekMarks(s)
        ])
      ]),
      h('main', {class: 'body'}, list.concat([
        stats,
        h('p', {class: 'tomorrow'}, mixed(tomorrowLine(run))),
        home,
        extraBtn,
        reminderOffer(s)
      ]))
    ]);
  }

  // ---- the route view ---------------------------------------------------------------------
  function view() {
    var run = PM.session.resume();
    var stage = PM.session.stage();
    var page = h('div', {class: 'page sess'});
    if (!run.items.length) { PM.router.go('today'); return page; }

    function focusTitle() {
      var t = page.querySelector('h1');
      if (t) { t.setAttribute('tabindex', '-1'); t.focus({preventScroll: true}); }
    }
    function paint(parts, cls) {
      closeSheet();
      while (page.firstChild) page.removeChild(page.firstChild);
      page.className = cls || 'page sess';
      parts.forEach(function (p) { page.appendChild(p); });
      focusTitle();
      window.scrollTo(0, 0);
    }
    function show() {
      if (run.i >= run.items.length) {
        if (!run.done) PM.session.finish();
        paint([done(run)], 'page page-plain');
        return;
      }
      var it = run.items[run.i];
      paint(it.kind === 'word' ? wordCard(run, it, next, stage)
        : it.kind === 'drill' ? drillScreen(run, it, next, stage, function (parts) { paint(parts); })
        : choiceScreen(run, it, next, stage));
    }
    function next() { PM.session.advance(); show(); }
    show();
    return page;
  }

  // Shared with the gate and mock screens (exam-ui.js).
  PM.sessionUI = {view: view, openSheet: openSheet, closeSheet: closeSheet, flagLink: flagLink, squares: squares,
    wordSheet: wordSheet, entry: entry};
})(window.PM = window.PM || {});
