import { describe, it, expect } from "vitest";
import { montarBackup, lerBackup, nomeDoArquivo } from "./backup";

// O caso que motivou tudo isto: exportar a viagem, excluí-la e importar de
// volta deixava a conta vazia. O arquivo não levava nome, destino nem datas, e
// a importação escrevia por cima da viagem ABERTA em vez de recriar a viagem.

const META = {
  id: "abc123", name: "Costa Amalfitana", destination: "Positano, Itália",
  origin: "Belo Horizonte, MG", transport: "Avião", dateLabel: "19 – 27 novembro",
  startDate: "2026-11-19", endDate: "2026-11-27", currency: "€",
  interests: "Praia, Restaurantes", groupTypes: "Casal", bg: "https://exemplo/x.jpg",
  adults: 2, children: 0, budget: 5000,
};

const STATE = {
  days: [{ id: "d1", title: "Chegada", stops: [{ id: "s1", n: "Positano" }] }],
  budget: [{ k: "Hospedagem", v: 1800, spent: 0 }],
  prebuy: [{ id: "p1", t: "Adaptador" }],
  notes: [{ id: "n1", title: "Ferry", body: "Compre na véspera" }],
};

describe("montarBackup", () => {
  it("leva a viagem, não só o conteúdo dela", () => {
    const b = montarBackup(META, STATE);
    expect(b.viagem.name).toBe("Costa Amalfitana");
    expect(b.viagem.startDate).toBe("2026-11-19");
    expect(b.viagem.currency).toBe("€");
    expect(b.viagem.budget).toBe(5000);      // o teto, que vive na meta
    expect(b.state.budget).toEqual(STATE.budget);   // e a lista de gastos, no estado
  });

  it("não guarda campo vazio, para o arquivo não virar ruído", () => {
    const b = montarBackup({ name: "Só o nome", destination: "", currency: undefined, bg: null }, STATE);
    expect(Object.keys(b.viagem)).toEqual(["name"]);
  });

  it("mas zero é valor, não ausência: 0 crianças é uma informação", () => {
    const b = montarBackup({ name: "Casal", adults: 2, children: 0 }, STATE);
    expect(b.viagem.children).toBe(0);
    expect(lerBackup(b).meta.children).toBe(0);
  });

  it("aguenta viagem sem conteúdo nenhum", () => {
    const b = montarBackup(META, null);
    expect(b.state).toEqual({ days: [], budget: [], prebuy: [], notes: [] });
  });
});

describe("lerBackup", () => {
  it("dá a volta completa: o que sai é o que volta", () => {
    const { meta, state } = lerBackup(montarBackup(META, STATE));
    expect(state).toEqual(STATE);
    expect(meta.name).toBe("Costa Amalfitana");
    expect(meta.destination).toBe("Positano, Itália");
  });

  it("não traz o id: importar cria uma viagem, não clona a antiga", () => {
    const { meta } = lerBackup(montarBackup(META, STATE));
    expect(meta.id).toBeUndefined();
  });

  it("ainda entende os backups do formato antigo", () => {
    const antigo = { ...STATE, exportedAt: "2026-09-07T12:00:00.000Z" };
    const { meta, state } = lerBackup(antigo);
    expect(state.days).toEqual(STATE.days);
    expect(meta.name).toContain("Viagem importada");
    expect(meta.name).toContain("2026");          // a data ajuda a identificar
  });

  it("arquivo antigo sem data ainda ganha um nome utilizável", () => {
    expect(lerBackup({ days: [] }).meta.name).toBe("Viagem importada");
  });

  it("completa as listas que faltam, sem quebrar", () => {
    const { state } = lerBackup({ days: [{ id: "d1" }] });
    expect(state).toEqual({ days: [{ id: "d1" }], budget: [], prebuy: [], notes: [] });
  });

  it("recusa o que não é backup do VouAli", () => {
    [null, undefined, 42, "texto", [], {}, { foo: "bar" }, { state: {} }].forEach((x) => {
      expect(lerBackup(x)).toBeNull();
    });
  });
});

describe("nomeDoArquivo", () => {
  const dia = new Date("2026-09-07T15:00:00.000Z");

  it("põe o nome da viagem no arquivo", () => {
    expect(nomeDoArquivo(META, dia)).toBe("vouali-costa-amalfitana-2026-09-07.json");
  });

  it("tira acento e pontuação — o disco não precisa deles", () => {
    expect(nomeDoArquivo({ name: "Férias em São Paulo!" }, dia))
      .toBe("vouali-ferias-em-sao-paulo-2026-09-07.json");
  });

  it("não deixa o nome crescer sem limite nem terminar em hífen", () => {
    const n = nomeDoArquivo({ name: "a".repeat(80) }, dia);
    expect(n.length).toBeLessThan(70);
    expect(n).not.toContain("--");
  });

  it("viagem sem nome ainda gera um arquivo válido", () => {
    expect(nomeDoArquivo({}, dia)).toBe("vouali-2026-09-07.json");
    expect(nomeDoArquivo({ name: "———" }, dia)).toBe("vouali-2026-09-07.json");
  });
});
