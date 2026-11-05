# PassMate · 入籍过关

A study companion for the Australian citizenship test, for Chinese-speaking
learners. A short daily session with Chinese support that fades as the learner
masters the words. Vanilla HTML/CSS/JS, an offline PWA on GitHub Pages.

Not affiliated with the Australian Government. See [CONTENT.md](CONTENT.md).

## Status

M0 (data pipeline), M1 (app shell), M2 (session screens), M3 (plan engine) and M4
(values gate and mock test) done. The daily session is drawn by `js/plan.js`: stuck words
and repeat mistakes first, Leitner reviews, then new words; stages unlock by mastery; the
streak forgives one missed day a week; a test date adds a sprint week. From stage 2 (or in
sprint week) Today opens the values gate (`#/gate`: 5 values questions from 5 booklet
headings, 5/5 three runs in a row, weekly re-check) and the mock test (`#/mock`: 20
questions, 45 minutes, pass = 15/20 and all 5 values right). Their logic is `js/exam.js`.

## Run it

No build step. Serve the folder over http (a service worker needs it):

```
python -m http.server 8123   # then open http://localhost:8123/
```

All tunable numbers (session size, stage thresholds, plan rules, mock rules) are in `js/config.js`.

### Checking the plan engine

```
node tools/simulate_plan.js                  # 30 days, typical learner, one line per day
node tools/simulate_plan.js --learner weak   # a learner at about 60% right
node tools/simulate_plan.js --days 90 --quiet
```

It runs the real scripts in Node with a debug clock and fails on any session that
breaks a plan rule (shape, duplicates, stuck cap, repeat timing, streak forgiveness).
Gate and mock scoring against the real test rules (every possible mock result, time up,
three runs in a row, weekly re-check):

```
node tools/check_exam.js
```

In the browser, `#/today?clock=3` moves "today" three days on (a red pill shows it);
`?clock=0` puts it back.
When a shell file changes, bump the version in `sw.js` and `js/config.js`.
Icons are placeholders drawn by `tools/make_icons.py`.

## Data pipeline

`tools/build_app_data.py` reads the four checked content files (kept in a
separate, private content workshop), then:

1. keeps only the fields the app shows (review-only fields are dropped),
2. marks the anchor terms in every English stem, option and scenario as
   `[start, end, termId]` character spans, so the app does no text matching,
3. converts all Chinese text and the interface strings to Traditional with
   OpenCC `s2hk`,
4. writes `data/content.zh-Hans.json` and `data/content.zh-Hant.json`,
5. checks the result and prints an anchor coverage report. The build fails on
   duplicate or unknown IDs, an answer that is not a/b/c, an empty Chinese
   field, a Traditional field that is identical to its Simplified text, a
   review-only field in the output, or a file over 400 KB.

```
pip install opencc
python tools/build_app_data.py --content-dir "path/to/content"
```

Without `--content-dir` it uses `PASSMATE_CONTENT_DIR`, then
`../Concepts/PassMate`. Interface strings are written once in Simplified in
`tools/ui_strings.zh-Hans.json`. Simplified is the only hand-edited text.

### Data shape

Each file: `meta`, `ui`, `terms`, `questions`, `drills`, `scenarios`. Items with
English text carry `a` (anchor spans: `q` stem, `o` one list per option, `s`
scenario) and `chip: true` when the item's own term is not underlined on screen.
Terms may carry `confuse` (the terms their trap note names, shown beside a stuck
word); the Rednote card questions that repeat an earlier question carry `dup`.
