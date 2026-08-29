# Obroci — handoff

Ovaj dokument je za AI asistenta ili programera koji preuzima projekt.
Sadrži arhitekturu, odluke i njihove razloge, te otvorene zadatke.
Sučelje i komentari u kodu su na hrvatskom — zadrži to.

## 1. Što je ovo

Osobna PWA za praćenje obroka, makronutrijenata i unosa vode. Jedan
korisnik (vlasnik projekta), iPhone kao primarni uređaj, računalo kao
sekundarni. Nije proizvod, nema korisničku bazu, nema monetizaciju.

Ključne značajke:

- Biblioteka recepata s postupcima, razvrstana po obrocima
- Bilježenje obroka jednim tapom, uz skaliranje porcija
- Bilježenje pojedinačnih namirnica po gramaži
- Dnevni zbroj kcal/P/UH/M naspram ciljeva, tjedni pregled
- Praćenje vode
- Skener barkoda s dohvatom podataka iz Open Food Factsa
- Sinkronizacija preko korisnikove vlastite Supabase baze (neobavezna)

## 2. Arhitektonske odluke i zašto

Ove odluke su namjerne. Ako ih mijenjaš, imaj razlog jači od navike.

**Bez frameworka, bez alata za build osim jedne Python skripte.**
Aplikacija mora raditi za pet godina bez `npm install`. Nema ovisnosti
koje trunu. `build.py` koristi samo standardnu biblioteku.

**Vanilla JS, potpuno ponovno iscrtavanje.** `render()` prepisuje
`#main` preko `innerHTML`. Nema virtualnog DOM-a jer ga za ovu veličinu
ne treba. Obrasci se **ne** iscrtavaju ponovno pri svakom pritisku
tipke — vrijednosti se čitaju iz DOM-a tek pri spremanju
(`collectRecipe()`). To je razlog zašto fokus ne bježi tijekom tipkanja.
Ako uvedeš stanje vezano uz svaki `input`, vratit ćeš bug koji je već
jednom bio popravljen.

**Lokalno je izvor istine, oblak je sloj iznad.** `localStorage` se
piše prvo i sinkroni; Supabase tek nakon toga, s odgodom. Aplikacija
mora biti potpuno upotrebljiva bez interneta — u dućanu, u teretani.

**Skener je slojevit:** ugrađeni `BarcodeDetector` gdje postoji
(Android/Chrome), inače ZXing (Safari), inače ručni upis brojke.
ZXing je lokalna datoteka, ne CDN, da skeniranje radi offline.

**Nikakav ključ s povlasticama ne ide u klijent.** Supabase publishable
(nekad anon) ključ jest javan po dizajnu; sigurnost dolazi iz RLS
pravila u `SUPABASE.sql`. Aplikacija aktivno odbija ključ koji izgleda
kao `sb_secret_` ili `service_role`.

## 3. Datoteke

```
src/shell.html   HTML kostur, sav CSS, PWA meta oznake
src/seed.js      SEED_INGREDIENTS i SEED_RECIPES (početni sadržaj)
src/app.js       sva logika: stanje, prikazi, radnje, sync, skener
build.py         src/ -> index.html
index.html       GENERIRANO. Ne uređuj ručno.
zxing.js         ZXing 0.21.3 UMD, MIT. Nepromijenjen, ne diraj.
sw.js            service worker, cache-first za vlastito podrijetlo
manifest.json    ikona, standalone prikaz
icon-*.png       180 (iOS), 192, 512 (maskable)
SUPABASE.sql     shema + RLS pravila
README.md        upute za objavu, za vlasnika
```

Radni tok: uredi `src/`, pokreni `python3 build.py`, podigni verziju
cachea u `sw.js`, commitaj sve uključujući `index.html`.

## 4. Model podataka

Tri ključa u `localStorage`:

```js
"obroci_data"    { ingredients: [], recipes: [], settings: {} }
"obroci_logs"    { "2026-08-29": { meals: [], water: 3000 }, ... }
"obroci_updated" "1756483200000"   // ms, za usporedbu pri syncu
"obroci_sync"    { url, anon, email, access_token, refresh_token,
                   expires_at, user_id }
```

Oblici:

```js
ingredient = {
  id, name,
  state: "raw" | "cooked" | "as_sold",   // sprječava vaganje sirovog kao kuhanog
  kcal, p, c, f,                          // uvijek na 100 g
  barcode?                                // ako je došla sa skenera
}

recipe = {
  id, name,
  slot: "dorucak" | "rucak" | "vecera" | "uzina",
  servings,                               // >= 1, cijeli broj
  mode: "direct" | "items",
  items: [{ ing: ingredientId, g }],      // samo za mode "items"
  macros: { kcal, p, c, f },              // samo za "direct", za CIJELI recept
  ing: ["50 g zobi", ...],                // slobodan tekst, samo za "direct"
  steps: ["korak", ...]
}

meal = {                                  // zapis u dnevniku, snimka u trenutku unosa
  id, slot, name, servings,
  kcal, p, c, f                           // PO PORCIJI, množi se sa servings
}
```

Dvije zamke:

- `macros` u `direct` receptu je za **cijeli recept**; `recipeMacros()`
  dijeli sa `servings`. Cheesecake ima `servings: 4`.
- `meal` je **snimka**, ne referenca. Kad se recept naknadno promijeni,
  stari zapisi u dnevniku ostaju kakvi jesu. To je namjerno — povijest
  se ne smije mijenjati unatrag.

## 5. Sinkronizacija

Jedan redak po korisniku, cijelo stanje kao JSON:

```sql
obroci_state (user_id uuid pk, data jsonb, updated_at timestamptz)
```

REST se zove direktno preko `fetch`, bez `supabase-js`, da se ne uvodi
ovisnost. Prijava: `POST /auth/v1/otp` pa `POST /auth/v1/verify`, ili
povratak s magic linka koji hvata `consumeAuthHash()` iz `location.hash`.
Osvježavanje tokena: `POST /auth/v1/token?grant_type=refresh_token`.
Upis: `POST /rest/v1/obroci_state` sa zaglavljem
`Prefer: resolution=merge-duplicates`.

Rješavanje sukoba: **novije pobjeđuje, nad cijelim skupom**. Usporedba
je `data.updatedAt` prema lokalnom `obroci_updated`. Vidi otvorene
zadatke — ovo je poznato ograničenje.

## 6. Vanjske ovisnosti

| što | gdje | bilješka |
|---|---|---|
| Open Food Facts | `world.openfoodfacts.org/api/v2/product/{barcode}.json` | bez ključa; traži se `product_name,brands,nutriments,serving_size` |
| Supabase | korisnikov projekt | neobavezno; bez njega aplikacija radi normalno |
| ZXing 0.21.3 | lokalno | MIT |

Kalorije se čitaju iz `energy-kcal_100g`, uz zamjenu preko
`energy_100g / 4.184` kad su vrijednosti u kJ. Kad neko polje
nedostaje, aplikacija otvori obrazac s oznakom `partial` i traži
od korisnika da dopuni.

## 7. Otvoreni zadaci

Poredano po tome koliko vjerojatno ugrize u praksi.

1. **Granularnost sukoba pri syncu.** Sad "novije pobjeđuje" gazi cijeli
   skup. Scenarij koji boli: unos na mobitelu offline, pa unos na
   računalu, pa mobitel dođe online i pregazi. Rješenje: spajanje po
   dnevnicima (`logs`) po datumu i po `meal.id`, uz zadržavanje LWW za
   `settings`. Prije toga izmjeri koliko se stvarno događa.
2. **Zaključan zoom je nagodba s pristupačnošću.** `user-scalable=no`
   riješio je slučajno zumiranje pri tapkanju, ali onemogućuje
   povećanje teksta. Ako aplikacija ikad dobije drugog korisnika,
   vrati zoom i riješi problem drugačije (veće ciljne površine).
3. **Predlošci e-maila na Supabaseu su zaključani** bez vlastitog SMTP-a,
   pa OTP kod ne stiže — koristi se magic link. Ako se postavi SMTP,
   dodaj `{{ .Token }}` u predloške "Magic link or OTP" i "Confirm signup"
   i kod proradi bez ikakve izmjene u aplikaciji.
4. **iOS zna izbaciti podatke.** `requestPersist()` traži zaštitu, ali
   jamstva nema. Razmisli o periodičkom podsjetniku za izvoz ako sync
   nije uključen.
5. **Open Food Facts traži vlastiti User-Agent**, a preglednik ga ne
   dopušta postaviti. Zasad se ignorira. Ako počne stizati blokada,
   treba proxy — što znači server, što je odluka koju vlasnik nije htio.
6. **Nema uređivanja zabilježenog obroka.** Može se samo obrisati i
   unijeti ponovno.

## 8. Konvencije

- Sučelje, poruke i komentari u kodu na hrvatskom.
- Nutritivni podaci: USDA FoodData Central kad se računa iz namirnica.
  Kad recept dolazi s tuđim brojkama, prenesi ih i reci odakle su —
  nemoj ih tiho miješati s izračunatima.
- Sve nutritivne vrijednosti namirnica su na 100 g, bez iznimke.
- Ne uvoditi ovisnosti bez jakog razloga. Ako ipak, neka budu lokalne
  datoteke, ne CDN — offline rad je zahtjev, ne želja.
- CSS varijable su u `:root` u `shell.html`. Paleta je namjerna
  (tamna, topla, boje začina); ne zamjenjuj je zadanim Tailwind tonovima.

## 9. Provjera prije commita

Nema automatiziranih testova. Minimum:

```bash
node --check src/app.js
node --check src/seed.js
python3 build.py
```

Ručno, na mobitelu, nakon svake veće izmjene:

- [ ] Zabilježi recept, provjeri zbroj na Danas
- [ ] Zabilježi namirnicu po gramaži, provjeri izračun
- [ ] Otvori recept — vide se sastojci i postupak
- [ ] Uredi i spremi recept, pa novi recept od nule
- [ ] Spremi ciljeve, zatvori i ponovno otvori aplikaciju
- [ ] Tapkaj čaše vode, provjeri da se stanje drži
- [ ] Skeniraj barkod ili upiši ručno, provjeri dopunjavanje
- [ ] Preuzmi kopiju, obriši podatke preglednika, vrati kopiju
- [ ] Ako je sync uključen: izmjena na jednom uređaju, provjera na drugom
- [ ] Zrakoplovni način rada — aplikacija se otvara i radi

## 10. Čega se kloniti

- Ne uređuj `index.html` ručno; `build.py` ga prepisuje.
- Ne inlinaj `zxing.js` u `index.html`; SW ga cachira zasebno.
- Ne stavljaj `sb_secret_` ni `service_role` ključ nigdje u repozitorij.
- Ne uvodi `localStorage` ovisnosti u obrasce (vidi odjeljak 2).
- Ne zaboravi podići verziju cachea u `sw.js`; inače se stara verzija
  poslužuje iz cachea i izgleda kao da promjena nije prošla.
