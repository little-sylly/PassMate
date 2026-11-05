/* Review (错题本), Progress (可以去考了吗？), Settings, Restore, and the in-app browser banner (M5).
   Layout follows design-reference A5 (Review) and A6 (Progress). */
(function (PM) {
  'use strict';
  var h = PM.dom.h, icon = PM.dom.icon, mixed = PM.dom.mixed;
  var T = function (p, v) { return PM.content.ui(p, v); };
  var U = function () { return PM.sessionUI; };
  var V = function () { return PM.views; };
  var CHECK = ['M5 12.5l4.5 4.5L19 7.5'], CHEV = ['M9 5l7 7-7 7'], CROSS = ['M6 6l12 12M18 6L6 18'];
  var GEAR = ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'];
  var LETTERS = ['a', 'b', 'c'];

  function md(iso) { var d = PM.dates.parse(iso); return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : ''; }
  function pct(x) { return Math.round(x * 100); }
  function sectionHead(title, note) {
    return h('div', {class: 'sec-head'}, [h('h2', {class: 'sec-title'}, title), note ? h('span', {class: 'sec-note'}, note) : null]);
  }
  function kindLabel(id) { return T('review.kind' + {word: 'Word', q: 'Q', drill: 'Drill', scenario: 'Scenario'}[PM.plan.kindOf(id)]); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ======================================================================================
  // Review (A5)
  // ======================================================================================
  function stuckRows() {
    var s = PM.store.get(), need = PM.config.plan.stuckClearDays;
    var ids = PM.plan.stuckIds().sort(function (a, b) { return (s.items[a].stuckAt || '') < (s.items[b].stuckAt || '') ? -1 : 1; });
    if (!ids.length) return null;
    return [
      sectionHead(T('review.stuckH', {n: ids.length}), T('review.stuckNote', {n: PM.config.plan.stuckDays})),
      h('ul', {class: 'rv-list'}, ids.map(function (id) {
        var t = PM.content.term(id), r = s.items[id], bits = [t.zh, T('review.troubleDays', {n: (r.troubleDays || []).length})];
        var other = (t.confuse || [])[0] && PM.content.term(t.confuse[0]);
        if (other) bits.push(T('review.confuse', {word: PM.content.shortTerm(other)}));
        return h('li', null, h('button', {
          class: 'rv-row', type: 'button', onclick: function (e) { U().wordSheet(id, e.currentTarget, true); }
        }, [
          h('span', {class: 'rv-text'}, [
            h('span', {class: 'rv-term', lang: 'en'}, PM.content.shortTerm(t)),
            h('span', {class: 'rv-sub'}, mixed(bits.join(' · ')))
          ]),
          U().squares((r.stuckRight || []).length, need)
        ]));
      }))
    ];
  }

  function dueLabel(due) {
    var d = PM.dates.iso(), n = PM.dates.daysBetween(d, due);
    return n <= 0 ? T('review.dueToday') : n === 1 ? T('review.dueTomorrow') : T('review.dueOn', {date: md(due)});
  }

  // One missed item: the English, when it comes back; opens its answer and explanation.
  function repeatRow(id) {
    var it = PM.plan.itemOf(id), r = PM.store.get().items[id], k = PM.plan.kindOf(id);
    var text = k === 'scenario' ? it.scenario_en : it.question_en, misses = (r.n || 0) - (r.right || 0);
    var sub = [dueLabel(r.repeat.due)];
    if (k !== 'q') sub.push(kindLabel(id));
    if (misses > 1) sub.push(T('review.missTimes', {n: misses}));
    return h('li', null, h('button', {
      class: 'rv-row rv-q', type: 'button', onclick: function (e) { answerSheet(id, e.currentTarget); }
    }, [
      h('span', {class: 'rv-text'}, [h('span', {class: 'rv-qtext', lang: 'en'}, text), h('span', {class: 'rv-sub'}, sub.join(' · '))]),
      icon(20, CHEV)
    ]));
  }

  function answerSheet(id, opener) {
    var it = PM.plan.itemOf(id), k = PM.plan.kindOf(id), right = LETTERS.indexOf(it.answer);
    var explain = k === 'scenario' ? [it.why_zh && it.why_zh[right], it.takeaway_zh] : [it.explain_zh];
    U().openSheet(T('review.answerTitle'), h('div', {class: 'sheet-body'}, [
      h('div', {class: 'kicker'}, kindLabel(id)),
      k === 'scenario' ? h('p', {class: 'situation', lang: 'en'}, it.scenario_en) : null,
      h('h2', {class: 'rv-sheet-q', lang: 'en'}, it.question_en),
      h('div', {class: 'miss-pick miss-right'}, [h('span', {class: 'miss-label'}, T('review.rightAnswer')),
        h('span', {lang: 'en'}, it.options_en[right])]),
      explain.filter(Boolean).map(function (x) { return h('p', {class: 'explain-text'}, mixed(x)); }),
      h('p', {class: 'fine fine-tight'}, T('review.backOn', {when: dueLabel(PM.store.get().items[id].repeat.due)})),
      h('button', {class: 'btn btn-quiet sheet-focus', type: 'button', onclick: U().closeSheet}, T('session.sheetClose')),
      U().flagLink(id, 'review')
    ]), opener);
  }

  // Repeat mistakes grouped by the wording that tripped her (NOT, EXCEPT...).
  function trapRows(reps) {
    var groups = {}, order = [];
    reps.forEach(function (id) {
      var it = PM.plan.itemOf(id), k = PM.plan.kindOf(id);
      var ws = k === 'q' ? (it.wording_focus || []) : k === 'drill' ? [it.term_id] : [];
      ws.forEach(function (w) {
        if (!PM.content.term(w)) return;
        if (!groups[w]) { groups[w] = []; order.push(w); }
        if (groups[w].indexOf(id) === -1) groups[w].push(id);
      });
    });
    if (!order.length) return null;
    order.sort(function (a, b) { return groups[b].length - groups[a].length || (a < b ? -1 : 1); });
    return [
      sectionHead(T('review.trapsH'), T('review.trapsNote')),
      h('ul', {class: 'rv-list'}, order.map(function (w) {
        var t = PM.content.term(w), open = false, list = h('ul', {class: 'rv-list rv-sublist', hidden: true}, groups[w].map(repeatRow));
        var btn = h('button', {
          class: 'rv-row rv-trap', type: 'button', 'aria-expanded': 'false',
          onclick: function () { open = !open; list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
        }, [
          h('span', {class: 'trap-chip', lang: 'en'}, PM.content.shortTerm(t)),
          h('span', {class: 'rv-trap-text'}, mixed(T('review.trapRow', {zh: t.zh, n: groups[w].length}))),
          icon(20, CHEV, 'rv-chev')
        ]);
        return h('li', null, [btn, list]);
      }))
    ];
  }

  function repeatsBlock(reps) {
    if (!reps.length) return null;
    var SHOW = 5, list = h('ul', {class: 'rv-list rv-reps'}, reps.slice(0, SHOW).map(repeatRow));
    var more = reps.length > SHOW ? h('button', {
      class: 'link-btn rv-more', type: 'button',
      onclick: function () { reps.slice(SHOW).forEach(function (id) { list.appendChild(repeatRow(id)); }); more.parentNode.removeChild(more); }
    }, T('review.showAll', {n: reps.length})) : null;
    return [sectionHead(T('review.repeatsH', {n: reps.length}), T('review.repeatsNote')), list, more];
  }

  // Her flags, and the 发给 Sam button: share sheet, else clipboard, else a box to copy from.
  function flagsBlock() {
    var box = h('section', {class: 'rv-flags', 'aria-labelledby': 'flags-h'});
    var status = '', fallback = null;

    function paint() {
      clear(box);
      var s = PM.store.get(), flags = s.flags || [], unsent = flags.filter(function (f) { return !f.sent; });
      box.appendChild(h('div', {class: 'sec-head'}, [
        h('h2', {class: 'sec-title', id: 'flags-h'}, T('review.flagsH', {n: flags.length})),
        unsent.length ? h('span', {class: 'sec-note'}, T('review.flagsNew', {n: unsent.length})) : null
      ]));
      if (!flags.length) { box.appendChild(h('p', {class: 'note'}, T('review.flagsEmpty'))); return; }
      box.appendChild(h('p', {class: 'muted rv-flags-lead'}, T('review.flagsLead')));
      box.appendChild(h('ul', {class: 'rv-list'}, flags.slice().reverse().map(function (f) { return flagRow(f); })));
      var sendList = unsent.length ? unsent : flags;
      box.appendChild(h('button', {
        class: 'btn' + (unsent.length ? '' : ' btn-quiet'), type: 'button',
        onclick: function () { send(sendList); }
      }, unsent.length ? T('review.send', {n: unsent.length}) : T('review.sendAll', {n: flags.length})));
      if (status) box.appendChild(h('p', {class: 'rv-status', role: 'status'}, status));
      if (fallback) {
        var ta = h('textarea', {class: 'field code-field', rows: '6', readonly: true, 'aria-label': T('review.copyBox')});
        ta.value = fallback;
        box.appendChild(ta);
        setTimeout(function () { try { ta.focus(); ta.select(); } catch (e) { /* ok */ } }, 0);
      }
    }

    function flagRow(f) {
      var del = false, b;
      var first = (f.zh && f.zh[0]) ? f.zh[0][1] : '';
      b = h('button', {
        class: 'link-btn rv-del', type: 'button',
        onclick: function () {
          if (!del) { del = true; b.textContent = T('review.deleteSure'); return; }
          var s = PM.store.get(), i = s.flags.indexOf(f);
          if (i !== -1) s.flags.splice(i, 1);
          PM.store.save(); paint();
        }
      }, T('review.delete'));
      return h('li', {class: 'rv-flag'}, [
        h('div', {class: 'rv-flag-top'}, [
          h('span', {class: 'rv-flag-id', lang: 'en'}, f.id),
          h('span', {class: 'rv-sub'}, kindLabel(f.id) + ' · ' + md(PM.dates.iso(new Date(f.at))) + ' · ' + (f.script === 'zh-Hant' ? '繁' : '简')),
          f.sent ? h('span', {class: 'tag tag-quiet'}, T('review.sent')) : null
        ]),
        h('p', {class: 'rv-flag-note'}, f.note ? mixed(f.note) : h('span', {class: 'muted'}, T('review.noNote'))),
        first ? h('p', {class: 'rv-flag-zh'}, mixed(first)) : null,
        b
      ]);
    }

    function send(list) {
      var text = PM.share.flagsText(list);
      PM.share.send(T('review.sendTitle'), text).then(function (how) {
        if (how === 'cancelled') return;
        fallback = null;
        if (how === 'failed') { status = T('review.copyFailed'); fallback = text; paint(); return; }
        var d = PM.dates.iso();
        list.forEach(function (f) { f.sent = d; });
        PM.store.save();
        status = how === 'shared' ? T('review.shared') : T('review.copied');
        paint();
      });
    }

    paint();
    return box;
  }

  function review() {
    var reps = PM.plan.repeats(), stuck = stuckRows(), traps = trapRows(reps), extraN = Math.min(reps.length, PM.config.plan.extraQuestions);
    var empty = !stuck && !reps.length ? h('div', {class: 'rv-empty'}, [
      h('strong', null, T('review.emptyTitle')), h('span', null, T('review.emptyBody'))
    ]) : null;
    var foot = extraN ? h('div', {class: 'rv-foot'}, h('a', {
      class: 'btn', href: '#/session?extra=1', onclick: function () { PM.session.startExtra(); }
    }, T('review.practise', {n: extraN}))) : null;
    return h('div', {class: 'page has-tabs' + (foot ? ' has-foot' : '')}, [
      h('header', {class: 'plain-head'}, [
        h('div', {class: 'plain-row'}, [h('h1', null, T('review.title')), V().scriptToggle('light')]),
        h('p', {class: 'plain-lead'}, T('review.lead', {n: PM.config.plan.stuckClearDays}))
      ]),
      h('main', {class: 'body body-review'}, [empty, stuck, traps, repeatsBlock(reps), flagsBlock()]),
      foot,
      V().tabBar('review')
    ]);
  }

  // ======================================================================================
  // Progress (A6)
  // ======================================================================================
  function checklist(d) {
    var r = PM.plan.readiness(d), cfg = PM.config.readyToSit, gs = PM.exam.gateStatus(d);
    var rows = r.list.map(function (c) {
      var value, frac;
      if (c.key === 'parts') {
        var n = c.parts.filter(function (p) { return p.ok; }).length;
        value = T('progress.vParts', {n: n}); frac = n / 4;
      } else if (c.key === 'gate') {
        value = c.ok ? T('progress.vGateOk') : T('progress.vGate', {n: gs.inARow, m: gs.need}); frac = c.ok ? 1 : gs.inARow / gs.need;
      } else if (c.key === 'mocks') {
        var m = Math.min(PM.exam.passesInARow(), cfg.mocksInARow);
        value = T('progress.vMocks', {n: m, m: cfg.mocksInARow}); frac = m / cfg.mocksInARow;
      } else if (c.key === 'stuck') {
        value = c.ok ? T('progress.vStuckOk') : c.n ? T('progress.vStuck', {n: c.n}) : '—'; frac = c.ok ? 1 : 0;
      } else {
        value = c.n + ' / ' + c.need; frac = Math.min(1, c.n / c.need);
      }
      return h('li', {class: 'ck' + (c.ok ? ' ck-ok' : '')}, [
        h('span', {class: 'ck-box', role: 'img', 'aria-label': c.ok ? T('progress.done') : T('progress.notYet')}, c.ok ? icon(16, CHECK) : null),
        h('span', {class: 'ck-main'}, [
          h('span', {class: 'ck-top'}, [h('span', {class: 'ck-name'}, T('ready.' + c.key, {n: cfg.wordsMastered})), h('span', {class: 'ck-val num'}, value)]),
          h('span', {class: 'ck-bar', 'aria-hidden': 'true'}, h('span', {class: 'ck-fill', style: 'width:' + Math.round(frac * 100) + '%'}))
        ])
      ]);
    });
    return {r: r, list: h('ul', {class: 'ck-list'}, rows)};
  }

  function partsBlock(r) {
    var cfg = PM.config.readyToSit, goal = pct(cfg.partRight);
    var parts = r.list.filter(function (c) { return c.key === 'parts'; })[0].parts;
    return [
      sectionHead(T('progress.partsH'), T('progress.partsNote', {n: cfg.partOverLast, p: goal})),
      h('ul', {class: 'pt-list'}, parts.map(function (p) {
        var enough = p.answers >= cfg.partMinAnswers, v = pct(p.right), low = enough && v < goal;
        return h('li', {class: 'pt'}, [
          h('span', {class: 'pt-top'}, [
            h('span', {class: 'pt-name'}, T('progress.part' + p.part)),
            h('span', {class: 'pt-val num' + (low ? ' pt-low' : '') + (enough ? '' : ' pt-few')},
              enough ? v + '%' : T('progress.partFew', {n: p.answers, m: cfg.partMinAnswers}))
          ]),
          h('span', {class: 'pt-bar', 'aria-hidden': 'true'}, [
            h('span', {class: 'pt-fill' + (low ? ' pt-fill-low' : ''), style: 'width:' + (enough ? v : 0) + '%'}),
            h('span', {class: 'pt-tick', style: 'left:' + goal + '%'})
          ])
        ]);
      }))
    ];
  }

  function masteryBlock(d) {
    return [
      sectionHead(T('progress.masteryH'), T('progress.masteryNote', {a: PM.config.mastered.rightOnDays, b: PM.config.mastered.noMissInLastDays})),
      h('ul', {class: 'pt-list'}, PM.plan.masteryByPart(d).map(function (p) {
        return h('li', {class: 'pt'}, [
          h('span', {class: 'pt-top'}, [h('span', {class: 'pt-name'}, T('progress.part' + p.part)),
            h('span', {class: 'pt-val num'}, p.mastered + ' / ' + p.total)]),
          h('span', {class: 'pt-bar pt-bar-thin', 'aria-hidden': 'true'}, h('span', {class: 'pt-fill', style: 'width:' + Math.round(p.mastered / p.total * 100) + '%'}))
        ]);
      }))
    ];
  }

  function stageBox() {
    var sp = PM.plan.stageProgress(), lines = [];
    if (!sp.next) lines.push(T('progress.stageTop'));
    else if (sp.ready) lines.push(T('progress.stageReady', {name: T('stages.' + sp.next)}));
    else {
      var need = [];
      if (sp.minWordsMet && sp.wordsMet < sp.minWordsMet) need.push(T('progress.stageWords', {m: sp.wordsMet, need: sp.minWordsMet}));
      if (sp.answers < sp.need) lines.push(T('progress.stageFew', {k: sp.need - sp.answers, name: T('stages.' + sp.next)}));
      else {
        need.unshift(T('progress.stageRight', {n: sp.need, p: pct(sp.right), need: pct(sp.minRight)}));
        if (sp.help != null) need.push(T('progress.stageHelp', {h: sp.help.toFixed(1), max: sp.maxHelp}));
      }
      if (need.length) lines.unshift(T('progress.stageThen', {items: need.join(T('progress.sep')), name: T('stages.' + sp.next)}));
    }
    return h('div', {class: 'stage-box'}, [
      h('strong', null, T('progress.stageNow', {name: T('stages.' + sp.stage)})),
      lines.map(function (l) { return h('p', null, mixed(l)); })
    ]);
  }

  // The last five weeks, Monday first: done, forgiven (dashed), today, missed, not yet.
  function calendar() {
    var s = PM.store.get(), st = PM.plan.streak(PM.dates.iso()), d = PM.dates.iso();
    var first = PM.dates.add(PM.dates.iso(PM.dates.week()[0]), -28), cells = [];
    var started = Object.keys(st.days).sort()[0] || d;    // days before her first session are not "missed"
    for (var i = 0; i < 35; i++) {
      var iso = PM.dates.add(first, i), dt = PM.dates.parse(iso), state, label;
      if (st.days[iso]) { state = 'done'; label = T('today.dayDone'); }
      else if (st.saved[iso]) { state = 'saved'; label = T('today.daySaved'); }
      else if (iso === d) { state = 'today'; label = T('today.dayToday'); }
      else if (iso > d) { state = 'next'; label = T('today.dayNext'); }
      else if (iso < started) { state = 'pre'; label = ''; }
      else { state = 'missed'; label = T('today.dayMissed'); }
      cells.push(h('span', {class: 'cal-day cal-' + state, role: 'img', 'aria-label': md(iso) + ' ' + label},
        dt.getDate() === 1 ? (dt.getMonth() + 1) + '月' : String(dt.getDate())));
    }
    var heads = [1, 2, 3, 4, 5, 6, 0].map(function (n) { return h('span', {class: 'cal-head', 'aria-hidden': 'true'}, T('today.dayMarks.' + n)); });
    return [
      sectionHead(T('progress.calH'), T('progress.calNote', {n: st.count, m: Object.keys(s.streak.days).length})),
      h('div', {class: 'cal', role: 'group', 'aria-label': T('progress.calH')}, heads.concat(cells)),
      h('div', {class: 'cal-legend', 'aria-hidden': 'true'}, [
        h('span', null, [h('span', {class: 'cal-key cal-done'}), T('today.dayDone')]),
        h('span', null, [h('span', {class: 'cal-key cal-saved'}), T('today.daySaved')])
      ])
    ];
  }

  function progress() {
    var d = PM.dates.iso(), ck = checklist(d), left = ck.r.list.filter(function (c) { return !c.ok; }).length;
    return h('div', {class: 'page has-tabs'}, [
      h('header', {class: 'cover'}, [
        h('div', {class: 'cover-row'}, [
          h('div', {class: 'cover-muted'}, T('progress.kicker')),
          h('a', {class: 'icon-link', href: '#/settings', 'aria-label': T('settings.title')}, icon(22, GEAR))
        ]),
        h('h1', {class: 'ready-title'}, T('progress.title')),
        h('p', {class: 'cover-lead'}, ck.r.ready ? T('progress.ready') : T('progress.left', {n: left})),
        ck.r.ready ? h('p', {class: 'cover-fine'}, T('progress.readySub')) : null
      ]),
      h('main', {class: 'body'}, [
        ck.list,
        partsBlock(ck.r),
        stageBox(),
        masteryBlock(d),
        calendar(),
        h('a', {class: 'nav-row settings-row', href: '#/settings'}, [
          h('span', null, [h('span', {class: 'nav-title'}, T('settings.title')), h('span', {class: 'nav-sub'}, T('progress.settingsSub'))]),
          icon(20, CHEV)
        ])
      ]),
      V().tabBar('progress')
    ]);
  }

  // ======================================================================================
  // Settings
  // ======================================================================================
  function setSection(title, kids) {
    return h('section', {class: 'set'}, [h('h2', {class: 'set-h'}, title)].concat(kids));
  }

  function stageSection() {
    var s = PM.store.get(), stage = s.stage || 1;
    var kids = [h('p', {class: 'set-line'}, T('settings.stageNow', {name: T('stages.' + stage)})), h('p', {class: 'muted'}, T('settings.stageNote'))];
    if (stage > 1) {
      var prev = T('stages.' + (stage - 1));
      kids.push(h('button', {
        class: 'btn btn-quiet btn-sm', type: 'button',
        onclick: function (e) {
          U().openSheet(T('settings.stageBackTitle', {name: prev}), h('div', {class: 'sheet-body'}, [
            h('h2', {class: 'sheet-title'}, T('settings.stageBackTitle', {name: prev})),
            h('p', null, T('settings.stageBackBody')),
            h('button', {class: 'btn sheet-focus', type: 'button', onclick: function () { U().closeSheet(); PM.plan.stepBack(); PM.router.refresh(); }}, T('settings.stageBackGo')),
            h('button', {class: 'btn btn-quiet', type: 'button', onclick: U().closeSheet}, T('settings.cancel'))
          ]), e.currentTarget);
        }
      }, T('settings.stageBack', {name: prev})));
    }
    return setSection(T('settings.stageH'), kids);
  }

  function largeSection() {
    var sw = h('button', {class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!PM.store.get().largeText),
      'aria-labelledby': 'large-h', onclick: function () {
        var on = !PM.store.get().largeText;
        PM.store.set({largeText: on});
        if (on) document.documentElement.setAttribute('data-large', ''); else document.documentElement.removeAttribute('data-large');
        sw.setAttribute('aria-checked', String(on));
      }}, h('span', {class: 'switch-knob'}));
    return h('section', {class: 'set'}, [
      h('div', {class: 'set-row'}, [h('span', null, [h('h2', {class: 'set-h', id: 'large-h'}, T('settings.largeH')),
        h('span', {class: 'muted'}, T('settings.largeNote'))]), sw])
    ]);
  }

  function reminderSection() {
    var s = PM.store.get(), rem = s.reminder || {};
    var picked = PM.share.nearestSlot(rem.time || '20:00');
    var time = h('select', {id: 'remind-time', class: 'field field-time'}, PM.share.reminderSlots().map(function (t) {
      var o = h('option', {value: t}, t);
      if (t === picked) o.selected = true;
      return o;
    }));
    var status = h('p', {class: 'rv-status', role: 'status'});
    return setSection(T('settings.remindH'), [
      h('p', {class: 'muted'}, T('settings.remindNote')),
      h('label', {for: 'remind-time', class: 'label'}, T('settings.remindTime')), time,
      h('p', {class: 'muted set-gap'}, s.testDate ? T('settings.remindUntil', {date: V().formatDate(s.testDate)}) : T('settings.remindNoEnd')),
      h('button', {
        class: 'btn', type: 'button',
        onclick: function () {
          var st = PM.store.get(), t = PM.share.nearestSlot(time.value), d = PM.dates.iso();
          var app = PM.share.inApp();
          if (app) { status.textContent = T('settings.remindInApp', {app: T('banner.' + app)}); return; }
          st.reminder = {offered: (st.reminder && st.reminder.offered) || d, time: t, added: d};
          PM.store.save();
          var route = PM.share.addReminder({start: d, time: t, until: st.testDate, title: T('settings.remindTitle'),
            body: T('settings.remindBody'), url: location.href.split('#')[0]}, st.script || PM.config.defaultScript);
          status.textContent = T(route === 'ios-file' ? 'settings.remindDoneNoEnd' : route === 'ios-data' ? 'settings.remindDoneIos' : 'settings.remindDone');
        }
      }, T('settings.remindGo')),
      status,
      rem.added ? h('p', {class: 'fine fine-tight'}, T('settings.remindLast', {date: V().formatDate(rem.added), time: rem.time})) : null
    ]);
  }

  function backupSection() {
    var out = h('div', {class: 'backup-out'});
    function make() {
      clear(out);
      var code = PM.backup.make(), status = h('p', {class: 'rv-status', role: 'status'});
      var ta = h('textarea', {class: 'field code-field', rows: '4', readonly: true, 'aria-label': T('settings.backupCode')});
      ta.value = code;
      out.appendChild(ta);
      out.appendChild(h('p', {class: 'fine fine-tight'}, T('settings.backupMeta', {n: code.length})));
      out.appendChild(h('button', {class: 'btn', type: 'button', onclick: function () {
        PM.share.copy(code).then(function (ok) {
          status.textContent = ok ? T('settings.backupCopied') : T('settings.backupCopyFailed');
          if (!ok) { ta.focus(); ta.select(); }
        });
      }}, T('settings.backupCopy')));
      if (navigator.share) out.appendChild(h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () {
        PM.share.send(T('settings.backupTitle'), code).then(function (how) {
          if (how === 'shared' || how === 'copied') status.textContent = how === 'shared' ? T('settings.backupShared') : T('settings.backupCopied');
        });
      }}, T('settings.backupShare')));
      out.appendChild(status);
    }
    return setSection(T('settings.backupH'), [
      h('p', {class: 'muted'}, T('settings.backupNote')),
      h('button', {class: 'btn btn-quiet', type: 'button', onclick: make}, T('settings.backupMake')),
      out,
      h('a', {class: 'link-btn', href: '#/restore'}, T('restore.title'))
    ]);
  }

  function settings() {
    var s = PM.store.get();
    return h('div', {class: 'page has-tabs'}, [
      h('header', {class: 'plain-head'}, [
        h('a', {class: 'back-link', href: '#/progress'}, [icon(18, ['M15 5l-7 7 7 7']), T('settings.back')]),
        h('h1', null, T('settings.title'))
      ]),
      h('main', {class: 'body body-settings'}, [
        h('section', {class: 'set'}, [
          h('div', {class: 'set-row'}, [h('span', null, [h('h2', {class: 'set-h'}, T('settings.scriptH')),
            h('span', {class: 'muted'}, T('settings.scriptNote'))]), V().scriptToggle('light')])
        ]),
        setSection(T('settings.dateH'), [
          h('div', {class: 'set-row'}, [
            h('span', {class: 'set-line'}, s.testDate ? V().formatDate(s.testDate) : T('settings.dateNone')),
            h('a', {class: 'link-btn', href: '#/date'}, s.testDate ? T('settings.dateEdit') : T('settings.dateAdd'))
          ])
        ]),
        stageSection(),
        largeSection(),
        reminderSection(),
        backupSection(),
        setSection(T('settings.aboutH'), [
          h('p', {class: 'set-about'}, T('settings.about')),
          h('p', {class: 'fine'}, T('app.notAffiliated')),
          h('p', {class: 'fine'}, T('app.credit')),
          h('p', {class: 'fine', lang: 'en'}, 'PassMate ' + PM.config.version)
        ])
      ]),
      V().tabBar('progress')
    ]);
  }

  // ======================================================================================
  // Restore (open before Welcome too: a wiped phone lands on Welcome)
  // ======================================================================================
  function restore() {
    var s = PM.store.get();
    var ta = h('textarea', {class: 'field code-field', id: 'restore-code', rows: '5', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false'});
    var error = h('p', {class: 'error', role: 'alert'});

    function apply(r) {
      PM.store.replace(r.rec);
      location.replace(location.href.split('#')[0] + '#/today');
      location.reload();
    }
    function go(e) {
      error.textContent = '';
      var r = PM.backup.read(ta.value);
      if (!r.ok) { error.textContent = T('restore.err' + {empty: 'Empty', bad: 'Bad', newer: 'Newer'}[r.error]); return; }
      if (!PM.store.get().welcomed) { apply(r); return; }      // nothing here to lose
      var met = 0;
      for (var id in r.rec.items) if (/^A\d/.test(id) && r.rec.items[id].met) met++;
      var when = r.at ? V().formatDate(PM.dates.iso(new Date(r.at))) : '?';
      U().openSheet(T('restore.confirmTitle'), h('div', {class: 'sheet-body'}, [
        h('h2', {class: 'sheet-title'}, T('restore.confirmTitle')),
        h('p', null, T('restore.confirmBody', {date: when, n: (r.rec.streak && r.rec.streak.count) || 0, m: met})),
        h('button', {class: 'btn sheet-focus', type: 'button', onclick: function () { U().closeSheet(); apply(r); }}, T('restore.confirmGo')),
        h('button', {class: 'btn btn-quiet', type: 'button', onclick: U().closeSheet}, T('settings.cancel'))
      ]), e.currentTarget);
    }

    return h('div', {class: 'page page-plain'}, [
      h('header', {class: 'cover cover-slim'}, [
        V().topRow(),
        h('h1', {class: 'hero-title hero-title-sm'}, T('restore.title')),
        h('p', {class: 'cover-lead'}, T('restore.lead'))
      ]),
      h('main', {class: 'body'}, [
        h('label', {for: 'restore-code', class: 'label'}, T('restore.label')), ta, error,
        h('button', {class: 'btn', type: 'button', onclick: go}, T('restore.go')),
        h('a', {class: 'link-btn', href: s.welcomed ? '#/settings' : '#/welcome'}, T('restore.back'))
      ])
    ]);
  }

  // ======================================================================================
  // In-app browser banner (WeChat, Rednote...): one line, closable
  // ======================================================================================
  function banner() {
    var app = PM.share.inApp();
    if (!app || PM.store.get().banner) return null;
    var el = h('div', {class: 'inapp', role: 'note'}, [
      h('p', null, T('banner.text', {app: T('banner.' + app)})),
      h('button', {class: 'inapp-x', type: 'button', 'aria-label': T('banner.close'), onclick: function () {
        PM.store.set({banner: PM.dates.iso()});
        if (el.parentNode) el.parentNode.removeChild(el);
      }}, icon(18, CROSS))
    ]);
    return el;
  }

  PM.tabsUI = {review: review, progress: progress, settings: settings, restore: restore, banner: banner};
})(window.PM = window.PM || {});
