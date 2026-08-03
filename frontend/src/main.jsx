import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// Auto-atualização: compara o bundle carregado com o do servidor e recarrega
// quando há um build novo — assim o PWA nunca fica preso numa versão em cache.
// (Em dev não dispara, pois o script é /src/main.jsx, não /assets/index-*.js.)
let _checking = false;
async function checkForUpdate() {
  if (_checking || document.hidden) return;
  _checking = true;
  try {
    const html = await fetch("/index.html", { cache: "no-store" }).then((r) => r.text());
    const latest = (html.match(/assets\/(index-[\w-]+\.js)/) || [])[1];
    const cur = (([...document.scripts].map((s) => s.src).join(" ").match(/assets\/(index-[\w-]+\.js)/)) || [])[1];
    if (latest && cur && latest !== cur) {
      if (window.caches) { try { for (const c of await caches.keys()) await caches.delete(c); } catch (_) {} }
      location.reload();
      return; // vai recarregar; não reseta a trava
    }
  } catch (_) {}
  _checking = false;
}
window.addEventListener("focus", checkForUpdate);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });
setTimeout(checkForUpdate, 4000);
