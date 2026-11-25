import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { desfechoDoErro, podeComprarAqui, identificar, buscarProduto, comprar, CHAVE_ANDROID, LOJA_URL } from "./compras";
import { apiSaldo, apiSincronizarCompras, apiAli, apiAliDica, setTokenGetter } from "./api";

describe("desfechoDoErro", () => {
  it("fechar a tela do Google é cancelamento, não erro", () => {
    expect(desfechoDoErro({ code: "1" })).toEqual({ cancelado: true });
    expect(desfechoDoErro({ code: 1 })).toEqual({ cancelado: true });
    expect(desfechoDoErro({ userCancelled: true })).toEqual({ cancelado: true });
    expect(desfechoDoErro({ data: { userCancelled: true } })).toEqual({ cancelado: true });
    expect(desfechoDoErro({ message: "Purchase was cancelled." })).toEqual({ cancelado: true });
  });

  it("pagamento em análise não é falha nem sucesso", () => {
    expect(desfechoDoErro({ code: "20" })).toEqual({ pendente: true });
  });

  it("separa falta de rede das demais falhas da loja", () => {
    expect(desfechoDoErro({ code: "10" })).toEqual({ erro: "rede" });
    expect(desfechoDoErro({ code: "5" })).toEqual({ erro: "indisponivel" });
    expect(desfechoDoErro({ code: "3" })).toEqual({ erro: "nao_permitida" });
    expect(desfechoDoErro({ code: "2" })).toEqual({ erro: "loja" });
    expect(desfechoDoErro(null)).toEqual({ erro: "loja" });
  });
});

describe("compras fora do app", () => {
  it("no site não há loja: nada é comprado nem identificado", async () => {
    expect(podeComprarAqui()).toBe(false);
    expect(await identificar("uid-1")).toBe(false);
    expect(await buscarProduto("uid-1", "passe_viagem")).toBeNull();
    expect(await comprar("uid-1", { identifier: "passe_viagem" })).toEqual({ erro: "loja" });
  });

  it("aponta para a página do app certo na loja", () => {
    expect(LOJA_URL).toBe("https://play.google.com/store/apps/details?id=app.vouali");
  });
});

describe("segredos", () => {
  it("só a chave PÚBLICA do SDK mora no app", () => {
    expect(CHAVE_ANDROID).toMatch(/^(goog|test)_/);
    for (const arquivo of ["compras.js", "components/PacoteSheet.jsx", "api.js"]) {
      const codigo = readFileSync(new URL(`./${arquivo}`, import.meta.url), "utf8");
      expect(codigo).not.toMatch(/sk_[A-Za-z0-9]{8,}/);
    }
  });

  it("o preço não está escrito em lugar nenhum do app: vem da loja", () => {
    for (const arquivo of ["compras.js", "saldo.js", "components/PacoteSheet.jsx", "components/AjustesSheet.jsx", "components/AliChat.jsx"]) {
      const codigo = readFileSync(new URL(`./${arquivo}`, import.meta.url), "utf8");
      expect(codigo).not.toMatch(/29[,.]90/);
    }
  });
});

const resposta = (status, corpo) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  json: async () => corpo,
});

describe("apiSaldo", () => {
  beforeEach(() => { setTokenGetter(async () => "token-de-teste"); });

  const SALDO = { cobranca: true, disponivel: { chat: 5, gen: 1, tip: 3 }, degustacao: {}, creditos: { chat: 0, gen: 0, tip: 0 }, tem_pacote: false };

  it("devolve o saldo e pergunta pela viagem certa", async () => {
    const chamadas = [];
    globalThis.fetch = vi.fn(async (u) => { chamadas.push(u); return resposta(200, SALDO); });
    expect(await apiSaldo("ab 12")).toEqual(SALDO);
    expect(chamadas[0]).toContain("/api/saldo?trip=ab%2012");
  });

  it("cobrança desligada no servidor é null — a tela antiga continua valendo", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { cobranca: false }));
    expect(await apiSaldo("t1")).toBeNull();
  });

  it("recusa um 200 que não é saldo, em vez de mostrar zeros a quem pagou", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, { state: null, version: 0 }));
    expect(await apiSaldo("t1")).toBeNull();
    globalThis.fetch = vi.fn(async () => resposta(200, { cobranca: true }));
    expect(await apiSaldo("t1")).toBeNull();
  });

  it("sem rede ou com erro, null", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await apiSaldo("t1")).toBeNull();
    globalThis.fetch = vi.fn(async () => resposta(404, {}));
    expect(await apiSaldo("t1")).toBeNull();
  });
});

describe("apiSincronizarCompras", () => {
  beforeEach(() => { setTokenGetter(async () => "token-de-teste"); });

  it("avisa de qual viagem é a compra — e nunca diz O QUE foi comprado", async () => {
    let corpo;
    globalThis.fetch = vi.fn(async (u, o) => { corpo = JSON.parse(o.body); return resposta(200, { ok: true, novos: 1, saldo: {} }); });
    const r = await apiSincronizarCompras("t1");
    expect(r.novos).toBe(1);
    expect(corpo).toEqual({ trip_id: "t1" });
  });

  it("sem viagem (compra feita na lista ou numa viagem nova) manda corpo vazio", async () => {
    let corpo;
    globalThis.fetch = vi.fn(async (u, o) => { corpo = JSON.parse(o.body); return resposta(200, { ok: true, novos: 0 }); });
    await apiSincronizarCompras(null);
    expect(corpo).toEqual({});
  });

  it("falha de rede vira erro tratável", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await apiSincronizarCompras("t1")).toEqual({ error: "offline" });
    globalThis.fetch = vi.fn(async () => resposta(404, {}));
    expect(await apiSincronizarCompras("t1")).toEqual({ error: "http_404" });
  });
});

describe("pedidos de IA dizem de qual viagem são", () => {
  beforeEach(() => { setTokenGetter(async () => "token-de-teste"); });

  it("conversa e dica mandam trip_id quando há viagem", async () => {
    const corpos = [];
    globalThis.fetch = vi.fn(async (u, o) => { corpos.push(JSON.parse(o.body)); return resposta(200, { reply: "oi", dica: "vá cedo" }); });
    await apiAli([{ role: "user", content: "oi" }], { days: [] }, "t9");
    await apiAliDica({ n: "Coliseu" }, { days: [] }, "t9");
    expect(corpos[0].trip_id).toBe("t9");
    expect(corpos[1].trip_id).toBe("t9");
  });

  it("sem viagem informada, o corpo é o de sempre", async () => {
    let corpo;
    globalThis.fetch = vi.fn(async (u, o) => { corpo = JSON.parse(o.body); return resposta(200, { reply: "oi" }); });
    await apiAli([{ role: "user", content: "oi" }], { days: [] });
    expect(corpo).toEqual({ messages: [{ role: "user", content: "oi" }], trip: { days: [] } });
  });

  it("o aviso de sem saldo chega inteiro a quem chamou", async () => {
    const aviso = { error: "paywall", tipo: "chat", motivo: "dias", dias: 8, max_dias: 4 };
    globalThis.fetch = vi.fn(async () => resposta(200, aviso));
    expect(await apiAli([], {}, "t9")).toEqual(aviso);
  });
});
