// ---------- Persistência no backend (sincroniza os dois celulares) ----------
const TOKEN_KEY = "trip-token";
function authHeaders() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) { const q = new URLSearchParams(location.search).get("k"); if (q) { t = q; localStorage.setItem(TOKEN_KEY, q); } }
  return t ? { "X-Trip-Token": t } : {};
}
function promptToken() {
  const t = window.prompt("Senha do app (a que voce definiu em TRIP_TOKEN no Railway):");
  if (t) { localStorage.setItem(TOKEN_KEY, t); location.reload(); }
}

// Estado de sincronização observável (pub/sub) — alimenta o indicador no header.
// synced | saving | offline | reloaded
let _status = "synced";
const _statusSubs = new Set();
function setStatus(s) { _status = s; _statusSubs.forEach((fn) => fn(s)); }
export function onStatus(fn) { _statusSubs.add(fn); fn(_status); return () => _statusSubs.delete(fn); }

let _version = 0;          // última versão conhecida do servidor
let _dirty = false;        // há edição local pendente de gravação?
let _onRemote = null;      // handler que aplica estado vindo do servidor
export function setRemoteHandler(fn) { _onRemote = fn; }
export function isDirty() { return _dirty; }

// Busca o estado do servidor. Retorna { state, version } ou null em falha.
export async function apiGet() {
  try {
    const res = await fetch("/api/state", { headers: authHeaders() });
    if (res.status === 401) { promptToken(); return null; }
    if (!res.ok) { setStatus("offline"); return null; }
    const j = await res.json();
    if (typeof j.version === "number") _version = j.version;
    if (_status === "offline") setStatus("synced");
    return { state: j && j.state ? j.state : null, version: _version };
  } catch (e) { setStatus("offline"); return null; }
}

let putTimer = null;
let _pending = null;       // último snapshot ainda não confirmado pelo servidor
export function apiPut(state) {
  _dirty = true;
  _pending = state;
  setStatus("saving");
  clearTimeout(putTimer);
  putTimer = setTimeout(async () => {
    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Base-Version": String(_version), ...authHeaders() },
        body: JSON.stringify(state),
      });
      if (res.status === 401) { promptToken(); return; }
      if (res.status === 409) {
        // outro aparelho gravou antes; recarrega o estado do servidor e avisa
        const fresh = await apiGet();
        if (fresh && fresh.state && _onRemote) _onRemote(fresh.state);
        _dirty = false;
        setStatus("reloaded");
        return;
      }
      if (!res.ok) { setStatus("offline"); return; }
      const j = await res.json();
      if (typeof j.version === "number") _version = j.version;
      _dirty = false;
      _pending = null;
      setStatus("synced");
    } catch (e) { setStatus("offline"); }
  }, 400);
}

// Reenvia a última edição pendente ao voltar a conexão.
export function flushPending() { if (_dirty && _pending) apiPut(_pending); }

// ---------- Chat com o Ali (IA) ----------
export async function apiAli(messages, trip) {
  try {
    const res = await fetch("/api/ali", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ messages, trip }),
    });
    if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json();
  } catch (e) { return { error: "offline" }; }
}

// Gera uma dica do Ali (sob demanda) para uma parada do roteiro.
export async function apiAliDica(stop, trip) {
  try {
    const res = await fetch("/api/ali/dica", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ stop, trip }),
    });
    if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json();
  } catch (e) { return { error: "offline" }; }
}
