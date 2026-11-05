# PassMate · 入籍过关

A study companion for the Australian citizenship test, for Chinese-speaking
learners. A short daily session with Chinese support that fades as the learner
masters the words. Vanilla HTML/CSS/JS, an offline PWA on GitHub Pages.

Not affiliated with the Australian Government. See [CONTENT.md](CONTENT.md).

## Status

M0 (data pipeline) and M1 (app shell) done: hash router, versioned localStorage record,
简/繁 toggle, Welcome, Test date and Today (fixed sample session), installable and offline.
The session screens are next (M2).

## Run it

No build step. Serve the folder over http (a service worker needs it):

```
python -m http.server 8123   # then open http://localhost:8123/
```

All tunable numbers (session size, stage thresholds, mock rules) are in `js/config.js`.
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
