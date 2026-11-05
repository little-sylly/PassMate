/* All tunable numbers live here. First guesses, to be tuned in the partner trial. */
(function (PM) {
  'use strict';
  PM.config = {
    version: '0.2.1',            // keep in step with CACHE in sw.js
    storeKey: 'passmate.v1',
    storeVersion: 1,
    dataFiles: {'zh-Hans': 'data/content.zh-Hans.json', 'zh-Hant': 'data/content.zh-Hant.json'},
    defaultScript: 'zh-Hans',

    // Session shape (BUILD_PLAN: Plan engine)
    session: {words: 5, questions: 5, scenarios: 1, minutes: 10},

    // Stage and ready-to-sit thresholds (not used until M3/M5, kept here on purpose)
    stages: {
      2: {minWordsMet: 30, minRight: 0.8, overLast: 20},
      3: {minRight: 0.8, overLast: 30, maxTapsPerQuestion: 1}
    },
    mastered: {rightOnDays: 3, noMissInLastDays: 7},
    values: {gateRun: 3, gateQuestions: 5},
    mock: {questions: 20, minutes: 45, passMark: 15, valuesQuestions: 5},
    readyToSit: {partRight: 0.8, mocksInARow: 2, wordsMastered: 150},
    sprintDays: 7,
    totalWords: 171,

    // Fixed sample for the M1 Today screen: real items, not a real plan.
    sample: {
      terms: ['A092', 'A088', 'A057', 'A054', 'A055'],
      questions: ['PQ001', 'PQ006', 'PQ004', 'PQ005', 'PQ002'],
      scenario: 'VS01'
    }
  };
})(window.PM = window.PM || {});
