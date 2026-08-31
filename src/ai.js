/* ============================================================
   AI sloj — BYOK, multi-provider. Čiste funkcije (testabilne).
   Mrežni omotač (aiCall) živi u app.js jer koristi fetch + S.settings.
   ============================================================ */

const AI_PRESETS = {
  anthropic: { kind: "anthropic", baseURL: "https://api.anthropic.com", model: "claude-sonnet-4-6", vision: true },
  openai: { kind: "openai", baseURL: "https://api.openai.com/v1", model: "gpt-4o", vision: true },
  deepseek: { kind: "openai", baseURL: "https://api.deepseek.com", model: "deepseek-chat", vision: false },
  glm: { kind: "openai", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v", vision: true },
  kimi: { kind: "openai", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k-vision-preview", vision: true },
  openrouter: { kind: "openai", baseURL: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free", vision: true },
};
const AI_PROVIDER_LABELS = { anthropic: "Anthropic (Claude)", openai: "OpenAI (GPT)", deepseek: "DeepSeek", glm: "GLM (Zhipu)", kimi: "Kimi (Moonshot)", openrouter: "OpenRouter" };

/* Spoji preset + korisnički override (model/baseURL). Prazan override = preset default. */
function aiPreset(cfg) {
  cfg = cfg || {};
  const p = AI_PRESETS[cfg.provider] || AI_PRESETS.anthropic;
  return {
    kind: p.kind,
    baseURL: (cfg.baseURL || p.baseURL).replace(/\/+$/, ""),
    model: cfg.model || p.model,
    vision: p.vision,
    provider: cfg.provider || "anthropic",
  };
}

/* Rastavi data URL "data:image/jpeg;base64,AAAA" na {mime, b64}. */
function dataUrlParts(u) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(String(u || ""));
  return m ? { mime: m[1], b64: m[2] } : { mime: "image/jpeg", b64: "" };
}

/* Složi HTTP zahtjev (URL, headeri, body) bez slanja. */
function buildRequest(cfg, opts) {
  const p = aiPreset(cfg);
  const key = (cfg && cfg.key) || "";
  const system = opts.system || "";
  const text = opts.text || "";
  const maxTokens = opts.maxTokens || 1500;
  const img = opts.imageDataUrl ? dataUrlParts(opts.imageDataUrl) : null;

  if (p.kind === "anthropic") {
    const content = [{ type: "text", text: text }];
    if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } });
    return {
      url: p.baseURL + "/v1/messages",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: { model: p.model, max_tokens: maxTokens, system: system, messages: [{ role: "user", content: content }] },
    };
  }
  /* openai-compatible */
  const content = [{ type: "text", text: text }];
  if (img) content.push({ type: "image_url", image_url: { url: opts.imageDataUrl } });
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: img ? content : text });
  return {
    url: p.baseURL + "/chat/completions",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: { model: p.model, max_tokens: maxTokens, messages: messages },
  };
}

/* Izvuci tekst iz odgovora (oba oblika). */
function parseResponse(cfg, json) {
  const p = aiPreset(cfg);
  if (p.kind === "anthropic") {
    const c = json && json.content;
    return (Array.isArray(c) ? c.map((x) => (x && x.text) || "").join("") : "") || "";
  }
  const ch = json && json.choices && json.choices[0];
  return (ch && ch.message && ch.message.content) || "";
}

/* Izvuci JSON iz teksta. Model zna dodati prozu (i zagrade!) oko JSON-a, umotati
   u ```json …```, ili vratiti više blokova. Skupimo svaki balansirani {…}/[…]
   kandidat, pokušamo parsirati, i vratimo najdulji koji se stvarno parsira.
   ponytail: O(n²) skeniranje, ali ulazi su mali (jedan AI odgovor). */
function extractJson(text) {
  let t = String(text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const candidates = [];
  for (let i = 0; i < t.length; i++) {
    const open = t[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc2 = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (ch === "\\") esc2 = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) { candidates.push(t.slice(i, j + 1)); break; } }
    }
  }
  let best = null;
  for (const c of candidates) {
    try { const v = JSON.parse(c); if (!best || c.length > best.len) best = { v: v, len: c.length }; }
    catch (e) { /* nije valjan JSON blok, preskoči */ }
  }
  if (best) return best.v;
  throw new Error("no-json");
}

/* ---------- Promptovi ---------- */

const LANG_NAME = { hr: "Croatian", en: "English", de: "German" };

/* Tjedni pregled — bogat, konkretan, trener persona. `lang` = izlazni jezik. */
function weeklySystemPrompt(lang) {
  const L = LANG_NAME[lang] || "English";
  return [
    "You are an experienced nutrition and strength-training coach reviewing one week of a client's food and workout log.",
    "Your expertise spans applied sports nutrition (energy balance, protein sufficiency for muscle retention and growth, carbohydrate timing, dietary fat minimums, micronutrient and fibre awareness), hydration, and resistance-training programming (weekly volume per muscle group, progressive overload, training frequency, recovery and rest).",
    "",
    "How to read the data you are given:",
    "- Each day lists calories, protein (P), carbs (C), fat (F) in grams, and water, each compared to the client's own daily targets.",
    "- Training sessions list the workout title and the number of sets performed.",
    "- Days marked as not logged mean the client did not record food that day — do NOT treat a blank day as zero intake or as fasting. Acknowledge the gap instead.",
    "",
    "Write a focused weekly review that:",
    "1. Opens with 1–2 genuine wins (things the client did well — consistency, hitting protein, good hydration, training regularity).",
    "2. Identifies the 2–3 most important issues, judged against the client's targets and sound training/nutrition principles: chronic calorie deficit or surplus, protein below target, very low fat, poor hydration, unbalanced or insufficient training volume, low logging consistency.",
    "3. Gives concrete, specific, actionable adjustments for next week — name foods, gram amounts, set counts, or habits, not vague advice. Prioritise the one change that matters most.",
    "",
    "Rules:",
    "- Base every statement strictly on the data provided. Never invent meals, weights, or numbers that are not there.",
    "- Be supportive but direct and honest; skip filler and generic platitudes.",
    "- Use kcal and grams. Keep it concise — short paragraphs or tight bullet lists, no wall of text.",
    "- You are not a doctor: do not diagnose or give medical advice; suggest professional help only if something looks genuinely concerning.",
    "- Write the ENTIRE response in " + L + ".",
  ].join("\n");
}

/* Ekstrakcija iz slike — strogi JSON, po vrsti. Vrati {system, instruction}. */
function imagePrompt(kind, lang) {
  const L = LANG_NAME[lang] || "English";
  const base = "You extract structured data from a photo. Your ENTIRE reply must be a single JSON value that passes JSON.parse — it must start with { or [ and end with } or ]. Output NOTHING else: no prose, no preamble, no explanation, no markdown code fences, no comments, no trailing text. Use a dot as decimal separator and plain ASCII quotes. If a value is not visible, estimate reasonably or use 0. Text fields (names, steps) must be written in " + L + ".";
  if (kind === "ing") {
    return {
      system: base,
      instruction: 'This photo shows a product nutrition label. Return a JSON array with ONE object for the product, macros per 100 g: [{"name": string, "state": "as_sold", "kcal": number, "p": number, "c": number, "f": number}]. If the label lists values per serving only, convert to per 100 g using the serving size shown. "p"=protein, "c"=carbohydrate, "f"=fat, all grams per 100 g.',
    };
  }
  if (kind === "rec") {
    return {
      system: base,
      instruction: 'This photo shows a recipe. Return a JSON array with ONE recipe object: [{"name": string, "slot": one of "dorucak"|"rucak"|"vecera"|"uzina", "servings": integer>=1, "mode": "direct", "macros": {"kcal": number, "p": number, "c": number, "f": number}, "steps": [string], "ing": [string]}]. "macros" are the estimated totals for the WHOLE recipe (all servings). "ing" is the human-readable ingredient list (one string per ingredient, with quantities). "steps" are the preparation steps in order. Pick the most fitting meal slot.',
    };
  }
  if (kind === "train") {
    return {
      system: base,
      instruction: 'This photo shows a workout / training plan. Return a JSON object with a title and a flat list of exercises: {"title": string, "exercises": [{"name": string, "muscles": [string], "equipment": [string], "sets": integer, "reps": integer, "weight": number, "restSeconds": integer}]}. One item per exercise. "sets" = number of working sets, "reps" = reps per set, "weight" = kilograms per set (0 for bodyweight or if not shown), "restSeconds" = rest between sets (use 90 if not specified). "muscles" and "equipment" may be [] if unknown. Example: {"title":"Push Day","exercises":[{"name":"Bench Press","muscles":["chest","triceps"],"equipment":["barbell"],"sets":3,"reps":8,"weight":60,"restSeconds":120}]}',
    };
  }
  /* plate */
  return {
    system: base,
    instruction: 'This photo shows a plate/portion of prepared food. Estimate its nutrition and return a JSON object: {"name": string, "slot": one of "dorucak"|"rucak"|"vecera"|"uzina", "kcal": number, "p": number, "c": number, "f": number}. Values are the estimate for the ENTIRE portion shown (not per 100 g). This is a best-effort visual estimate. "name" briefly describes the dish. Pick the most fitting meal slot.',
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { AI_PRESETS, AI_PROVIDER_LABELS, aiPreset, dataUrlParts, buildRequest, parseResponse, extractJson, weeklySystemPrompt, imagePrompt };
}
