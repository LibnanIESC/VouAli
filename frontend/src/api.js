// ---------- Persistência no backend (sincroniza os dois celulares) ----------

// No site, a API é a mesma origem (base vazia). No app Android a interface
// roda embarcada no aparelho, então precisa do endereço absoluto do servidor
// — definido em VITE_API_BASE na hora de gerar o app.
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
export const url = (caminho) => API_BASE + caminho;
export const noApp = () => !!(typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const TOKEN_KEY = "trip-token";

// No modo multiusuário, quem fornece o token é o Firebase (definido pelo App).
let _tokenGetter = null;
export function setTokenGetter(fn) { _tokenGetter = fn; }

async function authHeaders(forcar = false) {
  if (_tokenGetter) {
    const t = await _tokenGetter(forcar);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) { const q = new URLSearchParams(location.search).get("k"); if (q) { t = q; localStorage.setItem(TOKEN_KEY, q); } }
  return t ? { "X-Trip-Token": t } : {};
}

/**
 * `fetch` com a credencial do momento, e com uma segunda chance.
 *
 * Sessão vencida é o 401 mais comum num app que fica dias aberto. Antes ele
 * era engolido em silêncio: a tela ficava vazia, como se a conta não tivesse
 * nada, e toda ação falhava sem explicação. Agora o token é renovado à força
 * e a chamada é repetida UMA vez — que é o que resolve o caso comum.
 */
async function fetchAuth(caminho, opcoes = {}) {
  const monta = async (forcar) => fetch(url(caminho), {
    ...opcoes,
    headers: { ...(opcoes.headers || {}), ...(await authHeaders(forcar)) },
  });
  let res = await monta(false);
  if (res.status === 401 && _tokenGetter) res = await monta(true);
  return res;
}

// Configuração pública do servidor (modo de login e credenciais do Firebase).
export async function apiConfig() {
  try {
    const res = await fetch(url("/api/config"));
    if (!res.ok) return { authMode: "token", firebase: null };
    return await res.json();
  } catch (e) { return { authMode: "token", firebase: null }; }
}
// Pedido de senha: avisa o App (que mostra a tela de desbloqueio própria).
let _authCb = null;
export function onAuthNeeded(fn) { _authCb = fn; }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); location.reload(); }
// Modo com contas: 401 depois da renovação forçada não é sessão vencida, é
// sessão MORTA (conta apagada, senha trocada, acesso revogado). Antes isso era
// engolido e a pessoa ficava olhando uma tela vazia achando que perdeu tudo.
let _sessaoMortaCb = null;
export function onSessaoMorta(fn) { _sessaoMortaCb = fn; }
function promptToken() {
  if (_tokenGetter) { if (_sessaoMortaCb) _sessaoMortaCb(); return; }
  if (_authCb) _authCb();
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

let _etag = "";            // marca da última versão que já temos

// Busca o estado do servidor. Retorna { state, version }, { naoMudou: true }
// quando nada mudou desde a última consulta, ou null em falha.
export async function apiGet() {
  try {
    const marca = _etag ? { "If-None-Match": _etag } : {};   // pergunta leve: "mudou?"
    const res = await fetchAuth("/api/state", { headers: marca, cache: "no-store" });
    if (res.status === 401) { promptToken(); return null; }
    if (res.status === 304) {                      // nada mudou: sem corpo
      if (_status === "offline") setStatus("synced");
      return { naoMudou: true, version: _version };
    }
    if (!res.ok) { setStatus("offline"); return null; }
    _etag = res.headers.get("ETag") || "";
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
      const res = await fetchAuth("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Base-Version": String(_version) },
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
      _etag = "";            // gravamos: a marca antiga não vale mais
      _dirty = false;
      _pending = null;
      setStatus("synced");
    } catch (e) { setStatus("offline"); }
  }, 400);
}

// Reenvia a última edição pendente ao voltar a conexão.
export function flushPending() { if (_dirty && _pending) apiPut(_pending); }

// Grava imediatamente (e aguarda) qualquer edição pendente na viagem ATUAL.
// Usado antes de trocar de viagem, para a pendência não cair na viagem errada.
export async function flushNow() {
  clearTimeout(putTimer);
  if (!(_dirty && _pending)) return;
  try {
    const res = await fetchAuth("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Base-Version": String(_version) },
      body: JSON.stringify(_pending),
    });
    if (res.ok) { const j = await res.json(); if (typeof j.version === "number") _version = j.version; setStatus("synced"); }
  } catch (e) {}
  _dirty = false;
  _pending = null;
}

// ---------- Gestão de viagens (multi-viagem) ----------
export async function apiTrips() {
  try {
    const res = await fetchAuth("/api/trips");
    if (res.status === 401) { promptToken(); return null; }
    if (!res.ok) { setStatus("offline"); return null; }
    const j = await res.json();
    return j.trips || { active: null, list: [] };
  } catch (e) { setStatus("offline"); return null; }
}
export async function apiCreateTrip(meta) {
  const res = await fetchAuth("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) });
  if (!res.ok) return null;
  return await res.json(); // { meta, trips }
}
// Qual viagem está aberta é decidido no servidor. Se a troca não chegou lá
// (sem rede), guardamos o pedido: senão, ao reconectar, o servidor mandaria o
// roteiro da viagem ANTIGA por cima da que a pessoa está olhando.
let _activePendente = null;
export async function apiSetActive(id) {
  _etag = "";               // outra viagem: a marca anterior não serve
  _activePendente = id;
  try {
    const res = await fetchAuth("/api/active", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) _activePendente = null;
  } catch (e) {}
}
/** Reenvia a troca de viagem que não chegou ao servidor. */
export async function flushActive() {
  if (_activePendente) await apiSetActive(_activePendente);
}
export async function apiTripMeta(id, meta) {
  const res = await fetchAuth(`/api/trips/${id}/meta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) });
  if (!res.ok) return null;
  return await res.json(); // { trips }
}
export async function apiDeleteTrip(id) {
  const res = await fetchAuth(`/api/trips/${id}`, { method: "DELETE" });
  if (!res.ok) return null;
  return await res.json(); // { trips }
}

// ---------- Excluir a conta (exigência do Google para publicar) ----------
/** O que a exclusão vai levar, para avisar antes. null se não der para saber. */
export async function apiPreviaExclusao() {
  try {
    const res = await fetchAuth("/api/me/exclusao");
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.error ? null : j;
  } catch (e) { return null; }
}
/** Apaga a conta e tudo que é dela. Não tem desfazer. */
export async function apiExcluirConta() {
  try {
    const res = await fetchAuth("/api/me", { method: "DELETE" });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (e) { return { ok: false }; }
}

// Consumo de IA do mês (cotas). null = ambiente sem cota (modo antigo).
export async function apiUsage() {
  try {
    const res = await fetchAuth("/api/usage");
    if (!res.ok) return null;
    const j = await res.json();
    return j.quotas ? j : null;
  } catch (e) { return null; }
}

// ---------- Compartilhamento de viagem ----------
export async function apiMembers(id) {
  try {
    const res = await fetchAuth(`/api/trips/${id}/members`);
    if (!res.ok) return null;
    return await res.json(); // { role, members, invites }
  } catch (e) { return null; }
}
export async function apiInvite(id, email) {
  try {
    const res = await fetchAuth(`/api/trips/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.status === 400) return { error: "self" };
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json(); // { status, members, invites }
  } catch (e) { return { error: "offline" }; }
}
export async function apiRemoveMember(id, quem) {
  try {
    const res = await fetchAuth(`/api/trips/${id}/members/${encodeURIComponent(quem)}`, { method: "DELETE" });
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json(); // { members, invites }
  } catch (e) { return { error: "offline" }; }
}

// ---------- Chat com o Ali (IA) ----------
export async function apiAli(messages, trip) {
  try {
    const res = await fetchAuth("/api/ali", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, trip }),
    });
    if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json();
  } catch (e) { return { error: "offline" }; }
}

// Conversa com o Ali recebendo o texto conforme ele sai (streaming).
// `onDelta(pedaco)` é chamado a cada trecho. Se o streaming não funcionar,
// devolve { fallback: true } para o chamador usar apiAli() do jeito antigo.
export async function apiAliStream(messages, trip, onDelta) {
  let res;
  try {
    res = await fetchAuth("/api/ali/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, trip }),
    });
  } catch (e) { return { fallback: true }; }

  if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
  if (!res.ok || !res.body || !(res.headers.get("Content-Type") || "").includes("event-stream")) {
    return { fallback: true };
  }

  const leitor = res.body.getReader();
  const decodificador = new TextDecoder();
  let sobra = "";
  let texto = "";
  let recebeuAlgo = false;
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      sobra += decodificador.decode(value, { stream: true });
      const partes = sobra.split("\n\n");
      sobra = partes.pop() || "";
      for (const parte of partes) {
        const linha = parte.split("\n").find((l) => l.startsWith("data:"));
        if (!linha) continue;
        let evento;
        try { evento = JSON.parse(linha.slice(5).trim()); } catch (e) { continue; }
        if (evento.delta) { texto += evento.delta; recebeuAlgo = true; onDelta && onDelta(evento.delta); }
        else if (evento.error) return recebeuAlgo ? { reply: texto } : { error: evento.error, ...evento };
      }
    }
  } catch (e) {
    return recebeuAlgo ? { reply: texto } : { fallback: true };
  }
  return recebeuAlgo ? { reply: texto } : { fallback: true };
}

// Pede ao Ali um roteiro completo para uma viagem nova. Retorna { state } ou { error }.
export async function apiGenerate(params) {
  try {
    const res = await fetchAuth("/api/ali/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json();
  } catch (e) { return { error: "offline" }; }
}

// Gera uma dica do Ali (sob demanda) para uma parada do roteiro.
export async function apiAliDica(stop, trip) {
  try {
    const res = await fetchAuth("/api/ali/dica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stop, trip }),
    });
    if (res.status === 401) { promptToken(); return { error: "unauthorized" }; }
    if (!res.ok) return { error: "http_" + res.status };
    return await res.json();
  } catch (e) { return { error: "offline" }; }
}
