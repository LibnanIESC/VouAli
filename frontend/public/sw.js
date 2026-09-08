const CACHE = "vouali-v4";
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

  // A API passa direto, sem service worker no meio.
  //
  // Aqui havia um "fallback offline" que respondia {state:null,version:0} com
  // status 200 para QUALQUER rota /api/. A intenção era não travar a interface;
  // o efeito foi o app nunca descobrir que estava sem rede. O pior caso: a
  // resposta falsa chegava como config do servidor, era gravada por cima da
  // configuração boa, e o app abria sem saber quem era o usuário — mostrando a
  // tela de "primeira viagem" a quem tinha viagens guardadas. A mesma resposta
  // chegava como lista de viagens vazia e apagava a lista do cache.
  //
  // Requisição de API sem rede tem de FALHAR: é o que o cliente sabe tratar —
  // modo leitura, cópia local, aviso de offline. Um 200 inventado é pior que
  // erro nenhum, porque não há como distingui-lo de sucesso.
  if (url.pathname.startsWith("/api/")) return;

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
  //
  // Sem reserva: um asset que falta tem de FALHAR. Aqui havia um `catch` que
  // entregava a página do app como se fosse o `.js` pedido — o navegador
  // respondia "SyntaxError: Unexpected token" e o app morria na abertura.
  e.respondWith(
    caches.match(req).then((r) =>
      r ||
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return resp;
      })
    )
  );
});
