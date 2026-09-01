/* Osobni sync backend za fitness app — Cloudflare Worker + KV.
   Sprema jedan JSON blob po tajnoj frazi. Ista fraza = isti podaci.

   POSTAVLJANJE (jednom, ~5 min):
   1. Cloudflare dashboard -> Workers & Pages -> Create -> Worker.
      Zalijepi ovu datoteku umjesto predloska -> Deploy.
   2. Worker -> Settings -> Variables and Secrets -> Bindings ->
      Add -> KV Namespace. Napravi novi namespace (npr. "fitness-sync")
      i vezi ga pod tocno ovim imenom:
          Variable name: SYNC
   3. Redeploy ako treba. Kopiraj URL workera (https://ime.tvoj.workers.dev).
   4. U aplikaciji (tab Vise -> Sinkronizacija) upisi taj URL i tajnu frazu
      (barem 8 znakova). Istu frazu upisi na svakom uredaju.

   Sigurnost: fraza se ne sprema u cistom obliku — KV kljuc je SHA-256(fraza).
   Tko zna frazu, cita/pise taj blob; zato je drzi tajnom.
   ponytail: zadnji upis pobjeduje, jedan KV kljuc po frazi. */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, x-sync-secret",
};

async function keyFor(secret) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const secret = request.headers.get("x-sync-secret") || "";
    if (secret.length < 8) return new Response("bad secret", { status: 401, headers: CORS });
    const key = await keyFor(secret);

    if (request.method === "GET") {
      const val = await env.SYNC.get(key);
      if (val == null) return new Response(null, { status: 404, headers: CORS });
      return new Response(val, { headers: { ...CORS, "content-type": "application/json" } });
    }

    if (request.method === "PUT") {
      const body = await request.text();
      if (body.length > 25 * 1024 * 1024) return new Response("too big", { status: 413, headers: CORS });
      await env.SYNC.put(key, body);
      return new Response("ok", { headers: CORS });
    }

    return new Response("method not allowed", { status: 405, headers: CORS });
  },
};
