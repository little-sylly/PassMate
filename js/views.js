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

  // The step up offered when she is ready for less Chinese. She decides.
  function offerCard(n) {
    return h('section', {class: 'offer', 'aria-labelledby': 'offer-h'}, [
      h('h2', {id: 'offer-h', class: 'offer-title'}, T('today.offerTitle')),
      h('p', {class: 'offer-text'}, T('today.offer' + n)),
      h('div', {class: 'two'}, [
        h('button', {class: 'btn btn-quiet', type: 'button', onclick: function () { PM.plan.declineStage(n); PM.router.refresh(); }}, T('today.offerNo')),
        h('button', {class: 'btn', type: 'button', onclick: function () { PM.plan.acceptStage(n); PM.router.refresh(); }}, T('today.offerYes'))
      ])
    ]);
  }

  // Sprint week (a test date within 7 days); 3 days out, what is still left on the checklist.
  function sprintNote(s, d) {
    if (!PM.plan.sprint(d)) return null;
    var lines = [h('strong', null, T('today.sprint'))];
    if (PM.dates.daysBetween(d, s.testDate) <= 3) {
      var r = PM.plan.readiness(d);
      var left = r.list.filter(function (c) { return !c.ok; }).map(function (c) {
        return T('ready.' + c.key, {n: PM.config.readyToSit.wordsMastered});
      });
      if (left.length) lines.push(h('span', {class: 'sprint-left'}, T('today.sprintLeft', {items: left.join(T('today.listSep'))})));
    }
    return h('p', {class: 'sprint'}, lines);
  }

  // Debug clock pill (#/today?clock=N). Never shown unless the clock was moved.
  function debugClock(d) {
    if (!PM.clock.offset) return null;
    function move(n) { return function () { PM.clock.set(n); PM.router.refresh(); }; }
    return h('div', {class: 'debug-clock', lang: 'en'}, [
      h('span', null, 'Debug clock +' + PM.clock.offset + 'd · ' + d),
      h('button', {type: 'button', onclick: move(PM.clock.offset + 1)}, '+1 day'),
      h('button', {type: 'button', onclick: move(0)}, 'Reset')
    ]);
  }

  function today() {
    var s = PM.store.get(), cfg = PM.config, d = PM.dates.iso();
    PM.plan.streak(d);                      // a missed day can end the streak without a session
    var run = PM.plan.todayRun(), stage = s.stage || 1, offer = PM.plan.offer(d);
    PM.store.save();
    var mastered = PM.plan.masteredCount(d), total = cfg.totalWords;

    var words = run.items.filter(function (it) { return it.kind === 'word'; });
    var qs = run.items.filter(function (it) { return it.kind === 'q' || it.kind === 'drill'; });
    var scen = run.items.filter(function (it) { return it.kind === 'scenario'; });
    var stuckN = words.filter(function (it) { return it.why === 'stuck'; }).length;

    var wordLine = h('span', {class: 'step-sub', lang: 'en'}, words.map(function (it, i) {
      var name = PM.content.shortTerm(PM.content.term(it.id));
      return [i ? ' · ' : '', it.why === 'stuck' ? h('strong', null, name) : name];
    }));
    var qBits = [], reps = qs.filter(function (it) { return it.why === 'repeat'; }).length;
    var drill = qs.filter(function (it) { return it.kind === 'drill'; })[0];
    if (reps) qBits.push(T('today.repeatSub', {n: reps}));
    if (drill) qBits.push(T('today.drillSub', {word: PM.content.shortTerm(PM.content.term(PM.content.drill(drill.id).term_id))}));
    var qLine = h('span', {class: 'step-sub'}, qBits.length ? PM.dom.mixed(qBits.join(' · ')) : T('today.questionsSub'));

    var action;
    if (run.done) {
      var extraN = Math.min(PM.plan.repeats().length, cfg.plan.extraQuestions);
      action = [
        h('div', {class: 'done-note'}, [h('span', {class: 'done-mark done-mark-ink'}, icon(18, ['M5 12.5l4.5 4.5L19 7.5'])),
          h('span', null, [h('strong', null, T('today.doneTitle')), h('span', {class: 'done-note-sub'}, T('today.doneSub'))])]),
        extraN ? h('a', {class: 'btn', href: '#/session?extra=1', onclick: function () { PM.session.startExtra(); }}, T('today.extra', {n: extraN})) : null,
        h('a', {class: 'btn btn-quiet', href: '#/session'}, T('today.seeResult'))
      ];
    } else {
      action = [h('a', {class: 'btn', href: '#/session'}, run.i > 0 ? T('today.continue') : T('today.start'))];
    }

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
          debugClock(d),
          offer ? offerCard(offer) : null,
          h('div', {class: 'title-row'}, [
            h('h1', null, T('today.title')),
            h('span', {class: 'muted'}, T('today.time'))
          ]),
          h('ol', {class: 'steps' + (run.done ? ' steps-done' : '')}, [
            stepRow(words.length, T('today.words'), wordLine, stuckN ? h('span', {class: 'tag'}, T('today.stuckTag', {n: stuckN})) : null),
            stepRow(qs.length, T('today.questions'), qLine),
            scen.length ? stepRow(scen.length, T('today.scenario'), h('span', {class: 'step-sub'}, T('today.scenarioSub'))) : null
          ]),
          sprintNote(s, d)
        ].concat(action, [
          h('div', {class: 'navlist'}, [
            gateRow('gate', stage), gateRow('mock', stage),
            dateRow(s)
          ])
        ]))
      ]),
      tabBar('today')
    ]);
  }

  // Values gate and mock test rows: open from stage 2 once their screens exist (M4).
  function gateRow(name, stage) {
    var built = PM.router.has(name), open = stage >= 2 && built;
    var sub = stage < 2 ? T('today.locksAt') : built ? T('today.' + name + 'Sub') : T('today.soon');
    return navRow(T('today.' + name), sub, '#/' + name, !open);
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

  PM.views = {welcome: welcome, date: testDate, today: today, session: function () { return PM.sessionUI.view(); }, soon: soon,
    loadError: loadError, weekMarks: weekMarks};
})(window.PM = window.PM || {});
