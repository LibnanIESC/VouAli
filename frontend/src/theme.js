// ---------- Tokens de identidade visual (Brand Book VouAli) ----------
// Fontes
export const HELV = '"Manrope", system-ui, -apple-system, sans-serif';
export const DISPLAY = '"Baloo 2", "Manrope", system-ui, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

// Paleta oficial
export const CREAM = "#FBF4E9";     // Areia Clara — fundo padrão
export const NAVY = "#223A5E";      // Azul Marinho — marca, títulos, estrutura
export const STEEL = "#365D7A";     // Azul Petróleo — botões e links
export const ORANGE = "#F28C28";    // Laranja — destaques e ação principal
export const ORANGE_D = "#DD7D1C";  // Laranja escuro — hover
export const SAND = "#E9D8BF";      // Bege — cards e superfícies
export const SAND_L = "#F5E8D4";    // Areia — superfícies secundárias
export const BROWN = "#7A5A3A";     // Marrom — detalhes e texto de apoio

// Superfícies / efeitos
export const PHOTO = "https://images.unsplash.com/photo-1557780486-7347b5578a23?fm=jpg&q=70&w=1600&auto=format&fit=crop";
export const CARD_DARK = "linear-gradient(135deg,#1c3050 0%,#2b4a6d 100%)";
export const HSHADOW = "0 1px 4px rgba(0,0,0,0.45)";

// ---------- Contraste de cor (cores de dia escolhidas pelo usuário) ----------
// Luminância aproximada (0 escuro … 1 claro). Cores vazias/curtas contam como claras.
export function isLight(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}
// Cor de texto que contrasta sobre um fundo dessa cor.
export const onColor = (hex) => (isLight(hex) ? NAVY : "#fff");
// Acento legível sobre superfícies claras: se a cor for clara demais, cai no marinho.
export const readable = (hex) => (isLight(hex) ? NAVY : hex);

// ---------- Tipografia (escala fixa: 12/14/16/20/24/28) & texto ----------
export const FS = { caps: 12, support: 14, body: 16, sub: 20, title: 24, display: 28 };
export const INK = NAVY;        // texto principal sobre superfícies claras
export const INK2 = "#4A5A6E";  // texto de apoio (≈7:1 sobre branco)
export const INK3 = "#66738A";  // rótulos/caps (≈4.8:1 sobre branco)

// ---------- Área segura (barra de status do celular) ----------
// Dentro do app, o conteúdo desenha POR BAIXO da barra do sistema (hora,
// bateria, sinal). Não é escolha nossa: a partir do Android 15 o sistema impõe
// isso e a opção de desligar deixou de existir no Android 16. Então toda tela
// que encosta no topo precisa reservar esse espaço por conta própria.
// No site, `env(safe-area-inset-top)` vale 0 e sobra só o respiro normal.
export const safeTop = (respiro = 0) => `calc(${respiro}px + env(safe-area-inset-top))`;

// ---------- Helpers de estilo ----------
export const btn = (bg, extra = {}) => ({ background: bg, color: "#fff", border: "none", borderRadius: 12, padding: "12px 18px", minHeight: 44, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: HELV, ...extra });
export const field = { width: "100%", boxSizing: "border-box", border: "1.5px solid #ddd", borderRadius: 12, padding: "12px 14px", minHeight: 44, fontSize: 15, fontFamily: HELV, marginTop: 4, resize: "vertical" };
export const lbl = { fontSize: 12, fontWeight: 800, color: "#66738A", letterSpacing: 0.5, marginTop: 12, display: "block" };
