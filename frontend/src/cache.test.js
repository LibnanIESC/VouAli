import { describe, it, expect, beforeEach } from "vitest";
import { definirDono, lerViagens, guardarViagens, lerEstado, guardarEstado, limparCache } from "./cache";

// localStorage de mentira: os testes rodam em Node, sem navegador. As chaves
// ficam como propriedades do próprio objeto, que é como o navegador expõe.
function storageFalso() {
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  };
}

const VIAGENS = { active: "t1", list: [{ id: "t1", name: "Itália" }] };
const ESTADO = { days: [{ id: "d1", title: "Chegada" }], budget: [], prebuy: [], notes: [] };

beforeEach(() => {
  globalThis.localStorage = storageFalso();
  definirDono("local");
});

describe("cópia local do roteiro", () => {
  it("devolve o que guardou", () => {
    guardarViagens(VIAGENS);
    guardarEstado("t1", ESTADO);
    expect(lerViagens()).toEqual(VIAGENS);
    expect(lerEstado("t1")).toEqual(ESTADO);
  });

  it("não devolve nada quando nunca guardou", () => {
    expect(lerViagens()).toBeNull();
    expect(lerEstado("t1")).toBeNull();
    expect(lerEstado(undefined)).toBeNull();
  });

  it("separa por conta — um login não pode ver a viagem do outro", () => {
    definirDono("ana");
    guardarEstado("t1", ESTADO);
    definirDono("bruno");
    expect(lerEstado("t1")).toBeNull();
    definirDono("ana");
    expect(lerEstado("t1")).toEqual(ESTADO);
  });

  it("limpar apaga só o que é do dono atual", () => {
    definirDono("ana");
    guardarEstado("t1", ESTADO);
    definirDono("bruno");
    guardarEstado("t9", ESTADO);
    limparCache();                          // o Bruno saiu da conta
    expect(lerEstado("t9")).toBeNull();
    definirDono("ana");
    expect(lerEstado("t1")).toEqual(ESTADO);   // a viagem da Ana não podia sumir
  });

  it("age como se não houvesse cópia quando o conteúdo está corrompido", () => {
    globalThis.localStorage.setItem("vouali:cache:local:trips", "{isso não é json");
    expect(lerViagens()).toBeNull();
  });

  it("não derruba o app quando o storage está cheio ou bloqueado", () => {
    globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => guardarEstado("t1", ESTADO)).not.toThrow();
    expect(() => guardarViagens(VIAGENS)).not.toThrow();
    expect(() => limparCache()).not.toThrow();
  });

  it("ignora pedidos vazios em vez de gravar lixo", () => {
    guardarViagens(null);
    guardarEstado("t1", null);
    guardarEstado(null, ESTADO);
    expect(lerViagens()).toBeNull();
    expect(lerEstado("t1")).toBeNull();
  });
});
