import { describe, it, expect } from "vitest";
import { quantos, resumoDoPacote, ehPaywall, origemDoSaldo, resta, textoDoPaywall, falaDoAliSemSaldo, linhaDoSaldo, linhaDasCompras } from "./saldo";

describe("quantos", () => {
  it("concorda no singular e no plural", () => {
    expect(quantos(1, "gen")).toBe("1 roteiro");
    expect(quantos(3, "gen")).toBe("3 roteiros");
    expect(quantos(1, "chat")).toBe("1 conversa");
    expect(quantos(100, "chat")).toBe("100 conversas");
    expect(quantos(50, "tip")).toBe("50 dicas");
  });

  it("nunca mostra número negativo nem lixo", () => {
    expect(quantos(-2, "tip")).toBe("0 dicas");
    expect(quantos(undefined, "chat")).toBe("0 conversas");
  });
});

describe("resumoDoPacote", () => {
  it("descreve o pacote na ordem roteiro, conversa, dica", () => {
    expect(resumoDoPacote({ chat: 100, gen: 3, tip: 50 })).toBe("3 roteiros, 100 conversas e 50 dicas");
  });

  it("some com o que o pacote não traz (recarga de um tipo só)", () => {
    expect(resumoDoPacote({ chat: 100, gen: 0, tip: 0 })).toBe("100 conversas");
    expect(resumoDoPacote({ gen: 1, tip: 3 })).toBe("1 roteiro e 3 dicas");
    expect(resumoDoPacote(null)).toBe("");
  });
});

describe("ehPaywall", () => {
  it("só reconhece o aviso de sem saldo", () => {
    expect(ehPaywall({ error: "paywall", motivo: "dias" })).toBe(true);
    expect(ehPaywall({ error: "quota" })).toBe(false);
    expect(ehPaywall({ reply: "oi" })).toBe(false);
    expect(ehPaywall(null)).toBe(false);
  });
});

describe("origemDoSaldo", () => {
  const deg = (vale, n = 1) => ({ chat: n, gen: n, tip: n, vale_nesta_viagem: vale });

  it("créditos pagos vêm antes de tudo — os próprios ou os do dono da viagem", () => {
    expect(origemDoSaldo({ tem_pacote: true, degustacao: deg(true) })).toBe("pacote");
    expect(origemDoSaldo({ tem_pacote: false, dono: { creditos: { chat: 3, gen: 0, tip: 0 } }, degustacao: deg(false) })).toBe("pacote");
    expect(origemDoSaldo({ tem_pacote: false, dono: { creditos: { chat: 0, gen: 0, tip: 0 } }, degustacao: deg(false) })).toBe("nada");
  });

  it("sem pacote, a degustação só conta se valer nesta viagem", () => {
    expect(origemDoSaldo({ tem_pacote: false, degustacao: deg(true) })).toBe("degustacao");
    expect(origemDoSaldo({ tem_pacote: false, degustacao: deg(false) })).toBe("nada");
  });

  it("degustação zerada não é saldo", () => {
    expect(origemDoSaldo({ tem_pacote: false, degustacao: deg(true, 0) })).toBe("nada");
    expect(origemDoSaldo(null)).toBe("nada");
  });
});

describe("resta", () => {
  it("lê o disponível e nunca devolve negativo", () => {
    expect(resta({ disponivel: { chat: 4 } }, "chat")).toBe(4);
    expect(resta({ disponivel: { chat: -1 } }, "chat")).toBe(0);
    expect(resta({ disponivel: {} }, "gen")).toBe(0);
    expect(resta(null, "tip")).toBe(0);
  });
});

describe("textoDoPaywall", () => {
  it("viagem longa: diz o limite da degustação e o tamanho desta", () => {
    const t = textoDoPaywall({ tipo: "gen", motivo: "dias", dias: 8, max_dias: 4 });
    expect(t.titulo).toBe("Esta viagem pede o Pacote VouAli");
    expect(t.texto).toContain("até 4 dias");
    expect(t.texto).toContain("esta tem 8");
  });

  it("viagem sem dias conhecidos não inventa um tamanho", () => {
    const t = textoDoPaywall({ motivo: "dias", dias: 0, max_dias: 4 });
    expect(t.texto).not.toContain("esta tem");
  });

  it("pacote esgotado: nomeia o que acabou", () => {
    expect(textoDoPaywall({ tipo: "chat", motivo: "esgotado" }).titulo).toBe("As conversas do pacote acabaram");
    expect(textoDoPaywall({ tipo: "gen", motivo: "esgotado" }).titulo).toBe("Os roteiros do pacote acabaram");
    expect(textoDoPaywall({ tipo: "tip", motivo: "esgotado" }).titulo).toBe("As dicas do pacote acabaram");
  });

  it("degustação usada", () => {
    expect(textoDoPaywall({ tipo: "chat", motivo: "sem_passe" }).titulo).toBe("Sua degustação do Ali acabou");
  });

  it("aberta por conta própria: sem tom de bloqueio", () => {
    expect(textoDoPaywall().titulo).toBe("Pacote VouAli");
    expect(textoDoPaywall({}).titulo).toBe("Pacote VouAli");
  });

  it("nunca promete uso ilimitado", () => {
    for (const motivo of ["dias", "esgotado", "sem_passe", undefined]) {
      const t = textoDoPaywall({ tipo: "chat", motivo, dias: 9, max_dias: 4 });
      expect((t.titulo + t.texto).toLowerCase()).not.toContain("ilimitad");
    }
  });
});

describe("falaDoAliSemSaldo", () => {
  it("garante, em todos os casos, que o que foi salvo continua lá", () => {
    for (const motivo of ["dias", "esgotado", "sem_passe"]) {
      expect(falaDoAliSemSaldo({ motivo, dias: 8, max_dias: 4 })).toMatch(/continua/);
    }
  });

  it("viagem longa cita os dois números", () => {
    const f = falaDoAliSemSaldo({ motivo: "dias", dias: 8, max_dias: 4 });
    expect(f).toContain("até 4 dias");
    expect(f).toContain("esta tem 8");
  });

  it("não fala mais em limite do mês nem em renovação", () => {
    for (const motivo of ["dias", "esgotado", "sem_passe"]) {
      const f = falaDoAliSemSaldo({ motivo, dias: 8, max_dias: 4 });
      expect(f).not.toMatch(/mês|renova no dia/);
    }
  });
});

describe("linhaDasCompras", () => {
  it("explica de onde veio o saldo", () => {
    expect(linhaDasCompras({ pacotes: 2, reembolsados: 1 })).toBe("2 pacotes comprados · 1 reembolsado");
    expect(linhaDasCompras({ pacotes: 3, reembolsados: 2 })).toBe("3 pacotes comprados · 2 reembolsados");
    expect(linhaDasCompras({ pacotes: 1, reembolsados: 0 })).toBe("1 pacote comprado");
  });

  it("quem nunca comprou (ou servidor antigo) não vê nada", () => {
    expect(linhaDasCompras({ pacotes: 0, reembolsados: 0 })).toBe("");
    expect(linhaDasCompras(undefined)).toBe("");
  });
});

describe("linhaDoSaldo", () => {
  it("mostra os três tipos, inclusive os zerados", () => {
    expect(linhaDoSaldo({ gen: 2, chat: 99, tip: 50 })).toBe("2 roteiros · 99 conversas · 50 dicas");
    expect(linhaDoSaldo({ gen: 0, chat: 1, tip: 3 })).toBe("0 roteiros · 1 conversa · 3 dicas");
  });

  it("tudo zerado é esgotado", () => {
    expect(linhaDoSaldo({ gen: 0, chat: 0, tip: 0 })).toBe("esgotado");
    expect(linhaDoSaldo(null)).toBe("esgotado");
  });
});

describe("pacote reembolsado", () => {
  it("a tela do pacote explica o estorno e garante que nada some", () => {
    const t = textoDoPaywall({ tipo: "chat", motivo: "reembolsado" });
    expect(t.titulo).toBe("Seu Pacote VouAli foi reembolsado");
    expect(t.texto).toMatch(/continua nas suas viagens/);
  });

  it("o Ali não fala em degustação quando o motivo é reembolso", () => {
    const f = falaDoAliSemSaldo({ motivo: "reembolsado" });
    expect(f).toMatch(/reembolsado/);
    expect(f).not.toMatch(/degustação/);
  });
});

describe("o pacote é da conta, não de uma viagem", () => {
  it("nenhum texto promete o pacote para uma viagem só", () => {
    const textos = [undefined, "dias", "esgotado", "sem_passe", "reembolsado"].flatMap((motivo) => {
      const t = textoDoPaywall({ tipo: "chat", motivo, dias: 8, max_dias: 4 });
      return [t.titulo, t.texto, falaDoAliSemSaldo({ motivo, dias: 8, max_dias: 4 })];
    });
    for (const t of textos) expect(t).not.toMatch(/desta viagem|passe/i);
  });
});
