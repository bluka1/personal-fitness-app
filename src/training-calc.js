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
