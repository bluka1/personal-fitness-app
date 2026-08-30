/* ============================================================
   Obroci — lokalna aplikacija. Podaci nikad ne napuštaju uređaj.
   ============================================================ */

const SLOTS = [
  { id: "dorucak", label: "Doručak" },
  { id: "rucak", label: "Ručak" },
  { id: "vecera", label: "Večera" },
  { id: "uzina", label: "Užina" },
];

const DEFAULT_SETTINGS = {
  targets: { kcal: 1800, p: 195, c: 164, f: 40 },
  waterGoal: 4000,
  glass: 250,
};

const STATE_LABEL = { raw: "sirovo", cooked: "kuhano", as_sold: "kako se kupuje" };
const K_DATA = "obroci_data";
const K_LOGS = "obroci_logs";

/* ---------- spremište ---------- */

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, error: "" };
  } catch (e) {
    const full = e && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: full ? "Spremište je puno" : "Preglednik ne dopušta spremanje" };
  }
}
function storageHealth() {
  try {
    localStorage.setItem("obroci_probe", "1");
    if (localStorage.getItem("obroci_probe") !== "1") return { ok: false, detail: "Zapis se ne čita natrag" };
    localStorage.removeItem("obroci_probe");
    return { ok: true, detail: "Radi — podaci su spremljeni na ovom uređaju" };
  } catch (e) {
    return { ok: false, detail: "Preglednik blokira spremanje (privatni prozor?)" };
  }
}

/* Zamoli preglednik da podatke ne briše sam od sebe. Bez ovoga ih
   sustav smije obrisati kad mu zatreba prostora. */
async function requestPersist() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) {
    return null;
  }
}

async function updateStorageInfo() {
  const el = document.getElementById("store_extra");
  if (!el) return;
  const bits = [];
  if (navigator.storage && navigator.storage.persisted) {
    try {
      const p = await navigator.storage.persisted();
      bits.push(p ? "Zaštićeno od automatskog brisanja" : "Nije zaštićeno — sustav ga smije obrisati ako ostane bez prostora");
    } catch (e) { /* prešuti */ }
  }
  const size = (localStorage.getItem(K_DATA) || "").length + (localStorage.getItem(K_LOGS) || "").length;
  bits.push("Zauzeto: " + (size / 1024).toFixed(1).replace(".", ",") + " kB");
  const days = Object.keys(S.logs).length;
  bits.push(days + (days === 1 ? " zabilježen dan" : " zabilježenih dana"));
  el.textContent = bits.join(" · ");
}

/* ---------- pomoćne ---------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const dateKey = (d) => {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DANI = ["nedjelja", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"];
const MJ = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
const prettyDate = (d) => DANI[d.getDay()] + ", " + d.getDate() + ". " + MJ[d.getMonth()];
const relDayLabel = (d) => {
  const diff = Math.round((new Date(dateKey(d)) - new Date(dateKey(new Date()))) / 86400000);
  return { "-1": "Jučer", "0": "Danas", "1": "Sutra", "2": "Prekosutra" }[diff] || "Dan";
};
const num = (v, fb) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? (fb || 0) : n; };
const findIngByName = (name) => S.ingredients.find((i) => i.name.trim().toLowerCase() === String(name).trim().toLowerCase());

function recipeMacros(recipe) {
  if (recipe.mode === "direct" && recipe.macros) {
    const s = recipe.servings || 1;
    return { kcal: recipe.macros.kcal / s, p: recipe.macros.p / s, c: recipe.macros.c / s, f: recipe.macros.f / s };
  }
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  (recipe.items || []).forEach((it) => {
    const ing = S.ingredients.find((x) => x.id === it.ing);
    if (!ing) return;
    const k = (it.g || 0) / 100;
    t.kcal += ing.kcal * k; t.p += ing.p * k; t.c += ing.c * k; t.f += ing.f * k;
  });
  const s = recipe.servings || 1;
  return { kcal: t.kcal / s, p: t.p / s, c: t.c / s, f: t.f / s };
}

/* ---------- stanje ---------- */

const S = {
  tab: "danas",
  day: new Date(),
  ingredients: [],
  recipes: [],
  settings: DEFAULT_SETTINGS,
  logs: {},
  sheet: null,
};

function load() {
  const d = readLS(K_DATA, null);
  if (d) {
    S.ingredients = d.ingredients || SEED_INGREDIENTS;
    S.recipes = (d.recipes || SEED_RECIPES).map((r) => {
      if (r.steps && r.steps.length) return r;
      const seed = SEED_RECIPES.find((x) => x.id === r.id);
      return seed ? Object.assign({}, r, { steps: seed.steps }) : Object.assign({}, r, { steps: [] });
    });
    S.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
  } else {
    S.ingredients = SEED_INGREDIENTS;
    S.recipes = SEED_RECIPES;
  }
  S.logs = readLS(K_LOGS, {}) || {};
}

function saveData() {
  const res = writeLS(K_DATA, { ingredients: S.ingredients, recipes: S.recipes, settings: S.settings });
  if (!res.ok) toast(res.error);
  else { bumpStamp(); scheduleSync(); }
  return res.ok;
}
function saveLogs() {
  const res = writeLS(K_LOGS, S.logs);
  if (!res.ok) toast(res.error);
  else { bumpStamp(); scheduleSync(); }
  return res.ok;
}

function today() {
  const k = dateKey(S.day);
  if (!S.logs[k]) S.logs[k] = { meals: [], water: 0 };
  return S.logs[k];
}
function dayTotals(log) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  (log.meals || []).forEach((m) => {
    t.kcal += m.kcal * m.servings; t.p += m.p * m.servings;
    t.c += m.c * m.servings; t.f += m.f * m.servings;
  });
  return t;
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 2200);
}

/* ---------- prikazi ---------- */

function viewDanas() {
  const log = today();
  const t = dayTotals(log);
  const g = S.settings.targets;
  const pct = Math.min(100, (t.kcal / (g.kcal || 1)) * 100);
  const left = g.kcal - t.kcal;
  const isToday = dateKey(S.day) === dateKey(new Date());
  const dayLabel = relDayLabel(S.day);
  const glasses = Math.ceil(S.settings.waterGoal / S.settings.glass);

  let html = `
  <div class="pad">
    <div class="row spread mb16">
      <button class="btn btn-g sq" data-act="day" data-n="-1">‹</button>
      <div class="center">
        <div class="eyebrow">${dayLabel}</div>
        <div class="dsp" style="font-size:16px;font-weight:700;margin-top:2px">${prettyDate(S.day)}</div>
      </div>
      <button class="btn btn-g sq" data-act="day" data-n="1">›</button>
    </div>

    <div class="card p18 mb14">
      <div class="row" style="align-items:flex-end;gap:16px">
        <div class="vessel"><div class="fill" style="height:${pct}%;background:${pct > 100 ? "var(--coral)" : "var(--amber)"}"></div></div>
        <div style="flex:1;min-width:0">
          <div class="eyebrow">Pojedeno</div>
          <div class="dsp num" style="font-size:40px;font-weight:800;line-height:1.05">${r0(t.kcal)}</div>
          <div class="num sub">od ${g.kcal} kcal · ${left >= 0 ? r0(left) + " preostalo" : r0(-left) + " preko"}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="row" style="gap:12px">
        ${[["Protein", t.p, g.p, "var(--sage)"], ["Ugljik.", t.c, g.c, "var(--amber)"], ["Masti", t.f, g.f, "var(--coral)"]]
      .map(([l, v, tg, col]) => `
          <div style="flex:1">
            <div class="eyebrow mb6">${l}</div>
            <div class="bar"><div style="width:${Math.min(100, (v / (tg || 1)) * 100)}%;background:${col}"></div></div>
            <div class="num" style="font-size:12px;margin-top:5px;font-weight:600">${r0(v)}<span class="mut" style="font-weight:400"> / ${tg} g</span></div>
          </div>`).join("")}
      </div>
    </div>

    <div class="card p16 mb14">
      <div class="row spread mb12">
        <span class="eyebrow">Voda</span>
        <span class="num sub">${(log.water / 1000).toFixed(2).replace(".", ",")} / ${(S.settings.waterGoal / 1000).toFixed(1).replace(".", ",")} l</span>
      </div>
      <div class="row wrap" style="gap:7px">
        ${Array.from({ length: glasses }).map((_, i) => {
        const full = log.water >= (i + 1) * S.settings.glass;
        return `<button class="glass${full ? " full" : ""}" data-act="water-set" data-i="${i}" aria-label="Čaša ${i + 1}"></button>`;
      }).join("")}
      </div>
      <div class="row" style="gap:8px;margin-top:12px">
        <button class="btn grow" data-act="water" data-n="-1">−${S.settings.glass} ml</button>
        <button class="btn grow" data-act="water" data-n="1">+${S.settings.glass} ml</button>
      </div>
    </div>`;

  SLOTS.forEach((s) => {
    const meals = (log.meals || []).filter((m) => m.slot === s.id);
    const kcal = meals.reduce((a, m) => a + m.kcal * m.servings, 0);
    html += `
    <div class="card p14 mb10">
      <div class="row spread" ${meals.length ? 'style="margin-bottom:10px"' : ""}>
        <div class="row" style="gap:8px">
          <span class="dsp" style="font-size:15px;font-weight:700">${s.label}</span>
          ${kcal ? `<span class="num sub">${r0(kcal)} kcal</span>` : ""}
        </div>
        <button class="btn btn-p sm" data-act="pick" data-slot="${s.id}">Dodaj</button>
      </div>
      ${meals.map((m) => `
        <div class="row spread meal">
          <div style="min-width:0;flex:1">
            <div class="ellip">${esc(m.name)}${m.servings !== 1 ? ` <span class="mut">×${m.servings}</span>` : ""}</div>
            <div class="num sub2">${r0(m.kcal * m.servings)} kcal · ${r0(m.p * m.servings)}P · ${r0(m.c * m.servings)}UH · ${r0(m.f * m.servings)}M</div>
          </div>
          <button class="x" data-act="rm-meal" data-id="${m.id}" aria-label="Ukloni">×</button>
        </div>`).join("")}
    </div>`;
  });

  /* Trening modul (ako je učitan) dodaje današnji raspored ispod obroka. */
  if (typeof trainingDanasSection === "function") html += trainingDanasSection();

  return html + "</div>";
}

function viewRecepti() {
  let html = `
  <div class="pad">
    <div class="row spread mb14">
      <h1>Recepti</h1>
      <div class="row" style="gap:8px">
        <button class="btn btn-g" data-act="import-rec">Uvezi</button>
        <button class="btn btn-p" data-act="new-recipe">Novi</button>
      </div>
    </div>`;
  SLOTS.forEach((s) => {
    const list = S.recipes.filter((r) => r.slot === s.id);
    if (!list.length) return;
    html += `<div class="mb18"><div class="eyebrow mb8">${s.label} · ${list.length}</div>`;
    list.forEach((r) => {
      const m = recipeMacros(r);
      html += `
      <button class="card row-btn p12 mb8" data-act="open-recipe" data-id="${r.id}">
        <div style="font-size:14.5px;font-weight:500">${esc(r.name)}</div>
        <div class="num sub2">${r0(m.kcal)} kcal · ${r1(m.p)}P · ${r1(m.c)}UH · ${r1(m.f)}M${r.mode === "items" ? " · iz namirnica" : ""}</div>
      </button>`;
    });
    html += "</div>";
  });
  return html + "</div>";
}

function viewNamirnice() {
  let html = `
  <div class="pad">
    <div class="row spread mb6">
      <h1>Namirnice</h1>
      <div class="row" style="gap:8px">
        <button class="btn btn-g" data-act="scan">Skeniraj</button>
        <button class="btn btn-g" data-act="import-ing">Uvezi</button>
        <button class="btn btn-p" data-act="new-ing">Nova</button>
      </div>
    </div>
    <p class="note">Sve vrijednosti su na 100 g. Oznaka stanja sprječava najčešću grešku — sirov unos vagan kao kuhan.</p>`;
  S.ingredients.forEach((i) => {
    html += `
    <button class="card row-btn p12 mb8" data-act="open-ing" data-id="${i.id}">
      <div class="row spread" style="gap:10px">
        <span style="font-size:14.5px;font-weight:500">${esc(i.name)}</span>
        <span class="eyebrow" style="flex:none">${STATE_LABEL[i.state] || ""}</span>
      </div>
      <div class="num sub2">${i.kcal} kcal · ${i.p}P · ${i.c}UH · ${i.f}M <span style="opacity:.6">/ 100 g</span></div>
    </button>`;
  });
  return html + "</div>";
}

function viewVise() {
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const l = S.logs[dateKey(d)];
    const tot = l ? dayTotals(l) : { kcal: 0, p: 0, c: 0, f: 0 };
    week.push({ d: d, kcal: tot.kcal, p: tot.p, c: tot.c, f: tot.f, water: l ? (l.water || 0) : 0, logged: !!(l && l.meals && l.meals.length) });
  }
  const maxK = Math.max(S.settings.targets.kcal, ...week.map((w) => w.kcal), 1);
  const h = storageHealth();
  const g = S.settings.targets;
  const logged = week.filter((w) => w.logged);
  const nDays = logged.length;
  const avg = (k) => (nDays ? logged.reduce((a, w) => a + w[k], 0) / nDays : 0);
  const wDays = week.filter((w) => w.water > 0);
  const avgWater = wDays.length ? wDays.reduce((a, w) => a + w.water, 0) / wDays.length : 0;

  return `
  <div class="pad">
    <h1 class="mb16">Više</h1>

    <div class="card p16 mb14">
      <div class="row spread mb14">
        <span class="eyebrow">Tjedni pregled</span>
        <span class="num sub" style="margin:0">${nDays}/7 dana</span>
      </div>
      <div class="row" style="align-items:flex-end;gap:6px;height:92px">
        ${week.map((w) => `
          <div style="flex:1;text-align:center">
            <div style="height:${Math.max(3, (w.kcal / maxK) * 74)}px;background:${w.kcal > g.kcal ? "var(--coral)" : "var(--amber)"};border-radius:4px 4px 2px 2px;opacity:${w.kcal ? 1 : 0.22}"></div>
            <div class="eyebrow" style="margin-top:6px;font-size:9px">${["N", "P", "U", "S", "Č", "P", "S"][w.d.getDay()]}</div>
            <div class="num" style="font-size:9.5px;color:var(--mut)">${w.kcal ? r0(w.kcal) : "–"}</div>
          </div>`).join("")}
      </div>
      <div class="divider"></div>
      <div class="eyebrow mb10">Dnevni prosjek</div>
      <div class="row" style="gap:10px">
        ${[["kcal", nDays ? r0(avg("kcal")) : "–", g.kcal, "kcal"],
      ["p", nDays ? r1(avg("p")) : "–", g.p, "P"],
      ["c", nDays ? r1(avg("c")) : "–", g.c, "UH"],
      ["f", nDays ? r1(avg("f")) : "–", g.f, "M"]].map(([k, val, tg, lbl]) => `
          <div style="flex:1">
            <div class="num" style="font-size:17px;font-weight:700">${val}</div>
            <div class="num" style="font-size:10.5px;color:var(--mut)">/ ${tg}</div>
            <div class="eyebrow" style="margin-top:5px;font-size:9px">${lbl}</div>
          </div>`).join("")}
      </div>
      <div class="divider"></div>
      <div class="row spread">
        <span class="eyebrow">Prosječna voda</span>
        <span class="num" style="font-size:15px;font-weight:700">${wDays.length ? (avgWater / 1000).toFixed(2).replace(".", ",") + " l" : "–"}<span class="mut" style="font-size:11px;font-weight:400"> / ${(g && S.settings.waterGoal ? (S.settings.waterGoal / 1000).toFixed(1).replace(".", ",") : "0")} l</span></span>
      </div>
    </div>

    <div class="card p16 mb14">
      <div class="eyebrow mb12">Dnevni ciljevi</div>
      <div class="row" style="gap:8px;margin-bottom:12px">
        ${[["kcal", "kcal"], ["p", "P (g)"], ["c", "UH (g)"], ["f", "M (g)"]].map(([k, l]) => `
          <div style="flex:1">
            <input inputmode="decimal" id="t_${k}" value="${g[k]}" class="mini">
            <div class="eyebrow center" style="margin-top:4px;font-size:9px">${l}</div>
          </div>`).join("")}
      </div>
      <div class="row" style="gap:8px">
        <div style="flex:1"><label class="eyebrow">Voda (ml)</label><input inputmode="decimal" id="t_water" value="${S.settings.waterGoal}" style="margin-top:6px"></div>
        <div style="flex:1"><label class="eyebrow">Čaša (ml)</label><input inputmode="decimal" id="t_glass" value="${S.settings.glass}" style="margin-top:6px"></div>
      </div>
      <button class="btn btn-p wide" style="margin-top:14px" data-act="save-targets">Spremi ciljeve</button>
    </div>

    <div class="card p16 mb14">
      <div class="eyebrow mb8">Podaci</div>
      <p class="note">Sve je spremljeno na ovom uređaju i nigdje se ne šalje. Preuzmi sigurnosnu kopiju s vremena na vrijeme.</p>
      <div class="row" style="gap:8px">
        <button class="btn grow" data-act="export">Preuzmi kopiju</button>
        <button class="btn grow" data-act="import-all">Vrati kopiju</button>
      </div>
    </div>

    <div class="card p16 mb14">
      <div class="eyebrow mb8">Sinkronizacija</div>
      <div id="sync_status" style="font-size:13px;line-height:1.5;color:${SYNC.status === "idle" ? "var(--sage)" : "var(--mut)"};margin-bottom:12px">${syncStatusText()}</div>
      <button class="btn wide" data-act="sync-open">${SYNC.status === "idle" ? "Upravljaj" : "Postavi sinkronizaciju"}</button>
    </div>

    <div class="card p16 mb14">
      <div class="eyebrow mb8">Spremište</div>
      <div style="font-size:13px;line-height:1.5;color:${h.ok ? "var(--sage)" : "var(--coral)"}">${h.detail}</div>
      <div id="store_extra" class="note" style="margin:8px 0 0"></div>
    </div>
  </div>`;
}

/* ---------- listovi (sheets) ---------- */

function sheetPicker(slot) {
  const list = S.recipes.filter((r) => r.slot === slot);
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>${SLOTS.find((s) => s.id === slot).label}</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    <div class="seg mb12">
      <button data-act="pick-tab" data-t="rec" class="on" id="tab_rec">Recepti</button>
      <button data-act="pick-tab" data-t="ing" id="tab_ing">Namirnice</button>
    </div>

    <div id="pane_ing" style="display:none">
      <input id="ing_q" placeholder="Traži namirnicu…" autocomplete="off">
      <div style="margin-top:12px">
        ${S.ingredients.map((i) => `
          <div class="card p12 mb8 ingpick" data-name="${esc(i.name.toLowerCase())}">
            <div style="font-size:14.5px;font-weight:500">${esc(i.name)}</div>
            <div class="num sub2" style="margin-bottom:10px">${i.kcal} kcal · ${i.p}P · ${i.c}UH · ${i.f}M / 100 g</div>
            <div class="row" style="gap:8px">
              <input inputmode="decimal" id="ig_${i.id}" value="100" style="width:84px;text-align:center">
              <span class="sub" style="margin:0">g</span>
              <button class="btn btn-p grow" data-act="log-ing" data-id="${i.id}" data-slot="${slot}">Zabilježi</button>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <div id="pane_rec">
    <input id="pick_q" placeholder="Traži recept…" data-act="filter" autocomplete="off">
    <div id="pick_list" style="margin-top:12px">
      ${list.length ? "" : '<p class="note">Nema recepta za ovaj obrok. Dodaj ga u kartici Recepti.</p>'}
      ${S.recipes.map((r) => {
    const m = recipeMacros(r);
    return `
        <div class="card p12 mb8 pickrow" data-name="${esc(r.name.toLowerCase())}" data-slot="${r.slot}" ${r.slot === slot ? "" : 'style="display:none"'}>
          <div style="font-size:14.5px;font-weight:500">${esc(r.name)}</div>
          <div class="num sub2" style="margin-bottom:10px">${r0(m.kcal)} kcal · ${r1(m.p)}P · ${r1(m.c)}UH · ${r1(m.f)}M${r.servings > 1 ? " · porcija" : ""}</div>
          <div class="row" style="gap:8px">
            <div class="stepper">
              <button data-act="srv" data-id="${r.id}" data-n="-1">−</button>
              <span class="num" id="srv_${r.id}">×1</span>
              <button data-act="srv" data-id="${r.id}" data-n="1">+</button>
            </div>
            <button class="btn btn-p grow" data-act="log" data-id="${r.id}" data-slot="${slot}">Zabilježi</button>
          </div>
        </div>`;
  }).join("")}
    </div>
    <label class="row" style="gap:8px;margin-top:4px;font-size:13px;color:var(--mut)">
      <input type="checkbox" id="pick_all" data-act="show-all" style="width:16px;height:16px;padding:0;accent-color:#E8A33D">
      Prikaži sve recepte, ne samo za ovaj obrok
    </label>
    </div>
  </div>`;
}

function sheetRecipeView(r) {
  const m = recipeMacros(r);
  return `
  <div class="sheet-in">
    <div class="row spread" style="align-items:flex-start;gap:12px;margin-bottom:4px">
      <h2 style="font-size:20px;line-height:1.2">${esc(r.name)}</h2>
      <button class="btn btn-g sm" data-act="close" style="flex:none">Zatvori</button>
    </div>
    <div class="eyebrow mb14">${SLOTS.find((s) => s.id === r.slot).label}${r.servings > 1 ? " · " + r.servings + " porcije" : ""}</div>
    <div class="card p12 mb16" style="background:var(--sf2)">
      <div class="eyebrow">Po porciji</div>
      <div class="num" style="font-size:14px;margin-top:5px">${r0(m.kcal)} kcal · ${r1(m.p)} g P · ${r1(m.c)} g UH · ${r1(m.f)} g M</div>
    </div>
    ${r.mode === "items" && (r.items || []).some((it) => !S.ingredients.find((x) => x.id === it.ing)) ? `<p class="note" style="color:var(--coral)">Neke namirnice nisu u bazi (crveno) pa se ne računaju. Otvori Uredi da to popraviš.</p>` : ""}
    ${r.mode === "items" && (r.items || []).length ? `
      <div class="mb18">
        <div class="eyebrow mb8">Sastojci</div>
        ${r.items.map((it) => {
    const ing = S.ingredients.find((x) => x.id === it.ing);
    return `<div class="row spread ingrow"><span style="font-size:14px${ing ? "" : ";color:var(--coral)"}">${esc(ing ? ing.name : (it.name ? it.name + " — nije u bazi" : "nepoznata namirnica"))}</span><span class="num sub">${it.g} g</span></div>`;
  }).join("")}
      </div>` : ((r.ing || []).length ? `
      <div class="mb18">
        <div class="eyebrow mb8">Sastojci</div>
        ${r.ing.map((line) => `<div class="ingline">${esc(line)}</div>`).join("")}
      </div>` : "")}
    <div class="eyebrow mb10">Postupak</div>
    ${(r.steps || []).length
      ? `<ol class="steps">${r.steps.map((s, i) => `<li><span class="stepno dsp num">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>`
      : '<p class="note">Postupak još nije upisan. Otvori Uredi i dodaj korake.</p>'}
    <button class="btn wide" data-act="edit-recipe" data-id="${r.id}">Uredi</button>
  </div>`;
}

function sheetRecipeEdit(r) {
  return `
  <div class="sheet-in">
    <div class="row spread mb14">
      <h2>Recept</h2>
      <button class="btn btn-g sm" data-act="close">Odustani</button>
    </div>
    <label class="eyebrow">Naziv</label>
    <input id="r_name" value="${esc(r.name)}" placeholder="npr. Proteinski omlet" style="margin:6px 0 12px">
    <div class="row" style="gap:10px;margin-bottom:12px">
      <div style="flex:1">
        <label class="eyebrow">Obrok</label>
        <select id="r_slot" style="margin-top:6px">
          ${SLOTS.map((s) => `<option value="${s.id}"${s.id === r.slot ? " selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
      <div style="width:100px">
        <label class="eyebrow">Porcija</label>
        <input inputmode="decimal" id="r_srv" value="${r.servings}" style="margin-top:6px">
      </div>
    </div>
    <div class="seg mb14">
      <button data-act="r-mode" data-mode="direct" class="${r.mode === "direct" ? "on" : ""}">Upišem makroe</button>
      <button data-act="r-mode" data-mode="items" class="${r.mode === "items" ? "on" : ""}">Iz namirnica</button>
    </div>
    ${r.mode === "direct" ? `
      <div class="eyebrow mb8">Vrijednosti za cijeli recept</div>
      <div class="row" style="gap:8px;margin-bottom:14px">
        ${[["kcal", "kcal"], ["p", "P"], ["c", "UH"], ["f", "M"]].map(([k, l]) => `
          <div style="flex:1">
            <input inputmode="decimal" id="rm_${k}" value="${(r.macros && r.macros[k]) || 0}" class="mini">
            <div class="eyebrow center" style="margin-top:4px">${l}</div>
          </div>`).join("")}
      </div>` : `
      <div class="eyebrow mb8">Sastojci</div>
      <div class="mb10">
        ${(r.items || []).map((it, i) => {
        const ing = S.ingredients.find((x) => x.id === it.ing);
        return `<div class="row spread ingrow">
            <span class="ellip" style="font-size:14px;flex:1${ing ? "" : ";color:var(--coral)"}">${esc(ing ? ing.name : (it.name ? it.name + " — nije u bazi" : "nepoznata namirnica"))}</span>
            <span class="num sub" style="margin:0 10px">${it.g} g</span>
            <button class="x" data-act="rm-item" data-i="${i}">×</button>
          </div>`;
      }).join("")}
      </div>
      ${(r.items || []).some((it) => !S.ingredients.find((x) => x.id === it.ing)) ? `<p class="note" style="color:var(--coral)">Crveno označene namirnice nisu u bazi pa ne ulaze u izračun (0 kcal). Dodaj ih u Namirnice i odaberi ispod, ili prebaci recept na „Izravno” i upiši makrose ručno.</p>` : ""}
      <div class="row" style="gap:8px;margin-bottom:14px">
        <select id="it_ing" style="flex:1;min-width:0">
          ${S.ingredients.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}
        </select>
        <input inputmode="decimal" id="it_g" value="100" style="width:76px;text-align:center">
        <button class="btn" data-act="add-item">+</button>
      </div>`}
    ${r.mode === "direct" ? `
      <div class="eyebrow" style="margin-bottom:6px">Sastojci</div>
      <textarea id="r_ing" rows="5" placeholder="Jedan sastojak po retku.">${esc((r.ing || []).join("\n"))}</textarea>
      <div style="height:14px"></div>` : ""}
    <div class="eyebrow" style="margin-bottom:6px">Postupak</div>
    <textarea id="r_steps" rows="7" placeholder="Jedan korak po retku.">${esc((r.steps || []).join("\n"))}</textarea>
    <div class="row" style="gap:8px;margin-top:14px">
      <button class="btn btn-p grow" data-act="save-recipe">Spremi</button>
      <button class="btn btn-g" data-act="del-recipe">Obriši</button>
    </div>
  </div>`;
}

function scanSupport() {
  if ("BarcodeDetector" in window) return "native";
  if (window.ZXing && navigator.mediaDevices) return "zxing";
  return "none";
}

/* ============================================================
   Sinkronizacija (Supabase). Lokalno je i dalje glavno —
   ovo je sloj iznad koji izjednačava uređaje.
   ============================================================ */

const K_SYNC = "obroci_sync";
const K_STAMP = "obroci_updated";

const SYNC = { cfg: null, status: "off", msg: "", busy: false, timer: null };

function loadSync() {
  SYNC.cfg = readLS(K_SYNC, null);
  SYNC.status = SYNC.cfg && SYNC.cfg.access_token ? "idle" : (SYNC.cfg && SYNC.cfg.url ? "auth" : "off");
}
function saveSync() { writeLS(K_SYNC, SYNC.cfg); }

function localStamp() { return parseInt(localStorage.getItem(K_STAMP) || "0", 10) || 0; }
function bumpStamp() { localStorage.setItem(K_STAMP, String(Date.now())); }

function syncStatusText() {
  if (SYNC.msg) return SYNC.msg;
  if (SYNC.status === "off") return "Isključena — podaci su samo na ovom uređaju";
  if (SYNC.status === "auth") return "Postavljena, ali nisi prijavljen";
  const t = localStamp();
  return t ? "Zadnja promjena " + new Date(t).toLocaleString("hr-HR") : "Spremna";
}

function setSyncMsg(m, keep) {
  SYNC.msg = m;
  const el = document.getElementById("sync_status");
  if (el) el.textContent = syncStatusText();
  if (!keep) setTimeout(() => { SYNC.msg = ""; const e2 = document.getElementById("sync_status"); if (e2) e2.textContent = syncStatusText(); }, 4000);
}

async function sbAuth(path, body) {
  const c = SYNC.cfg;
  const res = await fetch(c.url.replace(/\/+$/, "") + "/auth/v1/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: c.anon },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || json.message || ("HTTP " + res.status));
  return json;
}

async function ensureToken() {
  const c = SYNC.cfg;
  if (!c || !c.access_token) throw new Error("Nisi prijavljen");
  if (c.expires_at && Date.now() < c.expires_at - 60000) return c.access_token;
  const j = await sbAuth("token?grant_type=refresh_token", { refresh_token: c.refresh_token });
  c.access_token = j.access_token;
  c.refresh_token = j.refresh_token || c.refresh_token;
  c.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
  saveSync();
  return c.access_token;
}

async function sbRest(method, query, body) {
  const c = SYNC.cfg;
  const token = await ensureToken();
  const headers = {
    apikey: c.anon,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers.Prefer = "resolution=merge-duplicates,return=representation";
  const res = await fetch(c.url.replace(/\/+$/, "") + "/rest/v1/" + query, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && (json.message || json.hint)) || ("HTTP " + res.status));
  return json;
}

function currentPayload() {
  return {
    ingredients: S.ingredients, recipes: S.recipes,
    settings: S.settings, logs: S.logs, training: S.training || null, updatedAt: localStamp(),
  };
}

function adoptPayload(p) {
  if (p.ingredients) S.ingredients = p.ingredients;
  if (p.recipes) S.recipes = p.recipes;
  if (p.settings) S.settings = Object.assign({}, DEFAULT_SETTINGS, p.settings);
  if (p.logs) S.logs = p.logs;
  if (p.training) { S.training = p.training; writeLS("obroci_training", S.training); }
  writeLS(K_DATA, { ingredients: S.ingredients, recipes: S.recipes, settings: S.settings });
  writeLS(K_LOGS, S.logs);
  localStorage.setItem(K_STAMP, String(p.updatedAt || Date.now()));
}

async function pushRemote() {
  const c = SYNC.cfg;
  await sbRest("POST", "obroci_state", [{ user_id: c.user_id, data: currentPayload(), updated_at: new Date().toISOString() }]);
}

async function pullRemote() {
  const rows = await sbRest("GET", "obroci_state?select=data");
  return rows && rows.length ? rows[0].data : null;
}

/* Novije pobjeđuje. Za jednog korisnika s par uređaja to je dovoljno. */
async function syncNow(force) {
  if (!SYNC.cfg || !SYNC.cfg.access_token || SYNC.busy) return;
  SYNC.busy = true;
  setSyncMsg("Sinkroniziram…", true);
  try {
    const remote = await pullRemote();
    const localT = localStamp();
    const remoteT = (remote && remote.updatedAt) || 0;
    if (remote && remoteT > localT && force !== "push") {
      adoptPayload(remote);
      setSyncMsg("Preuzeto s oblaka");
      render();
    } else if (!remote || localT > remoteT || force === "push") {
      await pushRemote();
      setSyncMsg("Poslano u oblak");
    } else {
      setSyncMsg("Već je izjednačeno");
    }
  } catch (e) {
    setSyncMsg("Sync: " + String(e.message || e).slice(0, 70), true);
  }
  SYNC.busy = false;
}

function scheduleSync() {
  if (!SYNC.cfg || !SYNC.cfg.access_token) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(() => syncNow(), 3000);
}

/* Ako se korisnik vratio klikom na link iz e-maila, tokeni dolaze
   u hashu adrese. Pokupi ih pa očisti adresu. */
async function consumeAuthHash() {
  if (!location.hash || location.hash.indexOf("access_token") < 0) return false;
  if (!SYNC.cfg || !SYNC.cfg.url || !SYNC.cfg.anon) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  const at = p.get("access_token");
  if (!at) return false;
  SYNC.cfg.access_token = at;
  SYNC.cfg.refresh_token = p.get("refresh_token") || "";
  SYNC.cfg.expires_at = Date.now() + (parseInt(p.get("expires_in") || "3600", 10) * 1000);
  try {
    const res = await fetch(SYNC.cfg.url.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { apikey: SYNC.cfg.anon, Authorization: "Bearer " + at },
    });
    const u = await res.json();
    if (u && u.id) { SYNC.cfg.user_id = u.id; SYNC.cfg.email = u.email || SYNC.cfg.email; }
  } catch (e) { /* prešuti */ }
  SYNC.cfg.pending = false;
  saveSync();
  SYNC.status = "idle";
  history.replaceState(null, "", location.pathname + location.search);
  return true;
}

function sheetSync() {
  const c = SYNC.cfg || {};
  const authed = !!c.access_token;
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>Sinkronizacija</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    ${authed ? `
      <p class="note">Prijavljen kao <strong>${esc(c.email || "")}</strong>. Podaci se izjednačavaju sa svim uređajima na kojima si prijavljen istim e-mailom.</p>
      <div class="row" style="gap:8px;margin-bottom:10px">
        <button class="btn grow" data-act="sync-pull">Uzmi s oblaka</button>
        <button class="btn grow" data-act="sync-push">Pošalji moje</button>
      </div>
      <button class="btn btn-p wide" data-act="sync-now">Izjednači sada</button>
      <div id="sync_msg" class="note" style="margin-top:12px"></div>
      <button class="btn btn-g wide" style="margin-top:14px" data-act="sync-logout">Odjavi se s ovog uređaja</button>
    ` : `
      <p class="note">Podaci će se spremati i u tvoju Supabase bazu, pa ih vidiš i na računalu. Lokalno spremanje ostaje — aplikacija radi i bez interneta.</p>
      <label class="eyebrow">Supabase URL</label>
      <input id="sy_url" value="${esc(c.url || "")}" placeholder="https://xxxx.supabase.co" style="margin:6px 0 12px" autocomplete="off">
      <label class="eyebrow">Publishable ključ</label>
      <input id="sy_key" value="${esc(c.anon || "")}" placeholder="sb_publishable_… ili eyJhbGci…" style="margin:6px 0 12px" autocomplete="off">
      <p class="note" style="margin:-4px 0 12px">Settings → API Keys → Publishable key. Na starijim projektima je to legacy „anon public”. Nikad ne upisuj secret ni service_role ključ.</p>
      <label class="eyebrow">E-mail</label>
      <input id="sy_mail" type="email" value="${esc(c.email || "")}" placeholder="ti@primjer.hr" style="margin:6px 0 12px" autocomplete="email">
      <button class="btn btn-p wide" data-act="sync-code">Pošalji mi kod</button>
      <p class="note" style="margin-top:10px">Ako u e-mailu dobiješ samo link umjesto koda: u Supabaseu pod Authentication → Emails dodaj <strong>{{ .Token }}</strong> u predloške „Magic Link” i „Confirm signup”. Klik na link također radi ako ga otvoriš na ovom uređaju.</p>
      <div id="sync_msg" class="note" style="margin-top:12px"></div>
      <div id="sync_step2" style="display:${c.pending ? "block" : "none"};margin-top:12px">
        <label class="eyebrow">Kod iz e-maila</label>
        <input id="sy_code" inputmode="numeric" placeholder="6 znamenki" style="margin:6px 0 12px" autocomplete="one-time-code">
        <button class="btn btn-p wide" data-act="sync-verify">Potvrdi</button>
      </div>
      <p class="note" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ln)">
        Prijava ide bez lozinke — dobiješ šesteroznamenkasti kod na e-mail. Pristupni token ostaje u pregledniku ovog uređaja.
      </p>
    `}
  </div>`;
}

function syncMsg(t) {
  const el = document.getElementById("sync_msg");
  if (el) el.textContent = t;
}

/* ============================================================ */

function sheetScan() {
  const mode = scanSupport();
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>Skeniraj proizvod</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    ${mode !== "none" ? `
      <div class="cam-wrap"><video id="cam" playsinline muted autoplay></video><div class="cam-line"></div></div>
      <p class="note" style="margin-top:10px">Drži barkod vodoravno preko crvene crte. Prepoznavanje je automatsko.</p>
    ` : `
      <p class="note">Kamera nije dostupna u ovom pregledniku. Upiši brojku ispod ručno.</p>
    `}
    <label class="eyebrow">Barkod</label>
    <input inputmode="numeric" id="bc" placeholder="npr. 3017624010701" style="margin:6px 0 12px" autocomplete="off">
    <button class="btn btn-p wide" data-act="off-lookup">Dohvati podatke</button>
    <div id="bc_msg" class="note" style="margin:12px 0 0"></div>
    <p class="note" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ln)">
      Podaci dolaze iz Open Food Factsa, otvorene baze koju pune korisnici. Provjeri brojke uz deklaraciju
      prije nego se osloniš na njih. Prema van odlazi samo barkod — ništa iz tvojih dnevnika.
    </p>
  </div>`;
}

let camStream = null;
let camTimer = null;
let zxReader = null;

function stopCam() {
  if (camTimer) { clearInterval(camTimer); camTimer = null; }
  if (zxReader) { try { zxReader.reset(); } catch (e) { /* prešuti */ } zxReader = null; }
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
}

function camError(text) {
  const m = document.getElementById("bc_msg");
  if (m) m.textContent = text;
}

async function startCam() {
  const video = document.getElementById("cam");
  if (!video) return;
  const mode = scanSupport();

  if (mode === "zxing") {
    const hints = new Map();
    const F = window.ZXing.BarcodeFormat;
    hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS,
      [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF]);
    hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
    zxReader = new window.ZXing.BrowserMultiFormatReader(hints, 300);
    try {
      await zxReader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result) return;
          const code = result.getText();
          stopCam();
          const input = document.getElementById("bc");
          if (input) input.value = code;
          offLookup(code);
        }
      );
    } catch (e) {
      camError("Kamera nije dostupna. Upiši barkod ručno.");
    }
    return;
  }

  if (mode !== "native" || !navigator.mediaDevices) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = camStream;
    await video.play();
  } catch (e) {
    camError("Kamera nije dostupna. Upiši barkod ručno.");
    return;
  }
  const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
  camTimer = setInterval(async () => {
    try {
      const found = await det.detect(video);
      if (found && found.length) {
        const code = found[0].rawValue;
        stopCam();
        const input = document.getElementById("bc");
        if (input) input.value = code;
        offLookup(code);
      }
    } catch (e) { /* prešuti pojedinačni promašaj */ }
  }, 400);
}

async function offLookup(code) {
  const msg = document.getElementById("bc_msg");
  code = String(code || "").replace(/\D/g, "");
  if (code.length < 6) { if (msg) msg.textContent = "Upiši barkod (najmanje 6 znamenki)."; return; }
  if (msg) msg.textContent = "Tražim…";

  const url = "https://world.openfoodfacts.org/api/v2/product/" + code
    + ".json?fields=product_name,brands,nutriments,serving_size";
  let body;
  try {
    const res = await fetch(url);
    body = await res.json();
  } catch (e) {
    if (msg) msg.textContent = "Nema veze s internetom. Skeniranje traži mrežu, ostatak aplikacije ne.";
    return;
  }
  if (!body || body.status !== 1 || !body.product) {
    if (msg) msg.textContent = "Proizvod nije u bazi. Upiši ga ručno preko gumba Nova.";
    return;
  }

  const p = body.product;
  const n = p.nutriments || {};
  const numOr = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  let kcal = numOr(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = numOr(n["energy_100g"]) || numOr(n["energy-kj_100g"]);
    if (kj !== null) kcal = kj / 4.184;
  }
  const prot = numOr(n["proteins_100g"]);
  const carb = numOr(n["carbohydrates_100g"]);
  const fat = numOr(n["fat_100g"]);

  if (kcal === null && prot === null && carb === null && fat === null) {
    if (msg) msg.textContent = "Proizvod postoji, ali nema upisane nutritivne vrijednosti.";
    return;
  }

  const name = [p.brands ? String(p.brands).split(",")[0].trim() : "", p.product_name || ""]
    .filter(Boolean).join(" ").trim() || ("Proizvod " + code);

  stopCam();
  S.sheet = {
    type: "ingredient",
    ing: {
      id: uid("i"), name: name, state: "as_sold", barcode: code,
      kcal: r1(kcal || 0), p: r1(prot || 0), c: r1(carb || 0), f: r1(fat || 0),
    },
    partial: kcal === null || prot === null || carb === null || fat === null,
  };
  renderSheet();
}

function sheetIngredient(x) {
  return `
  <div class="sheet-in">
    <div class="row spread mb14">
      <h2>Namirnica</h2>
      <button class="btn btn-g sm" data-act="close">Odustani</button>
    </div>
    ${S.sheet && S.sheet.partial ? '<p class="note" style="color:var(--coral)">Open Food Facts nema sve vrijednosti za ovaj proizvod. Nadopuni prazna polja s deklaracije.</p>' : ""}
    ${x.barcode ? `<p class="note">Barkod ${esc(x.barcode)} · vrijednosti iz Open Food Factsa, provjeri ih uz ambalažu.</p>` : ""}
    <label class="eyebrow">Naziv</label>
    <input id="i_name" value="${esc(x.name)}" style="margin:6px 0 12px">
    <label class="eyebrow">Kako vagaš</label>
    <select id="i_state" style="margin:6px 0 14px">
      <option value="raw"${x.state === "raw" ? " selected" : ""}>Sirovo</option>
      <option value="cooked"${x.state === "cooked" ? " selected" : ""}>Kuhano</option>
      <option value="as_sold"${x.state === "as_sold" ? " selected" : ""}>Kako se kupuje</option>
    </select>
    <div class="eyebrow mb8">Na 100 g</div>
    <div class="row" style="gap:8px;margin-bottom:16px">
      ${[["kcal", "kcal"], ["p", "P"], ["c", "UH"], ["f", "M"]].map(([k, l]) => `
        <div style="flex:1">
          <input inputmode="decimal" id="im_${k}" value="${x[k]}" class="mini">
          <div class="eyebrow center" style="margin-top:4px">${l}</div>
        </div>`).join("")}
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn-p grow" data-act="save-ing">Spremi</button>
      <button class="btn btn-g" data-act="del-ing">Obriši</button>
    </div>
  </div>`;
}

function sheetImport(kind) {
  const help = kind === "ing"
    ? 'Zalijepi JSON niz namirnica. Primjer: [{"name":"Skyr","state":"as_sold","kcal":63,"p":11,"c":4,"f":0.2}]'
    : kind === "rec"
      ? "Zalijepi JSON niz recepata. Dodaju se postojećima — ništa se ne briše."
      : "Zalijepi sadržaj preuzete kopije. Prepisuje namirnice, recepte, ciljeve i dnevnike.";
  const title = kind === "ing" ? "Uvoz namirnica" : kind === "rec" ? "Uvoz recepata" : "Vrati kopiju";
  return `
  <div class="sheet-in">
    <div class="row spread mb12">
      <h2>${title}</h2>
      <button class="btn btn-g sm" data-act="close">Zatvori</button>
    </div>
    <p class="note">${help}</p>
    <textarea id="imp_txt" rows="8" placeholder="[ … ]" style="font-size:13px"></textarea>
    <div id="imp_err" class="err"></div>
    <button class="btn btn-p wide" style="margin-top:12px" data-act="do-import" data-kind="${kind}">Uvezi</button>
  </div>`;
}

/* ---------- render ---------- */

function render() {
  const views = Object.assign({ danas: viewDanas, recepti: viewRecepti, namirnice: viewNamirnice, vise: viewVise }, S.extraViews || {});
  $("#main").innerHTML = (views[S.tab] || viewDanas)();
  document.querySelectorAll("#nav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === S.tab);
  });
  renderSheet();
  if (S.tab === "vise") updateStorageInfo();
  window.scrollTo(0, 0);
  /* Trening modul (ako je učitan) osvježava štopericu nakon rendera. */
  if (typeof S.afterRender === "function") S.afterRender();
}

function renderSheet() {
  const host = $("#sheet");
  if (!S.sheet) { stopCam(); host.innerHTML = ""; host.style.display = "none"; return; }
  const s = S.sheet;
  let inner = "";
  if (s.type && s.type.indexOf("t-") === 0 && typeof trainingSheet === "function") inner = trainingSheet(s);
  else if (s.type === "picker") inner = sheetPicker(s.slot);
  else if (s.type === "recipe-view") inner = sheetRecipeView(s.recipe);
  else if (s.type === "recipe-edit") inner = sheetRecipeEdit(s.recipe);
  else if (s.type === "ingredient") inner = sheetIngredient(s.ing);
  else if (s.type === "import") inner = sheetImport(s.kind);
  else if (s.type === "scan") inner = sheetScan();
  else if (s.type === "sync") inner = sheetSync();
  host.innerHTML = inner;
  host.style.display = "flex";
  if (s.type !== "scan") stopCam();
  if (s.type === "scan" && scanSupport() !== "none") startCam();
}

/* ---------- radnje ---------- */

const srvMap = {};

document.addEventListener("click", (e) => {
  const nav = e.target.closest("#nav button");
  if (nav) {
    if (S.guardLeave && S.guardLeave("tab:" + nav.dataset.tab)) return;
    S.tab = nav.dataset.tab; S.sheet = null; render(); return;
  }

  const host = $("#sheet");
  if (S.sheet && e.target === host) { S.sheet = null; renderSheet(); return; }

  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act;

  if (a === "close") { S.sheet = null; renderSheet(); return; }

  if (a === "day") { S.day = addDays(S.day, parseInt(el.dataset.n, 10)); render(); return; }

  if (a === "water") {
    const log = today();
    log.water = Math.max(0, log.water + parseInt(el.dataset.n, 10) * S.settings.glass);
    saveLogs(); render(); return;
  }
  if (a === "water-set") {
    const log = today();
    const i = parseInt(el.dataset.i, 10);
    const full = log.water >= (i + 1) * S.settings.glass;
    log.water = full ? i * S.settings.glass : (i + 1) * S.settings.glass;
    saveLogs(); render(); return;
  }
  if (a === "rm-meal") {
    const log = today();
    log.meals = log.meals.filter((m) => m.id !== el.dataset.id);
    saveLogs(); render(); return;
  }

  if (a === "pick") { S.sheet = { type: "picker", slot: el.dataset.slot }; renderSheet(); return; }
  if (a === "srv") {
    const id = el.dataset.id;
    srvMap[id] = Math.max(0.5, (srvMap[id] || 1) + parseInt(el.dataset.n, 10) * 0.5);
    $("#srv_" + id).textContent = "×" + srvMap[id];
    return;
  }
  if (a === "log") {
    const r = S.recipes.find((x) => x.id === el.dataset.id);
    const m = recipeMacros(r);
    const srv = srvMap[r.id] || 1;
    today().meals.push({ id: uid("m"), slot: el.dataset.slot, name: r.name, servings: srv, kcal: m.kcal, p: m.p, c: m.c, f: m.f });
    delete srvMap[r.id];
    saveLogs(); S.sheet = null; render(); return;
  }
  if (a === "pick-tab") {
    const t = el.dataset.t;
    document.getElementById("pane_rec").style.display = t === "rec" ? "" : "none";
    document.getElementById("pane_ing").style.display = t === "ing" ? "" : "none";
    document.getElementById("tab_rec").classList.toggle("on", t === "rec");
    document.getElementById("tab_ing").classList.toggle("on", t === "ing");
    return;
  }
  if (a === "log-ing") {
    const ing = S.ingredients.find((i) => i.id === el.dataset.id);
    const g = num($("#ig_" + ing.id).value, 0);
    if (!g) { toast("Upiši gramažu"); return; }
    const k = g / 100;
    today().meals.push({
      id: uid("m"), slot: el.dataset.slot, name: ing.name + " (" + g + " g)", servings: 1,
      kcal: ing.kcal * k, p: ing.p * k, c: ing.c * k, f: ing.f * k,
    });
    saveLogs(); S.sheet = null; render(); return;
  }
  if (a === "show-all") {
    const on = $("#pick_all").checked;
    const slot = S.sheet.slot;
    document.querySelectorAll(".pickrow").forEach((row) => {
      row.style.display = on || row.dataset.slot === slot ? "" : "none";
    });
    return;
  }

  if (a === "open-recipe") {
    S.sheet = { type: "recipe-view", recipe: S.recipes.find((r) => r.id === el.dataset.id) };
    renderSheet(); return;
  }
  if (a === "edit-recipe") {
    S.sheet = { type: "recipe-edit", recipe: JSON.parse(JSON.stringify(S.recipes.find((r) => r.id === el.dataset.id))) };
    renderSheet(); return;
  }
  if (a === "new-recipe") {
    S.sheet = { type: "recipe-edit", recipe: { id: uid("r"), name: "", slot: "dorucak", servings: 1, mode: "direct", items: [], macros: { kcal: 0, p: 0, c: 0, f: 0 }, steps: [] } };
    renderSheet(); return;
  }
  if (a === "r-mode") {
    collectRecipe();
    S.sheet.recipe.mode = el.dataset.mode;
    renderSheet(); return;
  }
  if (a === "add-item") {
    collectRecipe();
    const r = S.sheet.recipe;
    r.items = r.items || [];
    r.items.push({ ing: $("#it_ing").value, g: num($("#it_g").value, 0) });
    renderSheet(); return;
  }
  if (a === "rm-item") {
    collectRecipe();
    S.sheet.recipe.items.splice(parseInt(el.dataset.i, 10), 1);
    renderSheet(); return;
  }
  if (a === "save-recipe") {
    collectRecipe();
    const r = S.sheet.recipe;
    if (!r.name.trim()) { toast("Recept treba naziv"); return; }
    r.servings = Math.max(1, Math.round(r.servings) || 1);
    r.steps = (r.steps || []).map((s) => s.trim()).filter(Boolean);
    r.ing = (r.ing || []).map((s) => s.trim()).filter(Boolean);
    const i = S.recipes.findIndex((x) => x.id === r.id);
    if (i >= 0) S.recipes[i] = r; else S.recipes.push(r);
    if (saveData()) toast("Recept spremljen");
    S.sheet = null; render(); return;
  }
  if (a === "del-recipe") {
    S.recipes = S.recipes.filter((x) => x.id !== S.sheet.recipe.id);
    if (saveData()) toast("Obrisano");
    S.sheet = null; render(); return;
  }

  if (a === "sync-open") { S.sheet = { type: "sync" }; renderSheet(); return; }
  if (a === "sync-code") {
    const url = $("#sy_url").value.trim();
    const anon = $("#sy_key").value.trim();
    const email = $("#sy_mail").value.trim();
    if (!url || !anon || !email) { syncMsg("Popuni sva tri polja."); return; }
    if (/^sb_secret_/.test(anon) || /service_role/.test(anon)) {
      syncMsg("To je serverski ključ i ne smije u preglednik. Uzmi Publishable (ili anon) ključ.");
      return;
    }
    SYNC.cfg = Object.assign({}, SYNC.cfg, { url: url, anon: anon, email: email, pending: true });
    saveSync();
    syncMsg("Šaljem kod…");
    sbAuth("otp", { email: email, create_user: true })
      .then(() => {
        syncMsg("Kod je poslan na " + email + ". Provjeri i spam.");
        const st = document.getElementById("sync_step2");
        if (st) st.style.display = "block";
      })
      .catch((err) => syncMsg("Ne mogu poslati kod: " + String(err.message || err).slice(0, 70)));
    return;
  }
  if (a === "sync-verify") {
    const code = $("#sy_code").value.trim();
    if (!code) { syncMsg("Upiši kod iz e-maila."); return; }
    syncMsg("Provjeravam…");
    sbAuth("verify", { email: SYNC.cfg.email, token: code, type: "email" })
      .then((j) => {
        SYNC.cfg.access_token = j.access_token;
        SYNC.cfg.refresh_token = j.refresh_token;
        SYNC.cfg.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
        SYNC.cfg.user_id = j.user && j.user.id;
        SYNC.cfg.pending = false;
        saveSync();
        SYNC.status = "idle";
        S.sheet = null;
        render();
        toast("Prijavljen");
        syncNow();
      })
      .catch((err) => syncMsg("Kod nije prihvaćen: " + String(err.message || err).slice(0, 70)));
    return;
  }
  if (a === "sync-now") { syncMsg("Sinkroniziram…"); syncNow().then(() => syncMsg(syncStatusText())); return; }
  if (a === "sync-push") { syncMsg("Šaljem…"); syncNow("push").then(() => syncMsg(syncStatusText())); return; }
  if (a === "sync-pull") {
    syncMsg("Preuzimam…");
    pullRemote().then((remote) => {
      if (!remote) { syncMsg("U oblaku još nema podataka."); return; }
      adoptPayload(remote);
      S.sheet = null; render(); toast("Preuzeto s oblaka");
    }).catch((err) => syncMsg("Greška: " + String(err.message || err).slice(0, 70)));
    return;
  }
  if (a === "sync-logout") {
    SYNC.cfg = { url: SYNC.cfg.url, anon: SYNC.cfg.anon, email: SYNC.cfg.email };
    saveSync(); SYNC.status = "auth"; S.sheet = null; render(); toast("Odjavljen");
    return;
  }

  if (a === "scan") { S.sheet = { type: "scan" }; renderSheet(); return; }
  if (a === "off-lookup") { offLookup($("#bc").value); return; }

  if (a === "new-ing") { S.sheet = { type: "ingredient", ing: { id: uid("i"), name: "", state: "as_sold", kcal: 0, p: 0, c: 0, f: 0 } }; renderSheet(); return; }
  if (a === "open-ing") { S.sheet = { type: "ingredient", ing: Object.assign({}, S.ingredients.find((i) => i.id === el.dataset.id)) }; renderSheet(); return; }
  if (a === "save-ing") {
    const x = S.sheet.ing;
    x.name = $("#i_name").value;
    x.state = $("#i_state").value;
    ["kcal", "p", "c", "f"].forEach((k) => { x[k] = num($("#im_" + k).value, 0); });
    if (!x.name.trim()) { toast("Namirnica treba naziv"); return; }
    const i = S.ingredients.findIndex((y) => y.id === x.id);
    if (i >= 0) {
      S.ingredients[i] = x;
    } else {
      if (findIngByName(x.name)) { toast("„" + x.name.trim() + "” već postoji"); return; }
      S.ingredients.push(x);
    }
    if (saveData()) toast("Spremljeno");
    S.sheet = null; render(); return;
  }
  if (a === "del-ing") {
    S.ingredients = S.ingredients.filter((y) => y.id !== S.sheet.ing.id);
    if (saveData()) toast("Obrisano");
    S.sheet = null; render(); return;
  }

  if (a === "import-ing") { S.sheet = { type: "import", kind: "ing" }; renderSheet(); return; }
  if (a === "import-rec") { S.sheet = { type: "import", kind: "rec" }; renderSheet(); return; }
  if (a === "import-all") { S.sheet = { type: "import", kind: "all" }; renderSheet(); return; }
  if (a === "do-import") {
    let obj;
    try { obj = JSON.parse($("#imp_txt").value); }
    catch (err) { $("#imp_err").textContent = "Ne mogu pročitati JSON. Provjeri zareze i navodnike."; return; }
    if (el.dataset.kind === "ing") {
      if (!Array.isArray(obj)) { $("#imp_err").textContent = "Očekujem niz [ ... ]"; return; }
      let addedI = 0, skippedI = 0;
      obj.forEach((x) => {
        const name = String(x.name || "bez naziva");
        if (findIngByName(name)) { skippedI++; return; }
        S.ingredients.push({
          id: uid("i"), name: name, state: x.state || "as_sold",
          kcal: num(x.kcal, 0), p: num(x.p, 0), c: num(x.c, 0), f: num(x.f, 0),
        });
        addedI++;
      });
      saveData(); toast("Dodano: " + addedI + (skippedI ? " · preskočeno (postoji): " + skippedI : ""));
    } else if (el.dataset.kind === "rec") {
      if (!Array.isArray(obj)) { $("#imp_err").textContent = "Očekujem niz [ ... ]"; return; }
      const slotIds = SLOTS.map((s) => s.id);
      let added = 0;
      obj.forEach((x) => {
        if (!x || !x.name) return;
        const mode = x.mode === "items" ? "items" : "direct";
        const rec = {
          id: uid("r"),
          name: String(x.name),
          slot: slotIds.indexOf(x.slot) >= 0 ? x.slot : "uzina",
          servings: Math.max(1, Math.round(num(x.servings, 1)) || 1),
          mode: mode,
          items: [],
          macros: null,
          steps: Array.isArray(x.steps) ? x.steps.map(String) : [],
          ing: Array.isArray(x.ing) ? x.ing.map(String) : [],
        };
        if (mode === "items") {
          rec.items = (x.items || []).map((it) => {
            const byId = S.ingredients.find((i) => i.id === it.ing);
            const byName = !byId && it.name
              ? S.ingredients.find((i) => i.name.toLowerCase() === String(it.name).toLowerCase())
              : null;
            return { ing: byId ? byId.id : (byName ? byName.id : it.ing), g: num(it.g, 0) };
          });
          const missing = rec.items.filter((it) => !S.ingredients.some((i) => i.id === it.ing));
          if (missing.length) {
            $("#imp_err").textContent = "Recept „" + rec.name + "” traži namirnicu koje nema. Uvezi prvo namirnice.";
            return;
          }
        } else {
          const m = x.macros || {};
          rec.macros = { kcal: num(m.kcal, 0), p: num(m.p, 0), c: num(m.c, 0), f: num(m.f, 0) };
        }
        S.recipes.push(rec);
        added++;
      });
      if (!added) { if (!$("#imp_err").textContent) $("#imp_err").textContent = "Nijedan recept nije prepoznat."; return; }
      saveData(); toast("Dodano recepata: " + added);
    } else {
      if (obj.ingredients) S.ingredients = obj.ingredients;
      if (obj.recipes) S.recipes = obj.recipes;
      if (obj.settings) S.settings = Object.assign({}, DEFAULT_SETTINGS, obj.settings);
      if (obj.logs) S.logs = obj.logs;
      saveData(); saveLogs(); toast("Vraćeno");
    }
    S.sheet = null; render(); return;
  }

  if (a === "save-targets") {
    const t = {};
    ["kcal", "p", "c", "f"].forEach((k) => { t[k] = Math.round(num($("#t_" + k).value, S.settings.targets[k])); });
    const glass = Math.max(50, Math.round(num($("#t_glass").value, 250)));
    S.settings = { targets: t, glass: glass, waterGoal: Math.max(glass, Math.round(num($("#t_water").value, 0))) };
    if (saveData()) toast("Ciljevi spremljeni");
    render(); return;
  }

  if (a === "export") {
    const blob = new Blob([JSON.stringify({ ingredients: S.ingredients, recipes: S.recipes, settings: S.settings, logs: S.logs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "obroci-" + dateKey(new Date()) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "ing_q") {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".ingpick").forEach((row) => {
      row.style.display = row.dataset.name.indexOf(q) >= 0 ? "" : "none";
    });
    return;
  }
  if (e.target.id === "pick_q") {
    const q = e.target.value.toLowerCase();
    const showAll = $("#pick_all") && $("#pick_all").checked;
    const slot = S.sheet.slot;
    document.querySelectorAll(".pickrow").forEach((row) => {
      const okSlot = showAll || row.dataset.slot === slot;
      row.style.display = okSlot && row.dataset.name.indexOf(q) >= 0 ? "" : "none";
    });
  }
});

/* Pokupi vrijednosti iz forme prije nego je ponovno iscrtamo. */
function collectRecipe() {
  const r = S.sheet && S.sheet.recipe;
  if (!r) return;
  if ($("#r_name")) r.name = $("#r_name").value;
  if ($("#r_slot")) r.slot = $("#r_slot").value;
  if ($("#r_srv")) r.servings = num($("#r_srv").value, 1);
  if ($("#r_steps")) r.steps = $("#r_steps").value.split("\n");
  if ($("#r_ing")) r.ing = $("#r_ing").value.split("\n");
  if (r.mode === "direct" && $("#rm_kcal")) {
    r.macros = r.macros || {};
    ["kcal", "p", "c", "f"].forEach((k) => { r.macros[k] = num($("#rm_" + k).value, 0); });
  }
}

/* Skupi list na vidljivi dio ekrana kad se digne tipkovnica, da rezultati
   pretrage ne ostanu skriveni iza nje. */
function fitSheet() {
  const vv = window.visualViewport, el = document.getElementById("sheet");
  if (!vv || !el) return;
  el.style.top = vv.offsetTop + "px";
  el.style.height = vv.height + "px";
  el.style.bottom = "auto";
}
if (window.visualViewport) {
  visualViewport.addEventListener("resize", fitSheet);
  visualViewport.addEventListener("scroll", fitSheet);
  fitSheet();
}

/* ---------- start ---------- */

load();
loadSync();
render();
requestPersist();
consumeAuthHash().then((came) => {
  if (came) { render(); toast("Prijavljen"); }
  if (SYNC.cfg && SYNC.cfg.access_token) syncNow();
});
if (typeof window !== "undefined" && typeof window.onTrainingReady === "function") window.onTrainingReady();
window.addEventListener("online", () => syncNow());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { });
}
