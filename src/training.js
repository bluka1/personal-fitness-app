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

const exName = (id) => { const e = S.training.exercises.find((x) => x.id === id); return e ? e.name : tr("nepoznata vježba"); };

/* ---------- glavni prikaz s pod-navigacijom ---------- */

function viewTrening() {
  if (!S.trainingTab) S.trainingTab = "log";
  const active = activeSession(S.training);
  let html = `
  <div class="pad">
    <div class="row spread mb14">
      <h1>${tr("Trening")}</h1>
    </div>
    <div class="seg mb14">
      ${TSLOTS.map((t) => `<button data-act="t-tab" data-t="${t.id}" class="${S.trainingTab === t.id ? "on" : ""}">${tr(t.label)}</button>`).join("")}
    </div>`;

  if (active && S.trainingTab !== "log") {
    html += `<button class="card row-btn p12 mb12" data-act="t-resume-open" style="border-color:var(--amber)">
      <div class="eyebrow" style="color:var(--amber)">${tr("Trening u tijeku")}</div>
      <div style="font-size:14.5px;font-weight:600;margin-top:3px">${tr("Nastavi trening")} →</div>
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
      <span class="eyebrow">${S.training.exercises.length} ${tr("vježbi")}</span>
      <button class="btn btn-p sm" data-act="t-new-ex">${tr("Nova vježba")}</button>
    </div>`;
  if (!S.training.exercises.length) html += `<p class="note">${tr("Još nema vježbi. Dodaj prvu.")}</p>`;
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
      <h2>${tr("Vježba")}</h2>
      <button class="btn btn-g sm" data-act="close">${tr("Odustani")}</button>
    </div>
    <label class="eyebrow">${tr("Naziv")}</label>
    <input id="tx_name" value="${esc(x.name || "")}" placeholder="${tr('npr. Potisak s klupe')}" style="margin:6px 0 14px">
    <div class="eyebrow mb8">${tr("Mišići")}</div>
    <div class="row wrap" style="margin-bottom:12px">${chips(MUSCLES, x.muscles || [], "t-ex-muscle")}</div>
    <div class="eyebrow mb8">${tr("Oprema")}</div>
    <div class="row wrap" style="margin-bottom:16px">${chips(EQUIPMENT, x.equipment || [], "t-ex-equip")}</div>
    <div class="row" style="gap:8px">
      <button class="btn btn-p grow" data-act="t-save-ex">${tr("Spremi")}</button>
      ${x._editing ? `<button class="btn btn-g" data-act="t-del-ex">${tr("Obriši")}</button>` : ""}
    </div>
  </div>`;
}

function sheetTemplate(tpl) {
  const exOptions = S.training.exercises.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  return `
  <div class="sheet-in">
    <div class="row spread mb14">
      <h2>${tr("Predložak")}</h2>
      <button class="btn btn-g sm" data-act="close">${tr("Odustani")}</button>
    </div>
    <label class="eyebrow">${tr("Naziv")}</label>
    <input id="tt_title" value="${esc(tpl.title || '')}" placeholder="${tr('npr. Gornji dio A')}" style="margin:6px 0 14px">
    <div class="eyebrow mb8">${tr("Vježbe")}</div>
    <div class="mb10">
      ${tpl.exercises.map((row, i) => `
        <div class="card p12 mb8" style="background:var(--sf2)">
          <div class="row spread">
            <span class="ellip" style="flex:1;font-size:14px">${esc(exName(row.exerciseId))}</span>
            <button class="x" data-act="t-tpl-rm" data-i="${i}">×</button>
          </div>
          <div class="num sub2" style="margin-top:4px">${row.targetSets.length} × ${row.targetSets[0] ? row.targetSets[0].reps + ' ' + tr('pon') + ' · ' + row.targetSets[0].weight + ' kg' : '—'} · ${tr("pauza")} ${row.restSeconds}s</div>
          <div class="row" style="gap:8px;margin-top:8px">
            <div style="flex:1"><label class="eyebrow">${tr("Serije")}</label><input inputmode="numeric" id="ts_sets_${i}" value="${row.targetSets.length}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">${tr("Pon.")}</label><input inputmode="numeric" id="ts_reps_${i}" value="${row.targetSets[0] ? row.targetSets[0].reps : 5}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">${tr("Kg")}</label><input inputmode="decimal" id="ts_wt_${i}" value="${row.targetSets[0] ? row.targetSets[0].weight : 0}" class="mini"></div>
            <div style="flex:1"><label class="eyebrow">${tr("Pauza s")}</label><input inputmode="numeric" id="ts_rest_${i}" value="${row.restSeconds}" class="mini"></div>
          </div>
        </div>`).join("")}
    </div>
    <div class="row" style="gap:8px;margin-bottom:16px">
      <select id="tt_add_ex" style="flex:1;min-width:0">${exOptions}</select>
      <button class="btn" data-act="t-tpl-add">+</button>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn-p grow" data-act="t-save-tpl">${tr("Spremi")}</button>
      ${tpl._editing ? `<button class="btn btn-g" data-act="t-del-tpl">${tr("Obriši")}</button>` : ""}
    </div>
  </div>`;
}

/* ---------- Kalendar ---------- */

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

/* ---------- List: raspored dana ---------- */

function sheetSchedule(date) {
  const d = new Date(date);
  const sess = S.training.sessions.filter((s) => s.date === date);
  const opts = S.training.templates.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("");
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>${prettyDate(d)}</h2>
      <button class="btn btn-g sm" data-act="close">${tr("Zatvori")}</button>
    </div>
    ${sess.length ? sess.map((s) => `
      <div class="card p12 mb8">
        <div class="row spread">
          <div>
            <div style="font-size:14px;font-weight:600">${esc(s.snapshot ? s.snapshot.title : (S.training.templates.find((t) => t.id === s.templateId) || {}).title || tr("Trening"))}</div>
            <div class="num sub2">${s.status === "completed" ? tr("Završeno") : s.status === "skipped" ? tr("Preskočeno") : tr("Planirano")}</div>
          </div>
          ${s.status === "planned" ? `<div class="row" style="gap:6px">
            <button class="btn btn-p sm" data-act="t-cal-start" data-id="${s.id}">${tr("Pokreni")}</button>
            <button class="btn btn-g sm" data-act="t-cal-skip" data-id="${s.id}">${tr("Preskoči")}</button>
            <button class="x" data-act="t-del-session" data-id="${s.id}">×</button>
          </div>` : `<button class="btn btn-g sm" data-act="t-open-session" data-id="${s.id}">${tr("Otvori")}</button>`}
        </div>
      </div>`).join("") : `<p class="note">${tr("Ništa planirano za ovaj dan.")}</p>`}
    <div class="eyebrow mb8" style="margin-top:8px">${tr("Zakaži predložak")}</div>
    <div class="row" style="gap:8px">
      <select id="tsch_tpl" style="flex:1;min-width:0">${opts}</select>
      <button class="btn btn-p" data-act="t-schedule-do" data-date="${date}">${tr("Zakaži")}</button>
    </div>`;
}

/* ---------- Povijest ---------- */

function panePovijest() {
  const done = S.training.sessions.filter((s) => s.status === "completed").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  if (!done.length) return `<p class="note" style="margin-top:8px">${tr("Još nema završenih treninga.")}</p>`;
  let html = `<div style="margin-top:4px">`;
  done.forEach((s) => {
    html += `
    <button class="card row-btn p12 mb8" data-act="t-open-session" data-id="${s.id}">
      <div class="row spread">
        <span style="font-size:14.5px;font-weight:500">${esc(s.snapshot ? s.snapshot.title : tr("Trening"))}</span>
        <span class="num sub" style="margin:0">${esc(s.date)}</span>
      </div>
      <div class="num sub2">${sessionSetCount(s)} ${tr("serija")} · ${tr("volumen")} ${Math.round(sessionVolume(s))} kg</div>
    </button>`;
  });
  return html + "</div>";
}

function sheetSession(s) {
  const snap = s.snapshot || { exercises: [] };
  return `
  <div class="sheet-in">
    <div class="row spread mb4" style="align-items:flex-start">
      <h2 style="font-size:19px">${esc(snap.title || tr("Trening"))}</h2>
      <button class="btn btn-g sm" data-act="close">${tr("Zatvori")}</button>
    </div>
    <div class="eyebrow mb14">${esc(s.date)} · ${sessionSetCount(s)} ${tr("serija")} · ${tr("volumen")} ${Math.round(sessionVolume(s))} kg</div>
    ${(s.log ? s.log.performedExercises : []).map((pe) => `
      <div class="mb14">
        <div style="font-size:14.5px;font-weight:600;margin-bottom:6px">${esc(exName(pe.exerciseId))}</div>
        ${pe.sets.map((set, i) => `<div class="row spread ingrow"><span class="sub" style="margin:0">${tr("Serija")} ${i + 1}</span><span class="num" style="font-size:14px">${set.reps} × ${set.weight} kg</span></div>`).join("")}
      </div>`).join("")}
    <button class="btn btn-g wide" style="margin-top:6px" data-act="t-del-session" data-id="${esc(s.id)}">${tr("Obriši trening")}</button>
  </div>`;
}

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

/* ---------- listovi za čuvara i nastavak ---------- */

function sheetLeave() {
  return `
  <div class="sheet-in">
    <div class="row spread mb12"><h2>${tr("Trening u tijeku")}</h2></div>
    <p class="note">${tr("Trening još nije spremljen. Ako izađeš, ostaje prekinut i možeš ga kasnije nastaviti.")}</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn btn-p grow" data-act="t-leave-stay">${tr("Ostani")}</button>
      <button class="btn btn-g grow" data-act="t-leave-go">${tr("Izađi")}</button>
    </div>
  </div>`;
}

function sheetResume(pending) {
  return `
  <div class="sheet-in">
    <div class="row spread mb12"><h2>${tr("Prekinuti trening")}</h2></div>
    <p class="note">${tr("Imaš trening koji nije završen. Želiš li ga nastaviti ili započeti novi? Novi briše prekinuti.")}</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn btn-p grow" data-act="t-resume-continue">${tr("Nastavi")}</button>
      <button class="btn btn-g grow" data-act="t-resume-new" data-id="${pending && pending.templateId ? esc(pending.templateId) : ""}">${tr("Započni novi")}</button>
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

/* ---------- Predlošci ---------- */

function paneLog(active) {
  let html = "";
  if (active) {
    const snap = active.snapshot;
    html += `
    <div class="card p14 mb14" style="border-color:var(--amber)">
      <div class="row spread mb10">
        <div>
          <div class="eyebrow" style="color:var(--amber)">${tr("U tijeku")}</div>
          <div style="font-size:16px;font-weight:700;margin-top:2px">${esc(snap.title)}</div>
        </div>
        <div class="center">
          <div class="num" id="t-timer" style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums">${fmtDur(Date.now() - (active.startedAt || Date.now()))}</div>
          <button class="btn btn-g sm" style="margin-top:6px" data-act="t-abandon">${tr("Odustani")}</button>
        </div>
      </div>
      ${snap.exercises.map((row, ei) => {
        const pe = active.log.performedExercises[ei];
        const bw = bestWeightTimes(S.training.sessions, row.exerciseId);
        const last = lastBestSet(S.training.sessions, row.exerciseId);
        return `
        <div class="mb12">
          <div class="row spread mb6">
            <span style="font-size:14.5px;font-weight:600">${esc(exName(row.exerciseId))}</span>
            ${bw.weight ? `<span class="num sub" style="margin:0">${tr("najbolje")} ${bw.weight} kg · ${bw.times}×</span>` : ""}
          </div>
          ${last ? `<div class="num sub2" style="margin:-2px 0 8px">${tr("prošli put")}: ${last.reps} × ${last.weight} kg</div>` : ""}
          ${pe.sets.map((s, si) => `
            <div class="setrow${s.done ? " done" : ""}">
              <button class="chk" data-act="t-set-done" data-ei="${ei}" data-si="${si}" aria-label="${tr('Gotovo')}">${s.done ? "✓" : ""}</button>
              <div class="stpr">
                <button class="stp" data-act="t-set-step" data-ei="${ei}" data-si="${si}" data-fld="reps" data-d="-1" aria-label="${tr('Manje pon.')}">−</button>
                <input inputmode="numeric" data-act="t-set-reps" data-ei="${ei}" data-si="${si}" value="${s.reps}" aria-label="${tr('Ponavljanja')}">
                <button class="stp" data-act="t-set-step" data-ei="${ei}" data-si="${si}" data-fld="reps" data-d="1" aria-label="${tr('Više pon.')}">+</button>
              </div>
              <span class="mut" style="font-size:12px">×</span>
              <div class="stpr">
                <button class="stp" data-act="t-set-step" data-ei="${ei}" data-si="${si}" data-fld="weight" data-d="-2.5" aria-label="${tr('Manje kg')}">−</button>
                <input inputmode="decimal" data-act="t-set-wt" data-ei="${ei}" data-si="${si}" value="${s.weight}" aria-label="${tr('Kilogrami')}">
                <button class="stp" data-act="t-set-step" data-ei="${ei}" data-si="${si}" data-fld="weight" data-d="2.5" aria-label="${tr('Više kg')}">+</button>
              </div>
              <button class="x" data-act="t-rmset" data-ei="${ei}" data-si="${si}">×</button>
            </div>`).join("")}
          <button class="btn btn-g sm" data-act="t-addset" data-ei="${ei}">+ ${tr("serija")}</button>
        </div>`;
      }).join("")}
      <button class="btn btn-p wide" style="margin-top:6px" data-act="t-finish">${tr("Završi trening")}</button>
    </div>
    ${S.rest ? `
    <div class="restbar" id="t-rest">
      <span>${tr("Pauza")} <span class="num" id="t-rest-num">${fmtDur(Math.max(0, S.rest.endsAt - Date.now()))}</span></span>
      <span class="row" style="gap:8px">
        <button data-act="t-rest-plus">+15s</button>
        <button data-act="t-rest-skip">${tr("Preskoči")}</button>
      </span>
    </div>` : ""}`;
  }
  // Dok trening traje, ne nudimo predloške (unos/pokretanje drugog treninga).
  if (!active) {
    html += `
    <div class="row spread mb10" style="margin-top:4px">
      <span class="eyebrow">${tr("Predlošci")}</span>
      <div class="row" style="gap:6px">
        <button class="btn btn-g sm" data-act="import-train">${tr("Iz slike")}</button>
        <button class="btn btn-p sm" data-act="t-new-tpl">${tr("Novi predložak")}</button>
      </div>
    </div>`;
    if (!S.training.templates.length) html += `<p class="note">${tr("Nema predložaka. Napravi prvi pa ga pokreni.")}</p>`;
    S.training.templates.forEach((t) => {
      html += `
      <div class="card p12 mb8">
        <div style="font-size:14.5px;font-weight:500">${esc(t.title)}</div>
        <div class="num sub2" style="margin-bottom:10px">${t.exercises.length} ${tr("vježbi")} · ${t.exercises.reduce((a, x) => a + (x.targetSets ? x.targetSets.length : 0), 0)} ${tr("serija")}</div>
        <div class="row" style="gap:8px">
          <button class="btn btn-p grow" data-act="t-start" data-id="${t.id}">${tr("Pokreni")}</button>
          <button class="btn btn-g" data-act="t-edit-tpl" data-id="${t.id}">${tr("Uredi")}</button>
        </div>
      </div>`;
    });
  }
  return html;
}

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
    if (!ex.name) { toast(tr("Vježba treba naziv")); return; }
    if (!ex.id) {
      if (S.training.exercises.some((y) => y.name.trim().toLowerCase() === ex.name.toLowerCase())) { toast(tr('„{name}“ već postoji', { name: ex.name })); return; }
      ex.id = uid("ex");
      S.training.exercises.push({ id: ex.id, name: ex.name, muscles: ex.muscles || [], equipment: ex.equipment || [] });
    } else {
      const i = S.training.exercises.findIndex((y) => y.id === ex.id);
      S.training.exercises[i] = { id: ex.id, name: ex.name, muscles: ex.muscles || [], equipment: ex.equipment || [] };
    }
    if (saveTraining()) toast(tr("Spremljeno"));
    S.sheet = null; render(); return;
  }
  if (a === "t-del-ex") {
    const id = S.sheet.ex.id, name = S.sheet.ex.name;
    askConfirm({ msg: tr("Obrisati vježbu „{name}”?", { name: name || "" }), ok: () => {
      S.training.exercises = S.training.exercises.filter((y) => y.id !== id);
      if (saveTraining()) toast(tr("Obrisano"));
      S.sheet = null; render();
    } });
    return;
  }

  if (a === "t-start") {
    const existing = activeSession(S.training);
    if (existing) { S.sheet = { type: "t-resume", pending: { templateId: el.dataset.id } }; renderSheet(); return; }
    startSession(el.dataset.id); return;
  }
  if (a === "t-addset") {
    collectActiveSets();
    const ei = parseInt(el.dataset.ei, 10);
    const active = activeSession(S.training);
    const sets = active.log.performedExercises[ei].sets;
    const last = sets[sets.length - 1] || { reps: 5, weight: 0 };
    sets.push({ reps: last.reps, weight: last.weight });
    saveTraining(); render(); return;
  }
  if (a === "t-rmset") {
    collectActiveSets();
    const active = activeSession(S.training);
    active.log.performedExercises[parseInt(el.dataset.ei, 10)].sets.splice(parseInt(el.dataset.si, 10), 1);
    saveTraining(); render(); return;
  }
  if (a === "t-set-step") {
    collectActiveSets();
    const ei = parseInt(el.dataset.ei, 10), si = parseInt(el.dataset.si, 10);
    const fld = el.dataset.fld, d = parseFloat(el.dataset.d);
    const set = activeSession(S.training).log.performedExercises[ei].sets[si];
    let v = (set[fld] || 0) + d;
    v = fld === "reps" ? Math.max(0, Math.round(v)) : Math.max(0, Math.round(v * 4) / 4);
    set[fld] = v;
    saveTraining(); render(); return;
  }
  if (a === "t-set-done") {
    collectActiveSets();
    const ei = parseInt(el.dataset.ei, 10), si = parseInt(el.dataset.si, 10);
    const active = activeSession(S.training);
    const row = active.snapshot.exercises[ei];
    const set = active.log.performedExercises[ei].sets[si];
    set.done = !set.done;
    if (set.done) {
      const w = set.weight || 0;
      // PR: pobjeđuje li povijesni najbolji (i najbolji već označeni u ovoj sesiji)
      const prevBest = bestWeight(S.training.sessions, row.exerciseId);
      let sessMax = 0;
      active.log.performedExercises.forEach((pe2) => pe2.sets.forEach((st) => { if (st.done && st !== set && (st.weight || 0) > sessMax) sessMax = st.weight || 0; }));
      if (w > 0 && prevBest > 0 && w > prevBest && w > sessMax) toast(tr("Novi rekord 🏆 {w} kg", { w: w }));
      const rest = row.restSeconds || 0;
      if (rest > 0) { S.rest = { endsAt: Date.now() + rest * 1000, exId: row.exerciseId }; if (navigator.vibrate) navigator.vibrate(30); }
    }
    saveTraining(); render(); return;
  }
  if (a === "t-rest-skip") { S.rest = null; render(); return; }
  if (a === "t-rest-plus") { if (S.rest) { S.rest.endsAt += 15000; ensureTickers(); } return; }
  if (a === "t-finish") {
    collectActiveSets();
    const active = activeSession(S.training);
    active.status = "completed";
    active.completedAt = new Date().toISOString();
    unregisterLeaveGuard(); S.rest = null;
    if (saveTraining()) toast(tr("Trening spremljen"));
    S.trainingTab = "hist"; S.sheet = null; render(); return;
  }
  if (a === "t-leave-stay") { S.sheet = null; renderSheet(); return; }
  if (a === "t-leave-go") {
    const pend = S.sheet.pending || {};
    S.sheet = null;
    if (pend.abandon) {
      // Odustajanje: obriši prekinutu aktivnu sesiju.
      const act = activeSession(S.training);
      if (act) S.training.sessions = S.training.sessions.filter((s) => s.id !== act.id);
      unregisterLeaveGuard(); S.rest = null; saveTraining(); render(); return;
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
    if (!tplId) { unregisterLeaveGuard(); render(); return; } // došli s kalendara bez predloška — samo odbaci
    startSession(tplId); return;
  }

  if (a === "t-abandon") {
    collectActiveSets();
    S.sheet = { type: "t-leave", pending: { abandon: true } };
    renderSheet(); return;
  }
  if (a === "t-resume-open") { S.tab = "trening"; S.trainingTab = "log"; render(); return; }

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
    if (!t.title) { toast(tr("Predložak treba naziv")); return; }
    if (!t.exercises.length) { toast(tr("Dodaj barem jednu vježbu")); return; }
    t.exercises.forEach((r, i) => (r.order = i));
    if (!t.id) { t.id = uid("tpl"); S.training.templates.push(stripMeta(t)); }
    else { const i = S.training.templates.findIndex((x) => x.id === t.id); S.training.templates[i] = stripMeta(t); }
    if (saveTraining()) toast(tr("Spremljeno"));
    S.sheet = null; render(); return;
  }
  if (a === "t-del-tpl") {
    const id = S.sheet.tpl.id, title = S.sheet.tpl.title;
    askConfirm({ msg: tr("Obrisati predložak „{title}”?", { title: title || "" }), ok: () => {
      S.training.templates = S.training.templates.filter((x) => x.id !== id);
      if (saveTraining()) toast(tr("Obrisano"));
      S.sheet = null; render();
    } });
    return;
  }

  // --- Kalendar i povijest ---
  if (a === "t-cal-prev") { let { y, m } = S.calMonth; m--; if (m < 0) { m = 11; y--; } S.calMonth = { y, m }; render(); return; }
  if (a === "t-cal-next") { let { y, m } = S.calMonth; m++; if (m > 11) { m = 0; y++; } S.calMonth = { y, m }; render(); return; }
  if (a === "t-cal-day") { S.sheet = { type: "t-schedule", date: el.dataset.date }; renderSheet(); return; }
  if (a === "t-schedule-do") {
    const id = $("#tsch_tpl").value;
    const tpl = S.training.templates.find((t) => t.id === id);
    if (!tpl) { toast(tr("Nema predloška")); return; }
    S.training.sessions.push({ id: uid("ses"), date: el.dataset.date, templateId: id, status: "planned", snapshot: cloneTemplate(tpl) });
    if (saveTraining()) toast(tr("Zakazano"));
    S.sheet = null; render(); return;
  }
  if (a === "t-cal-start") {
    const s = S.training.sessions.find((x) => x.id === el.dataset.id);
    const existing = activeSession(S.training);
    if (existing) { S.sheet = { type: "t-resume", pending: { templateId: s ? s.templateId : "" } }; renderSheet(); return; }
    // Pretvori planiranu sesiju u aktivnu koristeći njezin snapshot.
    s.status = "active"; s.startedAt = Date.now();
    s.log = { performedExercises: s.snapshot.exercises.map((row) => ({ exerciseId: row.exerciseId, sets: row.targetSets.map((z) => ({ reps: z.reps, weight: z.weight })) })) };
    saveTraining(); registerLeaveGuard();
    S.tab = "trening"; S.trainingTab = "log"; S.sheet = null; render(); return;
  }
  if (a === "t-cal-skip") {
    const s = S.training.sessions.find((x) => x.id === el.dataset.id);
    s.status = "skipped"; if (saveTraining()) toast(tr("Preskočeno"));
    S.sheet = null; render(); return;
  }
  if (a === "t-open-session") { S.sheet = { type: "t-session", session: S.training.sessions.find((x) => x.id === el.dataset.id) }; renderSheet(); return; }
  if (a === "t-del-session") {
    const id = el.dataset.id;
    askConfirm({ msg: tr("Obrisati ovaj trening?"), ok: () => {
      const s = S.training.sessions.find((x) => x.id === id);
      if (s && s.status === "active") unregisterLeaveGuard(); // brišemo li aktivni, makni čuvar
      S.training.sessions = S.training.sessions.filter((x) => x.id !== id);
      if (saveTraining()) toast(tr("Trening obrisan"));
      S.sheet = null; render();
    } });
    return;
  }
});

/* ---------- aktivna sesija ---------- */

function startSession(templateId) {
  const tpl = S.training.templates.find((t) => t.id === templateId);
  if (!tpl) { toast(tr("Predložak ne postoji")); return; }
  const snap = cloneTemplate(tpl);
  const session = {
    id: uid("ses"), date: dateKey(S.day || new Date()), templateId: tpl.id,
    status: "active", startedAt: Date.now(), snapshot: snap,
    log: { performedExercises: snap.exercises.map((row) => ({ exerciseId: row.exerciseId, sets: row.targetSets.map((s) => ({ reps: s.reps, weight: s.weight })) })) },
  };
  S.training.sessions.push(session);
  saveTraining();
  S.trainingTab = "log";
  registerLeaveGuard();
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

/* ---------- štoperica aktivnog treninga ---------- */

let _timerInt = null;

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? h + ":" + pad(m) + ":" + pad(ss) : pad(m) + ":" + pad(ss);
}

/* Poziva se nakon svakog rendera (S.afterRender). Osvježava štopericu i pauzu
   svake sekunde dok su relevantni elementi u DOM-u; inače stane. */
function ensureTickers() {
  const stop = () => { if (_timerInt) { clearInterval(_timerInt); _timerInt = null; } };
  const tick = () => {
    const active = activeSession(S.training);
    const tel = document.getElementById("t-timer");
    if (tel && active && active.startedAt) tel.textContent = fmtDur(Date.now() - active.startedAt);
    if (S.rest) {
      const rem = Math.ceil((S.rest.endsAt - Date.now()) / 1000);
      if (rem <= 0) {
        S.rest = null;
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        const bar = document.getElementById("t-rest");
        if (bar) bar.remove();
      } else {
        const rel = document.getElementById("t-rest-num");
        if (rel) rel.textContent = fmtDur(rem * 1000);
      }
    }
    if (!document.getElementById("t-timer") && !S.rest) stop();
  };
  stop();
  if (document.getElementById("t-timer") || S.rest) { tick(); _timerInt = setInterval(tick, 1000); }
}

/* ---------- odsjek na "Danas" (dodaje ga app.js kroz spojnicu) ---------- */

/* Trening zakazan za prikazani dan (S.day). Ako nema — poruka. */
function trainingDanasSection() {
  if (!S.training) return "";
  const key = dateKey(S.day || new Date());
  const sess = S.training.sessions.filter((s) => s.date === key);
  let html = `<div class="row spread mb10" style="margin-top:24px"><span class="eyebrow">${tr("Trening")}</span></div>`;
  if (!sess.length) return html + `<p class="note">${tr("Nema predviđenih treninga za danas.")}</p>`;
  sess.forEach((s) => {
    const title = s.snapshot ? s.snapshot.title : ((S.training.templates.find((t) => t.id === s.templateId) || {}).title || tr("Trening"));
    const label = s.status === "completed" ? tr("Završeno") : s.status === "active" ? tr("U tijeku") : s.status === "skipped" ? tr("Preskočeno") : tr("Planirano");
    const action = s.status === "planned" ? `<button class="btn btn-p sm" data-act="t-cal-start" data-id="${s.id}">${tr("Pokreni")}</button>`
      : s.status === "active" ? `<button class="btn btn-p sm" data-act="t-resume-open">${tr("Nastavi")}</button>`
      : `<button class="btn btn-g sm" data-act="t-open-session" data-id="${s.id}">${tr("Otvori")}</button>`;
    html += `
    <div class="card p14 mb10">
      <div class="row spread">
        <div>
          <div class="dsp" style="font-size:15px;font-weight:700">${esc(title)}</div>
          <div class="num sub2">${label}</div>
        </div>
        ${action}
      </div>
    </div>`;
  });
  return html;
}

/* ---------- registracija ---------- */

window.onTrainingReady = function () {
  loadTraining();
  S.extraViews = S.extraViews || {};
  S.extraViews.trening = viewTrening;
  S.afterRender = ensureTickers; // štoperica + pauza se osvježavaju nakon rendera
  // Ubaci gumb u donju navigaciju (prije "Više").
  const nav = document.getElementById("nav");
  if (nav && !nav.querySelector('[data-tab="trening"]')) {
    const btn = document.createElement("button");
    btn.dataset.tab = "trening";
    btn.innerHTML = `<span class="pip"></span>${tr("Trening")}`;
    const vise = nav.querySelector('[data-tab="vise"]');
    nav.insertBefore(btn, vise);
  }
  if (activeSession(S.training)) registerLeaveGuard();
};

/* app.js pokreće start (uklj. onTrainingReady hook) PRIJE nego što je ovaj
   modul učitan, pa je tada window.onTrainingReady još bio undefined. Ovaj se
   modul inlina iza app.js i izvršava nakon što je start gotov (nav je već u
   DOM-u), pa registraciju pokrećemo sami — jednom, ovdje. */
window.onTrainingReady();
