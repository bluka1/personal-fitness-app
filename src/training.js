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
      if (S.training.exercises.some((y) => y.name.trim().toLowerCase() === ex.name.toLowerCase())) { toast('„' + ex.name + '“ već postoji'); return; }
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
