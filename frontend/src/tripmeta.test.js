import { describe, it, expect } from "vitest";
import { daysBetween, formatDateLabel, guessCurrency, suggestGroup, tripStatus, diaDeHoje, rotuloDoDia, CURRENCIES, GRUPOS, INTERESSES } from "./tripmeta";

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

describe("tripStatus", () => {
  // Viagem de referência: New York, 6 a 13 de outubro de 2026.
  const ny = (dia) => tripStatus("2026-10-06", "2026-10-13", new Date(dia));

  it("conta os dias que faltam", () => {
    expect(ny("2026-10-01T09:00")).toEqual({ estado: "futura", dias: 5, texto: "Faltam 5 dias" });
    expect(ny("2026-08-23T09:00").texto).toBe("Faltam 44 dias");
  });
  it("trata a véspera e o dia da partida", () => {
    expect(ny("2026-10-05T23:59").texto).toBe("Amanhã");
    expect(ny("2026-10-06T00:01")).toEqual({ estado: "andamento", dias: 0, texto: "Começa hoje" });
  });
  it("reconhece a viagem em andamento, inclusive no último dia", () => {
    expect(ny("2026-10-09T14:00").texto).toBe("Em viagem");
    expect(ny("2026-10-13T23:00").texto).toBe("Em viagem");
  });
  it("marca como concluída só depois do fim", () => {
    expect(ny("2026-10-14T00:30")).toEqual({ estado: "passada", dias: 0, texto: "Concluída" });
  });
  it("aceita viagem de um dia só (sem data de fim)", () => {
    expect(tripStatus("2026-10-06", "", new Date("2026-10-06T10:00")).texto).toBe("Começa hoje");
    expect(tripStatus("2026-10-06", "", new Date("2026-10-07T10:00")).estado).toBe("passada");
  });
  it("fica em silêncio quando não há data de início", () => {
    expect(tripStatus("", "2026-10-13").estado).toBe("");
    expect(tripStatus("qualquer", "coisa").texto).toBe("");
  });
});

describe("diaDeHoje", () => {
  // New York: 8 dias de roteiro a partir de 6 de outubro de 2026.
  const ny = (dia, total = 8) => diaDeHoje("2026-10-06", total, new Date(dia));

  it("abre no dia correspondente durante a viagem", () => {
    expect(ny("2026-10-06T08:00")).toBe(0);   // dia 1
    expect(ny("2026-10-09T14:00")).toBe(3);   // dia 4
    expect(ny("2026-10-13T23:30")).toBe(7);   // último dia
  });

  it("abre no primeiro dia fora do período da viagem", () => {
    expect(ny("2026-08-23T10:00")).toBe(0, "antes de viajar");
    expect(ny("2026-10-14T00:10")).toBe(0, "depois de voltar");
  });

  it("não passa do fim quando há menos dias no roteiro do que no período", () => {
    // A viagem dura 8 dias, mas só 3 foram montados.
    expect(ny("2026-10-11T12:00", 3)).toBe(0);
    expect(ny("2026-10-08T12:00", 3)).toBe(2);
  });

  it("usa a virada do dia local, não o horário", () => {
    expect(ny("2026-10-08T23:59")).toBe(2);
    expect(ny("2026-10-09T00:01")).toBe(3);
  });

  it("cai no primeiro dia quando não dá para saber", () => {
    expect(diaDeHoje("", 5)).toBe(0);
    expect(diaDeHoje("qualquer", 5)).toBe(0);
    expect(diaDeHoje("2026-10-06", 0)).toBe(0, "roteiro sem dias");
  });
});

describe("rotuloDoDia", () => {
  // New York: 6 de outubro de 2026 é uma terça-feira.
  const ny = (i) => rotuloDoDia("2026-10-06", i);

  it("dá o dia do mês e o dia da semana de cada dia do roteiro", () => {
    expect(ny(0)).toEqual({ numero: "6", semana: "TER", mes: "OUT" });
    expect(ny(1)).toEqual({ numero: "7", semana: "QUA", mes: "OUT" });
    expect(ny(5)).toEqual({ numero: "11", semana: "DOM", mes: "OUT" });
  });

  it("atravessa a virada de mês", () => {
    const r = rotuloDoDia("2026-10-28", 5);       // 28 out + 5 = 2 nov
    expect(r).toEqual({ numero: "2", semana: "SEG", mes: "NOV" });
  });

  it("atravessa a virada de ano", () => {
    expect(rotuloDoDia("2026-12-30", 3)).toEqual({ numero: "2", semana: "SÁB", mes: "JAN" });
  });

  it("percorre a semana inteira sem repetir nem pular", () => {
    const semana = [0, 1, 2, 3, 4, 5, 6].map((i) => ny(i).semana);
    expect(semana).toEqual(["TER", "QUA", "QUI", "SEX", "SÁB", "DOM", "SEG"]);
  });

  it("devolve null sem data de início — aí o app usa o que está escrito no dia", () => {
    expect(rotuloDoDia("", 0)).toBeNull();
    expect(rotuloDoDia("qualquer", 2)).toBeNull();
    expect(rotuloDoDia("2026-10-06", -1)).toBeNull();
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
