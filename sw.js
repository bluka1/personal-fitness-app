/* Offline cache. Verzija se mijenja pri svakoj izmjeni aplikacije. */
const CACHE = "obroci-v13";
const ASSETS = ["./", "./index.html", "./zxing.js", "./manifest.json",
  "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* Open Food Facts uvijek ide na mrežu — nema smisla posluživati stari zapis. */
  if (url.hostname.indexOf("openfoodfacts") >= 0) return;
  if (url.origin !== self.location.origin) return;

  /* HTML (sva logika je unutra) ide mreža-prvo, da nova verzija stigne
     odmah. Bez ovoga stara verzija ostane u cacheu dok se SW ne promijeni.
     Offline: padni natrag na cache. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  /* Ostalo (zxing, ikone, manifest) — cache prvo, ne mijenja se često. */
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
