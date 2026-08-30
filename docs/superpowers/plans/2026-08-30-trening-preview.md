# Trening Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the fitness-app training features (exercise library, templates, active workout logging, calendar, history) to the Obroci PWA as an additive, preview-only module, published to the Pages subpath `/preview/` without touching the live app.

**Architecture:** All training code lives in three new inlined source files (`training-calc.js` pure logic, `training-seed.js` data, `training.js` DOM/views). It self-registers through four small seams in `src/app.js` (view map, nav injection, sheet delegation, sync payload) plus one nav-guard seam. The live build (`build.py`) is unchanged and excludes training; a new `build.py --preview` inlines training into `preview/index.html`. Training data persists in a new `obroci_training` localStorage key and rides Obroci's existing single-row Supabase sync.

**Tech Stack:** Vanilla JS (no framework, no bundler), Python 3 stdlib build script, `node --test` / `node --check` for verification, GitHub Actions + Pages for deploy.

**Spec:** `docs/superpowers/specs/2026-08-30-trening-preview-design.md`

## Global Constraints

- Vanilla JS only. No framework, no bundler, **no new runtime dependency**.
- `build.py` uses Python **standard library only**.
- `index.html` (live root) is generated and MUST remain behaviourally unchanged; never hand-edit it.
- UI text, toasts, and code comments in **Croatian**.
- Forms are not re-rendered per keystroke; values are read from the DOM at save time (avoids focus loss — Obroci handoff §2).
- `localStorage` is the source of truth; Supabase is a thin layer written after.
- Reuse existing CSS classes/palette from `src/shell.html` (`.card`, `.seg`, `.btn`, `.btn-p`, `.btn-g`, `.stepper`, `.row`, `.eyebrow`, `.num`, `.sub`, `.sub2`, `.x`, `.pad`, `.mb*`, `.p*`) before adding new CSS.
- All new training data lives under `S.training` / `obroci_training`; writes go through `saveTraining()` which bumps `obroci_updated` and calls `scheduleSync()`.
- Work on branch `trening-preview`. Preview publishes to `/personal-fitness-app/preview/`; live root untouched.
- After any change to `src/`, the preview is rebuilt with `python3 build.py --preview`; bump the preview cache only if a preview SW exists (it does not — §9 of spec: preview ships no SW).

---

## File Structure

**New files:**
- `src/training-calc.js` — pure functions (volume, set count, best weight, snapshot clone, active-session lookup). Node-requireable via an exports guard. Unit-tested.
- `src/training-seed.js` — `SEED_EXERCISES` + one `SEED_TEMPLATE`.
- `src/training.js` — training state (`S.training`), `loadTraining()`, `saveTraining()`, self-registration, the four views (`viewTrening` with sub-nav), all training sheets (`trainingSheet`), training action/input listeners, active-session guards.
- `test/training-calc.test.js` — `node --test` unit tests for the pure logic.

**Modified files:**
- `src/app.js` — four registration seams + one nav-guard seam. No behavioural change when training is absent.
- `build.py` — add `--preview` flag producing `preview/index.html`.
- `.github/workflows/deploy.yml` — build root **and** `--preview`, upload whole tree.

**Generated (do not hand-edit):**
- `index.html` (live, unchanged output), `preview/index.html` (new).

---

## Task 1: app.js registration seams (inert without training)

Adds the seams training.js hooks into. With no training.js present, every seam is a no-op, so the live build's behaviour is identical.

**Files:**
- Modify: `src/app.js` (render view map; renderSheet delegation; currentPayload/adoptPayload; nav-guard in the click handler; a load hook)
- Verify: `index.html` (regenerated, diff shows only the seam lines)

**Interfaces:**
- Produces (consumed by training.js in later tasks):
  - `S.extraViews` — object mapping `tab id → view fn`, merged into the render view map.
  - `S.guardLeave` — optional `fn(dest: string) → boolean`; if set and returns `true`, navigation is blocked (training shows its own modal).
  - `renderSheet()` delegates any `S.sheet.type` starting with `"t-"` to global `trainingSheet(S.sheet)`.
  - `currentPayload()` includes `training: S.training || null`; `adoptPayload(p)` sets `S.training` and persists `obroci_training`.
  - `window.onTrainingReady` — optional `fn()` called at end of startup so training can seed/register after `load()`.

- [ ] **Step 1: Add `S.extraViews` to the render view map**

In `src/app.js`, `render()` currently starts:
```js
function render() {
  const views = { danas: viewDanas, recepti: viewRecepti, namirnice: viewNamirnice, vise: viewVise };
  $("#main").innerHTML = views[S.tab]();
```
Change the first line of the body to merge extras:
```js
function render() {
  const views = Object.assign({ danas: viewDanas, recepti: viewRecepti, namirnice: viewNamirnice, vise: viewVise }, S.extraViews || {});
  $("#main").innerHTML = (views[S.tab] || viewDanas)();
```

- [ ] **Step 2: Delegate `t-` sheets in `renderSheet()`**

`renderSheet()` has an if/else chain building `inner`. Add a branch at the top of that chain (right after `const s = S.sheet; let inner = "";`):
```js
  if (s.type && s.type.indexOf("t-") === 0 && typeof trainingSheet === "function") inner = trainingSheet(s);
  else if (s.type === "picker") inner = sheetPicker(s.slot);
```
(Keep the existing `else if` branches unchanged after this.)

- [ ] **Step 3: Carry `training` in the sync payload**

In `currentPayload()`:
```js
function currentPayload() {
  return {
    ingredients: S.ingredients, recipes: S.recipes,
    settings: S.settings, logs: S.logs, training: S.training || null, updatedAt: localStamp(),
  };
}
```
In `adoptPayload(p)`, after the `if (p.logs) S.logs = p.logs;` line add:
```js
  if (p.training) { S.training = p.training; writeLS("obroci_training", S.training); }
```

- [ ] **Step 4: Add the nav-guard seam**

In the top-level `document.addEventListener("click", ...)` handler, the first lines are:
```js
  const nav = e.target.closest("#nav button");
  if (nav) { S.tab = nav.dataset.tab; S.sheet = null; render(); return; }
```
Replace with:
```js
  const nav = e.target.closest("#nav button");
  if (nav) {
    if (S.guardLeave && S.guardLeave("tab:" + nav.dataset.tab)) return;
    S.tab = nav.dataset.tab; S.sheet = null; render(); return;
  }
```

- [ ] **Step 5: Add the startup hook**

At the very end of the `/* ---------- start ---------- */` section, after the existing `consumeAuthHash().then(...)` block, add:
```js
if (typeof window !== "undefined" && typeof window.onTrainingReady === "function") window.onTrainingReady();
```

- [ ] **Step 6: Rebuild live and confirm it is unchanged in behaviour**

Run:
```bash
node --check src/app.js && python3 build.py
```
Expected: `index.html sastavljen — ~78 kB`, no errors. The live app has no `training.js`, so `S.extraViews`/`S.guardLeave`/`trainingSheet`/`window.onTrainingReady` are all undefined and every seam is a no-op.

- [ ] **Step 7: Commit**

```bash
git add src/app.js index.html
git commit -m "feat(app): add inert registration seams for training module"
```

---

## Task 2: build.py --preview flag

Produces `preview/index.html` including the training files. Default build stays exactly as-is.

**Files:**
- Modify: `build.py`
- Create (generated): `preview/index.html`

**Interfaces:**
- Produces: `python3 build.py` → `index.html` (unchanged). `python3 build.py --preview` → `preview/index.html` with `training-calc.js` + `training-seed.js` + `training.js` inlined after seed/app, and the service-worker registration stripped (preview ships no SW).

- [ ] **Step 1: Rewrite `build.py` to support both targets**

Replace the body of `build.py` with:
```python
#!/usr/bin/env python3
"""Sastavlja src/ u index.html (živa aplikacija) ili preview/index.html.

    python3 build.py            # živa aplikacija, bez treninga
    python3 build.py --preview  # preview s modulom za trening

zxing.js ostaje zasebna datoteka. Ne mijenjaj generirane datoteke ručno.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

MARKER = '<script src="seed.js"></script>\n<script src="app.js"></script>'


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8")


def build(preview: bool) -> int:
    shell = read("shell.html")
    if MARKER not in shell:
        print("GREŠKA: src/shell.html nema očekivane <script> oznake.", file=sys.stderr)
        return 1

    parts = [read("seed.js"), read("app.js")]
    if preview:
        # Trening moduli se ubacuju IZA app.js: calc i seed prije logike.
        parts = [read("training-calc.js"), read("training-seed.js"), read("seed.js"), read("app.js"), read("training.js")]

    html = shell.replace(MARKER, "<script>\n" + "\n".join(parts) + "\n</script>")

    if preview:
        # Preview je online-first: bez service workera (spec §9).
        html = html.replace('if ("serviceWorker" in navigator)', 'if (false && "serviceWorker" in navigator)')
        out_dir = ROOT / "preview"
        out_dir.mkdir(exist_ok=True)
        out = out_dir / "index.html"
    else:
        out = ROOT / "index.html"

    out.write_text(html, encoding="utf-8")
    label = "preview/index.html" if preview else "index.html"
    print(f"{label} sastavljen — {len(html) / 1024:.0f} kB")
    if not preview:
        print("Ne zaboravi podići verziju cachea u sw.js ako se aplikacija promijenila.")
    return 0


def main() -> int:
    return build("--preview" in sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
```

Note: the SW-strip `.replace` targets the exact string in `src/app.js`
startup (`if ("serviceWorker" in navigator)`). If that string is absent the
replace is a harmless no-op; verify it exists with `grep`.

- [ ] **Step 2: Verify the SW-registration string exists (so the strip works)**

Run:
```bash
grep -n 'if ("serviceWorker" in navigator)' src/app.js
```
Expected: one match. If it differs, adjust the `.replace` in build.py to match verbatim.

- [ ] **Step 3: Verify default build unchanged and --preview fails cleanly (files missing yet)**

Run:
```bash
python3 build.py && echo "root OK"
python3 build.py --preview; echo "exit=$?"
```
Expected: root builds fine. `--preview` fails with a `FileNotFoundError` for `training-calc.js` (files created in later tasks). That is expected now.

- [ ] **Step 4: Commit**

```bash
git add build.py
git commit -m "feat(build): add --preview target that inlines training module"
```

---

## Task 3: training-calc.js pure logic + unit tests

**Files:**
- Create: `src/training-calc.js`
- Create: `test/training-calc.test.js`

**Interfaces:**
- Produces (globals when inlined; `module.exports` when required in node):
  - `cloneTemplate(t) → deep copy` (snapshot).
  - `sessionVolume(session) → Number` — Σ reps×weight over `session.log.performedExercises[].sets`.
  - `sessionSetCount(session) → Number` — count of logged sets.
  - `bestWeight(sessions, exerciseId) → Number` — max `weight` for that exercise across `completed` sessions (0 if none).
  - `activeSession(training) → session | null` — the single session with `status === "active"`.

- [ ] **Step 1: Write the failing tests**

Create `test/training-calc.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const C = require("../src/training-calc.js");

const session = (over) => Object.assign({
  id: "s1", date: "2026-08-30", templateId: "t1", status: "completed",
  log: { performedExercises: [
    { exerciseId: "e1", sets: [ { reps: 5, weight: 100 }, { reps: 5, weight: 100 } ] },
    { exerciseId: "e2", sets: [ { reps: 10, weight: 20 } ] },
  ] },
}, over || {});

test("sessionVolume sums reps*weight", () => {
  assert.strictEqual(C.sessionVolume(session()), 5 * 100 + 5 * 100 + 10 * 20); // 1200
});

test("sessionVolume handles missing log", () => {
  assert.strictEqual(C.sessionVolume({ status: "planned" }), 0);
});

test("sessionSetCount counts logged sets", () => {
  assert.strictEqual(C.sessionSetCount(session()), 3);
});

test("bestWeight takes max over completed sessions only", () => {
  const sessions = [
    session({ id: "a" }),
    session({ id: "b", status: "active", log: { performedExercises: [ { exerciseId: "e1", sets: [ { reps: 1, weight: 999 } ] } ] } }),
  ];
  assert.strictEqual(C.bestWeight(sessions, "e1"), 100); // active 999 ignored
  assert.strictEqual(C.bestWeight(sessions, "e2"), 20);
  assert.strictEqual(C.bestWeight(sessions, "nope"), 0);
});

test("cloneTemplate is a deep copy", () => {
  const t = { id: "t1", title: "A", exercises: [ { exerciseId: "e1", targetSets: [ { reps: 5, weight: 100 } ] } ] };
  const c = C.cloneTemplate(t);
  c.exercises[0].targetSets[0].reps = 99;
  assert.strictEqual(t.exercises[0].targetSets[0].reps, 5); // original untouched
});

test("activeSession finds the active one or null", () => {
  assert.strictEqual(C.activeSession({ sessions: [] }), null);
  const a = { id: "x", status: "active" };
  assert.strictEqual(C.activeSession({ sessions: [ { id: "y", status: "planned" }, a ] }), a);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/`
Expected: FAIL — cannot find module `../src/training-calc.js`.

- [ ] **Step 3: Implement `src/training-calc.js`**

```js
/* Čiste funkcije za trening — bez DOM-a, testabilne u node-u.
   Kad su inline u pregledniku, postaju globalne; u node-u ih izvozimo. */

function cloneTemplate(t) {
  return JSON.parse(JSON.stringify(t));
}

function sessionVolume(session) {
  const pe = session && session.log && session.log.performedExercises;
  if (!pe) return 0;
  let v = 0;
  pe.forEach((ex) => (ex.sets || []).forEach((s) => { v += (s.reps || 0) * (s.weight || 0); }));
  return v;
}

function sessionSetCount(session) {
  const pe = session && session.log && session.log.performedExercises;
  if (!pe) return 0;
  return pe.reduce((a, ex) => a + (ex.sets ? ex.sets.length : 0), 0);
}

function bestWeight(sessions, exerciseId) {
  let best = 0;
  (sessions || []).forEach((s) => {
    if (s.status !== "completed") return;
    const pe = s.log && s.log.performedExercises;
    if (!pe) return;
    pe.forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((set) => { if ((set.weight || 0) > best) best = set.weight; });
    });
  });
  return best;
}

function activeSession(training) {
  const list = (training && training.sessions) || [];
  return list.find((s) => s.status === "active") || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { cloneTemplate, sessionVolume, sessionSetCount, bestWeight, activeSession };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/training-calc.js test/training-calc.test.js
git commit -m "feat(training): pure calc helpers + node unit tests"
```

---

## Task 4: training-seed.js starter data

**Files:**
- Create: `src/training-seed.js`

**Interfaces:**
- Produces: globals `SEED_EXERCISES` (Array) and `SEED_TEMPLATE` (Object) used by `loadTraining()` when `obroci_training` is absent. Exercise shape `{ id, name, muscles:[], equipment:[] }`; template shape per spec §5.

- [ ] **Step 1: Create `src/training-seed.js`**

```js
/* Početni sadržaj za trening — ubacuje se samo ako još nema spremljenih podataka. */

const MUSCLES = ["Prsa", "Leđa", "Ramena", "Biceps", "Triceps", "Kvadriceps", "Zadnja loža", "Listovi", "Gluteusi", "Core", "Cijelo tijelo"];
const EQUIPMENT = ["Šipka", "Bučice", "Girja", "Sprava", "Kabel", "Vlastita težina", "Elastika", "Šipka za zgibove"];

const SEED_EXERCISES = [
  { id: "ex_bench", name: "Potisak s klupe", muscles: ["Prsa", "Triceps"], equipment: ["Šipka"] },
  { id: "ex_squat", name: "Čučanj", muscles: ["Kvadriceps", "Gluteusi"], equipment: ["Šipka"] },
  { id: "ex_dead", name: "Mrtvo dizanje", muscles: ["Leđa", "Zadnja loža", "Gluteusi"], equipment: ["Šipka"] },
  { id: "ex_ohp", name: "Potisak iznad glave", muscles: ["Ramena", "Triceps"], equipment: ["Šipka"] },
  { id: "ex_row", name: "Veslanje u pretklonu", muscles: ["Leđa", "Biceps"], equipment: ["Šipka"] },
  { id: "ex_pull", name: "Zgibovi", muscles: ["Leđa", "Biceps"], equipment: ["Šipka za zgibove"] },
  { id: "ex_curl", name: "Pregib s bučicama", muscles: ["Biceps"], equipment: ["Bučice"] },
  { id: "ex_tri", name: "Ekstenzija tricepsa na kabelu", muscles: ["Triceps"], equipment: ["Kabel"] },
  { id: "ex_lat", name: "Povlačenje na lat spravi", muscles: ["Leđa"], equipment: ["Sprava"] },
  { id: "ex_legpress", name: "Potisak nogama", muscles: ["Kvadriceps", "Gluteusi"], equipment: ["Sprava"] },
  { id: "ex_plank", name: "Plank", muscles: ["Core"], equipment: ["Vlastita težina"] },
  { id: "ex_calf", name: "Podizanje na prste", muscles: ["Listovi"], equipment: ["Sprava"] },
];

const SEED_TEMPLATE = {
  id: "tpl_fullbody",
  title: "Cijelo tijelo A",
  exercises: [
    { exerciseId: "ex_squat", order: 0, restSeconds: 120, targetSets: [ { reps: 5, weight: 60 }, { reps: 5, weight: 60 }, { reps: 5, weight: 60 } ] },
    { exerciseId: "ex_bench", order: 1, restSeconds: 120, targetSets: [ { reps: 5, weight: 40 }, { reps: 5, weight: 40 }, { reps: 5, weight: 40 } ] },
    { exerciseId: "ex_row", order: 2, restSeconds: 90, targetSets: [ { reps: 8, weight: 30 }, { reps: 8, weight: 30 }, { reps: 8, weight: 30 } ] },
  ],
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MUSCLES, EQUIPMENT, SEED_EXERCISES, SEED_TEMPLATE };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/training-seed.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add src/training-seed.js
git commit -m "feat(training): starter exercises and sample template"
```

---

## Task 5: training.js bootstrap + Vježbe (exercise library)

Creates the module, wires registration, sub-nav, and the first real view (exercise CRUD). After this task `python3 build.py --preview` succeeds and the Trening tab works with the Vježbe pane.

**Files:**
- Create: `src/training.js`
- Modify (append CSS if needed): `src/shell.html`

**Interfaces:**
- Consumes from app.js: `S`, `render()`, `renderSheet()`, `toast()`, `$`, `esc`, `num`, `uid`, `writeLS`, `readLS`, `bumpStamp`, `scheduleSync`.
- Consumes from calc/seed: `SEED_EXERCISES`, `SEED_TEMPLATE`, `activeSession`, `bestWeight`, `sessionVolume`, `sessionSetCount`, `cloneTemplate`.
- Produces: `S.training`, `S.trainingTab`, `loadTraining()`, `saveTraining()`, `viewTrening()`, `trainingSheet(s)`, and training-scoped `click`/`input` listeners. Registers via `S.extraViews.trening`, nav injection, `window.onTrainingReady`.

- [ ] **Step 1: Create `src/training.js` with bootstrap, registration, sub-nav, and Vježbe**

```js
/* ============================================================
   Trening — dodatni modul (preview). Sav kod je ovdje; app.js
   ga vidi kroz nekoliko malih spojnica. Lokalno je izvor istine.
   ============================================================ */

const K_TRAINING = "obroci_training";

const TSLOTS = [
  { id: "log", label: "Trening" },
  { id: "ex", label: "Vježbe" },
  { id: "cal", label: "Kalendar" },
  { id: "hist", label: "Povijest" },
];

function loadTraining() {
  const d = readLS(K_TRAINING, null);
  if (d) {
    S.training = {
      exercises: d.exercises || [],
      templates: d.templates || [],
      sessions: d.sessions || [],
      settings: Object.assign({ units: "kg" }, d.settings || {}),
    };
  } else {
    S.training = {
      exercises: SEED_EXERCISES.slice(),
      templates: [cloneTemplate(SEED_TEMPLATE)],
      sessions: [],
      settings: { units: "kg" },
    };
    writeLS(K_TRAINING, S.training);
  }
}

function saveTraining() {
  const res = writeLS(K_TRAINING, S.training);
  if (!res.ok) { toast(res.error); return false; }
  bumpStamp();
  scheduleSync();
  return true;
}

const exName = (id) => { const e = S.training.exercises.find((x) => x.id === id); return e ? e.name : "nepoznata vježba"; };

/* ---------- glavni prikaz s pod-navigacijom ---------- */

function viewTrening() {
  if (!S.trainingTab) S.trainingTab = "log";
  const active = activeSession(S.training);
  let html = `
  <div class="pad">
    <div class="row spread mb14">
      <h1>Trening</h1>
    </div>
    <div class="seg mb14">
      ${TSLOTS.map((t) => `<button data-act="t-tab" data-t="${t.id}" class="${S.trainingTab === t.id ? "on" : ""}">${t.label}</button>`).join("")}
    </div>`;

  if (active && S.trainingTab !== "log") {
    html += `<button class="card row-btn p12 mb12" data-act="t-resume-open" style="border-color:var(--amber)">
      <div class="eyebrow" style="color:var(--amber)">Trening u tijeku</div>
      <div style="font-size:14.5px;font-weight:600;margin-top:3px">Nastavi trening →</div>
    </button>`;
  }

  if (S.trainingTab === "ex") html += paneVjezbe();
  else if (S.trainingTab === "log") html += paneLog(active);
  else if (S.trainingTab === "cal") html += paneKalendar();
  else if (S.trainingTab === "hist") html += panePovijest();

  return html + "</div>";
}

/* ---------- Vježbe ---------- */

function paneVjezbe() {
  let html = `
    <div class="row spread mb10">
      <span class="eyebrow">${S.training.exercises.length} vježbi</span>
      <button class="btn btn-p sm" data-act="t-new-ex">Nova vježba</button>
    </div>`;
  if (!S.training.exercises.length) html += `<p class="note">Još nema vježbi. Dodaj prvu.</p>`;
  S.training.exercises.forEach((e) => {
    html += `
    <button class="card row-btn p12 mb8" data-act="t-open-ex" data-id="${e.id}">
      <div style="font-size:14.5px;font-weight:500">${esc(e.name)}</div>
      <div class="num sub2">${(e.muscles || []).map(esc).join(", ") || "—"}${(e.equipment || []).length ? " · " + e.equipment.map(esc).join(", ") : ""}</div>
    </button>`;
  });
  return html;
}

function sheetExercise(x) {
  const chips = (list, sel, act) => list.map((m) => `
    <button class="btn ${sel.indexOf(m) >= 0 ? "btn-p" : "btn-g"} sm" style="margin:0 6px 6px 0" data-act="${act}" data-v="${esc(m)}">${esc(m)}</button>`).join("");
  return `
  <div class="sheet-in">
    <div class="row spread mb14">
      <h2>Vježba</h2>
      <button class="btn btn-g sm" data-act="close">Odustani</button>
    </div>
    <label class="eyebrow">Naziv</label>
    <input id="tx_name" value="${esc(x.name || "")}" placeholder="npr. Potisak s klupe" style="margin:6px 0 14px">
    <div class="eyebrow mb8">Mišići</div>
    <div class="row wrap" style="margin-bottom:12px">${chips(MUSCLES, x.muscles || [], "t-ex-muscle")}</div>
    <div class="eyebrow mb8">Oprema</div>
    <div class="row wrap" style="margin-bottom:16px">${chips(EQUIPMENT, x.equipment || [], "t-ex-equip")}</div>
    <div class="row" style="gap:8px">
      <button class="btn btn-p grow" data-act="t-save-ex">Spremi</button>
      ${x._editing ? '<button class="btn btn-g" data-act="t-del-ex">Obriši</button>' : ""}
    </div>
  </div>`;
}

/* ---------- listovi (delegirano iz renderSheet) ---------- */

function trainingSheet(s) {
  if (s.type === "t-exercise") return sheetExercise(s.ex);
  if (s.type === "t-template") return sheetTemplate(s.tpl);
  if (s.type === "t-schedule") return sheetSchedule(s.date);
  if (s.type === "t-leave") return sheetLeave();
  if (s.type === "t-resume") return sheetResume(s.pending);
  if (s.type === "t-session") return sheetSession(s.session);
  return "";
}

/* ---------- radnje (vlastiti listener; app.js ignorira t-* akcije) ---------- */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act;
  if (a.indexOf("t-") !== 0 && a !== "close") return; // samo trening akcije
  if (!S.training) return;

  if (a === "t-tab") {
    const dest = el.dataset.t;
    if (S.guardLeave && S.guardLeave("ttab:" + dest)) return;
    S.trainingTab = dest; render(); return;
  }

  if (a === "t-new-ex") { S.sheet = { type: "t-exercise", ex: { muscles: [], equipment: [] } }; renderSheet(); return; }
  if (a === "t-open-ex") {
    const ex = S.training.exercises.find((x) => x.id === el.dataset.id);
    S.sheet = { type: "t-exercise", ex: Object.assign({ _editing: true }, JSON.parse(JSON.stringify(ex))) };
    renderSheet(); return;
  }
  if (a === "t-ex-muscle" || a === "t-ex-equip") {
    const key = a === "t-ex-muscle" ? "muscles" : "equipment";
    const v = el.dataset.v;
    const ex = S.sheet.ex;
    ex.name = ($("#tx_name") || {}).value !== undefined ? $("#tx_name").value : ex.name; // zadrži upisano ime
    ex[key] = ex[key] || [];
    const i = ex[key].indexOf(v);
    if (i >= 0) ex[key].splice(i, 1); else ex[key].push(v);
    renderSheet(); return;
  }
  if (a === "t-save-ex") {
    const ex = S.sheet.ex;
    ex.name = $("#tx_name").value.trim();
    if (!ex.name) { toast("Vježba treba naziv"); return; }
    if (!ex.id) {
      if (S.training.exercises.some((y) => y.name.trim().toLowerCase() === ex.name.toLowerCase())) { toast("„" + ex.name + "” već postoji"); return; }
      ex.id = uid("ex");
      S.training.exercises.push({ id: ex.id, name: ex.name, muscles: ex.muscles || [], equipment: ex.equipment || [] });
    } else {
      const i = S.training.exercises.findIndex((y) => y.id === ex.id);
      S.training.exercises[i] = { id: ex.id, name: ex.name, muscles: ex.muscles || [], equipment: ex.equipment || [] };
    }
    if (saveTraining()) toast("Spremljeno");
    S.sheet = null; render(); return;
  }
  if (a === "t-del-ex") {
    S.training.exercises = S.training.exercises.filter((y) => y.id !== S.sheet.ex.id);
    if (saveTraining()) toast("Obrisano");
    S.sheet = null; render(); return;
  }
});
```

Note: `sheetTemplate`, `sheetSchedule`, `sheetLeave`, `sheetResume`,
`sheetSession`, `paneLog`, `paneKalendar`, `panePovijest` are defined in
Tasks 6–9. Until then `trainingSheet` references them; that is fine because
they are only *called* when those sheet types are opened, which does not
happen yet. But `node --check` needs them to at least exist to avoid a
ReferenceError at call time — they are only referenced inside functions, so
`node --check` (syntax only) passes. Runtime paths that call them are not
reachable until their tasks land.

- [ ] **Step 2: Register the module at the end of `src/training.js`**

Append:
```js
/* ---------- registracija ---------- */

window.onTrainingReady = function () {
  loadTraining();
  S.extraViews = S.extraViews || {};
  S.extraViews.trening = viewTrening;
  // Ubaci gumb u donju navigaciju (prije "Više").
  const nav = document.getElementById("nav");
  if (nav && !nav.querySelector('[data-tab="trening"]')) {
    const btn = document.createElement("button");
    btn.dataset.tab = "trening";
    btn.innerHTML = '<span class="pip"></span>Trening';
    const vise = nav.querySelector('[data-tab="vise"]');
    nav.insertBefore(btn, vise);
  }
};
```

- [ ] **Step 3: Add the Trening tab so nav has 5 items (already injected) — verify build**

Run:
```bash
node --check src/training.js && python3 build.py --preview
```
Expected: `preview/index.html sastavljen — ~9x kB`, no errors.

- [ ] **Step 4: Manual smoke test in a browser**

Run: `python3 -m http.server 8000` then open `http://localhost:8000/preview/`.
Verify: a **Trening** tab appears in the bottom nav between Namirnice and Više; tapping it shows the segmented sub-nav; **Vježbe** lists the 12 seed exercises; adding a new exercise (name + toggling muscle/equipment chips) saves and appears; editing and deleting work; a duplicate name is refused with a toast.

- [ ] **Step 5: Commit**

```bash
git add src/training.js src/shell.html preview/index.html
git commit -m "feat(training): module bootstrap, nav tab, exercise library (Vježbe)"
```

---

## Task 6: Predlošci (templates) in the Trening pane

**Files:**
- Modify: `src/training.js` (add `paneLog` template list + `sheetTemplate` + actions)

**Interfaces:**
- Consumes: `S.training.templates`, `S.training.exercises`, `exName`, `uid`, `saveTraining`.
- Produces: `paneLog(active)` (partial — template list + start buttons; active-logging body added in Task 7), `sheetTemplate(tpl)`, template CRUD actions. Template exercise row shape `{ exerciseId, order, restSeconds, targetSets:[{reps,weight}] }`.

- [ ] **Step 1: Add `paneLog` (template list portion) to `src/training.js`**

Insert before the registration block:
```js
function paneLog(active) {
  let html = "";
  // (Task 7 ubacuje ovdje "danas" i aktivni trening.)
  html += `
    <div class="row spread mb10" style="margin-top:4px">
      <span class="eyebrow">Predlošci</span>
      <button class="btn btn-p sm" data-act="t-new-tpl">Novi predložak</button>
    </div>`;
  if (!S.training.templates.length) html += `<p class="note">Nema predložaka. Napravi prvi pa ga pokreni.</p>`;
  S.training.templates.forEach((t) => {
    html += `
    <div class="card p12 mb8">
      <div style="font-size:14.5px;font-weight:500">${esc(t.title)}</div>
      <div class="num sub2" style="margin-bottom:10px">${t.exercises.length} vježbi · ${t.exercises.reduce((a, x) => a + (x.targetSets ? x.targetSets.length : 0), 0)} serija</div>
      <div class="row" style="gap:8px">
        <button class="btn btn-p grow" data-act="t-start" data-id="${t.id}">Pokreni</button>
        <button class="btn btn-g" data-act="t-edit-tpl" data-id="${t.id}">Uredi</button>
      </div>
    </div>`;
  });
  return html;
}
```

- [ ] **Step 2: Add `sheetTemplate`**

```js
function sheetTemplate(tpl) {
  const exOptions = S.training.exercises.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  return `
  <div class="sheet-in">
    <div class="row spread mb14">
      <h2>Predložak</h2>
      <button class="btn btn-g sm" data-act="close">Odustani</button>
    </div>
    <label class="eyebrow">Naziv</label>
    <input id="tt_title" value="${esc(tpl.title || "")}" placeholder="npr. Gornji dio A" style="margin:6px 0 14px">
    <div class="eyebrow mb8">Vježbe</div>
    <div class="mb10">
      ${tpl.exercises.map((row, i) => `
        <div class="card p12 mb8" style="background:var(--sf2)">
          <div class="row spread">
            <span class="ellip" style="flex:1;font-size:14px">${esc(exName(row.exerciseId))}</span>
            <button class="x" data-act="t-tpl-rm" data-i="${i}">×</button>
          </div>
          <div class="num sub2" style="margin-top:4px">${row.targetSets.length} × ${row.targetSets[0] ? row.targetSets[0].reps + " pon · " + row.targetSets[0].weight + " kg" : "—"} · pauza ${row.restSeconds}s</div>
          <div class="row" style="gap:8px;margin-top:8px">
            <div style="flex:1"><label class="eyebrow">Serije</label><input inputmode="numeric" id="ts_sets_${i}" value="${row.targetSets.length}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">Pon.</label><input inputmode="numeric" id="ts_reps_${i}" value="${row.targetSets[0] ? row.targetSets[0].reps : 5}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">Kg</label><input inputmode="decimal" id="ts_wt_${i}" value="${row.targetSets[0] ? row.targetSets[0].weight : 0}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">Pauza s</label><input inputmode="numeric" id="ts_rest_${i}" value="${row.restSeconds}" class="mini"></div>
          </div>
        </div>`).join("")}
    </div>
    <div class="row" style="gap:8px;margin-bottom:16px">
      <select id="tt_add_ex" style="flex:1;min-width:0">${exOptions}</select>
      <button class="btn" data-act="t-tpl-add">+</button>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn-p grow" data-act="t-save-tpl">Spremi</button>
      ${tpl._editing ? '<button class="btn btn-g" data-act="t-del-tpl">Obriši</button>' : ""}
    </div>
  </div>`;
}
```

- [ ] **Step 3: Add template actions inside the training `click` listener**

Add these branches (before the closing `});` of the listener from Task 5):
```js
  if (a === "t-new-tpl") { S.sheet = { type: "t-template", tpl: { title: "", exercises: [] } }; renderSheet(); return; }
  if (a === "t-edit-tpl") {
    const t = S.training.templates.find((x) => x.id === el.dataset.id);
    S.sheet = { type: "t-template", tpl: Object.assign({ _editing: true }, cloneTemplate(t)) };
    renderSheet(); return;
  }
  if (a === "t-tpl-add") {
    collectTemplate();
    const id = $("#tt_add_ex").value;
    const t = S.sheet.tpl;
    t.exercises.push({ exerciseId: id, order: t.exercises.length, restSeconds: 90, targetSets: [ { reps: 5, weight: 0 }, { reps: 5, weight: 0 }, { reps: 5, weight: 0 } ] });
    renderSheet(); return;
  }
  if (a === "t-tpl-rm") { collectTemplate(); S.sheet.tpl.exercises.splice(parseInt(el.dataset.i, 10), 1); renderSheet(); return; }
  if (a === "t-save-tpl") {
    collectTemplate();
    const t = S.sheet.tpl;
    t.title = ($("#tt_title").value || "").trim();
    if (!t.title) { toast("Predložak treba naziv"); return; }
    if (!t.exercises.length) { toast("Dodaj barem jednu vježbu"); return; }
    t.exercises.forEach((r, i) => (r.order = i));
    if (!t.id) { t.id = uid("tpl"); S.training.templates.push(stripMeta(t)); }
    else { const i = S.training.templates.findIndex((x) => x.id === t.id); S.training.templates[i] = stripMeta(t); }
    if (saveTraining()) toast("Spremljeno");
    S.sheet = null; render(); return;
  }
  if (a === "t-del-tpl") {
    S.training.templates = S.training.templates.filter((x) => x.id !== S.sheet.tpl.id);
    if (saveTraining()) toast("Obrisano");
    S.sheet = null; render(); return;
  }
```

- [ ] **Step 4: Add `collectTemplate` and `stripMeta` helpers**

Add near `paneLog`:
```js
/* Pokupi vrijednosti iz obrasca predloška prije ponovnog iscrtavanja. */
function collectTemplate() {
  const t = S.sheet && S.sheet.tpl;
  if (!t) return;
  if ($("#tt_title")) t.title = $("#tt_title").value;
  t.exercises.forEach((row, i) => {
    const nSets = Math.max(1, parseInt(($("#ts_sets_" + i) || {}).value || row.targetSets.length, 10) || 1);
    const reps = num(($("#ts_reps_" + i) || {}).value, row.targetSets[0] ? row.targetSets[0].reps : 5);
    const wt = num(($("#ts_wt_" + i) || {}).value, row.targetSets[0] ? row.targetSets[0].weight : 0);
    row.restSeconds = Math.max(0, parseInt(($("#ts_rest_" + i) || {}).value || row.restSeconds, 10) || 0);
    row.targetSets = Array.from({ length: nSets }, () => ({ reps: reps, weight: wt }));
  });
}

function stripMeta(t) {
  return { id: t.id, title: t.title, exercises: t.exercises.map((r) => ({ exerciseId: r.exerciseId, order: r.order, restSeconds: r.restSeconds, targetSets: r.targetSets.map((s) => ({ reps: s.reps, weight: s.weight })) })) };
}
```

- [ ] **Step 5: Build, syntax check, manual test**

Run:
```bash
node --check src/training.js && python3 build.py --preview
```
Then reload `http://localhost:8000/preview/` → Trening tab. Verify: the seed template lists; New/Edit template opens the sheet; adding an exercise appends a row; changing sets/reps/kg/rest then Spremi persists; reopening shows the saved values; delete works.

- [ ] **Step 6: Commit**

```bash
git add src/training.js preview/index.html
git commit -m "feat(training): workout templates (Predlošci) CRUD"
```

---

## Task 7: Active workout logging + sync round-trip

**Files:**
- Modify: `src/training.js` (active-session portion of `paneLog`, log view, start/finish actions)
- Add: an assertion self-check for the payload round-trip in `test/training-calc.test.js`? No — payload lives in app.js. Instead add a small node check script (Step 6).

**Interfaces:**
- Consumes: `cloneTemplate`, `activeSession`, `bestWeight`, `sessionVolume`, `uid`, `dateKey`, `saveTraining`.
- Produces: `startSession(templateId)`, active-log rendering in `paneLog`, `t-start`/`t-addset`/`t-rmset`/`t-finish`/`t-abandon` actions. Session gains `status:"active"`, `startedAt`, `snapshot`, and a live `log.performedExercises`.

- [ ] **Step 1: Prepend the active-session UI to `paneLog`**

Replace the `// (Task 7 ubacuje ovdje ...)` comment in `paneLog` with:
```js
  if (active) {
    const snap = active.snapshot;
    html += `
    <div class="card p14 mb14" style="border-color:var(--amber)">
      <div class="row spread mb10">
        <div>
          <div class="eyebrow" style="color:var(--amber)">U tijeku</div>
          <div style="font-size:16px;font-weight:700;margin-top:2px">${esc(snap.title)}</div>
        </div>
        <button class="btn btn-g sm" data-act="t-abandon">Odustani</button>
      </div>
      ${snap.exercises.map((row, ei) => {
        const pe = active.log.performedExercises[ei];
        const best = bestWeight(S.training.sessions, row.exerciseId);
        return `
        <div class="mb12">
          <div class="row spread mb6">
            <span style="font-size:14.5px;font-weight:600">${esc(exName(row.exerciseId))}</span>
            ${best ? `<span class="num sub" style="margin:0">najbolje ${best} kg</span>` : ""}
          </div>
          ${pe.sets.map((s, si) => `
            <div class="row spread" style="gap:8px;margin-bottom:6px">
              <input inputmode="numeric" data-act="t-set-reps" data-ei="${ei}" data-si="${si}" value="${s.reps}" class="mini" style="flex:1" aria-label="Ponavljanja">
              <span class="mut" style="font-size:12px">×</span>
              <input inputmode="decimal" data-act="t-set-wt" data-ei="${ei}" data-si="${si}" value="${s.weight}" class="mini" style="flex:1" aria-label="Kilogrami">
              <span class="sub" style="margin:0">kg</span>
              <button class="x" data-act="t-rmset" data-ei="${ei}" data-si="${si}">×</button>
            </div>`).join("")}
          <button class="btn btn-g sm" data-act="t-addset" data-ei="${ei}">+ serija</button>
        </div>`;
      }).join("")}
      <button class="btn btn-p wide" style="margin-top:6px" data-act="t-finish">Završi trening</button>
    </div>`;
  }
```

- [ ] **Step 2: Add `startSession` and the logging actions to the training `click` listener**

```js
  if (a === "t-start") {
    const existing = activeSession(S.training);
    if (existing) { S.sheet = { type: "t-resume", pending: { templateId: el.dataset.id } }; renderSheet(); return; }
    startSession(el.dataset.id); return;
  }
  if (a === "t-addset") {
    const ei = parseInt(el.dataset.ei, 10);
    const active = activeSession(S.training);
    const sets = active.log.performedExercises[ei].sets;
    const last = sets[sets.length - 1] || { reps: 5, weight: 0 };
    sets.push({ reps: last.reps, weight: last.weight });
    saveTraining(); render(); return;
  }
  if (a === "t-rmset") {
    const active = activeSession(S.training);
    active.log.performedExercises[parseInt(el.dataset.ei, 10)].sets.splice(parseInt(el.dataset.si, 10), 1);
    saveTraining(); render(); return;
  }
  if (a === "t-finish") {
    collectActiveSets();
    const active = activeSession(S.training);
    active.status = "completed";
    active.completedAt = new Date().toISOString();
    if (saveTraining()) toast("Trening spremljen");
    S.trainingTab = "hist"; S.sheet = null; render(); return;
  }
  if (a === "t-abandon") {
    collectActiveSets();
    S.sheet = { type: "t-leave", pending: { abandon: true } };
    renderSheet(); return;
  }
  if (a === "t-resume-open") { S.trainingTab = "log"; render(); return; }
```

- [ ] **Step 3: Add `startSession` and `collectActiveSets` helpers**

```js
function startSession(templateId) {
  const tpl = S.training.templates.find((t) => t.id === templateId);
  if (!tpl) { toast("Predložak ne postoji"); return; }
  const snap = cloneTemplate(tpl);
  const session = {
    id: uid("ses"), date: dateKey(S.day || new Date()), templateId: tpl.id,
    status: "active", startedAt: Date.now(), snapshot: snap,
    log: { performedExercises: snap.exercises.map((row) => ({ exerciseId: row.exerciseId, sets: row.targetSets.map((s) => ({ reps: s.reps, weight: s.weight })) })) },
  };
  S.training.sessions.push(session);
  saveTraining();
  S.trainingTab = "log";
  registerLeaveGuard(); // Task 8
  render();
}

/* Pročitaj upisane serije iz DOM-a u aktivnu sesiju (obrasci se ne re-renderiraju). */
function collectActiveSets() {
  const active = activeSession(S.training);
  if (!active) return;
  document.querySelectorAll('[data-act="t-set-reps"]').forEach((inp) => {
    const ei = parseInt(inp.dataset.ei, 10), si = parseInt(inp.dataset.si, 10);
    if (active.log.performedExercises[ei] && active.log.performedExercises[ei].sets[si]) active.log.performedExercises[ei].sets[si].reps = num(inp.value, 0);
  });
  document.querySelectorAll('[data-act="t-set-wt"]').forEach((inp) => {
    const ei = parseInt(inp.dataset.ei, 10), si = parseInt(inp.dataset.si, 10);
    if (active.log.performedExercises[ei] && active.log.performedExercises[ei].sets[si]) active.log.performedExercises[ei].sets[si].weight = num(inp.value, 0);
  });
  saveTraining();
}
```
Note: `registerLeaveGuard()` is defined in Task 8; calling it from
`startSession` before Task 8 lands would throw at runtime. Implement Task 8
immediately after Task 7 (they ship together for a working guard). For a
strictly incremental commit, temporarily guard the call:
`if (typeof registerLeaveGuard === "function") registerLeaveGuard();` and
remove the guard in Task 8.

- [ ] **Step 4: Build + manual test the logging loop**

Run: `node --check src/training.js && python3 build.py --preview`, reload preview.
Verify: Pokreni on the template creates the in-tijeku card; editing reps/kg then + serija adds a set seeded from the last; removing a set works; Završi moves the session to Povijest (placeholder until Task 9, but `S.training.sessions` gains a completed one — check via devtools `JSON.parse(localStorage.obroci_training).sessions`).

- [ ] **Step 5: Add a payload round-trip check (app-level)**

Create a throwaway node check (do not commit) to confirm the app.js seam carries training. Run:
```bash
node -e '
const p = { ingredients:[], recipes:[], settings:{}, logs:{}, training:{exercises:[{id:"e1"}],templates:[],sessions:[],settings:{units:"kg"}}, updatedAt:1 };
// simulate adoptPayload training branch:
let S = {}; if (p.training) S.training = p.training;
if (JSON.stringify(S.training.exercises) !== JSON.stringify([{id:"e1"}])) { console.log("FAIL"); process.exit(1); }
console.log("payload training round-trip OK");
'
```
Expected: `payload training round-trip OK`.

- [ ] **Step 6: Commit**

```bash
git add src/training.js preview/index.html
git commit -m "feat(training): active workout logging, start/finish, best-weight"
```

---

## Task 8: Active-session guards (leave + resume)

**Files:**
- Modify: `src/training.js` (guard registration, `sheetLeave`, `sheetResume`, `S.guardLeave`, `beforeunload`)

**Interfaces:**
- Consumes: `activeSession`, `startSession`, `render`, `renderSheet`.
- Produces: `registerLeaveGuard()`, `unregisterLeaveGuard()`, `S.guardLeave(dest)`, `sheetLeave()`, `sheetResume(pending)`; `t-leave-stay`/`t-leave-go`, `t-resume-continue`/`t-resume-new` actions.

- [ ] **Step 1: Add guard state, `S.guardLeave`, and (un)register helpers**

```js
/* ---------- čuvar aktivnog treninga ---------- */

let _beforeUnload = null;

function registerLeaveGuard() {
  if (_beforeUnload) return;
  _beforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
  window.addEventListener("beforeunload", _beforeUnload);
}
function unregisterLeaveGuard() {
  if (_beforeUnload) { window.removeEventListener("beforeunload", _beforeUnload); _beforeUnload = null; }
}

/* Vrati true ako navigaciju treba blokirati (i prikaži upozorenje).
   Blokiramo samo kad je trening u tijeku i gledamo njegov log. */
S_guardInstall();
function S_guardInstall() {
  S.guardLeave = function (dest) {
    const active = activeSession(S.training);
    const inLog = S.tab === "trening" && S.trainingTab === "log";
    if (!active || !inLog) return false;
    if (dest === "ttab:log" || dest === "tab:trening") return false; // ostajemo u istom
    S.sheet = { type: "t-leave", pending: { dest: dest } };
    renderSheet();
    return true;
  };
}
```
Note: on module load an active session may already exist (interrupted). Call
`registerLeaveGuard()` from `onTrainingReady` too if `activeSession(S.training)`
is truthy — add that line at the end of `onTrainingReady`:
```js
  if (activeSession(S.training)) registerLeaveGuard();
```

- [ ] **Step 2: Add `sheetLeave` and `sheetResume`**

```js
function sheetLeave() {
  return `
  <div class="sheet-in">
    <div class="row spread mb12"><h2>Trening u tijeku</h2></div>
    <p class="note">Trening još nije spremljen. Ako izađeš, ostaje prekinut i možeš ga kasnije nastaviti.</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn btn-p grow" data-act="t-leave-stay">Ostani</button>
      <button class="btn btn-g grow" data-act="t-leave-go">Izađi</button>
    </div>
  </div>`;
}

function sheetResume(pending) {
  return `
  <div class="sheet-in">
    <div class="row spread mb12"><h2>Prekinuti trening</h2></div>
    <p class="note">Imaš trening koji nije završen. Želiš li ga nastaviti ili započeti novi? Novi briše prekinuti.</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn btn-p grow" data-act="t-resume-continue">Nastavi</button>
      <button class="btn btn-g grow" data-act="t-resume-new" data-id="${pending && pending.templateId ? esc(pending.templateId) : ""}">Započni novi</button>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Add the guard/resume actions to the training `click` listener**

```js
  if (a === "t-leave-stay") { S.sheet = null; renderSheet(); return; }
  if (a === "t-leave-go") {
    const pend = S.sheet.pending || {};
    S.sheet = null;
    if (pend.abandon) {
      // Odustajanje: obriši prekinutu aktivnu sesiju.
      const act = activeSession(S.training);
      if (act) S.training.sessions = S.training.sessions.filter((s) => s.id !== act.id);
      unregisterLeaveGuard(); saveTraining(); render(); return;
    }
    const dest = pend.dest || "";
    if (dest.indexOf("ttab:") === 0) { S.trainingTab = dest.slice(5); render(); return; }
    if (dest.indexOf("tab:") === 0) { S.tab = dest.slice(4); render(); return; }
    render(); return;
  }
  if (a === "t-resume-continue") { S.sheet = null; S.tab = "trening"; S.trainingTab = "log"; render(); return; }
  if (a === "t-resume-new") {
    const tplId = (S.sheet && S.sheet.pending && S.sheet.pending.templateId) || el.dataset.id || "";
    const act = activeSession(S.training);
    if (act) S.training.sessions = S.training.sessions.filter((s) => s.id !== act.id);
    saveTraining();
    S.sheet = null;
    if (!tplId) { render(); return; } // došli s kalendara bez predloška — samo odbaci
    startSession(tplId); return;
  }
```
Also: in `t-finish` and successful abandon, call `unregisterLeaveGuard()`
(add it in `t-finish` right after setting status completed):
```js
    active.status = "completed";
    active.completedAt = new Date().toISOString();
    unregisterLeaveGuard();
```

- [ ] **Step 4: Remove the temporary `typeof` guard added in Task 7 Step 3**

In `startSession`, change back to a direct call:
```js
  registerLeaveGuard();
```

- [ ] **Step 5: Build + manual test the guards**

Run: `node --check src/training.js && python3 build.py --preview`, reload preview.
Verify:
- Start a session; tap the **Više** tab → leave modal appears; **Ostani** keeps you in the log; **Izađi** navigates to Više and the session stays active (Trening tab shows the "Nastavi trening" banner).
- Switch to **Vježbe** sub-nav while active → leave modal appears.
- Reload the page while active → browser shows a native "Leave site?" prompt (desktop/Android; iOS may not — expected per spec §6).
- With an active session, tap **Pokreni** on a template → resume modal; **Nastavi** returns to the log; **Započni novi** discards the old and starts fresh.
- **Odustani** on the active card → leave modal; **Izađi** discards the session.

- [ ] **Step 6: Commit**

```bash
git add src/training.js preview/index.html
git commit -m "feat(training): active-session leave guard and resume flow"
```

---

## Task 9: Kalendar + Povijest

**Files:**
- Modify: `src/training.js` (`paneKalendar`, `panePovijest`, `sheetSchedule`, `sheetSession`, actions, `S.calMonth` state)

**Interfaces:**
- Consumes: `dateKey`, `addDays`, `sessionVolume`, `sessionSetCount`, `exName`, `DANI`/`MJ` (globals from app.js), `saveTraining`, `startSession`.
- Produces: `paneKalendar()`, `panePovijest()`, `sheetSchedule(date)`, `sheetSession(session)`, `t-cal-prev`/`t-cal-next`/`t-cal-day`/`t-schedule-do`/`t-open-session`/`t-cal-start`/`t-cal-skip` actions.

- [ ] **Step 1: Add `paneKalendar` (compact month grid)**

```js
function paneKalendar() {
  if (!S.calMonth) { const d = new Date(); S.calMonth = { y: d.getFullYear(), m: d.getMonth() }; }
  const { y, m } = S.calMonth;
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7; // ponedjeljak = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDate = {};
  S.training.sessions.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
  const todayKey = dateKey(new Date());

  let cells = "";
  for (let i = 0; i < startPad; i++) cells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const has = byDate[key] || [];
    const done = has.some((s) => s.status === "completed");
    const planned = has.some((s) => s.status === "planned");
    const dot = done ? "var(--sage)" : planned ? "var(--amber)" : "transparent";
    cells += `
      <button class="tcell${key === todayKey ? " today" : ""}" data-act="t-cal-day" data-date="${key}">
        <span class="num">${d}</span>
        <span class="tdot" style="background:${dot}"></span>
      </button>`;
  }

  return `
    <div class="row spread mb10" style="margin-top:4px">
      <button class="btn btn-g sq" data-act="t-cal-prev">‹</button>
      <span class="dsp" style="font-weight:700">${MJ[m]} ${y}</span>
      <button class="btn btn-g sq" data-act="t-cal-next">›</button>
    </div>
    <div class="tgrid-head">${["P", "U", "S", "Č", "P", "S", "N"].map((x) => `<div class="eyebrow center">${x}</div>`).join("")}</div>
    <div class="tgrid">${cells}</div>`;
}
```

- [ ] **Step 2: Add `sheetSchedule` and its action**

```js
function sheetSchedule(date) {
  const d = new Date(date);
  const sess = S.training.sessions.filter((s) => s.date === date);
  const opts = S.training.templates.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("");
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>${prettyDate(d)}</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    ${sess.length ? sess.map((s) => `
      <div class="card p12 mb8">
        <div class="row spread">
          <div>
            <div style="font-size:14px;font-weight:600">${esc(s.snapshot ? s.snapshot.title : (S.training.templates.find((t) => t.id === s.templateId) || {}).title || "Trening")}</div>
            <div class="num sub2">${s.status === "completed" ? "Završeno" : s.status === "skipped" ? "Preskočeno" : "Planirano"}</div>
          </div>
          ${s.status === "planned" ? `<div class="row" style="gap:6px">
            <button class="btn btn-p sm" data-act="t-cal-start" data-id="${s.id}">Pokreni</button>
            <button class="btn btn-g sm" data-act="t-cal-skip" data-id="${s.id}">Preskoči</button>
          </div>` : `<button class="btn btn-g sm" data-act="t-open-session" data-id="${s.id}">Otvori</button>`}
        </div>
      </div>`).join("") : `<p class="note">Ništa planirano za ovaj dan.</p>`}
    <div class="eyebrow mb8" style="margin-top:8px">Zakaži predložak</div>
    <div class="row" style="gap:8px">
      <select id="tsch_tpl" style="flex:1;min-width:0">${opts}</select>
      <button class="btn btn-p" data-act="t-schedule-do" data-date="${date}">Zakaži</button>
    </div>`;
}
```

- [ ] **Step 3: Add `panePovijest` and `sheetSession`**

```js
function panePovijest() {
  const done = S.training.sessions.filter((s) => s.status === "completed").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  if (!done.length) return `<p class="note" style="margin-top:8px">Još nema završenih treninga.</p>`;
  let html = `<div style="margin-top:4px">`;
  done.forEach((s) => {
    html += `
    <button class="card row-btn p12 mb8" data-act="t-open-session" data-id="${s.id}">
      <div class="row spread">
        <span style="font-size:14.5px;font-weight:500">${esc(s.snapshot ? s.snapshot.title : "Trening")}</span>
        <span class="num sub" style="margin:0">${esc(s.date)}</span>
      </div>
      <div class="num sub2">${sessionSetCount(s)} serija · volumen ${Math.round(sessionVolume(s))} kg</div>
    </button>`;
  });
  return html + "</div>";
}

function sheetSession(s) {
  const snap = s.snapshot || { exercises: [] };
  return `
  <div class="sheet-in">
    <div class="row spread mb4" style="align-items:flex-start">
      <h2 style="font-size:19px">${esc(snap.title || "Trening")}</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    <div class="eyebrow mb14">${esc(s.date)} · ${sessionSetCount(s)} serija · volumen ${Math.round(sessionVolume(s))} kg</div>
    ${(s.log ? s.log.performedExercises : []).map((pe) => `
      <div class="mb14">
        <div style="font-size:14.5px;font-weight:600;margin-bottom:6px">${esc(exName(pe.exerciseId))}</div>
        ${pe.sets.map((set, i) => `<div class="row spread ingrow"><span class="sub" style="margin:0">Serija ${i + 1}</span><span class="num" style="font-size:14px">${set.reps} × ${set.weight} kg</span></div>`).join("")}
      </div>`).join("")}
  </div>`;
}
```

- [ ] **Step 4: Add calendar/history actions to the training `click` listener**

```js
  if (a === "t-cal-prev") { let { y, m } = S.calMonth; m--; if (m < 0) { m = 11; y--; } S.calMonth = { y, m }; render(); return; }
  if (a === "t-cal-next") { let { y, m } = S.calMonth; m++; if (m > 11) { m = 0; y++; } S.calMonth = { y, m }; render(); return; }
  if (a === "t-cal-day") { S.sheet = { type: "t-schedule", date: el.dataset.date }; renderSheet(); return; }
  if (a === "t-schedule-do") {
    const id = $("#tsch_tpl").value;
    const tpl = S.training.templates.find((t) => t.id === id);
    if (!tpl) { toast("Nema predloška"); return; }
    S.training.sessions.push({ id: uid("ses"), date: el.dataset.date, templateId: id, status: "planned", snapshot: cloneTemplate(tpl) });
    if (saveTraining()) toast("Zakazano");
    S.sheet = null; render(); return;
  }
  if (a === "t-cal-start") {
    const existing = activeSession(S.training);
    if (existing) { S.sheet = { type: "t-resume", pending: {} }; renderSheet(); return; }
    const s = S.training.sessions.find((x) => x.id === el.dataset.id);
    // Pretvori planiranu sesiju u aktivnu koristeći njezin snapshot.
    s.status = "active"; s.startedAt = Date.now();
    s.log = { performedExercises: s.snapshot.exercises.map((row) => ({ exerciseId: row.exerciseId, sets: row.targetSets.map((z) => ({ reps: z.reps, weight: z.weight })) })) };
    saveTraining(); registerLeaveGuard();
    S.tab = "trening"; S.trainingTab = "log"; S.sheet = null; render(); return;
  }
  if (a === "t-cal-skip") {
    const s = S.training.sessions.find((x) => x.id === el.dataset.id);
    s.status = "skipped"; if (saveTraining()) toast("Preskočeno");
    S.sheet = null; render(); return;
  }
  if (a === "t-open-session") { S.sheet = { type: "t-session", session: S.training.sessions.find((x) => x.id === el.dataset.id) }; renderSheet(); return; }
```

- [ ] **Step 5: Append the calendar CSS to `src/shell.html`**

Before the closing `</style>` add:
```css
.tgrid-head{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;}
.tgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.tcell{aspect-ratio:1;border:1px solid var(--ln);border-radius:8px;background:var(--sf);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:13px;color:var(--ink);padding:0;}
.tcell.today{border-color:var(--amber);}
.tdot{width:5px;height:5px;border-radius:999px;}
```

- [ ] **Step 6: Build + manual test**

Run: `node --check src/training.js && python3 build.py --preview`, reload preview.
Verify: Kalendar shows the month grid; prev/next changes month; tapping a day opens the schedule sheet; scheduling a template dot-marks the day (amber) and lists it as planned; **Pokreni** from a planned day starts logging using its snapshot; **Preskoči** marks skipped; completing a session dot-marks the day green and it appears in Povijest with correct set count + volume; opening a history entry shows per-set detail.

- [ ] **Step 7: Commit**

```bash
git add src/training.js src/shell.html preview/index.html
git commit -m "feat(training): calendar scheduling and history"
```

---

## Task 10: Deploy — build root + preview, publish subpath, go live

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Merge `trening-preview` → `main` (so Pages publishes the additive `preview/` files; live root unchanged).

**Interfaces:**
- Produces: live preview at `https://bluka1.github.io/personal-fitness-app/preview/`; live app at root unchanged.

- [ ] **Step 1: Update the workflow to build both targets**

In `.github/workflows/deploy.yml`, replace the single build step:
```yaml
      - name: Build index.html from src/
        run: python3 build.py
```
with:
```yaml
      - name: Build live app
        run: python3 build.py
      - name: Build training preview
        run: python3 build.py --preview
```
Leave the rest (`upload-pages-artifact` with `path: .`, `deploy-pages`) as-is — it already uploads the whole tree including `preview/`.

- [ ] **Step 2: Final local build of both, syntax gate, unit tests**

Run:
```bash
node --check src/app.js && node --check src/training.js && node --check src/training-calc.js && node --check src/training-seed.js
node --test test/
python3 build.py && python3 build.py --preview
```
Expected: all checks pass; both `index.html` and `preview/index.html` written.

- [ ] **Step 3: Confirm the live root build is byte-identical to what's on main**

Run:
```bash
git fetch origin main
git show origin/main:index.html > /tmp/live-index.html
diff /tmp/live-index.html index.html && echo "LIVE ROOT UNCHANGED"
```
Expected: `LIVE ROOT UNCHANGED` (no diff). If there is a diff, the seams in Task 1 changed live output — investigate before merging.

- [ ] **Step 4: Commit the workflow + generated preview, merge to main**

```bash
git add .github/workflows/deploy.yml index.html preview/index.html
git commit -m "ci: build and publish training preview to /preview subpath"
git checkout main
git merge --no-ff trening-preview -m "feat: training preview at /preview (additive, live app unchanged)"
git push origin main
```

- [ ] **Step 5: Watch the deploy and verify the live URLs**

```bash
rid=$(gh run list --repo bluka1/personal-fitness-app --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $rid --repo bluka1/personal-fitness-app --exit-status
curl -s -o /dev/null -w "root=%{http_code}\n" https://bluka1.github.io/personal-fitness-app/
curl -s -o /dev/null -w "preview=%{http_code}\n" https://bluka1.github.io/personal-fitness-app/preview/
```
Expected: run `success`; both `root=200` and `preview=200`.

- [ ] **Step 6: Hand the preview link to the user**

Report: preview live at `https://bluka1.github.io/personal-fitness-app/preview/`; live app unchanged at the root. Note it has its own localStorage (separate origin path); to see real data, enable sync in the preview and pull.

---

## Self-Review

**Spec coverage:**
- §1 goal / cuts → Tasks 3–9 build training; no Firebase/AI/media/profile anywhere; recipes untouched. ✓
- §2 constraints → Global Constraints + each task obeys (vanilla, Croatian, forms-read-at-save via `collect*`). ✓
- §3 module seams → Task 1 (all four) + nav-guard. ✓
- §4 navigation (5th tab + sub-nav; four panes) → Tasks 5 (tab+Vježbe), 6 (templates in log), 7 (active log), 9 (cal+hist). ✓
- §5 data model → Tasks 4 (seed shapes), 5–9 (exercises/templates/sessions/settings) match spec shapes. ✓
- §6 active-session guards + resume + iOS caveat → Task 8 (+ startSession registers guard in Task 7). ✓
- §7 sync via payload key → Task 1 Step 3 + Task 7 Step 5 check. ✓
- §8 files & build → Task 2 (build --preview), Tasks 3–9 files. ✓
- §9 deployment subpath + no preview SW → Task 2 (SW strip), Task 10 (workflow+merge+verify). ✓
- §10 testing → Task 3 unit tests + per-task manual checklists + Task 10 gate. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Two forward-references are called out explicitly (Task 5 note on later sheet fns; Task 7 note on `registerLeaveGuard` guarded until Task 8) with concrete resolution steps. ✓

**Type consistency:** Session/template/exercise field names identical across tasks (`exerciseId`, `targetSets`, `performedExercises`, `snapshot`, `status`, `startedAt`, `completedAt`). Calc fn names match tests and call sites (`sessionVolume`, `sessionSetCount`, `bestWeight`, `cloneTemplate`, `activeSession`). Actions namespaced `t-*`; helpers `collectTemplate`/`collectActiveSets`/`stripMeta`/`startSession`/`registerLeaveGuard`/`unregisterLeaveGuard` defined once and referenced consistently. ✓
