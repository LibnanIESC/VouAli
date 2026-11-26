import { describe, it, expect } from "vitest";
import { avisoDeCreditos } from "./components/ViagemConfigSheet";
import { linhaDaChave } from "./components/ShareSheet";
import { textoDoPaywall, falaDoAliSemSaldo } from "./saldo";
import { montarBackupDeTudo, lerBackups, montarBackup, nomeDoArquivoDeTudo } from "./backup";

describe("aviso de créditos nas Configurações da Viagem", () => {
  it("na própria viagem (ou sem cobrança) não diz nada", () => {
    expect(avisoDeCreditos(null)).toBe("");
    expect(avisoDeCreditos({ dono: null, dono_bloqueou: null })).toBe("");
  });
  it("na viagem de outra pessoa diz de quem o Ali gasta", () => {
    expect(avisoDeCreditos({ dono: { nome: "Ana" } })).toBe("Nesta viagem, o Ali usa primeiro os créditos de Ana.");
    expect(avisoDeCreditos({ dono: null, dono_bloqueou: "Ana" })).toMatch(/usa os seus créditos: Ana preferiu não compartilhar/);
  });
});

describe("chave dos créditos no cartão do convidado", () => {
  it("ligada: lista só o que foi usado dos créditos do dono", () => {
    expect(linhaDaChave({ liberado: true, usou: { chat: 4, gen: 0, tip: 1 } })).toBe("Já usou 4 conversas · 1 dica");
    expect(linhaDaChave({ liberado: true, usou: { chat: 0, gen: 0, tip: 0 } })).toBe("Ainda não usou nenhum crédito seu");
    expect(linhaDaChave({ liberado: true })).toBe("Ainda não usou nenhum crédito seu");
  });
  it("desligada: diz de onde sai o Ali da pessoa", () => {
    expect(linhaDaChave({ liberado: false, usou: { chat: 4 } })).toBe("Não — gasta os da própria conta");
  });
});

describe("dono não liberou os créditos", () => {
  it("o paywall e o Ali explicam, com o nome de quem criou a viagem", () => {
    const t = textoDoPaywall({ motivo: "bloqueado", tipo: "chat", dono_nome: "Ana" });
    expect(t.titulo).toBe("Nesta viagem, o Ali usa os seus créditos");
    expect(t.texto).toMatch(/^Ana preferiu não compartilhar/);
    expect(falaDoAliSemSaldo({ motivo: "bloqueado", dono_nome: "Ana" })).toMatch(/Ana preferiu não compartilhar/);
    expect(textoDoPaywall({ motivo: "bloqueado" }).texto).toMatch(/^Quem criou a viagem/);
  });
});

describe("backup de todas as viagens", () => {
  const viagens = [
    { meta: { id: "a", name: "Miami", startDate: "2026-12-01" }, state: { days: [{ id: "d1" }], budget: [], prebuy: [], notes: [] } },
    { meta: { id: "b", name: "Lisboa" }, state: { days: [], budget: [{ id: "g" }], prebuy: [], notes: [] } },
  ];

  it("um arquivo só, com cada viagem inteira, e de volta", () => {
    const arquivo = montarBackupDeTudo(viagens);
    expect(arquivo.versao).toBe(3);
    expect(arquivo.viagens).toHaveLength(2);
    const lidas = lerBackups(JSON.parse(JSON.stringify(arquivo)));
    expect(lidas.map((v) => v.meta.name)).toEqual(["Miami", "Lisboa"]);
    expect(lidas[0].meta.startDate).toBe("2026-12-01");
    expect(lidas[0].state.days).toHaveLength(1);
    expect(lidas[1].state.budget).toHaveLength(1);
    expect(lidas[0].meta.id).toBeUndefined();
  });

  it("o backup de uma viagem continua sendo lido", () => {
    expect(lerBackups(montarBackup(viagens[0].meta, viagens[0].state)).map((v) => v.meta.name)).toEqual(["Miami"]);
  });

  it("arquivo que não é do VouAli é recusado", () => {
    expect(lerBackups({ viagens: [{ foo: 1 }] })).toBeNull();
    expect(lerBackups({ foo: 1 })).toBeNull();
    expect(lerBackups(null)).toBeNull();
  });

  it("nome do arquivo diz que são todas", () => {
    expect(nomeDoArquivoDeTudo(new Date("2026-11-25T12:00:00Z"))).toBe("vouali-todas-as-viagens-2026-11-25.json");
  });
});
