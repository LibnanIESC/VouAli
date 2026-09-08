import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiGet, apiPut, resetSessao, setTokenGetter } from "./api";

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
