import { describe, it, expect } from "vitest";
import { daysBetween, formatDateLabel, guessCurrency, suggestGroup, CURRENCIES, GRUPOS, INTERESSES } from "./tripmeta";

describe("daysBetween", () => {
  it("conta os dias de forma inclusiva", () => {
    expect(daysBetween("2026-11-01", "2026-11-12")).toBe(12);
    expect(daysBetween("2026-10-06", "2026-10-13")).toBe(8);
    expect(daysBetween("2026-11-01", "2026-11-01")).toBe(1);
  });
  it("atravessa mês e ano", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(4);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(4);
  });
  it("devolve 0 quando incompleto ou invertido", () => {
    expect(daysBetween("", "2026-11-12")).toBe(0);
    expect(daysBetween("2026-11-12", "2026-11-01")).toBe(0);
    expect(daysBetween("qualquer", "coisa")).toBe(0);
  });
});

describe("formatDateLabel", () => {
  it("usa um mês só quando as datas são do mesmo mês", () => {
    expect(formatDateLabel("2026-11-01", "2026-11-12")).toBe("1 – 12 novembro");
  });
  it("abrevia quando muda de mês", () => {
    expect(formatDateLabel("2026-10-28", "2026-11-03")).toBe("28 out – 3 nov");
  });
  it("devolve vazio sem as duas datas", () => {
    expect(formatDateLabel("2026-11-01", "")).toBe("");
  });
});

describe("guessCurrency", () => {
  it("acerta a moeda pelo destino", () => {
    expect(guessCurrency("Bruxelas, Bélgica")).toBe("€");
    expect(guessCurrency("New York, EUA")).toBe("US$");
    expect(guessCurrency("Londres")).toBe("£");
    expect(guessCurrency("Tóquio, Japão")).toBe("¥");
    expect(guessCurrency("Rio de Janeiro")).toBe("R$");
  });
  it("ignora maiúsculas e acentos do jeito que o usuário digita", () => {
    expect(guessCurrency("PARIS")).toBe("€");
    expect(guessCurrency("nova iorque")).toBe("US$");
  });
  it("não chuta quando não reconhece", () => {
    expect(guessCurrency("Marte")).toBe("");
    expect(guessCurrency("")).toBe("");
  });
  it("só sugere moedas que existem na lista", () => {
    const codigos = CURRENCIES.map((c) => c.code);
    ["Lisboa", "Miami", "Sydney", "Toronto", "Zurique"].forEach((d) => {
      const g = guessCurrency(d);
      if (g) expect(codigos).toContain(g);
    });
  });
});

describe("suggestGroup", () => {
  it("sugere o perfil pela composição", () => {
    expect(suggestGroup(1, 0)).toEqual(["Sozinho(a)"]);
    expect(suggestGroup(2, 0)).toEqual(["Casal"]);
    expect(suggestGroup(2, 3)).toEqual(["Família"]);
    expect(suggestGroup(1, 2)).toEqual(["Família"]);
    expect(suggestGroup(4, 0)).toEqual(["Amigos"]);
  });
  it("sempre devolve um perfil conhecido", () => {
    for (let a = 0; a <= 5; a++) {
      for (let c = 0; c <= 3; c++) {
        suggestGroup(a, c).forEach((g) => expect(GRUPOS).toContain(g));
      }
    }
  });
});

describe("catálogos", () => {
  it("não têm itens duplicados", () => {
    const semDup = (lista) => expect(new Set(lista).size).toBe(lista.length);
    semDup(INTERESSES);
    semDup(GRUPOS);
    semDup(CURRENCIES.map((c) => c.code));
  });
});
