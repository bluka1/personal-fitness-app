# Obroci

Praćenje obroka, makronutrijenata i vode. Radi offline, podaci ostaju
na uređaju, uz neobaveznu sinkronizaciju preko vlastite Supabase baze.

## Objava na GitHub Pages

1. Na github.com napravi novi repozitorij, npr. `obroci`. Public.
2. **Add file → Upload files**, povuci sav sadržaj ove mape uključujući
   `src/` (ne mapu `obroci`, nego ono što je u njoj — `index.html` mora
   završiti u korijenu repozitorija).
3. Commit changes.
4. **Settings → Pages → Build and deployment**
   Source: *Deploy from a branch*, Branch: `main`, folder: `/ (root)`. Save.
5. Nakon minutu-dvije adresa je `https://<korisnik>.github.io/obroci/`.

Ubuduće mijenjaš datoteku direktno na GitHubu (olovka → Commit) ili
uploadaš novu verziju. Pages se sam ponovno objavi.

## Ako želiš zadržati Netlify adresu

Netlify → Add new site → **Import an existing project** → GitHub → odaberi
repozitorij. Od tada svaki commit automatski objavljuje. Build command
ostavi prazan, publish directory `.`.

## Razvoj

Izvorne datoteke su u `src/`. Nakon izmjene:

```bash
python3 build.py          # sastavi src/ u index.html
```

Zatim podigni broj verzije u `sw.js` i commitaj.
Detalji za programera ili AI asistenta: **HANDOFF.md**.

## Struktura

| datoteka | čemu služi |
|---|---|
| `src/` | izvorne datoteke (shell.html, seed.js, app.js) |
| `build.py` | sastavlja `src/` u `index.html` |
| `index.html` | generirano, ne uređuj ručno |
| `zxing.js` | čitač barkoda, radi offline |
| `sw.js` | service worker za rad bez interneta |
| `manifest.json` | ikona i standalone prikaz |
| `icon-*.png` | ikone |
| `SUPABASE.sql` | shema baze, samo ako želiš sinkronizaciju |

## Nakon promjene aplikacije

Pokreni `python3 build.py`, pa u `sw.js` podigni broj verzije (`obroci-v8` → `obroci-v9`), inače
preglednici mogu servirati staru verziju iz cachea.

## Podaci

Bez sinkronizacije ne napuštaju uređaj. Sa sinkronizacijom idu u tvoj
Supabase projekt. Skeniranje barkoda šalje samo brojku Open Food Factsu.
Sigurnosna kopija: Više → Preuzmi kopiju.

Publishable ključ koji upišeš u aplikaciju je javan po dizajnu i smije
biti u repozitoriju. Secret i service_role ključevi ne smiju nikada.
