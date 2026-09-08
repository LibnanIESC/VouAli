import { describe, it, expect } from "vitest";
import { digitarNumero, numeroDoCampo, campoDeNumero, estimativaGeracao } from "./utils";

// O campo de valor mostrava "0130" enquanto o estado já valia 130: o React
// não corrige a tela de um <input type="number"> porque compara com `!=`, e
// "0130" != 130 é falso. Estas provas fixam a normalização que resolveu isso.
describe("digitarNumero", () => {
  it("come o zero à esquerda, que era o defeito relatado", () => {
    expect(digitarNumero("0130")).toBe("130");
    expect(digitarNumero("00")).toBe("0");
    expect(digitarNumero("000995")).toBe("995");
  });

  it("preserva o zero que faz sentido", () => {
    expect(digitarNumero("0")).toBe("0");
    expect(digitarNumero("0.5")).toBe("0.5");
    expect(digitarNumero("0.")).toBe("0.");
  });

  it("aceita vírgula, porque é assim que se digita em português", () => {
    expect(digitarNumero("1234,50")).toBe("1234.50");
  });

  it("descarta o que não é número", () => {
    expect(digitarNumero("R$ 1.800 reais")).toBe("1.800");
    expect(digitarNumero("abc")).toBe("");
    expect(digitarNumero("-50")).toBe("50");
  });

  it("admite um separador decimal só", () => {
    expect(digitarNumero("1.2.3")).toBe("1.23");
  });

  it("deixa o campo vazio em paz — apagar tudo é permitido", () => {
    expect(digitarNumero("")).toBe("");
    expect(digitarNumero(null)).toBe("");
    expect(digitarNumero(undefined)).toBe("");
  });

  it("é estável: normalizar duas vezes dá o mesmo resultado", () => {
    ["0130", "1234,50", "0.5", "", "1.2.3", "R$ 90"].forEach((t) => {
      expect(digitarNumero(digitarNumero(t))).toBe(digitarNumero(t));
    });
  });
});

describe("ida e volta entre campo e número", () => {
  it("converte o texto do campo no valor guardado", () => {
    expect(numeroDoCampo("130")).toBe(130);
    expect(numeroDoCampo("0130")).toBe(130);
    expect(numeroDoCampo("1234,50")).toBe(1234.5);
  });

  it("campo vazio ou pela metade vale zero, nunca NaN", () => {
    [" ", "", ".", "abc", null].forEach((t) => {
      const n = numeroDoCampo(t);
      expect(n).toBe(0);
      expect(Number.isNaN(n)).toBe(false);
    });
  });

  it("zero abre o campo VAZIO, para digitar sem ter que apagar antes", () => {
    expect(campoDeNumero(0)).toBe("");
    expect(campoDeNumero(undefined)).toBe("");
    expect(campoDeNumero("")).toBe("");
  });

  it("o valor salvo reaparece igual ao reabrir o formulário", () => {
    [130, 1800, 3000, 1234.5].forEach((n) => {
      expect(numeroDoCampo(campoDeNumero(n))).toBe(n);
    });
  });
});

// A tela de espera prometia "uns 15 segundos" e uma viagem de 10 dias levou
// 1min26 — a espera normal virava sensação de app travado.
describe("estimativaGeracao", () => {
  it("acompanha a medição real: 10 dias ficam perto de 1min26", () => {
    const { segundos } = estimativaGeracao(10);
    expect(segundos).toBeGreaterThanOrEqual(75);
    expect(segundos).toBeLessThanOrEqual(95);
  });

  it("cresce com o número de dias", () => {
    const seq = [1, 3, 7, 12].map((d) => estimativaGeracao(d).segundos);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(new Set(seq).size).toBe(seq.length);
  });

  it("não promete precisão que não temos", () => {
    expect(estimativaGeracao(1).texto).toBe("menos de um minuto");
    expect(estimativaGeracao(10).texto).toBe("cerca de um minuto e meio");
  });

  it("tem teto: nem a viagem mais longa vira uma estimativa absurda", () => {
    expect(estimativaGeracao(365).segundos).toBe(180);
    expect(estimativaGeracao(365).texto).toBe("cerca de três minutos");
  });

  it("aguenta entrada faltando ou inválida", () => {
    [0, -3, undefined, null, "", "abc"].forEach((d) => {
      const r = estimativaGeracao(d);
      expect(r.segundos).toBeGreaterThan(0);
      expect(r.texto).toBeTruthy();
    });
  });
});
