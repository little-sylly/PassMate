/* Values gate (#/gate) and mock test (#/mock) screens: intro, the English-only run, result.
   No Chinese and no hints while answering; the result explains every miss in Chinese. */
(function (PM) {
  'use strict';
  var h = PM.dom.h, icon = PM.dom.icon, mixed = PM.dom.mixed;
  var T = function (p, v) { return PM.content.ui(p, v); };
  var U = function () { return PM.sessionUI; };
  var LETTERS = ['a', 'b', 'c'];
  var CHECK = ['M5 12.5l4.5 4.5L19 7.5'], CROSS = ['M7 7l10 10M17 7L7 17'];
  var CLOCK = ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'];
  var GRID = [{rect: {x: 4, y: 4, width: 6, height: 6, rx: 1}}, {rect: {x: 14, y: 4, width: 6, height: 6, rx: 1}},
    {rect: {x: 4, y: 14, width: 6, height: 6, rx: 1}}, {rect: {x: 14, y: 14, width: 6, height: 6, rx: 1}}];

  var result = {gate: null, mock: null};   // the last hand-in, shown until she leaves the screen
  var timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  // Leaving the gate or mock screens drops the result and stops the clock.
  window.addEventListener('hashchange', function () {
    var m = /^#\/(gate|mock)\b/.exec(location.hash || '');
    stopTimer();
    if (!m) { result.gate = null; result.mock = null; }
  });

  function md(iso) { var d = PM.dates.parse(iso); return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : ''; }
  function clock(ms) {
    var s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---- Today rows --------------------------------------------------------------------------------
  function todaySub(name, d) {
    if (name === 'gate') {
      var st = PM.exam.gateStatus(d);
      if (st.run) return T('today.gateGoing');
      if (st.cleared) return st.recheckDue ? T('today.gateRecheck') : T('today.gateCleared', {date: md(st.nextCheck)});
      if (st.inARow) return T('today.gateInRun', {n: st.inARow, m: st.need - st.inARow});
      return T('today.gateSub');
    }
    var s = PM.store.get();
    if (s.mock) {
      var left = PM.exam.mockLeft();
      return left > 0 ? T('today.mockGoing', {min: Math.ceil(left / 60000)}) : T('today.mockTimeUp');
    }
    if (PM.exam.mockSuggested(d)) return T('today.mockSprint');
    var last = PM.exam.mocks()[PM.exam.mocks().length - 1];
    if (last) return T('today.mockLast', {r: last.right, t: last.total, verdict: last.pass ? T('exam.pass') : T('exam.fail')});
    return T('today.mockSub');
  }

  // ---- intro pages ---------------------------------------------------------------------------------
  function intro(kind, status, actions) {
    return h('div', {class: 'page page-plain'}, [
      h('header', {class: 'cover'}, [
        PM.views.topRow(),
        h('h1', {class: 'hero-title'}, T(kind + '.title')),
        h('p', {class: 'cover-lead'}, T(kind + '.lead'))
      ]),
      h('main', {class: 'body'}, [
        status,
        h('ul', {class: 'points'}, ['r1', 'r2', 'r3', 'r4'].map(function (r) { return h('li', null, T(kind + '.' + r)); }))
      ].concat(actions, [h('a', {class: 'link-btn', href: '#/today'}, T('exam.home'))]))
    ]);
  }

  function closed(kind) {
    return intro(kind, h('p', {class: 'note'}, T('exam.closed')), [h('a', {class: 'btn', href: '#/today'}, T('exam.home'))]);
  }

  function gateIntro(st) {
    var status;
    if (st.cleared) {
      status = h('div', {class: 'exam-status'}, [
        h('span', null, [h('strong', {class: 'exam-status-main'}, st.recheckDue ? T('gate.dueLine') : T('gate.clearedLine', {date: md(st.nextCheck)}))]),
        h('span', {class: 'tk-ok'}, icon(18, CHECK))
      ]);
    } else {
      status = h('div', {class: 'exam-status'}, [
        h('strong', {class: 'exam-status-main'}, T('gate.progress', {n: st.inARow, m: st.need})),
        U().squares(st.inARow, st.need)
      ]);
    }
    var label = st.cleared ? (st.recheckDue ? T('gate.startCheck') : T('gate.checkEarly')) : T('gate.start');
    return intro('gate', status, [h('button', {
      class: 'btn', type: 'button',
      onclick: function () { PM.exam.startGate(PM.dates.iso()); PM.router.refresh(); }
    }, label)]);
  }

  function mockIntro() {
    var list = PM.exam.mocks().slice(-5).reverse();
    var status = list.length ? h('div', {class: 'exam-history'}, [
      h('h2', {class: 'section-h'}, T('mock.history')),
      h('ul', {class: 'hist'}, list.map(function (m) {
        return h('li', null, [
          h('span', {class: 'num'}, T('mock.row', {date: md(m.d), r: m.right, t: m.total, v: m.values, vt: m.valuesTotal})),
          verdictTag(m.pass)
        ]);
      })),
      h('p', {class: 'fine'}, T('mock.inARow', {n: Math.min(2, PM.exam.passesInARow())}))
    ]) : null;
    return intro('mock', status, [h('button', {
      class: 'btn', type: 'button',
      onclick: function () { PM.exam.startMock(PM.dates.iso()); PM.router.refresh(); }
    }, T('mock.start'))]);
  }

  function verdictTag(pass) {
    return h('span', {class: 'verdict-tag ' + (pass ? 'tag-pass' : 'tag-fail')}, pass ? T('exam.pass') : T('exam.fail'));
  }

  // ---- the run (English only) -----------------------------------------------------------------------
  // kind 'gate': answer each question to go on; 'mock': free movement, question map, 45-minute clock.
  function runner(kind, run) {
    var isMock = kind === 'mock', n = run.ids.length;
    var page = h('div', {class: 'page sess exam'});
    var segs, pos, optsBox, foot, timerEl;

    function answered() { return run.answers.filter(function (a) { return a != null; }).length; }
    function save() { PM.store.save(); }

    function submit() {
      stopTimer();
      U().closeSheet();
      var d = PM.dates.iso();
      if (isMock) result.mock = PM.exam.finishMock(d);
      else result.gate = PM.exam.finishGate(d);
      PM.router.refresh();
    }

    function trySubmit(opener) {
      var left = n - answered();
      if (!isMock || !left) { submit(); return; }
      U().openSheet(T('exam.confirmTitle', {n: left}), h('div', {class: 'sheet-body'}, [
        h('h2', {class: 'sheet-title'}, T('exam.confirmTitle', {n: left})),
        h('p', null, T('exam.confirmBody')),
        h('button', {class: 'btn btn-quiet sheet-focus', type: 'button', onclick: function () { U().closeSheet(); }}, T('exam.confirmBack')),
        h('button', {class: 'btn', type: 'button', onclick: submit}, T('exam.confirmGo'))
      ]), opener);
    }

    function exitSheet(opener) {
      U().openSheet(T('exam.exitTitle'), h('div', {class: 'sheet-body'}, [
        h('h2', {class: 'sheet-title'}, T('exam.exitTitle')),
        h('p', null, isMock ? T('exam.mockExitBody') : T('exam.gateExitBody')),
        h('button', {class: 'btn sheet-focus', type: 'button', onclick: function () { U().closeSheet(); }}, T('exam.stay')),
        h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () { U().closeSheet(); PM.router.go('today'); }}, T('exam.leave')),
        isMock ? h('button', {class: 'link-btn exam-drop', type: 'button', onclick: function () {
          U().closeSheet(); PM.exam.dropMock(); PM.router.go('today');
        }}, T('exam.drop')) : null
      ]), opener);
    }

    function mapSheet(opener) {
      var done = answered();
      U().openSheet(T('exam.map'), h('div', {class: 'sheet-body'}, [
        h('h2', {class: 'sheet-title'}, T('exam.map')),
        h('p', {class: 'map-legend'}, T('exam.mapAnswered', {n: done, m: n - done})),
        h('div', {class: 'map-grid'}, run.ids.map(function (_, k) {
          var isDone = run.answers[k] != null;
          return h('button', {
            class: 'map-cell num' + (isDone ? ' map-done' : '') + (k === run.i ? ' map-now sheet-focus' : ''), type: 'button',
            'aria-label': T('exam.mapGo', {n: k + 1, state: isDone ? T('exam.mapDone') : T('exam.mapOpen')}),
            'aria-current': k === run.i ? 'step' : null,
            onclick: function () { U().closeSheet(); go(k); }
          }, String(k + 1));
        })),
        h('button', {class: 'btn', type: 'button', onclick: function (e) { trySubmit(e.currentTarget); }}, T('exam.submitMock'))
      ]), opener);
    }

    function go(k) { run.i = Math.max(0, Math.min(n - 1, k)); save(); paint(); }

    function pick(letter) { run.answers[run.i] = letter; save(); refresh(); }

    function refresh() {
      // segments: answered / current
      while (segs.firstChild) segs.removeChild(segs.firstChild);
      run.ids.forEach(function (_, k) {
        segs.appendChild(h('span', {class: 'seg' + (k === run.i ? ' seg-now' : run.answers[k] != null ? ' seg-done' : '')}));
      });
      segs.setAttribute('aria-valuenow', String(answered()));

      var q = PM.content.question(run.ids[run.i]), cur = run.answers[run.i];
      while (optsBox.firstChild) optsBox.removeChild(optsBox.firstChild);
      q.options_en.forEach(function (text, k) {
        var letter = LETTERS[k], on = cur === letter;
        var choose = function () { pick(letter); };
        optsBox.appendChild(h('div', {class: 'opt ' + (on ? 'opt-picked' : 'opt-idle'), onclick: choose}, [
          h('button', {class: 'opt-btn', type: 'button', 'aria-pressed': String(on),
            'aria-label': T('session.optionAria', {letter: letter, text: text}),
            onclick: function (e) { e.stopPropagation(); choose(); }}, h('span', {class: 'opt-letter'}, letter)),
          h('div', {class: 'opt-main'}, h('span', {class: 'opt-text', lang: 'en'}, text))
        ]));
      });

      var last = run.i === n - 1, canGo = isMock || cur != null;
      while (foot.firstChild) foot.removeChild(foot.firstChild);
      foot.appendChild(h('div', {class: 'two'}, [
        h('button', {class: 'btn btn-quiet', type: 'button', disabled: run.i === 0 ? true : null, onclick: function () { go(run.i - 1); }}, T('exam.prev')),
        last ? h('button', {class: 'btn', type: 'button', disabled: canGo ? null : true, onclick: function (e) { trySubmit(e.currentTarget); }},
          isMock ? T('exam.submitMock') : T('exam.submitGate'))
          : h('button', {class: 'btn', type: 'button', disabled: canGo ? null : true, onclick: function () { go(run.i + 1); }}, T('exam.next'))
      ]));
    }

    // The first tick runs before the page is mounted; after that, a detached clock stops itself.
    var mounted = false;
    function tick() {
      if (!timerEl) return;
      var left = PM.exam.mockLeft();
      timerEl.lastChild.textContent = T('exam.left', {t: clock(left)});
      timerEl.className = 'timer num' + (left <= PM.config.mock.lowSeconds * 1000 ? ' timer-low' : '');
      if (document.body.contains(timerEl)) mounted = true;
      else { if (mounted) stopTimer(); return; }
      if (left <= 0) submit();
    }

    function paint() {
      U().closeSheet();
      while (page.firstChild) page.removeChild(page.firstChild);
      var q = PM.content.question(run.ids[run.i]);
      segs = h('div', {class: 'segs', role: 'progressbar', 'aria-label': T('session.progressAria'),
        'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': '0'});
      pos = h('span', {class: 'pos num'}, T('exam.pos', {n: run.i + 1, m: n}));
      page.appendChild(h('div', {class: 'topbar'}, [
        h('button', {class: 'icon-btn', type: 'button', 'aria-label': T('session.exitAria'), onclick: function (e) { exitSheet(e.currentTarget); }},
          icon(24, CROSS)),
        segs, pos
      ]));
      if (isMock) {
        timerEl = h('span', {class: 'timer num', role: 'timer', 'aria-label': T('exam.timerAria')}, [icon(18, CLOCK), h('span')]);
        page.appendChild(h('div', {class: 'exam-bar'}, [
          timerEl,
          h('button', {class: 'map-btn', type: 'button', onclick: function (e) { mapSheet(e.currentTarget); }}, [icon(18, GRID), T('exam.map')])
        ]));
      }
      optsBox = h('div', {class: 'opts', role: 'group', 'aria-label': T('exam.qn', {n: run.i + 1})});
      page.appendChild(h('main', {class: 'sess-main exam-main'}, [
        h('div', {class: 'kicker'}, [T('exam.qn', {n: run.i + 1}), h('span', {class: 'kicker-sep'}, ' · '), T('exam.englishOnly')]),
        h('h1', {class: 'question', lang: 'en', tabindex: '-1'}, q.question_en),
        optsBox
      ]));
      foot = h('div', {class: 'foot-inner'});
      page.appendChild(h('div', {class: 'foot'}, foot));
      refresh();
      if (isMock) { tick(); if (!timer) timer = setInterval(tick, 1000); }
      window.scrollTo(0, 0);
      var t = page.querySelector('h1');
      if (t && document.body.contains(t)) t.focus({preventScroll: true});
    }

    paint();
    return page;
  }

  // ---- results ---------------------------------------------------------------------------------------
  function missList(res) {
    if (!res.misses.length) return [h('p', {class: 'note'}, T('exam.noMisses'))];
    return [
      h('h2', {class: 'section-h'}, T('exam.missesTitle')),
      h('ul', {class: 'miss-list'}, res.misses.map(function (k) {
        var q = PM.content.question(res.ids[k]);
        if (!q) return null;
        var mine = res.answers[k], mineText = mine != null ? q.options_en[LETTERS.indexOf(mine)] : null;
        return h('li', {class: 'miss'}, [
          h('div', {class: 'kicker'}, T('exam.qn', {n: k + 1})),
          h('p', {class: 'miss-q', lang: 'en'}, q.question_en),
          h('div', {class: 'miss-pick miss-wrong'}, [h('span', {class: 'miss-label'}, T('exam.yourPick')),
            mineText != null ? h('span', {lang: 'en'}, mineText) : h('span', null, T('exam.noAnswer'))]),
          h('div', {class: 'miss-pick miss-right'}, [h('span', {class: 'miss-label'}, T('exam.rightAnswer')),
            h('span', {lang: 'en'}, q.options_en[LETTERS.indexOf(q.answer)])]),
          h('p', {class: 'explain-text'}, mixed(q.explain_zh)),
          U().flagLink(q.id, res.kind)
        ]);
      })),
      h('div', {class: 'review-note'}, [icon(18, ['M4 12a8 8 0 108-8 8 8 0 00-5.7 2.4L4 8', 'M4 4v4h4']), T('exam.missedNote')])
    ];
  }

  function resultCover(good, title, sub) {
    return h('header', {class: 'cover'}, [
      h('div', {class: 'done-title'}, [h('span', {class: 'done-mark' + (good ? '' : ' done-mark-bad')}, icon(20, good ? CHECK : CROSS)), h('h1', null, title)]),
      sub ? h('p', {class: 'cover-lead'}, sub) : null
    ]);
  }

  function home(kind) {
    return h('a', {class: 'btn', href: '#/today', onclick: function () { result[kind] = null; }}, T('exam.home'));
  }

  function gateResult(res) {
    var title = res.ok ? T('gate.allRight') : T('gate.someWrong', {r: res.right, t: res.total});
    var line;
    if (res.justCleared) line = T('gate.cleared');
    else if (res.mode === 'recheck') line = res.ok ? T('gate.checkOk', {date: md(res.nextCheck)}) : T('gate.reopened');
    else if (res.ok) line = T('gate.oneMore', {m: PM.config.values.gateRun - res.inARow});
    else line = T('gate.restart');
    var again = !res.cleared ? h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () {
      result.gate = null; PM.exam.startGate(PM.dates.iso()); PM.router.refresh();
    }}, T('gate.again')) : null;
    return h('div', {class: 'page page-plain'}, [
      resultCover(res.ok, title, line),
      h('main', {class: 'body'}, [
        h('div', {class: 'exam-status'}, res.cleared
          ? [h('strong', {class: 'exam-status-main'}, T('gate.clearedLine', {date: md(res.nextCheck)})), h('span', {class: 'tk-ok'}, icon(18, CHECK))]
          : [h('strong', {class: 'exam-status-main'}, T('gate.runCount', {n: res.inARow, m: PM.config.values.gateRun})),
            U().squares(res.inARow, PM.config.values.gateRun)])
      ].concat(missList(res), [home('gate'), again]))
    ]);
  }

  function mockResult(res) {
    var e = res.entry, C = PM.config.mock, why = [];
    if (!e.pass) {
      if (e.right < C.passMark) why.push(T('mock.whyFailScore', {need: C.passMark, r: e.right}));
      if (e.values < e.valuesTotal) why.push(T('mock.whyFailValues', {v: e.values}));
    }
    function stat(main, label) { return h('div', {class: 'stat'}, [h('div', {class: 'stat-n num'}, main), h('div', {class: 'stat-l'}, label)]); }
    return h('div', {class: 'page page-plain'}, [
      resultCover(e.pass, e.pass ? T('exam.pass') : T('exam.fail'), e.timeUp ? T('mock.timeUp') : null),
      h('main', {class: 'body'}, [
        h('div', {class: 'stats'}, [
          stat(e.right + ' / ' + e.total, T('mock.score')),
          stat(e.values + ' / ' + e.valuesTotal, T('mock.values')),
          stat(String(Math.max(1, Math.round(e.secs / 60))), T('mock.time'))
        ]),
        why.length ? h('ul', {class: 'why-fail'}, why.map(function (w) { return h('li', null, w); })) : null,
        h('p', {class: 'fine'}, T('mock.inARow', {n: Math.min(2, PM.exam.passesInARow())}))
      ].concat(missList(res), [
        home('mock'),
        h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () {
          result.mock = null; PM.exam.startMock(PM.dates.iso()); PM.router.refresh();
        }}, T('mock.again'))
      ]))
    ]);
  }

  // ---- routes ------------------------------------------------------------------------------------------
  function gateView() {
    stopTimer();
    if (result.gate) return gateResult(result.gate);
    var st = PM.exam.gateStatus(PM.dates.iso());
    if (st.run) return runner('gate', st.run);
    if (!st.open) return closed('gate');
    return gateIntro(st);
  }

  function mockView() {
    stopTimer();
    if (result.mock) return mockResult(result.mock);
    var m = PM.store.get().mock;
    if (m) {
      if (PM.exam.mockLeft() <= 0) { result.mock = PM.exam.finishMock(PM.dates.iso()); return mockResult(result.mock); }
      return runner('mock', m);
    }
    if (!PM.exam.isOpen(PM.dates.iso())) return closed('mock');
    return mockIntro();
  }

  PM.examUI = {gate: gateView, mock: mockView, todaySub: todaySub};
})(window.PM = window.PM || {});
