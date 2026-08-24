import { describe, it, expect, vi, beforeEach } from "vitest";
import { passoDoVoltar, salvarArquivo } from "./nativo";

// Estado dos plugins falsos e do "estou no app?", trocados a cada teste.
const cap = { noApp: false, escritos: [], compartilhados: [], erroAoCompartilhar: null };

vi.mock("./api", () => ({ noApp: () => cap.noApp }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: async (o) => { cap.escritos.push(o); },
    getUri: async (o) => ({ uri: `file:///cache/${o.path}` }),
  },
}));
vi.mock("@capacitor/share", () => ({
  Share: {
    share: async (o) => {
      if (cap.erroAoCompartilhar) throw new Error(cap.erroAoCompartilhar);
      cap.compartilhados.push(o);
    },
  },
}));

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

// O "Exportar" dos Ajustes usava só um link de download, que o WebView do
// Android ignora em silêncio: o toque não fazia nada e parecia que tinha dado
// certo. Estas provas fixam os dois caminhos.
describe("salvarArquivo", () => {
  beforeEach(() => {
    cap.noApp = false; cap.escritos = []; cap.compartilhados = []; cap.erroAoCompartilhar = null;
  });

  describe("no site", () => {
    let ancora;
    beforeEach(() => {
      ancora = { click: vi.fn(), remove: vi.fn() };
      globalThis.Blob = class { constructor(p, o) { this.partes = p; this.type = o && o.type; } };
      globalThis.URL = { createObjectURL: () => "blob:falso", revokeObjectURL: vi.fn() };
      globalThis.document = {
        createElement: () => ancora,
        body: { appendChild: vi.fn() },
      };
    });

    it("entrega o arquivo pelo download do navegador", async () => {
      const r = await salvarArquivo("vouali-backup-2026-08-24.json", '{"a":1}');
      expect(r).toEqual({ ok: true });
      expect(ancora.download).toBe("vouali-backup-2026-08-24.json");
      expect(ancora.href).toBe("blob:falso");
      expect(ancora.click).toHaveBeenCalledOnce();
      expect(ancora.remove).toHaveBeenCalledOnce();
    });

    it("não aciona os plugins do celular", async () => {
      await salvarArquivo("x.json", "{}");
      expect(cap.escritos).toHaveLength(0);
      expect(cap.compartilhados).toHaveLength(0);
    });
  });

  describe("dentro do app", () => {
    beforeEach(() => { cap.noApp = true; });

    it("grava no aparelho e entrega ao menu de compartilhamento", async () => {
      const r = await salvarArquivo("backup.json", '{"dias":[]}');
      expect(r).toEqual({ ok: true });
      expect(cap.escritos).toEqual([
        { path: "backup.json", data: '{"dias":[]}', directory: "CACHE", encoding: "utf8" },
      ]);
      expect(cap.compartilhados).toHaveLength(1);
      expect(cap.compartilhados[0].files).toEqual(["file:///cache/backup.json"]);
    });

    it("fechar o menu de compartilhamento não é erro", async () => {
      cap.erroAoCompartilhar = "Share canceled";
      expect(await salvarArquivo("backup.json", "{}")).toEqual({ ok: true, cancelado: true });
    });

    it("falha de verdade é reportada, para o app poder avisar", async () => {
      cap.erroAoCompartilhar = "No Activity found to handle Intent";
      expect(await salvarArquivo("backup.json", "{}")).toEqual({ ok: false });
    });
  });
});
