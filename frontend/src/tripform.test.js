import { describe, it, expect } from "vitest";
import { mensagemDaFalha } from "./components/TripForm";

describe("falha ao gerar roteiro", () => {
  it("erro técnico mostra o código, para dar para investigar depois", () => {
    expect(mensagemDaFalha({ error: "api_error" })).toEqual({ texto: expect.stringMatching(/não foi descontado/), codigo: "api_error" });
    expect(mensagemDaFalha({ error: "http_502" }).codigo).toBe("http_502");
    expect(mensagemDaFalha({ error: "parse" }).codigo).toBe("parse");
    expect(mensagemDaFalha(null).codigo).toBe("sem_resposta");
  });

  it("sem internet diz que nada foi descontado", () => {
    expect(mensagemDaFalha({ error: "offline" }).texto).toMatch(/nada foi descontado/);
  });

  it("erros conhecidos têm texto próprio", () => {
    expect(mensagemDaFalha({ error: "rate_limited" }).codigo).toBeNull();
    expect(mensagemDaFalha({ error: "quota", limite: 3 }).texto).toMatch(/3 roteiros/);
  });
});
