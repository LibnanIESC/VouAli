const CACHE = "vouali-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // API: sempre rede; offline devolve estado nulo pra não travar a UI.
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ state: null, version: 0 }), { headers: { "Content-Type": "application/json" } }))
    );
    return;
  }

  // Documento HTML (navegação, "/" e "/index.html"): network-first, para nunca
  // ficar preso numa versão antiga após um deploy; cai no cache só offline.
  const isDoc = req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return resp;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets com hash no nome (JS/CSS) e ícones: cache-first (são imutáveis).
  e.respondWith(
    caches.match(req).then((r) =>
      r ||
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match("/index.html"))
    )
  );
});
