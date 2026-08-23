import { describe, it, expect } from "vitest";
import { passoDoVoltar } from "./nativo";

// O botão voltar do Android só dá para conferir de verdade num celular. Estas
// provas fixam a regra: um degrau por vez, e sair do app é sempre o último.
describe("passoDoVoltar", () => {
  const tela = (extra) => ({ temOverlay: false, aba: "roteiro", vista: "viagem", ...extra });

  it("fecha primeiro o que está por cima, venha de onde vier", () => {
    expect(passoDoVoltar(tela({ temOverlay: true }))).toBe("fecharOverlay");
    expect(passoDoVoltar(tela({ temOverlay: true, aba: "ali" }))).toBe("fecharOverlay");
    expect(passoDoVoltar(tela({ temOverlay: true, vista: "lista" }))).toBe("fecharOverlay");
  });

  it("das outras abas, volta para o Roteiro antes de sair da viagem", () => {
    ["orcamento", "ali", "info"].forEach((aba) => {
      expect(passoDoVoltar(tela({ aba }))).toBe("irParaRoteiro");
    });
  });

  it("do Roteiro, volta para a lista de viagens", () => {
    expect(passoDoVoltar(tela())).toBe("irParaLista");
  });

  it("só sai do app quando já está na lista, sem nada aberto", () => {
    expect(passoDoVoltar(tela({ vista: "lista" }))).toBe("sair");
  });

  it("nunca sai do app enquanto houver uma viagem aberta", () => {
    for (const aba of ["roteiro", "orcamento", "ali", "info"]) {
      for (const temOverlay of [true, false]) {
        expect(passoDoVoltar({ temOverlay, aba, vista: "viagem" })).not.toBe("sair");
      }
    }
  });
});
