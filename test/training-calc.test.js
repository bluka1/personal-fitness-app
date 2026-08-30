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

const mk = (id, when, sets) => ({
  id, status: "completed", date: when, completedAt: when + "T10:00:00Z",
  log: { performedExercises: [ { exerciseId: "e1", sets } ] },
});

test("bestWeightTimes sums reps at the max weight across completed sessions", () => {
  const sessions = [
    mk("a", "2026-08-01", [ { reps: 5, weight: 100 }, { reps: 3, weight: 100 }, { reps: 8, weight: 80 } ]),
    mk("b", "2026-08-10", [ { reps: 2, weight: 100 } ]),
    { id: "c", status: "active", log: { performedExercises: [ { exerciseId: "e1", sets: [ { reps: 1, weight: 200 } ] } ] } },
  ];
  // najbolja kilaža 100 (aktivnih 200 se ignorira); dignuta 5+3+2 = 10 puta
  assert.deepStrictEqual(C.bestWeightTimes(sessions, "e1"), { weight: 100, times: 10 });
  assert.deepStrictEqual(C.bestWeightTimes(sessions, "nope"), { weight: 0, times: 0 });
  assert.deepStrictEqual(C.bestWeightTimes([], "e1"), { weight: 0, times: 0 });
});

test("lastBestSet returns the best set from the most recent completed session", () => {
  const sessions = [
    mk("old", "2026-08-01", [ { reps: 5, weight: 90 } ]),
    mk("new", "2026-08-20", [ { reps: 5, weight: 100 }, { reps: 8, weight: 100 }, { reps: 12, weight: 60 } ]),
  ];
  // najnoviji je "new"; najbolja serija = najveća kilaža (100), pa najviše pon (8)
  assert.deepStrictEqual(C.lastBestSet(sessions, "e1"), { reps: 8, weight: 100 });
  assert.strictEqual(C.lastBestSet(sessions, "nope"), null);
  assert.strictEqual(C.lastBestSet([], "e1"), null);
});
