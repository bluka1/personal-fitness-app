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

/* Najbolja kilaža + koliko je puta (ukupno ponavljanja) dignuta na toj kilaži
   kroz sve završene treninge. { weight, times }; oba 0 ako nema povijesti. */
function bestWeightTimes(sessions, exerciseId) {
  const w = bestWeight(sessions, exerciseId);
  if (!w) return { weight: 0, times: 0 };
  let times = 0;
  (sessions || []).forEach((s) => {
    if (s.status !== "completed") return;
    const pe = s.log && s.log.performedExercises;
    if (!pe) return;
    pe.forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((set) => { if ((set.weight || 0) === w) times += (set.reps || 0); });
    });
  });
  return { weight: w, times: times };
}

/* Najbolja serija (najveća kilaža, pa najviše ponavljanja) iz posljednjeg
   ZAVRŠENOG treninga u kojem se radila ta vježba. null ako je nema. Aktivni
   trening je isključen jer nije "completed". */
function lastBestSet(sessions, exerciseId) {
  const done = (sessions || []).filter((s) =>
    s.status === "completed" && s.log && s.log.performedExercises &&
    s.log.performedExercises.some((ex) => ex.exerciseId === exerciseId && (ex.sets || []).length));
  if (!done.length) return null;
  done.sort((a, b) => String(b.completedAt || b.date || "").localeCompare(String(a.completedAt || a.date || "")));
  const ex = done[0].log.performedExercises.find((e) => e.exerciseId === exerciseId);
  let best = null;
  (ex.sets || []).forEach((set) => {
    const r = set.reps || 0, w = set.weight || 0;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { reps: r, weight: w };
  });
  return best;
}

function activeSession(training) {
  const list = (training && training.sessions) || [];
  return list.find((s) => s.status === "active") || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { cloneTemplate, sessionVolume, sessionSetCount, bestWeight, bestWeightTimes, lastBestSet, activeSession };
}
