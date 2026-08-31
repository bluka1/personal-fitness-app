# AI podrška (BYOK, multi-provider) — dizajn

Datum: 2026-08-31
Status: odobreno za implementaciju

## Cilj

Dvije AI funkcije u postojećem client-only PWA-u:

1. **Tjedni AI pregled** — personalizirani savjeti + feedback nad zadnjih 7 dana.
2. **Unos iz slike** — namirnica / recept / trening / tanjur iz priložene fotografije.

Bez vlastitog backenda: **BYOK** (bring your own key). Svaki user upiše vlastiti
API ključ u tab *Više*; ključ živi u localStorage (isto kao ostali podaci, samo
na tom uređaju).

## Arhitektura

Novi file `src/ai.js`, ubačen u `build.py` poslije `i18n.js`, prije `app.js`.
Testabilan modul (`typeof module` guard, export čistih funkcija).

### Provideri i adapteri

Dva HTTP oblika pokrivaju sve:

- **Anthropic-native**: `POST https://api.anthropic.com/v1/messages`
  - headeri: `x-api-key: <key>`, `anthropic-version: 2023-06-01`,
    `anthropic-dangerous-direct-browser-access: true`
  - body: `{ model, max_tokens, system, messages:[{role, content:[{type:"text",text}, {type:"image", source:{type:"base64", media_type, data}}]}] }`
  - odgovor: `data.content[0].text`
- **OpenAI-compatible**: `POST {baseURL}/chat/completions`
  - header: `Authorization: Bearer <key>`
  - body: `{ model, max_tokens, messages:[{role, content:[{type:"text",text}, {type:"image_url", image_url:{url:"data:<mime>;base64,<data>"}}]}] }`
  - odgovor: `data.choices[0].message.content`
  - pokriva OpenAI, DeepSeek, GLM (Zhipu), Kimi (Moonshot) — razlika samo baseURL + model.

### Presetovi

```
AI_PRESETS = {
  anthropic: { kind:"anthropic", baseURL:"https://api.anthropic.com", model:"claude-sonnet-4-6", vision:true },
  openai:    { kind:"openai", baseURL:"https://api.openai.com/v1", model:"gpt-4o", vision:true },
  deepseek:  { kind:"openai", baseURL:"https://api.deepseek.com", model:"deepseek-chat", vision:false },
  glm:       { kind:"openai", baseURL:"https://open.bigmodel.cn/api/paas/v4", model:"glm-4v", vision:true },
  kimi:      { kind:"openai", baseURL:"https://api.moonshot.cn/v1", model:"moonshot-v1-8k-vision-preview", vision:true },
}
```

User override: `settings.ai.model` i `settings.ai.baseURL` (prazno = preset default).
Ako odabrani provider/model `vision:false`, slike-import se onemogući s jasnom porukom.

### Pure funkcije (testabilne)

- `aiPreset(cfg)` → efektivni `{ kind, baseURL, model }` (spoji preset + override).
- `buildRequest(cfg, {system, text, imageDataUrl})` → `{ url, headers, body }` (bez mreže).
- `parseResponse(cfg, json)` → tekst.
- `extractJson(text)` → izvuče prvi `{...}`/`[...]` blok iz odgovora (AI zna umotati u ```json). Vrati parsiran objekt ili baci.

### Mrežni omotač (u app.js ili ai.js, koristi `fetch`)

- `aiCall({ system, text, imageDataUrl })` → `await fetch(...)`, 1 retry na network error, vrati tekst ili baci s čitljivom porukom (status + tijelo skraćeno). CORS greška se surface-a kao poruka: "Provider ne dopušta poziv iz preglednika".

## Settings

`DEFAULT_SETTINGS.ai = { provider:"anthropic", key:"", model:"", baseURL:"" }`.

Tab *Više*, nova kartica "AI":
- segment izbor providera (anthropic/openai/deepseek/glm/kimi),
- input za ključ (`type=password`),
- input za model (placeholder = preset default),
- input za baseURL (placeholder = preset default, za self-host/proxy),
- akcija `set-ai` sprema u `S.settings.ai`, `saveData()`.

## Feature A — Tjedni AI pregled

Gumb u Statistici (`viewStats`), uz tjedni graf: "Tjedni AI pregled".
Akcija `ai-week`:
1. Skupi zadnjih 7 dana iz `S.logs`: po danu kcal/P/C/F (via `dayTotals`), voda, vs `settings.targets`.
2. Treninzi iz `S.training.sessions` u rasponu (naslov, broj serija, volumen).
3. Složi kompaktan tekstualni sažetak + system prompt "ti si fitness/prehrana savjetnik, odgovori na jeziku {lang}, kratko, konkretno".
4. `aiCall` → prikaži markdown-ish tekst u sheetu (`type:"ai-week"`), s loading stanjem.
Read-only. Ništa se ne sprema. Jezik = `curLang()`.

## Feature B — Unos iz slike

Reuse postojećeg import flowa (`type:"import"`, `kind` ing/rec/all).

Zajednički: `<input type="file" accept="image/*" capture="environment">` →
`FileReader.readAsDataURL` → dataURL. Gumb "Iz slike" u import sheetu.
Nakon AI odgovora: `extractJson` → `JSON.stringify(pretty)` ubaci u postojeći
import `<textarea>`. User pregleda/uredi → postojeći "Primijeni" gumb.
**Nula novog apply koda za namirnice i recepte.**

Schema u promptu = točno postojeći import format:
- **ing**: `[{name, state:"raw|cooked|as_sold", kcal, p, c, f}]` (na 100 g).
- **rec**: `[{name, slot, servings, mode:"direct", macros:{kcal,p,c,f}, steps:[], ing:[]}]`
  (mode "direct" jer slika recepta nema naše ingredient ID-eve).

Novi `kind`:
- **train**: AI vrati `{ exercises:[{name, muscles:[], equipment:[]}], template:{title, exercises:[{name, restSeconds, sets:[{reps, weight}]}]} }`.
  Novi apply branch u training.js: dodaj vježbe kojih nema (po imenu), složi
  template s `targetSets`. Prikaz JSON-a u istom review textarea.
- **plate** (tanjur): AI vrati `{ name, slot, kcal, p, c, f }` (procjena za cijeli
  tanjur). Apply: `today().meals.push({ id:uid("m"), slot, name, servings:1, kcal,p,c,f })`
  — logira ko obrok danas. Prompt jasno kaže "procjena, ne precizno".

Ulazi u UI: Namirnice-import dobije "Iz slike (deklaracija)"; Recepti-import "Iz
slike (recept)"; Trening tab gumb "Iz slike (plan)"; Danas/slot dobije "Iz slike
(tanjur)".

## i18n

Svi novi stringovi: HR ključevi + EN + DE u `src/i18n.js`. Isti postupak ko dosad.

## Build / deploy / test

- `build.py`: dodaj `read("ai.js")` prije `app.js`.
- `sw.js`: bump `CACHE` v16 → v17.
- Test `test/ai.test.js`: `buildRequest` shape za anthropic i openai (URL, header,
  image blok), `parseResponse` za oba, `extractJson` (goli JSON, ```json ograđen,
  JSON s okolnim tekstom), `aiPreset` override logika. Bez mreže.

## Ponytail rezovi

- Bez streaminga — čekam pun odgovor.
- Bez retry osim 1× na network error.
- Review kroz postojeći textarea, ne custom UI.
- Bez token/cijena mjerenja.
- Bez lokalnog spremanja AI odgovora (pregled je efemeran).

## Rizici

- **CORS**: Anthropic i OpenAI rade iz browsera; DeepSeek/GLM/Kimi neizvjesno —
  ako padne, jasan error, ne tiho. Anthropic je siguran default.
- **Točnost slike**: tanjur je procjena; user uvijek pregleda JSON prije apply
  (osim tanjura koji ide direkt u log — ali user vidi rezultat i može obrisati).
- **Ključ u localStorage**: čitljiv JS-u na tom origin-u; prihvatljivo za
  osobnu PWA (isto ko Supabase ključ koji već stoji tamo).
