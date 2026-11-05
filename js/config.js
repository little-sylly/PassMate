/* All tunable numbers live here. First guesses, to be tuned in the partner trial. */
(function (PM) {
  'use strict';
  PM.config = {
    version: '0.6.0',            // keep in step with CACHE in sw.js
    storeKey: 'passmate.v1',
    storeVersion: 2,
    dataFiles: {'zh-Hans': 'data/content.zh-Hans.json', 'zh-Hant': 'data/content.zh-Hant.json'},
    defaultScript: 'zh-Hans',

    // Session shape (BUILD_PLAN: Plan engine)
    session: {words: 5, questions: 5, scenarios: 1, minutes: 10},

    // Stage and ready-to-sit thresholds. "Questions" = practice questions and wording drills,
    // counted from answers given at the stage below (stage 3 is judged on stage-2 answers).
    stages: {
      2: {minWordsMet: 30, minRight: 0.8, overLast: 20},
      3: {minRight: 0.8, overLast: 30, maxTapsPerQuestion: 1}   // taps + 看中文提示 per question
    },
    mastered: {rightOnDays: 3, noMissInLastDays: 7},
    values: {gateRun: 3, gateQuestions: 5, recheckDays: 7},   // 5/5 three runs in a row; weekly re-check
    mock: {questions: 20, minutes: 45, passMark: 15, valuesQuestions: 5, lowSeconds: 300},   // real test rules
    readyToSit: {partRight: 0.8, partOverLast: 10, partMinAnswers: 5, mocksInARow: 2, wordsMastered: 150},
    sprintDays: 7,
    totalWords: 171,

    // Plan engine (BUILD_PLAN: What each session draws). Days are calendar days.
    plan: {
      boxDays: [0, 1, 3, 7],     // Leitner box n -> next review n days on (box 3 stays at +7)
      repeatDays: [1, 3],        // a missed question comes back 1 day later, then 3 days later
      repairQuestions: 3,        // question slots for stuck words, repeat mistakes and trap drills (not in sprint)
      minNewWords: 3,            // word slots kept for new words while any are left (not in sprint)
      stuckDays: 3,              // tapped or missed on this many separate days = stuck
      stuckClearDays: 3,         // right on this many separate days unsticks it (A4: three squares)
      maxStuck: 2,               // stuck words per session
      confusePerStuck: 2,        // words from its trap note shown beside one stuck word (1 each when two)
      wordingTrapMisses: 3,      // misses on a wording trap (NOT, EXCEPT...) that bring a drill
      newWordingPerSession: 2,   // new question-wording terms per session; content words fill the rest
      maxDrills: 1,              // wording drills per session
      difficultyMix: {1: 0.3, 2: 0.5, 3: 0.2},   // stages 2-3; stage 1 leans to difficulty 1-2
      offerSnoozeDays: 3,        // after "先不用", ask about the next stage again this many days later
      extraQuestions: 5,         // 再练 5 道错题 after Done
      logSize: 60                // answers kept for the stage checks
    },

    // Streak: one missed day in any 7 is forgiven.
    streak: {forgiveEvery: 7}
  };
})(window.PM = window.PM || {});
