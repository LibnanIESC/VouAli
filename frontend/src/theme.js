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

// ---------- Helpers de estilo ----------
export const btn = (bg, extra = {}) => ({ background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: HELV, ...extra });
export const field = { width: "100%", boxSizing: "border-box", border: "1.5px solid #ddd", borderRadius: 9, padding: "10px 12px", fontSize: 14, fontFamily: HELV, marginTop: 4, resize: "vertical" };
export const lbl = { fontSize: 12, fontWeight: 800, color: "#555", letterSpacing: 0.5, marginTop: 12, display: "block" };
