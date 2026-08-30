# Trening preview — design spec

Date: 2026-08-30
Status: approved design, pre-implementation
Branch: `trening-preview` → published to Pages subpath `/preview/`

## 1. Goal

Incorporate the training/workout features of `bluka1/fitness-app` into the
Obroci PWA, as a **preview** the owner can open on a phone before deciding to
merge into the live app. Preview only — the live app at the site root stays
byte-for-byte unchanged.

Non-goals (explicit cuts):

- No Firebase (fitness-app's entire backend/auth). Local-first, like Obroci.
- No AI / chat / `server.js`.
- No exercise media (images/video). fitness-app stored these in Firebase
  Storage; local-first would mean base64 bloat in localStorage + sync payload.
- No profile/onboarding beyond a `units` setting (`kg`).
- No recipes port (Obroci already has recipes).
- No separate Postgres table — training rides Obroci's existing sync row.

## 2. Constraints inherited from Obroci

These are hard rules from the Obroci handoff; the training code obeys them.

- Vanilla JS, no framework, no bundler, no new runtime dependency.
- Build is one stdlib-only Python script (`build.py`); `index.html` is
  generated, never hand-edited.
- Full re-render via `render()` rewriting `#main.innerHTML`. Forms are NOT
  re-rendered per keystroke — values read from the DOM at save time.
- Local (`localStorage`) is the source of truth; Supabase is a thin layer.
- UI, messages, and code comments in Croatian.
- Palette/CSS come from `shell.html` `:root`; reuse existing classes.

## 3. Module boundary — training is additive

All training code lives in **`src/training.js`** (+ `src/training-seed.js`).
It self-registers through four small seams in `src/app.js`:

1. **Views registry.** `render()` view map becomes
   `Object.assign({ danas, recepti, namirnice, vise }, S.extraViews)`.
   training.js sets `S.extraViews.trening = viewTrening`.
2. **Nav injection.** training.js appends the `Trening`
   `<button data-tab="trening">` into `#nav` on load (after DOM ready).
3. **Sheet delegation.** `renderSheet()` delegates any `S.sheet.type` that
   starts with `t-` to `trainingSheet(S.sheet)`.
4. **Sync payload.** `currentPayload()` adds `training: S.training || null`;
   `adoptPayload(p)` sets `S.training = p.training` and writes the
   `obroci_training` localStorage key.

Consequence: the live build simply does not include `training.js`, so the live
app is unchanged. The preview build includes it, and the Trening tab appears.
`shell.html`'s static nav is untouched (button injected at runtime).

Globals training.js relies on (already global because everything is inlined
into one `<script>` by `build.py`): `S`, `render()`, `renderSheet()`,
`toast()`, `$`, `esc`, `num`, `uid`, `r0`, `r1`, `dateKey`, `addDays`,
`prettyDate`, `saveData`-style stamping via a new `saveTraining()`.

## 4. Navigation

New 5th bottom tab **Trening**. Inside it, a segmented sub-nav (`.seg`,
existing component) driven by `S.trainingTab`:

`Trening · Vježbe · Kalendar · Povijest`

- **Trening** (`S.trainingTab === "log"`): 
  - If an `active` session exists → a "Nastavi trening" banner to jump back in.
  - Today's `planned` session(s) from the calendar, each with *Start*.
  - Your templates (Predlošci) list, each with *Start* / *Uredi*, plus
    *Novi predložak*. (Templates live here to keep the sub-nav to four items.)
- **Vježbe**: exercise catalog (name · muscles · equipment); add/edit/delete
  via a `t-exercise` sheet.
- **Kalendar**: compact month grid (weeks × 7), current month with prev/next
  arrows; tap a day to schedule a template as a `planned` session
  (`t-schedule` sheet). Days with sessions are dot-marked.
- **Povijest**: `completed` sessions, newest first, with per-session volume
  (Σ reps×weight) and set count; tap to view detail.

Active logging (started from Trening): the log view lists the session's
exercises (from its frozen `snapshot`); per exercise, add sets (reps × weight,
optional RPE), mark sets done. Shows "najbolje dosad" (best weight seen for
that exercise across completed sessions — naive scan, fine for one user).
*Završi* finishes the session; *Odustani* abandons (see §6).

## 5. Data model

New localStorage key **`obroci_training`**, held in memory as `S.training`.
Writes go through `saveTraining()` which bumps `obroci_updated` and calls
`scheduleSync()` — identical pattern to `saveData()`/`saveLogs()`.

```js
S.training = {
  exercises: [
    { id, name, muscles: [String], equipment: [String] }
  ],
  templates: [
    { id, title,
      exercises: [
        { exerciseId, order, restSeconds, targetSets: [ { reps, weight } ] }
      ] }
  ],
  sessions: [
    { id,
      date: "YYYY-MM-DD",
      templateId,
      status: "planned" | "active" | "completed" | "skipped",
      startedAt?:  msNumber,     // set when status -> active
      completedAt?: ISOString,   // set when status -> completed
      snapshot?: WorkoutTemplate,// frozen template copy at start/schedule time
      log?: {
        performedExercises: [
          { exerciseId, sets: [ { reps, weight, rpe? } ] }
        ] } }
  ],
  settings: { units: "kg" }
}
```

- `muscles` / `equipment` enumerations reuse fitness-app's Croatian labels
  (Prsa, Leđa, Ramena, Biceps, Triceps, Kvadriceps, Zadnja loža, Listovi,
  Gluteusi, Core, Cijelo tijelo; Šipka, Bučice, Girja, Sprava, Kabel, Vlastita
  težina, Elastika, Šipka za zgibove).
- **Snapshot pattern** (kept from fitness-app, matches Obroci's "meal is a
  snapshot"): a session freezes a copy of the template at start time, so later
  template edits never rewrite session history.
- `units` is display-only; default `kg`. No profile, no onboarding.

`training-seed.js` provides `SEED_EXERCISES` (a small starter catalog, ~10–15
common lifts) and one sample template, so the preview is not empty on first
open. Seeded only when `obroci_training` is absent — same guard as Obroci's
`SEED_INGREDIENTS`/`SEED_RECIPES`.

## 6. Active session — guards & recovery

Exactly one `active` session at a time (single user). While a session is
`active`, every set add/edit calls `saveTraining()` immediately, so an
OS-level kill loses nothing.

**Leaving mid-session:**

- **In-app** (bottom-tab switch, training sub-nav switch, sheet close, or any
  `data-tab`/`data-act` that would navigate away) while the active log view is
  open → intercepted; open modal sheet `t-leave`:
  `Trening je u tijeku. Izađi?` → [Ostani] / [Izađi]. [Izađi] leaves the
  session `active` (i.e. interrupted) and proceeds with the navigation.
- **Page unload** (reload, tab close, browser back) → a `beforeunload` handler
  registered only while a session is `active` triggers the browser's native
  confirm. Works on desktop and Android Chrome.
  - **iOS limitation (named, not solved):** a standalone iOS PWA cannot block
    swipe-away / app termination; `beforeunload` is unreliable there. This is a
    platform limit with no workaround. Mitigation is the continuous persistence
    above + the resume flow below — nothing is lost, it is recovered.

**Interrupted → resume:**

- Tapping *Start* on a template (or today's planned session) while an `active`
  session already exists → modal `t-resume`:
  `Imaš prekinuti trening. Nastavi ili započni novi?` →
  [Nastavi] reopens the existing active session's log;
  [Započni novi] **discards** the interrupted active session (deleted — it was
  never completed) and starts the new one.
- The Trening tab also shows a "Nastavi trening" banner whenever an `active`
  session exists, as a direct way back in.

Session lifecycle: `planned → active → (completed | discarded)`. A `planned`
session can also be `skipped` from the calendar. "Discarded" = removed from
`sessions` (not persisted as a tombstone; single-user, no audit need).

## 7. Sync

`training` travels inside Obroci's existing `obroci_state` jsonb payload via
`currentPayload()` / `adoptPayload()`. Existing `scheduleSync()` → push/pull →
last-write-wins handles it. No SQL, no RLS change (jsonb stores arbitrary
JSON).

Known limitation (inherited, widened): Obroci sync is "newer wins over the
whole blob" (handoff §7.1). Training now shares that blob, so a food edit on
one device can clobber a workout logged on another and vice versa. Rare for one
user. The proper fix — per-key merge — is already on Obroci's roadmap and would
cover food and training together. Training is kept under its own top-level
`training` key so it is mechanically extractable to a dedicated table later if
that fix is ever needed.

## 8. Files & build

New:

- `src/training.js` — state, views, sheets, actions, guards. Croatian.
- `src/training-seed.js` — `SEED_EXERCISES` + one sample template.

Edited:

- `src/app.js` — the four seams in §3, plus `saveTraining()`, plus the
  active-session leave interception in the existing `click` handler and the
  `beforeunload` registration.
- `src/shell.html` — append training-specific CSS only if existing classes are
  insufficient; reuse `.card`, `.seg`, `.btn`, `.stepper`, `.row`, etc. first.
- `build.py` — add a `--preview` flag:
  - default (no flag): builds `index.html` **without** training (current
    behaviour, live app unchanged).
  - `--preview`: builds `preview/index.html` **with** `training-seed.js` +
    `training.js` inlined, and a preview `sw.js`/scope note (see §9).

## 9. Deployment — subpath on this repo

GitHub Pages serves one site per repo; a bare branch has no public URL. The
preview is therefore published to a **subpath**:

- Live app: `https://bluka1.github.io/personal-fitness-app/` (root, untouched).
- Preview: `https://bluka1.github.io/personal-fitness-app/preview/`.

The deploy must publish a single artifact containing **both** root (live) and
`preview/`. Implementation:

- Development happens on branch `trening-preview`.
- The Pages deploy workflow runs `python3 build.py` (root, live) **and**
  `python3 build.py --preview` (writes `preview/index.html`), then uploads the
  whole tree. The live root build is unchanged, so the live app is unaffected.
- To publish, the additive `preview/` output + the two `src/training*.js` files
  land on `main`; they do not alter the live root app (separate `index.html`).
- Service worker: the preview page needs its own cache scope so it does not
  fight the root SW. Options (decided at plan time): a `preview/sw.js` scoped to
  `/personal-fitness-app/preview/`, or the preview page reuses no SW. Preview is
  online-first anyway; simplest acceptable choice is **no service worker on the
  preview page** (drop the SW registration in the preview build). Offline for
  the preview is out of scope.

Merging later = promote the preview build into the root build (turn training on
in the default `build.py` output) — a one-line flip because training is
additive.

## 10. Testing

Repo has no test framework (handoff §9); follow its convention — `node --check`
plus throwaway `node -e` assert checks for non-trivial logic:

- `node --check src/training.js`, `node --check src/training-seed.js`.
- Self-checks:
  - volume + best-weight (PR) calc over a fixture of sessions;
  - snapshot freeze: editing a template after start does not change the
    session's `snapshot`;
  - payload round-trip: `adoptPayload(currentPayload())` preserves `training`.
- Manual (mobile), mirroring handoff §9 checklist, adding:
  - start session → add sets → Završi → appears in Povijest with right volume;
  - start session → switch tab → leave modal appears; [Ostani] keeps you in;
  - interrupt (reload) → start new → resume modal offers Nastavi / Novi;
  - schedule a template on a calendar day → shows as planned on that day;
  - enable sync on preview → training rows round-trip to Supabase.

## 11. Open items for the implementation plan

- Exact `SEED_EXERCISES` list and the one sample template (content only —
  format is settled).

Resolved (no longer open): Kalendar = compact month grid (§4); preview page
ships **no service worker** (§9).
