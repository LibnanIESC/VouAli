import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { apiGet, apiPut, apiConfig, apiTrips, resetSessao, setTokenGetter } from "./api";

// O ambiente de teste é node puro: sem navegador, sem localStorage.
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
  clear: () => memoria.clear(),
};

// O app é uma página só: sair da conta não recarrega o JavaScript. O estado da
// sessão (ETag, versão, pendência) vivia em variáveis de módulo e atravessava a
// troca de conta. Numa viagem COMPARTILHADA o id é o mesmo para as duas
// pessoas, então o servidor via a marca da conta anterior, respondia 304 "nada
// mudou", e a segunda conta abria a viagem em branco — pronta para gravar o
// branco por cima do roteiro de todo mundo. Foi assim que uma viagem inteira
// sumiu num teste real.

const ETAG = 'W/"amalfi-4"';

const resposta = (status, corpo, etag) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (h) => (h === "ETag" ? etag || "" : null) },
  json: async () => corpo,
});

const COM_ROTEIRO = { state: { days: [{ id: "d1", stops: [] }], budget: [], prebuy: [], notes: [] }, version: 4 };
const VAZIO = { days: [], budget: [], prebuy: [], notes: [] };

// O PUT é adiado 400ms para não gravar a cada tecla.
const esperarGravacao = () => new Promise((r) => setTimeout(r, 520));

describe("sessão do api.js na troca de conta", () => {
  beforeEach(() => {
    setTokenGetter(async () => "token-de-teste");   // evita o localStorage
    resetSessao();
  });

  it("esquece o ETag da conta anterior", async () => {
    const enviados = [];
    globalThis.fetch = vi.fn(async (_u, o) => {
      enviados.push((o && o.headers) || {});
      return resposta(200, COM_ROTEIRO, ETAG);
    });

    await apiGet();
    await apiGet();
    expect(enviados[1]["If-None-Match"]).toBe(ETAG);   // mesma conta: pergunta leve

    resetSessao();                                     // ← entrou outra conta
    await apiGet();
    expect(enviados[2]["If-None-Match"]).toBeUndefined();
  });

  it("a busca completa ignora a marca mesmo sem reset", async () => {
    const enviados = [];
    globalThis.fetch = vi.fn(async (_u, o) => {
      enviados.push((o && o.headers) || {});
      return resposta(200, COM_ROTEIRO, ETAG);
    });

    await apiGet();
    await apiGet(true);
    expect(enviados[1]["If-None-Match"]).toBeUndefined();
  });

  it("um 304 não conta como viagem carregada", async () => {
    globalThis.fetch = vi.fn(async () => resposta(304, null, ETAG));

    const r = await apiGet();
    expect(r.naoMudou).toBe(true);
    expect(r.state).toBeUndefined();

    apiPut(VAZIO);                    // era aqui que a viagem era apagada
    await esperarGravacao();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);   // só o GET
  });

  it("não grava enquanto a viagem não chegou do servidor", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { ok: true, version: 5 }));

    apiPut(VAZIO);
    await esperarGravacao();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("grava normalmente depois que a viagem chegou", async () => {
    const metodos = [];
    globalThis.fetch = vi.fn(async (_u, o) => {
      metodos.push((o && o.method) || "GET");
      return metodos.length === 1
        ? resposta(200, COM_ROTEIRO, ETAG)
        : resposta(200, { ok: true, version: 5 });
    });

    await apiGet();
    apiPut({ ...VAZIO, days: [{ id: "d1", stops: [] }] });
    await esperarGravacao();
    expect(metodos).toEqual(["GET", "PUT"]);
  });

  it("o reset volta a travar a gravação", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, COM_ROTEIRO, ETAG));
    await apiGet();

    resetSessao();
    globalThis.fetch = vi.fn(async () => resposta(200, { ok: true, version: 5 }));
    apiPut(VAZIO);
    await esperarGravacao();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// O service worker respondia {state:null,version:0} com status 200 a QUALQUER
// rota /api/ quando a rede caía. O app nunca descobria que estava offline: o
// corpo falso virava a config do servidor (e o usuário sumia), e virava também
// a lista de viagens vazia, gravada por cima da cópia local. Estas provas
// existem para que uma resposta inventada nunca mais passe por verdadeira.

describe("service worker", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  it("deixa a API passar direto, sem se meter", () => {
    expect(sw).toMatch(/startsWith\("\/api\/"\)\)\s*return;/);
  });

  it("não fabrica resposta nenhuma", () => {
    expect(sw).not.toContain("new Response");
  });

  // Devolver o index.html no lugar de um `.js` faz o navegador dizer
  // "Unexpected token '<'" — e o app morre na abertura, offline, sem pista.
  it("só usa o index.html como reserva para documentos, nunca para assets", () => {
    const quedas = sw.match(/caches\.match\("\/index\.html"\)/g) || [];
    expect(quedas.length).toBe(1);
    const trechoAssets = sw.slice(sw.indexOf("Assets com hash"));
    expect(trechoAssets).not.toContain("/index.html");
  });

  it("não é registrado dentro do app: lá os arquivos já estão no aparelho", () => {
    expect(html).toMatch(/PROD\s*&&\s*!noApp\s*&&\s*"serviceWorker" in navigator/);
    expect(html).toContain("unregister()");   // e limpa o que ficou instalado
  });
});

describe("apiConfig", () => {
  beforeEach(() => { memoria.clear(); });

  const CFG = { authMode: "firebase", firebase: { apiKey: "k" } };

  it("guarda a config boa e a reusa quando a rede cai", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, CFG));
    expect((await apiConfig()).authMode).toBe("firebase");

    globalThis.fetch = vi.fn(async () => { throw new Error("sem rede"); });
    const off = await apiConfig();
    expect(off.authMode).toBe("firebase");
    expect(off.doCache).toBe(true);
  });

  it("recusa um 200 que não é config, e não o guarda", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { state: null, version: 0 }));
    const r = await apiConfig();
    expect(r.offline).toBe(true);
    expect(localStorage.getItem("vouali:config")).toBeNull();
  });

  it("limpa uma config envenenada que já esteja guardada", async () => {
    localStorage.setItem("vouali:config", JSON.stringify({ state: null, version: 0 }));
    globalThis.fetch = vi.fn(async () => { throw new Error("sem rede"); });

    expect((await apiConfig()).offline).toBe(true);
    expect(localStorage.getItem("vouali:config")).toBeNull();
  });

  it("sem rede e sem nada guardado, assume offline", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("sem rede"); });
    expect((await apiConfig()).offline).toBe(true);
  });
});

describe("apiTrips", () => {
  beforeEach(() => { setTokenGetter(async () => "token-de-teste"); resetSessao(); });

  it("aceita a conta sem viagens — lista vazia é resposta legítima", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { trips: { active: null, list: [] } }));
    expect(await apiTrips()).toEqual({ active: null, list: [] });
  });

  it("recusa corpo sem `trips` em vez de inventar uma lista vazia", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { state: null, version: 0 }));
    expect(await apiTrips()).toBeNull();
  });

  it("recusa `trips` malformado", async () => {
    for (const corpo of [{ trips: null }, { trips: {} }, { trips: { list: "nao-e-lista" } }, {}]) {
      globalThis.fetch = vi.fn(async () => resposta(200, corpo));
      expect(await apiTrips()).toBeNull();
    }
  });
});
