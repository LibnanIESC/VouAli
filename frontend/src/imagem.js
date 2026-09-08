// ---------- Foto de capa vinda do aparelho ----------
//
// A capa da viagem é sincronizada com quem viaja junto, então ela viaja com a
// viagem: não adianta guardar o caminho de um arquivo que só existe num
// celular. A foto escolhida é reduzida aqui mesmo e guardada embutida.
//
// Por isso o tamanho importa de verdade. A capa aparece atrás do nome da
// viagem, escurecida por um degradê — não é uma galeria de fotos. Uma imagem
// de 720px larga resolve em qualquer tela de celular, e cada quilobyte a mais
// é trafegado toda vez que a lista de viagens é buscada.

export const LARGURA_CAPA = 720;
export const ALTURA_CAPA = 480;
export const TETO_BYTES = 120 * 1024;   // ~160 KB depois do base64

/**
 * Cabe a foto no espaço da capa sem distorcer e sem ampliar.
 *
 * Ampliar não melhora nada: só faz o arquivo crescer para mostrar os mesmos
 * pixels borrados. Uma foto pequena passa intacta.
 */
export function medidaDaCapa(largura, altura, maxL = LARGURA_CAPA, maxA = ALTURA_CAPA) {
  const l = Number(largura) > 0 ? Number(largura) : 0;
  const a = Number(altura) > 0 ? Number(altura) : 0;
  if (!l || !a) return { largura: 0, altura: 0 };
  const escala = Math.min(1, maxL / l, maxA / a);
  return { largura: Math.max(1, Math.round(l * escala)), altura: Math.max(1, Math.round(a * escala)) };
}

/** Quantos bytes um data URI ocupa de verdade (o base64 infla ~4/3). */
export function bytesDoDataUri(uri) {
  const virgula = String(uri || "").indexOf(",");
  if (virgula < 0) return 0;
  const dados = uri.slice(virgula + 1);
  const enchimento = (dados.endsWith("==") && 2) || (dados.endsWith("=") && 1) || 0;
  return Math.max(0, Math.floor((dados.length * 3) / 4) - enchimento);
}

const QUALIDADES = [0.72, 0.6, 0.5, 0.42];

/**
 * Lê a foto escolhida e devolve um data URI pronto para virar capa.
 *
 * Precisa de DOM (Image e canvas), então não roda nos testes — o que dá para
 * provar sem navegador está em `medidaDaCapa` e `bytesDoDataUri`.
 */
export function fotoParaCapa(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !String(arquivo.type || "").startsWith("image/")) {
      reject(new Error("não é uma imagem"));
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { largura, altura } = medidaDaCapa(img.naturalWidth, img.naturalHeight);
      if (!largura) { reject(new Error("imagem sem dimensões")); return; }

      const tela = document.createElement("canvas");
      tela.width = largura;
      tela.height = altura;
      const ctx = tela.getContext("2d");
      if (!ctx) { reject(new Error("sem canvas")); return; }
      ctx.drawImage(img, 0, 0, largura, altura);

      // Vai baixando a qualidade até caber. Uma foto de paisagem cabe na
      // primeira; uma cheia de detalhe pode precisar de mais uma volta.
      let saida = "";
      for (const q of QUALIDADES) {
        saida = tela.toDataURL("image/jpeg", q);
        if (bytesDoDataUri(saida) <= TETO_BYTES) break;
      }
      resolve(saida);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("não consegui ler a imagem")); };
    img.src = url;
  });
}
