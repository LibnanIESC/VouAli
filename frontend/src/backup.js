// ---------- Cópia de segurança de uma viagem ----------
//
// O arquivo antigo levava só o CONTEÚDO — dias, orçamento, compras e notas —
// sem nome, destino nem datas. Isso tornava a restauração impossível no caso em
// que mais se precisa dela: quem exportava, excluía a viagem e importava de
// volta ficava com a conta vazia, porque não havia o que recriar. Pior, a
// importação escrevia por cima da viagem ABERTA — com outra viagem na tela, o
// backup destruía o conteúdo dela em silêncio.
//
// Agora o arquivo carrega a viagem inteira e a importação cria uma viagem nova.
// O leitor continua entendendo os backups do formato antigo: quem já salvou um
// não fica com um arquivo inútil na mão.

// `budget` aqui é o TETO da viagem (um número), não a lista de gastos — essa
// vive no estado. Os dois se chamam igual desde que o teto virou campo da meta.
const CAMPOS_META = [
  "name", "destination", "origin", "transport", "dateLabel", "startDate", "endDate",
  "currency", "interests", "groupTypes", "bg", "adults", "children", "budget",
];

const LISTAS = ["days", "budget", "prebuy", "notes"];

const listaOu = (v) => (Array.isArray(v) ? v : []);

/** Monta o objeto que vai para o arquivo .json. */
export function montarBackup(meta, state) {
  const viagem = {};
  CAMPOS_META.forEach((k) => {
    const v = meta && meta[k];
    if (v !== undefined && v !== null && v !== "") viagem[k] = v;
  });
  return {
    app: "VouAli",
    versao: 2,
    exportedAt: new Date().toISOString(),
    viagem,
    state: {
      days: listaOu(state && state.days),
      budget: listaOu(state && state.budget),
      prebuy: listaOu(state && state.prebuy),
      notes: listaOu(state && state.notes),
    },
  };
}

function dataLegivel(iso) {
  const d = new Date(iso || "");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Lê um arquivo de backup. Devolve `{ meta, state }`, ou `null` quando o
 * conteúdo não parece um backup do VouAli.
 *
 * Aceita os dois formatos: o atual, com `viagem` e `state` separados, e o
 * antigo, em que o estado era a raiz do objeto.
 */
export function lerBackup(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const bruto = obj.state && typeof obj.state === "object" ? obj.state : obj;
  if (!LISTAS.some((k) => Array.isArray(bruto[k]))) return null;

  const state = {
    days: listaOu(bruto.days),
    budget: listaOu(bruto.budget),
    prebuy: listaOu(bruto.prebuy),
    notes: listaOu(bruto.notes),
  };

  const meta = {};
  const origem = obj.viagem && typeof obj.viagem === "object" ? obj.viagem : {};
  CAMPOS_META.forEach((k) => {
    if (origem[k] !== undefined && origem[k] !== null && origem[k] !== "") meta[k] = origem[k];
  });
  if (!String(meta.name || "").trim()) {
    const quando = dataLegivel(obj.exportedAt);
    meta.name = quando ? `Viagem importada · ${quando}` : "Viagem importada";
  }
  return { meta, state };
}

/** "Costa Amalfitana" -> "costa-amalfitana" (sem acento, sem surpresa no disco). */
function fatiar(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Nome do arquivo salvo. Leva o nome da viagem porque com três backups na
 * pasta de downloads a diferença é achar ou não achar o certo.
 */
export function nomeDoArquivo(meta, quando = new Date()) {
  const nome = fatiar(meta && meta.name);
  const dia = new Date(quando).toISOString().slice(0, 10);
  return `vouali-${nome ? `${nome}-` : ""}${dia}.json`;
}
