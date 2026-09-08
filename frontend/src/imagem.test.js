import { describe, it, expect } from "vitest";
import { medidaDaCapa, bytesDoDataUri, LARGURA_CAPA, ALTURA_CAPA, TETO_BYTES } from "./imagem";

// A capa viaja com a viagem — vai embutida, para quem viaja junto também ver.
// Por isso o tamanho não é detalhe: cada quilobyte é trafegado toda vez que a
// lista de viagens é buscada.

describe("medidaDaCapa", () => {
  it("encolhe a foto do celular até caber, sem distorcer", () => {
    const r = medidaDaCapa(4032, 3024);            // foto típica de câmera
    expect(r.largura).toBeLessThanOrEqual(LARGURA_CAPA);
    expect(r.altura).toBeLessThanOrEqual(ALTURA_CAPA);
    expect(r.largura / r.altura).toBeCloseTo(4032 / 3024, 2);
  });

  it("respeita o lado que limita, seja a largura ou a altura", () => {
    expect(medidaDaCapa(3000, 500).largura).toBe(LARGURA_CAPA);   // panorâmica
    expect(medidaDaCapa(500, 3000).altura).toBe(ALTURA_CAPA);     // retrato
  });

  it("não amplia: ampliar só engorda o arquivo sem melhorar nada", () => {
    expect(medidaDaCapa(320, 200)).toEqual({ largura: 320, altura: 200 });
  });

  it("devolve zero quando não há dimensão para trabalhar", () => {
    [[0, 0], [null, 100], [100, undefined], ["", ""], [-5, -5]].forEach(([l, a]) => {
      expect(medidaDaCapa(l, a)).toEqual({ largura: 0, altura: 0 });
    });
  });

  it("nunca devolve dimensão zerada para uma imagem que existe", () => {
    const r = medidaDaCapa(10000, 3);
    expect(r.largura).toBeGreaterThan(0);
    expect(r.altura).toBeGreaterThan(0);
  });
});

describe("bytesDoDataUri", () => {
  const uri = (b64) => `data:image/jpeg;base64,${b64}`;

  it("mede o peso real, descontando o enchimento do base64", () => {
    expect(bytesDoDataUri(uri("QQ=="))).toBe(1);        // "A"
    expect(bytesDoDataUri(uri("QUI="))).toBe(2);        // "AB"
    expect(bytesDoDataUri(uri("QUJD"))).toBe(3);        // "ABC"
  });

  it("o base64 infla ~4/3, e é por isso que o teto é medido aqui", () => {
    const cheio = uri("A".repeat(4 * 1024));
    expect(bytesDoDataUri(cheio)).toBeCloseTo(3 * 1024, -1);
  });

  it("aguenta lixo sem quebrar", () => {
    [null, undefined, "", "sem virgula", 42].forEach((x) => {
      expect(bytesDoDataUri(x)).toBe(0);
    });
  });

  it("o teto cabe numa lista de viagens sem pesar demais", () => {
    expect(TETO_BYTES).toBeLessThanOrEqual(150 * 1024);
  });
});
