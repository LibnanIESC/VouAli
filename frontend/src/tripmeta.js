// Helpers de metadados da viagem: moeda, datas e interesses.

export const CURRENCIES = [
  { code: "US$", label: "US$ · Dólar" },
  { code: "€", label: "€ · Euro" },
  { code: "R$", label: "R$ · Real" },
  { code: "£", label: "£ · Libra" },
  { code: "¥", label: "¥ · Iene" },
  { code: "CHF", label: "CHF · Franco suíço" },
  { code: "A$", label: "A$ · Dólar australiano" },
  { code: "C$", label: "C$ · Dólar canadense" },
];

// Sugere a moeda a partir do destino (o usuário pode trocar depois).
const HINTS = [
  ["€", ["portugal", "lisboa", "porto", "espanha", "madri", "madrid", "barcelona", "frança", "franca", "paris", "itália", "italia", "roma", "milão", "milao", "veneza", "alemanha", "berlim", "munique", "bélgica", "belgica", "bruxelas", "bruges", "holanda", "países baixos", "paises baixos", "amsterdã", "amsterda", "amsterdam", "áustria", "austria", "viena", "grécia", "grecia", "atenas", "irlanda", "dublin", "finlândia", "finlandia", "croácia", "croacia"]],
  ["US$", ["estados unidos", "eua", "usa", "new york", "nova york", "nova iorque", "miami", "orlando", "los angeles", "chicago", "las vegas", "boston", "san francisco", "havaí", "havai"]],
  ["R$", ["brasil", "rio de janeiro", "são paulo", "sao paulo", "salvador", "recife", "fortaleza", "florianópolis", "florianopolis", "gramado", "búzios", "buzios"]],
  ["£", ["reino unido", "inglaterra", "londres", "london", "escócia", "escocia", "edimburgo"]],
  ["¥", ["japão", "japao", "tóquio", "toquio", "tokyo", "kyoto", "osaka"]],
  ["CHF", ["suíça", "suica", "zurique", "genebra", "interlaken"]],
  ["A$", ["austrália", "australia", "sydney", "melbourne"]],
  ["C$", ["canadá", "canada", "toronto", "vancouver", "montreal"]],
];
export function guessCurrency(destino) {
  const t = String(destino || "").toLowerCase();
  if (!t.trim()) return "";
  for (const [code, keys] of HINTS) if (keys.some((k) => t.includes(k))) return code;
  return "";
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
};

// Nº de dias entre as datas (inclusivo). 0 quando incompleto/inválido.
export function daysBetween(start, end) {
  const a = parse(start), b = parse(end);
  if (!a || !b) return 0;
  const t0 = Date.UTC(a.y, a.mo, a.d), t1 = Date.UTC(b.y, b.mo, b.d);
  if (t1 < t0) return 0;
  return Math.round((t1 - t0) / 86400000) + 1;
}

// Rótulo amigável: "1 – 12 novembro" ou "28 out – 3 nov".
export function formatDateLabel(start, end) {
  const a = parse(start), b = parse(end);
  if (!a || !b) return "";
  if (a.y === b.y && a.mo === b.mo) return `${a.d} – ${b.d} ${MESES[a.mo]}`;
  const abbr = (i) => MESES[i].slice(0, 3);
  return `${a.d} ${abbr(a.mo)} – ${b.d} ${abbr(b.mo)}`;
}

/**
 * Situação da viagem em relação a hoje — alimenta o selo nos cards da home.
 *
 * Compara só a data (sem hora), no fuso do aparelho: quem viaja pensa em "que
 * dia é hoje", não em instantes. Sem data de início não há selo — melhor não
 * mostrar nada do que mostrar um palpite.
 */
export function tripStatus(start, end, hoje = new Date()) {
  const a = parse(start);
  if (!a) return { estado: "", texto: "", dias: 0 };
  const b = parse(end);
  const inicio = Date.UTC(a.y, a.mo, a.d);
  const fim = b ? Date.UTC(b.y, b.mo, b.d) : inicio;
  const hj = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (hj > fim) return { estado: "passada", texto: "Concluída", dias: 0 };
  if (hj === inicio) return { estado: "andamento", texto: "Começa hoje", dias: 0 };
  if (hj > inicio) return { estado: "andamento", texto: "Em viagem", dias: 0 };
  const dias = Math.round((inicio - hj) / 86400000);
  return { estado: "futura", dias, texto: dias === 1 ? "Amanhã" : `Faltam ${dias} dias` };
}

/**
 * Qual dia do roteiro corresponde a hoje — devolve o ÍNDICE na lista de dias.
 *
 * Cada dia guarda a data como texto livre ("26 NOV"), escrito pela pessoa ou
 * pelo Ali: não dá para fazer conta em cima disso. O que é confiável é a
 * ordem — o dia N do roteiro é o N-ésimo dia a partir da data de início.
 *
 * Fora do período da viagem (antes, depois, ou sem data de início), devolve o
 * primeiro dia. Nunca chuta: na dúvida, começa do começo.
 */
export function diaDeHoje(start, totalDias, hoje = new Date()) {
  const a = parse(start);
  if (!a || !(totalDias > 0)) return 0;
  const inicio = Date.UTC(a.y, a.mo, a.d);
  const hj = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const i = Math.round((hj - inicio) / 86400000);
  return i >= 0 && i < totalDias ? i : 0;
}

export const INTERESSES = ["Museus", "Praia", "Atrações turísticas", "Restaurantes", "Monumentos", "Vida noturna", "Compras", "Natureza"];

// Como a pessoa chega ao destino. Muda o primeiro e o último dia do roteiro e
// o custo de ida e volta — de avião não há pedágio, de carro não há check-in.
// A lista cobre o comum; o que faltar vai no campo livre "Outro".
export const TRANSPORTES = [
  { id: "Avião", emoji: "✈️" },
  { id: "Carro", emoji: "🚗" },
  { id: "Ônibus", emoji: "🚌" },
  { id: "Trem", emoji: "🚆" },
  { id: "Navio", emoji: "🚢" },
];
export const ehTransporteConhecido = (v) => TRANSPORTES.some((t) => t.id === String(v || "").trim());

// Perfil do grupo — muda o TIPO de recomendação do Ali (ritmo, comida, noite).
export const GRUPOS = ["Casal", "Família", "Amigos", "Sozinho(a)"];

// Palpite pelo tamanho/composição do grupo (o usuário pode trocar depois).
export function suggestGroup(adults, children) {
  const a = Number(adults || 0), c = Number(children || 0);
  if (a + c <= 1) return ["Sozinho(a)"];
  if (c > 0) return ["Família"];
  if (a === 2) return ["Casal"];
  return ["Amigos"];
}
