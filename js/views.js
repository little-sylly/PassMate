/* Screens. Layout follows DESIGN.md (direction A). */
(function (PM) {
  'use strict';
  var h = PM.dom.h, icon = PM.dom.icon, T = function (p, v) { return PM.content.ui(p, v); };

  var CAL = [{rect: {x: 3, y: 5, width: 18, height: 16, rx: 2}}, 'M3 10h18M8 3v4M16 3v4'];

  // ---- shared pieces ------------------------------------------------------
  function scriptToggle() {
    var cur = PM.store.get().script || PM.config.defaultScript;
    function btn(script, key) {
      return h('button', {
        type: 'button', 'aria-pressed': String(cur === script), lang: script,
        onclick: function () {
          if (script === cur) return;
          PM.store.set({script: script});
          PM.router.refresh();
        }
      }, T('script.' + key));
    }
    return h('div', {class: 'toggle', role: 'group', 'aria-label': T('script.aria')},
      [btn('zh-Hans', 'hans'), btn('zh-Hant', 'hant')]);
  }

  function topRow() {
    return h('div', {class: 'cover-row'}, [h('div', {class: 'brand'}, T('app.name')), scriptToggle()]);
  }

  function tabBar(active) {
    var tabs = [
      ['today', [{rect: {x: 4, y: 5, width: 16, height: 15, rx: 2}}, 'M4 10h16M9 3v4M15 3v4']],
      ['review', ['M5 4h11l3 3v13H5z', 'M9 11h6M9 15h4']],
      ['progress', ['M5 19V11M12 19V6M19 19v-5']]
    ];
    return h('nav', {class: 'tabbar', 'aria-label': T('tabs.aria')}, tabs.map(function (t) {
      return h('a', {href: '#/' + t[0], 'aria-current': active === t[0] ? 'page' : null},
        [icon(24, t[1]), T('tabs.' + t[0])]);
    }));
  }

  function formatDate(iso) {
    var d = PM.dates.parse(iso);
    return d ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' : iso;
  }

  function masteredCount() {
    var items = PM.store.get().items, n = 0;
    for (var k in items) if (items[k] && items[k].mastered) n++;
    return n;
  }

  // ---- Welcome --------------------------------------------------------------
  function welcome() {
    return h('div', {class: 'page page-plain'}, [
      h('header', {class: 'cover'}, [
        topRow(),
        h('h1', {class: 'hero-title'}, T('welcome.title')),
        h('p', {class: 'cover-lead'}, T('welcome.lead'))
      ]),
      h('main', {class: 'body'}, [
        h('ul', {class: 'points'}, ['p1', 'p2', 'p3'].map(function (k) {
          return h('li', null, T('welcome.' + k));
        })),
        h('p', {class: 'note'}, T('welcome.install')),
        h('button', {
          class: 'btn', type: 'button',
          onclick: function () {
            var s = PM.store.get();
            PM.store.set({welcomed: true, script: s.script || PM.config.defaultScript});
            PM.router.go('date');
          }
        }, T('welcome.start')),
        h('p', {class: 'fine'}, T('app.notAffiliated')),
        h('p', {class: 'fine'}, T('app.credit'))
      ])
    ]);
  }

  // ---- Test date ------------------------------------------------------------
  function testDate() {
    var s = PM.store.get(), today = PM.dates.iso();
    var error = h('p', {class: 'error', role: 'alert'});
    var input = h('input', {type: 'date', id: 'testdate', min: today, value: s.testDate || '', class: 'field'});
    var form = h('div', {class: 'date-form'}, [
      h('label', {for: 'testdate', class: 'label'}, T('date.label')), input, error,
      h('button', {
        class: 'btn', type: 'button',
        onclick: function () {
          var v = input.value;
          error.textContent = '';
          if (!v) { error.textContent = T('date.errorEmpty'); return; }
          if (v < today) { error.textContent = T('date.errorPast'); return; }
          PM.store.set({testDate: v, dateAnswered: true});
          PM.router.go('today');
        }
      }, T('date.save'))
    ]);
    form.hidden = !s.testDate;
    var yes = h('button', {
      class: 'btn btn-quiet', type: 'button',
      onclick: function () { form.hidden = false; yes.hidden = true; input.focus(); }
    }, T('date.yes'));
    yes.hidden = !!s.testDate;

    function answerNo() {
      PM.store.set({testDate: null, dateAnswered: true});
      PM.router.go('today');
    }

    return h('div', {class: 'page page-plain'}, [
      h('header', {class: 'cover'}, [
        topRow(),
        h('h1', {class: 'hero-title'}, T('date.title')),
        h('p', {class: 'cover-lead'}, T('date.lead'))
      ]),
      h('main', {class: 'body'}, [
        h('button', {class: 'btn', type: 'button', onclick: answerNo}, T('date.no')),
        yes, form,
        s.testDate ? h('button', {class: 'link-btn', type: 'button', onclick: answerNo}, T('date.clear')) : null,
        h('p', {class: 'note'}, T('date.later')),
        s.dateAnswered ? h('a', {class: 'link-btn', href: '#/today'}, T('date.back')) : null
      ])
    ]);
  }

  // ---- Today ----------------------------------------------------------------
  function weekMarks(s) {
    var todayIso = PM.dates.iso(), days = PM.dates.week();
    return h('div', {class: 'week', role: 'group', 'aria-label': T('today.weekAria')}, days.map(function (d) {
      var iso = PM.dates.iso(d), state, label;
      if (s.streak.days[iso]) { state = 'done'; label = T('today.dayDone'); }
      else if (s.streak.saved[iso]) { state = 'saved'; label = T('today.daySaved'); }
      else if (iso === todayIso) { state = 'today'; label = T('today.dayToday'); }
      else if (iso > todayIso) { state = 'next'; label = T('today.dayNext'); }
      else { state = 'next'; label = T('today.dayMissed'); }
      var name = dayName(d.getDay());
      return h('span', {class: 'day', role: 'img', 'aria-label': name + ' ' + label}, [
        h('span', {class: 'day-name', 'aria-hidden': 'true'}, name),
        h('span', {class: 'mark mark-' + state, 'aria-hidden': 'true'})
      ]);
    }));
  }

  function dayName(dow) { return T('today.dayMarks.' + dow); }

  function stageTabs(stage) {
    return h('nav', {class: 'stages', 'aria-label': T('stages.aria')}, [1, 2, 3].map(function (n) {
      return h('div', {class: 'stage' + (n === stage ? ' stage-on' : ''), 'aria-current': n === stage ? 'step' : null},
        T('stages.' + n));
    }));
  }

  function stepRow(num, title, sub, extra) {
    return h('li', {class: 'step'}, [
      h('span', {class: 'step-num'}, String(num)),
      h('span', {class: 'step-text'}, [h('span', {class: 'step-title'}, [title, extra]), sub])
    ]);
  }

  function navRow(title, sub, href, locked) {
    var lockIcon = icon(20, [{rect: {x: 6, y: 11, width: 12, height: 9, rx: 2}}, 'M8.5 11V8a3.5 3.5 0 017 0v3']);
    var inner = [
      h('span', null, [h('span', {class: 'nav-title'}, title), h('span', {class: 'nav-sub'}, sub)]),
      locked ? lockIcon : icon(20, ['M9 5l7 7-7 7'])
    ];
    return locked ? h('div', {class: 'nav-row nav-locked'}, inner) : h('a', {class: 'nav-row', href: href}, inner);
  }

  function dateRow(s) {
    if (!s.testDate) return h('a', {class: 'date-row', href: '#/date'}, [icon(18, CAL), T('today.addDate')]);
    var n = PM.dates.daysBetween(PM.dates.iso(), s.testDate);
    var line = n > 0 ? T('today.countdown', {n: n}) : n === 0 ? T('today.countdownToday') : null;
    return h('div', {class: 'date-row date-set'}, [
      icon(18, CAL),
      h('span', null, [
        line ? h('strong', {class: 'date-count'}, line) : null,
        h('a', {class: 'date-edit', href: '#/date'}, T('today.editDate', {date: formatDate(s.testDate)}))
      ])
    ]);
  }

  function today() {
    var s = PM.store.get(), cfg = PM.config, sample = cfg.sample, stage = s.stage;
    var mastered = masteredCount(), total = cfg.totalWords;
    var names = sample.terms.map(function (id) {
      var t = PM.content.term(id);
      return t ? PM.content.shortTerm(t) : null;
    }).filter(Boolean);
    var wordLine = h('span', {class: 'step-sub', lang: 'en'}, names.join(' · '));

    return h('div', {class: 'page has-tabs'}, [
      h('header', {class: 'cover'}, [
        topRow(),
        h('div', {class: 'streak-row'}, [
          h('div', null, [
            h('div', {class: 'cover-muted'}, T('today.streak')),
            h('div', {class: 'streak'}, [h('span', {class: 'streak-n'}, String(s.streak.count)),
              h('span', {class: 'streak-u'}, T('today.days'))])
          ]),
          weekMarks(s)
        ]),
        h('div', {class: 'mastery'}, [
          h('span', null, T('today.mastered')),
          h('span', {class: 'num'}, [h('strong', null, String(mastered)), ' / ' + total])
        ]),
        h('div', {
          class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total),
          'aria-valuenow': String(mastered), 'aria-label': T('today.mastered')
        }, h('div', {class: 'bar-fill', style: 'width:' + Math.round(mastered / total * 100) + '%'}))
      ]),
      h('div', {class: 'sheet'}, [
        stageTabs(stage),
        h('main', {class: 'body body-tabs'}, [
          h('div', {class: 'title-row'}, [
            h('h1', null, T('today.title')),
            h('span', {class: 'muted'}, T('today.time'))
          ]),
          h('ol', {class: 'steps'}, [
            stepRow(cfg.session.words, T('today.words'), wordLine, h('span', {class: 'tag'}, T('today.sample'))),
            stepRow(cfg.session.questions, T('today.questions'), h('span', {class: 'step-sub'}, T('today.questionsSub'))),
            stepRow(cfg.session.scenarios, T('today.scenario'), h('span', {class: 'step-sub'}, T('today.scenarioSub')))
          ]),
          h('p', {class: 'fine fine-tight'}, T('today.sampleNote')),
          h('a', {class: 'btn', href: '#/session'}, T('today.start')),
          h('div', {class: 'navlist'}, [
            navRow(T('today.gate'), stage >= 2 ? T('today.gateSub') : T('today.locksAt'), '#/gate', stage < 2),
            navRow(T('today.mock'), stage >= 2 ? T('today.mockSub') : T('today.locksAt'), '#/mock', stage < 2),
            dateRow(s)
          ])
        ])
      ]),
      tabBar('today')
    ]);
  }

  // ---- Session stub (M2 replaces this) ---------------------------------------
  function session() {
    var sample = PM.config.sample;
    var words = sample.terms.map(function (id) {
      var t = PM.content.term(id);
      return t ? h('li', null, [h('span', {lang: 'en', class: 'en-strong'}, PM.content.shortTerm(t)), ' ' + t.zh]) : null;
    });
    var qs = sample.questions.map(function (id) {
      var q = PM.content.question(id);
      return q ? h('li', {lang: 'en'}, q.question_en) : null;
    });
    return h('div', {class: 'page has-tabs'}, [
      h('header', {class: 'cover cover-slim'}, [topRow()]),
      h('main', {class: 'body'}, [
        h('h1', null, T('session.title')),
        h('p', null, T('session.body')),
        h('p', {class: 'muted'}, T('session.plan')),
        h('ul', {class: 'plain-list'}, words), h('ol', {class: 'plain-list'}, qs),
        h('a', {class: 'btn btn-quiet', href: '#/today'}, T('session.back'))
      ]),
      tabBar('today')
    ]);
  }

  // ---- Placeholder tabs (M5) ---------------------------------------------------
  function soon(name) {
    return h('div', {class: 'page has-tabs'}, [
      h('header', {class: 'cover cover-slim'}, [topRow()]),
      h('main', {class: 'body'}, [
        h('h1', null, T('soon.title')), h('p', null, T('soon.body')),
        h('a', {class: 'btn btn-quiet', href: '#/today'}, T('soon.back'))
      ]),
      tabBar(name)
    ]);
  }

  // ---- Load error (strings may not be loaded, so these are fixed) --------------
  function loadError(retry) {
    return h('div', {class: 'page page-plain'}, [h('main', {class: 'body'}, [
      h('h1', null, '内容加载失败'),
      h('p', null, '请检查网络后重试。 / Could not load. Check your connection.'),
      h('button', {class: 'btn', type: 'button', onclick: retry}, '重试 / Retry')
    ])]);
  }

  PM.views = {welcome: welcome, date: testDate, today: today, session: session, soon: soon, loadError: loadError};
})(window.PM = window.PM || {});
