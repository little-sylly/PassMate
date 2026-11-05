#!/usr/bin/env python3
"""Build the app's data files from the content workshop's checked JSON.

    python tools/build_app_data.py [--content-dir DIR] [--out-dir DIR]

Reads anchor-terms, practice-questions, question-wording-drills and
values-scenarios (.json) from the content folder, then:

  1. keeps only what the app shows (explicit whitelists: review-only fields
     such as evidence, fact_en, en_check and the review columns never pass),
  2. marks anchor-term spans in every English stem, option and scenario, so
     the app does no text matching,
  3. converts every Chinese field and the interface strings to Traditional
     with OpenCC s2hk (Simplified stays the only hand-edited text),
  4. writes data/content.zh-Hans.json and data/content.zh-Hant.json,
  5. runs the checks (exit 1 on any failure) and prints the anchor coverage
     report.

The content folder is found via --content-dir, the PASSMATE_CONTENT_DIR
environment variable, or ../Concepts/PassMate next to this repo.
Run with Python 3.9+ and `pip install opencc`.
"""
import argparse
import gzip
import json
import os
import re
import sys

try:
    import opencc
except ImportError:  # pragma: no cover
    sys.exit("OpenCC is missing: pip install opencc")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_BYTES = 400 * 1024

# --------------------------------------------------------------------------
# What the app keeps (whitelists)
# --------------------------------------------------------------------------
TERM_KEEP = ["id", "part", "type", "term", "zh", "explain", "trap", "card"]
TERM_ZH = ["zh", "explain", "trap"]

QUESTION_KEEP = ["id", "term_id", "part", "heading", "difficulty", "wording_terms",
                 "wording_focus", "question_en", "options_en", "answer", "gist_zh",
                 "explain_zh", "booklet_pages", "rednote_card"]
QUESTION_ZH = ["gist_zh", "explain_zh"]

DRILL_KEEP = ["id", "term_id", "decode", "question_en", "options_en", "answer",
              "tip_zh", "explain_zh", "twin", "booklet_pages"]
DRILL_ZH = ["tip_zh", "explain_zh"]

SCENARIO_KEEP = ["id", "term_id", "value_area", "scenario_en", "scenario_zh",
                 "question_en", "options_en", "answer", "why_zh", "takeaway_zh",
                 "booklet_pages"]
SCENARIO_ZH = ["scenario_zh", "why_zh", "takeaway_zh"]

# Must never appear in the output.
REVIEW_ONLY = {"evidence", "fact_en", "en_check", "booklet_checked", "native_reviewed",
               "source", "format", "term_en_check", "part_name"}

UI_STRINGS_FILE = os.path.join(ROOT, "tools", "ui_strings.zh-Hans.json")

# --------------------------------------------------------------------------
# Anchor matching
# --------------------------------------------------------------------------
# Hand-kept word forms the term field does not give (plurals are automatic).
# Keys are term IDs. Add here when the coverage report shows a miss.
VARIANTS = {
    "A003": ["colonial"],
    "A005": ["convicts", "convicted", "convict ships"],
    "A006": ["settle", "settled", "settling", "settlers", "settlements", "settlement"],
    "A007": ["Aboriginal", "Torres Strait Islander"],
    "A008": ["Indigenous Australians"],
    "A011": ["traditional owner", "traditional custodians", "custodian"],
    "A013": ["Anzacs"],
    "A016": ["commemorates", "commemorated", "commemorating", "commemoration"],
    "A017": ["the national capital"],
    "A034": ["migrate", "migrated", "migrating", "immigrate", "immigrated", "immigrant",
             "immigrants", "migration", "immigration", "migrants"],
    "A035": ["multiculturalism"],
    "A036": ["democratic"],
    "A039": ["live peacefully", "peacefully", "peaceful"],
    "A041": ["free speech", "freedom of expression", "freedom of speech"],
    "A042": ["defamed", "defaming", "defamatory", "defame"],
    "A043": ["incited", "inciting", "incitement"],
    "A046": ["secularism"],
    "A049": ["liberties"],
    "A050": ["responsibility"],
    "A051": ["privilege"],
    "A052": ["votes", "voted", "voting", "voter", "voters"],
    "A053": ["compulsory voting"],
    "A054": ["enrolled", "enrolling", "enrolls", "enrolment", "enrollment"],
    "A055": ["juror", "jurors", "jury service"],
    "A057": ["pledged", "pledges"],
    "A058": ["citizenship ceremonies"],
    "A059": ["loyal"],
    "A061": ["discriminated", "discriminating", "discriminatory"],
    "A062": ["consular"],
    "A063": ["constitutional"],
    "A064": ["referenda", "referendums"],
    "A066": ["federal government", "federal governments", "Commonwealth Government",
             "federal laws", "federal law"],
    "A068": ["local council", "local councils", "council", "councils", "local governments"],
    "A069": ["state government", "state governments"],
    "A070": ["federal government responsibilities"],
    "A072": ["governments"],
    "A073": ["House of Reps"],
    "A076": ["Members of Parliament", "MPs", "member of parliament"],
    "A077": ["electorates", "divisions"],
    "A083": ["political parties"],
    "A086": ["Opposition"],
    "A088": ["Premiers"],
    "A090": ["Ministers", "minister"],
    "A093": ["King", "Queen", "monarchy", "monarchs"],
    "A094": ["constitutional monarchy"],
    "A099": ["bills"],
    "A100": ["Acts of Parliament", "Act of Parliament"],
    "A105": ["court", "courts", "judiciary", "judicial"],
    "A107": ["judges", "magistrates", "magistrate", "judge"],
    "A109": ["innocent until proven guilty"],
    "A110": ["bribed", "bribes", "bribery", "bribing"],
    "A111": ["public servants", "public service"],
    "A112": ["family violence", "domestic violence"],
    "A123": ["tolerant", "tolerate", "tolerated", "intolerance", "intolerant"],
    "A125": ["consent", "consented", "freedom of choice"],
    "A127": ["cultural practice"],
    "A163": ["same-sex marriage"],
    "A164": ["age of consent"],
    "A166": ["racist", "racial", "racially", "racially abusive"],
    "A167": ["reported", "reporting", "reports"],
    "A168": ["volunteers", "volunteered", "volunteering", "volunteer work"],
    "A169": ["dual citizen", "dual citizens"],
    "A171": ["opals"],
    "A174": ["taxes", "taxation", "taxed", "Australian Taxation Office"],
    "A175": ["Mayors", "councillors", "Shire Presidents"],
}

# Part 5 (question wording) terms are matched with these patterns, in the
# question stem only (underlining "can" or "all" in every option is noise).
# Patterns that are too common to underline (must / can-may / should / all-some-any /
# role / represent / make-laws / best) are left to the item's wording_terms field.
WORDING_PATTERNS = {
    "A130": (r"\bNOT\b", 0),
    "A131": (r"\bEXCEPT\b", re.I),
    "A132": (r"\bwhich of (?:the following|these)\b", re.I),
    "A133": (r"\bwhich statement\b(?: (?:is|are))?(?: (?:correct|true|incorrect|false))?", re.I),
    "A134": (r"\b(?:incorrect|false|untrue)\b", re.I),
    "A138": (r"\bmust not\b|\bdo(?:es)? not have to\b|\b(?:don't|doesn't) have to\b", re.I),
    "A139": (r"\b(?:allowed|permitted) to\b", re.I),
    "A140": (r"\brequired (?:to|by law)\b", re.I),
    "A141": (r"\bonly\b", re.I),
    "A142": (r"\b(?:always|never)\b", re.I),
    "A144": (r"\bresponsib(?:le|ility) for\b", re.I),
    "A147": (r"\bknown as\b|\bcalled\b", re.I),
    "A148": (r"\brefers? to\b", re.I),
    "A149": (r"\bexample of\b", re.I),
    "A150": (r"\bunder (?:the |Australian )(?:law|Constitution)\b", re.I),
    "A151": (r"\bagainst the law\b|\billegal\b|\bunlawful\b", re.I),
    "A152": (r"\bentitled to\b", re.I),
    "A153": (r"\beligible\b", re.I),
    "A154": (r"\bregardless of\b", re.I),
    "A155": (r"\bunless\b", re.I),
    "A156": (r"\bneither\b|\bnor\b", re.I),
    "A157": (r"\binstead of\b", re.I),
    "A158": (r"\bon behalf of\b", re.I),
    "A160": (r"\bappl(?:y|ies) to\b", re.I),
}

CASE_SENSITIVE_FORMS = {"Act", "Acts"}  # plus any all-caps form (see is_cs)


def is_cs(form):
    return form in CASE_SENSITIVE_FORMS or (form.isupper() and any(c.isalpha() for c in form))


def term_forms(term):
    """English forms for a Part 1-4 term: brackets stripped (a bracketed
    acronym is kept), split on '/', leading 'the ' dropped, plurals added."""
    forms = []
    for acr in re.findall(r"\(([A-Z]{2,6})\)", term):
        forms.append(acr)
    t = re.sub(r"\([^)]*\)", " ", term)
    for piece in re.split(r"\s*/\s*", t):
        piece = re.sub(r"\s+", " ", piece).strip()
        piece = re.sub(r"^the\s+", "", piece, flags=re.I)
        if len(piece) >= 3:
            forms.append(piece)
    return forms


def plural_forms(form):
    if is_cs(form) and form.isupper():
        return [form + "s"]
    low = form.lower()
    if low.endswith("y") and not low.endswith(("ay", "ey", "oy", "uy")):
        return [form[:-1] + "ies"]
    if low.endswith(("s", "x", "ch", "sh")):
        return [form + "es"] if not low.endswith("s") else []
    return [form + "s"]


class Marker:
    def __init__(self, terms):
        self.rules = []  # (compiled regex, term_id, form)
        self.collisions = {}
        seen = {}  # normalised form -> term id
        for t in terms:
            if t["part"] == 5:
                continue
            forms = term_forms(t["term"]) + VARIANTS.get(t["id"], [])
            for f in list(forms):
                forms.extend(plural_forms(f))
            for f in dict.fromkeys(forms):
                key = f if is_cs(f) else f.lower()
                if key in seen and seen[key] != t["id"]:
                    # Keep the earliest term; report so a human can check it.
                    self.collisions.setdefault(key, [seen[key]]).append(t["id"])
                    continue
                seen[key] = t["id"]
                pat = r"(?<![A-Za-z0-9])" + re.escape(f).replace(r"\ ", r"\s+") + r"(?![A-Za-z0-9])"
                self.rules.append((re.compile(pat, 0 if is_cs(f) else re.I), t["id"]))
        self.wording = [(re.compile(p, fl), tid) for tid, (p, fl) in WORDING_PATTERNS.items()]
        known = {t["id"] for t in terms}
        for k in VARIANTS:
            if k not in known:
                raise SystemExit(f"VARIANTS names unknown term {k}")

    def spans(self, text, wording=False):
        found = []
        rules = list(self.rules) + (self.wording if wording else [])
        for rx, tid in rules:
            for m in rx.finditer(text):
                found.append((m.start(), m.end(), tid))
        # longest match first, then leftmost; keep non-overlapping
        found.sort(key=lambda s: (-(s[1] - s[0]), s[0]))
        taken = []
        for s in found:
            if all(s[1] <= o[0] or s[0] >= o[1] for o in taken):
                taken.append(s)
        taken.sort()
        return [[a, b, tid] for a, b, tid in taken]


# --------------------------------------------------------------------------
# Building
# --------------------------------------------------------------------------
def load(content_dir, name, key=None):
    path = os.path.join(content_dir, name + ".json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if key is None else data[key]


OPTIONAL = {"card", "rednote_card", "booklet_pages"}


def keep(row, fields):
    """Whitelist copy. Empty optional fields are dropped; any other empty field
    is kept so the empty-Chinese-field check can see it."""
    return {k: row[k] for k in fields
            if k in row and row[k] is not None and not (row[k] == "" and k in OPTIONAL)}


def mark_item(marker, item, own_term, fields):
    """fields: list of (key, path) where path is 'q', 'o', 's'. Adds item['a']
    and item['chip'] (own term not marked anywhere on screen)."""
    anchors = {}
    q = marker.spans(item["question_en"], wording=True)
    if q:
        anchors["q"] = q
    opts = [marker.spans(o) for o in item["options_en"]]
    if any(opts):
        anchors["o"] = opts
    if "scenario_en" in item:
        s = marker.spans(item["scenario_en"])
        if s:
            anchors["s"] = s
    if anchors:
        item["a"] = anchors
    on_screen = set()
    for key, v in anchors.items():
        for sp in ([x for grp in v for x in grp] if key == "o" else v):
            on_screen.add(sp[2])
    if own_term not in on_screen:
        item["chip"] = True
    return on_screen


def build_simplified(content_dir):
    terms_raw = load(content_dir, "anchor-terms")
    questions_raw = load(content_dir, "practice-questions", "questions")
    drills_raw = load(content_dir, "question-wording-drills", "drills")
    scenarios_raw = load(content_dir, "values-scenarios", "scenarios")

    terms = [keep(t, TERM_KEEP) for t in terms_raw]
    marker = Marker(terms)
    marked_terms = {}  # term id -> count of marks across the content

    def tally(ids):
        for tid in ids:
            marked_terms[tid] = marked_terms.get(tid, 0) + 1

    def count(item):
        a = item.get("a", {})
        for key, v in a.items():
            if key == "o":
                for grp in v:
                    tally(sp[2] for sp in grp)
            else:
                tally(sp[2] for sp in v)

    questions = []
    for r in questions_raw:
        q = keep(r, QUESTION_KEEP)
        if q.get("rednote_card") in (0, "0"):
            q.pop("rednote_card", None)
        if q["part"] != 4:  # heading is only used to spread the Part 4 values gate
            q.pop("heading", None)
        mark_item(marker, q, q["term_id"], None)
        count(q)
        questions.append(q)

    drills = []
    for r in drills_raw:
        d = keep(r, DRILL_KEEP)
        mark_item(marker, d, d["term_id"], None)
        count(d)
        if "twin" in d:
            tw = {k: d["twin"][k] for k in ("kind", "question_en", "options_en", "answer", "explain_zh")
                  if k in d["twin"]}
            mark_item(marker, tw, d["term_id"], None)
            count(tw)
            d["twin"] = tw
        drills.append(d)

    scenarios = []
    for r in scenarios_raw:
        s = keep(r, SCENARIO_KEEP)
        mark_item(marker, s, s["term_id"], None)
        count(s)
        scenarios.append(s)

    parts = {}
    for t in terms_raw:
        parts[str(t["part"])] = re.sub(r"^Part \d+\s*[—-]\s*", "", t["part_name"])

    ui = {}
    if os.path.exists(UI_STRINGS_FILE):
        with open(UI_STRINGS_FILE, encoding="utf-8") as f:
            ui = json.load(f)

    data = {
        "meta": {
            "script": "zh-Hans",
            "sources": {"anchor-terms": "v1.1", "practice-questions": load(content_dir, "practice-questions", "version"),
                        "question-wording-drills": load(content_dir, "question-wording-drills", "version"),
                        "values-scenarios": load(content_dir, "values-scenarios", "version")},
            "counts": {"terms": len(terms), "questions": len(questions),
                       "drills": len(drills), "scenarios": len(scenarios)},
            "parts": parts,
        },
        "ui": ui,
        "terms": terms,
        "questions": questions,
        "drills": drills,
        "scenarios": scenarios,
    }
    return data, marker, marked_terms


# --------------------------------------------------------------------------
# Traditional conversion
# --------------------------------------------------------------------------
def convert_tree(node, conv):
    """Convert every string in a Chinese-bearing structure."""
    if isinstance(node, str):
        return conv(node)
    if isinstance(node, list):
        return [convert_tree(x, conv) for x in node]
    if isinstance(node, dict):
        return {k: convert_tree(v, conv) for k, v in node.items()}
    return node


def build_traditional(hans, cc):
    hant = json.loads(json.dumps(hans))  # deep copy
    hant["meta"]["script"] = "zh-Hant"
    hant["ui"] = convert_tree(hant["ui"], cc.convert)
    for t in hant["terms"]:
        for f in TERM_ZH:
            t[f] = cc.convert(t[f])
    for q in hant["questions"]:
        for f in QUESTION_ZH:
            q[f] = cc.convert(q[f])
    for d in hant["drills"]:
        for f in DRILL_ZH:
            d[f] = cc.convert(d[f])
        d["decode"]["prompt_zh"] = cc.convert(d["decode"]["prompt_zh"])
        d["decode"]["options_zh"] = [cc.convert(x) for x in d["decode"]["options_zh"]]
        if "twin" in d:
            d["twin"]["explain_zh"] = cc.convert(d["twin"]["explain_zh"])
    for s in hant["scenarios"]:
        for f in SCENARIO_ZH:
            s[f] = convert_tree(s[f], cc.convert)
    return hant


# --------------------------------------------------------------------------
# Chinese field inventory (used by the empty / unconverted checks)
# --------------------------------------------------------------------------
def zh_fields(data):
    """Yield (label, text) for every Chinese field in a data file."""
    for t in data["terms"]:
        for f in TERM_ZH:
            yield f"{t['id']}.{f}", t.get(f)
    for q in data["questions"]:
        for f in QUESTION_ZH:
            yield f"{q['id']}.{f}", q.get(f)
    for d in data["drills"]:
        for f in DRILL_ZH:
            yield f"{d['id']}.{f}", d.get(f)
        dec = d.get("decode", {})
        yield f"{d['id']}.decode.prompt_zh", dec.get("prompt_zh")
        for i, x in enumerate(dec.get("options_zh", [])):
            yield f"{d['id']}.decode.options_zh[{i}]", x
        if "twin" in d:
            yield f"{d['id']}.twin.explain_zh", d["twin"].get("explain_zh")
    for s in data["scenarios"]:
        yield f"{s['id']}.scenario_zh", s.get("scenario_zh")
        yield f"{s['id']}.takeaway_zh", s.get("takeaway_zh")
        for i, x in enumerate(s.get("why_zh", [])):
            yield f"{s['id']}.why_zh[{i}]", x

    def walk(node, path):
        if isinstance(node, str):
            yield path, node
        elif isinstance(node, dict):
            for k, v in node.items():
                yield from walk(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                yield from walk(v, f"{path}[{i}]")
    yield from walk(data["ui"], "ui")


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------
def all_texts(item):
    yield item.get("question_en", "")
    yield from item.get("options_en", [])
    if "scenario_en" in item:
        yield item["scenario_en"]


def check(hans, hant, sizes, s2t):
    errors = []
    term_ids = [t["id"] for t in hans["terms"]]

    # duplicate and unknown IDs
    for coll, label in [("terms", "term"), ("questions", "question"),
                        ("drills", "drill"), ("scenarios", "scenario")]:
        ids = [x["id"] for x in hans[coll]]
        for i in sorted({i for i in ids if ids.count(i) > 1}):
            errors.append(f"duplicate {label} id {i}")
    everything = [x["id"] for c in ("terms", "questions", "drills", "scenarios") for x in hans[c]]
    for i in sorted({i for i in everything if everything.count(i) > 1}):
        errors.append(f"id {i} used in more than one set")
    known = set(term_ids)
    for coll in ("questions", "drills", "scenarios"):
        for x in hans[coll]:
            if x["term_id"] not in known:
                errors.append(f"{x['id']}: unknown term_id {x['term_id']}")
    tw_terms = {x["id"] for x in hans["terms"] if x["part"] == 5}
    for q in hans["questions"]:
        for w in q.get("wording_terms", []) + q.get("wording_focus", []):
            if w not in tw_terms:
                errors.append(f"{q['id']}: unknown wording term {w}")

    # answer letters
    def check_answer(label, ans, n):
        if ans not in ("a", "b", "c"):
            errors.append(f"{label}: answer {ans!r} is not a/b/c")
        elif "abc".index(ans) >= n:
            errors.append(f"{label}: answer {ans!r} but only {n} options")

    for coll in ("questions", "drills", "scenarios"):
        for x in hans[coll]:
            if len(x["options_en"]) != 3:
                errors.append(f"{x['id']}: {len(x['options_en'])} options, expected 3")
            check_answer(x["id"], x["answer"], len(x["options_en"]))
    for d in hans["drills"]:
        check_answer(d["id"] + ".decode", d["decode"]["answer"], len(d["decode"]["options_zh"]))
        if "twin" in d:
            check_answer(d["id"] + ".twin", d["twin"]["answer"], len(d["twin"]["options_en"]))
    for s in hans["scenarios"]:
        if len(s["why_zh"]) != len(s["options_en"]):
            errors.append(f"{s['id']}: {len(s['why_zh'])} why_zh for {len(s['options_en'])} options")

    # empty Chinese fields (both scripts), unconverted Traditional
    h = dict(zh_fields(hans))
    t = dict(zh_fields(hant))
    if set(h) != set(t):
        errors.append("Simplified and Traditional files have different Chinese fields")
    for label, text in h.items():
        if not isinstance(text, str) or not text.strip():
            errors.append(f"empty Chinese field {label} (zh-Hans)")
    for label, text in t.items():
        if not isinstance(text, str) or not text.strip():
            errors.append(f"empty Chinese field {label} (zh-Hant)")
    for label, text in h.items():
        if isinstance(text, str) and t.get(label) == text and s2t.convert(text) != text:
            errors.append(f"Traditional identical to Simplified in {label}")

    # anchor spans point at the text they claim
    terms_text = {x["id"] for x in hans["terms"]}
    def check_spans(item, label):
        a = item.get("a", {})
        pairs = []
        if "q" in a:
            pairs.append((item["question_en"], a["q"]))
        if "s" in a:
            pairs.append((item["scenario_en"], a["s"]))
        for i, grp in enumerate(a.get("o", [])):
            pairs.append((item["options_en"][i], grp))
        for text, spans in pairs:
            last = 0
            for s, e, tid in spans:
                if not (0 <= s < e <= len(text)) or s < last or tid not in terms_text:
                    errors.append(f"{label}: bad anchor span {s},{e},{tid}")
                last = e
    for coll in ("questions", "drills", "scenarios"):
        for x in hans[coll]:
            check_spans(x, x["id"])
            if "twin" in x:
                check_spans(x["twin"], x["id"] + ".twin")
            for txt in all_texts(x):
                if any(ord(c) > 0xFFFF for c in txt):
                    errors.append(f"{x['id']}: character outside the BMP (JS offsets would drift)")

    # review-only fields must not leak
    def leaked(node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in REVIEW_ONLY:
                    errors.append(f"review-only field {k!r} present at {path}")
                leaked(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                leaked(v, f"{path}[{i}]")
    leaked(hans, "hans")
    leaked(hant, "hant")

    # size
    for name, size in sizes.items():
        if size > MAX_BYTES:
            errors.append(f"{name} is {size / 1024:.0f} KB, over the {MAX_BYTES // 1024} KB limit")
    return errors


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------
def report(hans, marker, marked_terms, sizes, gz):
    out = []
    p = out.append
    p("")
    p("Anchor coverage report")
    p("=" * 56)
    p(f"{'set':<24}{'items':>6}{'with anchor':>13}{'chip':>6}")
    sets = [("questions", hans["questions"]), ("drills", hans["drills"]),
            ("drill twins", [d["twin"] | {"id": d["id"]} for d in hans["drills"] if "twin" in d]),
            ("scenarios", hans["scenarios"])]
    for name, items in sets:
        n = len(items)
        with_a = sum(1 for x in items if "a" in x)
        chip = sum(1 for x in items if x.get("chip"))
        p(f"{name:<24}{n:>6}{with_a:>13}{chip:>6}")
    p("")
    p("'chip' = the item's own term is not underlined on screen, so the app shows the")
    p("'本题关键词' chip under the question.")
    qs = hans["questions"]
    p("")
    p("Questions by part (own term not on screen):")
    for part in ("1", "2", "3", "4"):
        sub = [q for q in qs if str(q["part"]) == part]
        chip = [q for q in sub if q.get("chip")]
        p(f"  Part {part}: {len(chip):>3} of {len(sub):<3}")
    chips = [q["id"] for q in qs if q.get("chip")]
    if chips:
        p(f"  chip questions ({len(chips)}): " + ", ".join(chips[:12]) + (" ..." if len(chips) > 12 else ""))
    asked = {q["term_id"] for q in qs} | {d["term_id"] for d in hans["drills"]} | \
            {s["term_id"] for s in hans["scenarios"]}
    never = [t for t in hans["terms"] if t["part"] != 5 and marked_terms.get(t["id"], 0) == 0]
    p("")
    p(f"Part 1-4 terms underlined at least once: "
      f"{sum(1 for t in hans['terms'] if t['part'] != 5) - len(never)} of "
      f"{sum(1 for t in hans['terms'] if t['part'] != 5)}")
    if never:
        p("  never underlined anywhere: " + ", ".join(f"{t['id']} {t['term']}" for t in never))
    unasked = [t for t in hans["terms"] if t["id"] not in asked]
    if unasked:
        p("  terms with no question, drill or scenario: " + ", ".join(f"{t['id']} {t['term']}" for t in unasked))
    wt = [t for t in hans["terms"] if t["part"] == 5]
    wn = [t for t in wt if marked_terms.get(t["id"], 0) == 0]
    p(f"Part 5 wording terms underlined at least once: {len(wt) - len(wn)} of {len(wt)} "
      f"(common words left to wording_terms: {len(wn)})")
    if marker.collisions:
        p("")
        p("Forms shared by two terms (first term kept):")
        for form, ids in sorted(marker.collisions.items()):
            p(f"  {form!r}: {', '.join(ids)}")
    p("")
    p("Files")
    for name in sizes:
        warn = "  <- within 10% of the limit" if sizes[name] > MAX_BYTES * 0.9 else ""
        p(f"  {name:<28}{sizes[name] / 1024:7.0f} KB  ({gz[name] / 1024:.0f} KB gzipped){warn}")
    return "\n".join(out)


# --------------------------------------------------------------------------
def dump(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--content-dir", default=os.environ.get("PASSMATE_CONTENT_DIR") or
                    os.path.join(os.path.dirname(ROOT), "Concepts", "PassMate"))
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()
    if not os.path.isdir(args.content_dir):
        sys.exit(f"content folder not found: {args.content_dir}")

    hans, marker, marked_terms = build_simplified(args.content_dir)
    hant = build_traditional(hans, opencc.OpenCC("s2hk"))

    blobs = {"content.zh-Hans.json": dump(hans), "content.zh-Hant.json": dump(hant)}
    sizes = {k: len(v) for k, v in blobs.items()}
    gz = {k: len(gzip.compress(v, 9, mtime=0)) for k, v in blobs.items()}

    errors = check(hans, hant, sizes, opencc.OpenCC("s2t"))
    print(report(hans, marker, marked_terms, sizes, gz))
    print("")
    if errors:
        print(f"CHECKS FAILED ({len(errors)}):")
        for e in errors[:60]:
            print("  -", e)
        if len(errors) > 60:
            print(f"  ... and {len(errors) - 60} more")
        sys.exit(1)

    os.makedirs(args.out_dir, exist_ok=True)
    for name, blob in blobs.items():
        with open(os.path.join(args.out_dir, name), "wb") as f:
            f.write(blob)
    print("All checks passed. Wrote " + ", ".join(os.path.join("data", n) for n in blobs))


if __name__ == "__main__":
    main()
