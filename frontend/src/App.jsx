import React, { useState, useEffect } from "react";

const uid = () => Math.random().toString(36).slice(2, 9);
const HELV = '"Manrope", system-ui, -apple-system, sans-serif';
const DISPLAY = '"Baloo 2", "Manrope", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const CREAM = "#FBF4E9", NAVY = "#223A5E", STEEL = "#365D7A", ORANGE = "#F28C28", ORANGE_D = "#DD7D1C", SAND = "#E9D8BF", SAND_L = "#F5E8D4", BROWN = "#7A5A3A";
const STORE_KEY = "nyc-trip-v2";
const PHOTO = "https://images.unsplash.com/photo-1557780486-7347b5578a23?fm=jpg&q=70&w=1600&auto=format&fit=crop";
const HEADER_BG = "linear-gradient(135deg,#1b2f4d 0%,#223A5E 45%,#2c4d70 100%)";
const CARD_DARK = "linear-gradient(135deg,#1c3050 0%,#2b4a6d 100%)";
const HSHADOW = "0 1px 4px rgba(0,0,0,0.45)";

// ---------- Backend persistence (syncs both phones) ----------
const TOKEN_KEY = "trip-token";
function authHeaders() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) { const q = new URLSearchParams(location.search).get("k"); if (q) { t = q; localStorage.setItem(TOKEN_KEY, q); } }
  return t ? { "X-Trip-Token": t } : {};
}
function promptToken() {
  const t = window.prompt("Senha do app (a que voce definiu em TRIP_TOKEN no Railway):");
  if (t) { localStorage.setItem(TOKEN_KEY, t); location.reload(); }
}
async function apiGet() {
  try {
    const res = await fetch("/api/state", { headers: authHeaders() });
    if (res.status === 401) { promptToken(); return null; }
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.state ? j.state : null;
  } catch (e) { return null; }
}
let putTimer = null;
function apiPut(state) {
  clearTimeout(putTimer);
  putTimer = setTimeout(async () => {
    try {
      const res = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(state) });
      if (res.status === 401) promptToken();
    } catch (e) {}
  }, 400);
}

// ---------- Seed data ----------
const seedDays = () => [
  {
    id: "qua", label: "QUA", date: "7 OUT", color: "#6d6e71", line: "S",
    title: "Chegada + Midtown", sub: "Dia leve · vença o jetlag",
    stops: [
      { id: uid(), t: "~7h", n: "Aeroporto → Hotel", d: "Deixar malas (check-in 15h)", getting: "JFK: AirTrain + trem E até 42nd St. EWR: AirTrain + NJ Transit até Penn Station. LGA: ônibus Q70 (grátis) + E/F/M/R.", todo: "Deixar as malas no St James mesmo antes do check-in e sair para o café. Não durma agora — segure até a noite pra vencer o jetlag.", insight: "Compre um chip/eSIM antes de embarcar; o Wi-Fi do metrô é fraco.", link: "", done: false },
      { id: uid(), t: "10h", n: "NY Public Library + Bryant Park", d: "Rose Reading Room", getting: "A pé do hotel, ~8 min. Entrada pela 5ª Av com 42nd St.", todo: "Suba até a Rose Reading Room (salão monumental). Bryant Park ao lado tem café e cadeiras — ótimo primeiro respiro na cidade.", insight: "Entrada gratuita. Banheiros limpos aqui — raro e útil em Midtown.", link: "https://www.nypl.org", done: false },
      { id: uid(), t: "11h", n: "Grand Central", d: "Whispering Gallery + almoço", getting: "A pé de Bryant Park, ~5 min pela 42nd St.", todo: "Veja o teto de constelações, a sacada da Apple e teste a Whispering Gallery (fale no canto do arco). Almoce no Urbanspace Vanderbilt ou no Dining Concourse.", insight: "A Whispering Gallery fica na rampa antes da Oyster Bar — fale baixinho na diagonal oposta e a pessoa ouve.", link: "https://www.grandcentralterminal.com", done: false },
      { id: uid(), t: "14h", n: "Rockefeller Center", d: "St. Patrick's + 5ª Av", getting: "A pé, ~10 min subindo a 5ª Avenida.", todo: "Praça central, Catedral St. Patrick's do outro lado da avenida e vitrines da 5ª Av. Deixe Top of the Rock pro último dia.", insight: "Só entre em lojas se for comprar — o objetivo aqui é caminhar e situar-se.", link: "https://www.rockefellercenter.com", done: false },
      { id: uid(), t: "15h30", n: "Check-in + cochilo", d: "Descansar até 18h", getting: "Volta ao hotel.", todo: "Banho e cochilo curto (alarme às 18h). Cochilo longo demais atrapalha o sono da noite.", insight: "Regra anti-jetlag: exposição ao sol de manhã, cochilo curto à tarde, dormir no horário local.", link: "", done: false },
      { id: uid(), t: "19h", n: "Times Square à noite", d: "A 2 quadras · dormir cedo", getting: "A pé, ~3 min do hotel.", todo: "Veja os letreiros à noite (é quando impressiona), jantar leve e voltar cedo.", insight: "Ignore os personagens fantasiados que cobram por foto e os vendedores de ingresso de ônibus turístico.", link: "", done: false },
    ],
  },
  {
    id: "qui", label: "QUI", date: "8 OUT", color: "#ee352e", line: "1",
    title: "História Natural + Central Park + Summit", sub: "Trem 1",
    stops: [
      { id: uid(), t: "10h", n: "Museu de História Natural", d: "Trem 1 → 79th · ~3h", getting: "Trem 1 (vermelho) de Times Square-42 St até 79th St. ~10 min.", todo: "Prioridades: baleia azul, dinossauros no 4º andar, Gilder Center e o Rose Center (planetário). 3h é o suficiente.", insight: "Ingresso 'General Admission' é o que basta — as exposições especiais raramente valem o extra. Compre online com horário.", link: "https://www.amnh.org", done: false },
      { id: uid(), t: "13h", n: "Almoço", d: "Columbus Ave", getting: "A pé, saindo do museu.", todo: "Opções rápidas na Columbus Ave / Amsterdam Ave.", insight: "Fuja das armadilhas turísticas coladas no museu; ande 2 quadras pro lado e o preço cai.", link: "", done: false },
      { id: uid(), t: "14h", n: "Central Park", d: "Bethesda · Bow Bridge", getting: "Entre pela W 81st St, ao lado do museu.", todo: "Atravesse oeste→leste: Great Lawn → Belvedere Castle → Bethesda Terrace → Bow Bridge → The Mall. Sai na 5ª Av/59th.", insight: "Bethesda Terrace e Bow Bridge são as fotos icônicas. Fim de tarde tem a melhor luz.", link: "https://www.centralparknyc.org", done: false },
      { id: uid(), t: "17h30", n: "SUMMIT One Vanderbilt", d: "Pôr do sol ~18h25", getting: "Trem 4/5/6 até Grand Central; o Summit é colado na estação.", todo: "Salas de espelhos, piso de vidro e os elevadores externos. Pegue horário 60–90 min antes do pôr do sol pra ver dia e noite.", insight: "Multa de US$10/pessoa se atrasar +20 min do horário marcado. Quinta é mais barato e vazio que fim de semana.", link: "https://summitov.com", done: false },
      { id: uid(), t: "20h", n: "Jantar em Koreatown", d: "W 32nd St", getting: "A pé de Grand Central, ~12 min, ou 1 parada de metrô.", todo: "Churrasco coreano na W 32nd St. Muitos lugares abrem até tarde.", insight: "Vá onde tiver fila de coreanos. Peça o combo de carnes — rende pra dois.", link: "", done: false },
    ],
  },
  {
    id: "sex", label: "SEX", date: "9 OUT", color: "#0039a6", line: "A",
    title: "Cloisters + Met + Rooftop", sub: "Trem A · 1 ingresso só",
    stops: [
      { id: uid(), t: "10h", n: "Met Cloisters", d: "Trem A → 190 St · ~2h", getting: "Trem A EXPRESSO de 42nd St até 190 St (~35 min). Depois 5 min a pé pelo Fort Tryon Park.", todo: "Mosteiro medieval com as tapeçarias do Unicórnio, claustros e vista do Rio Hudson. ~2h bastam.", insight: "O ingresso do Met cobre Cloisters + 5ª Av NO MESMO DIA. Compre um só, comece pelo Cloisters.", link: "https://www.metmuseum.org", done: false },
      { id: uid(), t: "12h30", n: "Ônibus M4 na porta", d: "Direto até o Met", getting: "Ônibus M4 na saída do Cloisters desce a 5ª Av até o Met (~55 min, cênico, sem baldeação). Paga com o mesmo OMNY.", todo: "Trecho de descanso — sente do lado direito pra ver o parque e a avenida.", insight: "Alternativa mais rápida: trem A de volta + M86. Mas o M4 direto é mais tranquilo.", link: "", done: false },
      { id: uid(), t: "14h", n: "Almoço", d: "E 86th St", getting: "Salte perto da 86th St.", todo: "Opções na Madison/Lexington antes de entrar no museu.", insight: "", link: "", done: false },
      { id: uid(), t: "15h", n: "The Met", d: "Dendur · Egito · Armaduras", getting: "5ª Av com 82nd St.", todo: "Prioridades: Templo de Dendur, alas do Egito, Armaduras, Pintura Europeia e a Ala Americana. Sexta abre até 21h.", insight: "Depois das 17h o museu esvazia bastante — guarde as alas mais concorridas pro fim.", link: "https://www.metmuseum.org", done: false },
      { id: uid(), t: "20h", n: "230 Fifth Rooftop", d: "Drink c/ Empire State de frente", getting: "Trem 6 de 86th St até 28th St; 5 min a pé até 230 5th Ave.", todo: "Rooftop com o Empire State inteiro iluminado na sua frente. Drinks ~US$16-18. Chegue antes das 20h pra pegar mesa na parte aberta.", insight: "Costumam emprestar robe nas noites frias — em outubro você vai querer. Sem reserva na maioria das noites.", link: "https://www.230-fifth.com", done: false },
    ],
  },
  {
    id: "sab", label: "SÁB", date: "10 OUT", color: "#b933ad", line: "7",
    title: "Vessel + High Line + Village + Broadway", sub: "Trem 7",
    stops: [
      { id: uid(), t: "10h", n: "Vessel", d: "Trem 7 → Hudson Yards", getting: "Trem 7 (roxo) de Times Square, 1 parada até 34 St-Hudson Yards.", todo: "Estrutura em favo de mel, suba os lances para a vista do pátio. Reserve o ingresso gratuito com horário pelo site, se estiver exigindo.", insight: "Emenda direto no início da High Line, que começa ali do lado.", link: "https://www.hudsonyardsnewyork.com", done: false },
      { id: uid(), t: "10h30", n: "High Line", d: "Caminhando p/ o sul", getting: "Acesso pela 34th St ou 30th St.", todo: "Parque suspenso sobre a antiga linha férrea. Caminhe para o sul rumo a Chelsea. ~1h com paradas.", insight: "Vá de manhã pra evitar a multidão da tarde. Tem bancos e arte pelo caminho.", link: "https://www.thehighline.org", done: false },
      { id: uid(), t: "12h", n: "Chelsea Market", d: "Los Tacos No. 1", getting: "A High Line passa por cima; desça na 16th St.", todo: "Mercado gastronômico coberto. Los Tacos No. 1 é obrigatório. Também tem lobster roll e doces.", insight: "Lotado na hora do almoço — coma um pouco antes ou depois do pico.", link: "https://www.chelseamarket.com", done: false },
      { id: uid(), t: "13h30", n: "Little Island", d: "Reservar horário", getting: "Fim da High Line em Gansevoort; Little Island fica no Pier 55, a 5 min a pé.", todo: "Parque flutuante sobre 'tulipas' de concreto, com anfiteatro e mirantes. Reserve o ingresso gratuito com horário.", insight: "Pequeno — 30-40 min bastam. Ótimo pôr do sol se trocar a ordem do dia.", link: "https://littleisland.org", done: false },
      { id: uid(), t: "15h", n: "West Village", d: "Washington Sq Park", getting: "A pé, para leste.", todo: "Ruas arborizadas, Bleecker St, o arco de Washington Square. Clima boêmio.", insight: "Bom para café e vitrines sem pressa.", link: "", done: false },
      { id: uid(), t: "16h30", n: "SoHo", d: "Compras · Broadway/Prince", getting: "A pé, seguindo para o sul/leste.", todo: "Prédios de ferro fundido e lojas na Broadway e Prince St.", insight: "Preços iguais aos outlets em muitas marcas, mas sem o deslocamento.", link: "", done: false },
      { id: uid(), t: "20h", n: "Show da Broadway", d: "🎭", getting: "Metrô de volta ao Theater District (perto do hotel).", todo: "Chegue 30 min antes. Guarde o ingresso digital acessível offline.", insight: "Sessões de qui/sex custam menos que sábado. Confira a bilheteria oficial ou TodayTix pra descontos.", link: "https://www.todaytix.com", done: false },
    ],
  },
  {
    id: "dom", label: "DOM", date: "11 OUT", color: "#00933c", line: "5",
    title: "Estátua + Wall St + Ponte + Dumbo", sub: "Trem 1 · dia longo",
    stops: [
      { id: uid(), t: "8h15", n: "Trem 1 → South Ferry", d: "Chegar cedo p/ a fila", getting: "Trem 1 (vermelho) até a última estação, South Ferry.", todo: "Vá direto pra fila da segurança em Battery Park — é o gargalo do dia.", insight: "Quanto mais cedo, menor a fila. A primeira balsa costuma sair ~9h.", link: "", done: false },
      { id: uid(), t: "9h", n: "Balsa da Estátua", d: "Só bilheteria oficial", getting: "Embarque em Battery Park (Castle Clinton).", todo: "Balsa inclui Liberty Island, Ellis Island e os dois museus. US$26,30/adulto.", insight: "COMPRE SÓ no site oficial ou dentro do Castle Clinton — há golpistas vendendo ingresso falso no local.", link: "https://www.cityexperiences.com/new-york/city-cruises/statue", done: false },
      { id: uid(), t: "9h30", n: "Liberty + Ellis Island", d: "1h30 cada", getting: "A balsa faz o trajeto Liberty → Ellis → volta.", todo: "Liberty Island: pedestal e vistas. Ellis Island: museu da imigração, emocionante.", insight: "Acesso à coroa esgota meses antes e não estava no plano — o pedestal já entrega ótima vista.", link: "https://www.nps.gov/stli", done: false },
      { id: uid(), t: "14h30", n: "Touro de Wall St", d: "Fearless Girl · Trinity", getting: "A pé de Battery Park, subindo para o Financial District.", todo: "Charging Bull + Fearless Girl (Bowling Green), NYSE, Federal Hall e a Trinity Church.", insight: "O touro vive cercado de gente — chegue pela traseira pra foto mais rápida.", link: "", done: false },
      { id: uid(), t: "16h30", n: "Ponte do Brooklyn a pé", d: "~45 min", getting: "Entrada perto do City Hall (lado Manhattan).", todo: "Travessia a pé até o Brooklyn, ~45 min com fotos.", insight: "Fique na faixa de pedestres (a de bike é separada e os ciclistas não perdoam).", link: "", done: false },
      { id: uid(), t: "17h30", n: "Dumbo", d: "Foto na Washington St", getting: "Descendo da ponte, siga para o Brooklyn Bridge Park.", todo: "Foto clássica do Manhattan Bridge entre os prédios na Washington St, Jane's Carousel e o parque à beira-rio.", insight: "A foto da Washington St é a mais icônica — melhor luz no fim de tarde.", link: "", done: false },
      { id: uid(), t: "18h25", n: "Pôr do sol no Pier 1", d: "Skyline de frente 🌅", getting: "Brooklyn Bridge Park, Pier 1 / Pebble Beach.", todo: "Pôr do sol com o skyline de Manhattan de frente. Jantar no Time Out Market ou Juliana's Pizza.", insight: "Volta pelo trem F (York St) ou A/C (High St).", link: "", done: false },
    ],
  },
  {
    id: "seg", label: "SEG", date: "12 OUT", color: "#ff6319", line: "E",
    title: "11/09 + Oculus + MoMA + Teleférico", sub: "Trem E · feriado",
    stops: [
      { id: uid(), t: "9h", n: "Memorial + Museu 11/09", d: "Grátis online 7h da seg", getting: "Trem E até World Trade Center (última parada).", todo: "Espelhos d'água do memorial (livre) e o museu (~3h, forte emocionalmente).", insight: "Segunda libera ingressos gratuitos no site a partir das 7h, por ordem de chegada — coloque o despertador.", link: "https://www.911memorial.org", done: false },
      { id: uid(), t: "12h30", n: "Oculus + Eataly", d: "St. Paul's Chapel", getting: "O Oculus é colado no memorial.", todo: "Estrutura branca em forma de asas (estação/shopping). Almoço no Eataly (4 WTC) e a St. Paul's Chapel do lado.", insight: "Do Oculus dá pra ir a pé pra quase tudo do Financial District.", link: "", done: false },
      { id: uid(), t: "14h30", n: "MoMA", d: "Entrar até 15h", getting: "Trem E de WTC até 5 Av/53 St (direto).", todo: "Van Gogh (Noite Estrelada), Monet, Picasso, Warhol. Fecha 17h30, então entre até 15h.", insight: "Segunda é o dia mais tranquilo. Compre online com horário.", link: "https://www.moma.org", done: false },
      { id: uid(), t: "17h30", n: "Teleférico Roosevelt", d: "E 59th + 2nd Ave", getting: "A pé do MoMA, ~15 min, até a estação do Roosevelt Island Tram (E 59th St com 2nd Ave).", todo: "Travessia aérea sobre o East River no pôr do sol. Paga com OMNY normal — entra no teto semanal.", insight: "Do outro lado: Four Freedoms Park e vista do skyline. Volte de teleférico ou trem F.", link: "https://rioc.ny.gov/302/Tram", done: false },
      { id: uid(), t: "18h", n: "Roosevelt Island", d: "Pôr do sol + volta", getting: "Chegada pela estação do teleférico.", todo: "Caminhe até a ponta sul (Four Freedoms Park) pra vista do skyline.", insight: "⚠️ Desfile do Columbus Day fecha a 5ª Av entre 11h30-15h — não atravesse Midtown a pé nesse horário.", link: "", done: false },
    ],
  },
  {
    id: "ter", label: "TER", date: "13 OUT", color: "#996633", line: "M",
    title: "Último dia", sub: "Ajustar pelo voo",
    stops: [
      { id: uid(), t: "11h", n: "Checkout", d: "Deixar malas no hotel", getting: "No hotel.", todo: "Checkout às 11h, deixe as malas na bagageira do hotel.", insight: "Voo cedo? Saia do hotel 4h antes (JFK/EWR).", link: "", done: false },
      { id: uid(), t: "—", n: "Top of the Rock", d: "Se o voo for à noite", getting: "A pé, no Rockefeller Center.", todo: "A melhor vista de Midtown — inclui o Empire State no quadro (coisa que o próprio Empire não tem).", insight: "De manhã tem menos fila. Compre online com horário.", link: "https://www.rockefellercenter.com/attractions/top-of-the-rock-observation-deck", done: false },
      { id: uid(), t: "—", n: "Compras finais", d: "Macy's · 5ª Av", getting: "Herald Square / 5ª Avenida.", todo: "Últimas compras. Roupas abaixo de US$110/peça são isentas de imposto.", insight: "Guarde as sacolas com o hotel se sobrar tempo antes do aeroporto.", link: "", done: false },
    ],
  },
];

const seedBudget = () => [
  { id: uid(), k: "Metrô (2 pessoas)", v: 70, spent: 0, tag: "transporte" },
  { id: uid(), k: "Met + Cloisters", v: 60, spent: 0, tag: "ingressos" },
  { id: uid(), k: "MoMA", v: 60, spent: 0, tag: "ingressos" },
  { id: uid(), k: "História Natural", v: 62, spent: 0, tag: "ingressos" },
  { id: uid(), k: "Summit", v: 120, spent: 0, tag: "ingressos" },
  { id: uid(), k: "Museu 11/09", v: 72, spent: 0, tag: "ingressos" },
  { id: uid(), k: "Balsa Estátua", v: 53, spent: 0, tag: "ingressos" },
  { id: uid(), k: "Broadway (2)", v: 240, spent: 0, tag: "ingressos" },
  { id: uid(), k: "Alimentação (7 dias)", v: 850, spent: 0, tag: "comida" },
];

const seedPrebuy = () => [
  { id: uid(), text: "Ingresso do Met (online, p/ 9/10)", done: false },
  { id: uid(), text: "Summit — horário do pôr do sol", done: false },
  { id: uid(), text: "Balsa da Estátua (site oficial)", done: false },
  { id: uid(), text: "Museu 11/09 (grátis seg, 7h)", done: false },
  { id: uid(), text: "Little Island — horário", done: false },
  { id: uid(), text: "Show da Broadway", done: false },
];

const seedNotes = () => [
  { id: uid(), title: "💳 Regra do metrô (OMNY)", body: "US$3 por viagem, teto de US$35 na semana. Cada um usa sempre o mesmo cartão/celular, senão o teto não conta. O teleférico entra no mesmo teto." },
  { id: uid(), title: "🧥 Outubro em NY", body: "12–22°C, noite fria e vento nos observatórios. Camadas + tênis. Gorjeta 18–20%, imposto 8,875% nunca vem na etiqueta." },
];

const TOTAL_BUDGET = 3000;

// ---------- Icons ----------
const MapIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z" />
    <path d="M9 4v13.5M15 6.5V20" />
    <circle cx="15" cy="11" r="1.6" fill={color} stroke="none" />
  </svg>
);
const MoneyIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" />
  </svg>
);
const PinIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" />
  </svg>
);

// ---------- Style helpers ----------
const btn = (bg, extra = {}) => ({ background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: HELV, ...extra });
const field = { width: "100%", boxSizing: "border-box", border: "1.5px solid #ddd", borderRadius: 9, padding: "10px 12px", fontSize: 14, fontFamily: HELV, marginTop: 4, resize: "vertical" };
const lbl = { fontSize: 12, fontWeight: 800, color: "#555", letterSpacing: 0.5, marginTop: 12, display: "block" };

// ---------- Overlays ----------
function Sheet({ children, onClose }) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const startY = React.useRef(0);
  const onDown = (e) => { startY.current = e.clientY; setDragging(true); setTouched(true); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} };
  const onMove = (e) => { if (!dragging) return; setDy(Math.max(0, e.clientY - startY.current)); };
  const end = () => { if (!dragging) return; setDragging(false); if (dy > 120) onClose(); else setDy(0); };
  const overlayAlpha = Math.max(0.15, 0.45 - dy / 700);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${overlayAlpha})`, display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 50, transition: dragging ? "none" : "background .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#f5f4f0", borderRadius: "20px 20px 0 0", overflow: "hidden", transform: touched ? `translateY(${dy}px)` : undefined, transition: dragging ? "none" : "transform .26s cubic-bezier(.4,0,.2,1)", animation: touched ? "none" : "slideUp .25s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.28)" }}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
          style={{ position: "relative", height: 34, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.22)" }} />
          <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Fechar"
            style={{ position: "absolute", right: 12, top: 5, width: 30, height: 30, borderRadius: 15, border: "none", background: "rgba(0,0,0,0.30)", color: "#fff", fontSize: 15, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function StopDetail({ stop, color, onEdit, onDelete, onClose }) {
  const Section = ({ title, children }) => children ? (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 14.5, color: "#333", lineHeight: 1.55, marginTop: 5, fontWeight: 500 }}>{children}</div>
    </div>
  ) : null;
  return (
    <Sheet onClose={onClose}>
      <div style={{ background: color, color: "#fff", padding: "18px 22px 20px", borderRadius: "0" }}>
        <div style={{ fontSize: 13, fontWeight: 800, opacity: .9 }}>{stop.t}</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{stop.n}</div>
        {stop.d && <div style={{ fontSize: 14, opacity: .92, marginTop: 4, fontWeight: 500 }}>{stop.d}</div>}
      </div>
      <div style={{ padding: "6px 22px 26px" }}>
        <Section title="Como chegar">{stop.getting}</Section>
        <Section title="O que fazer">{stop.todo}</Section>
        <Section title="Insight">{stop.insight}</Section>
        {stop.link && (
          <div style={{ marginTop: 18 }}>
            <a href={stop.link} target="_blank" rel="noreferrer" style={{ ...btn(color), display: "inline-block", textDecoration: "none" }}>Abrir link oficial ↗</a>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button onClick={onEdit} style={{ ...btn("#223A5E"), flex: 1 }}>Editar</button>
          <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>
        </div>
      </div>
    </Sheet>
  );
}

function StopForm({ stop, color, onSave, onClose }) {
  const [f, setF] = useState(stop || { t: "", n: "", d: "", getting: "", todo: "", insight: "", link: "" });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{stop ? "Editar parada" : "Nova parada"}</div>
        <label style={lbl}>Nome</label>
        <input style={field} value={f.n} onChange={up("n")} placeholder="Ex: Empire State Building" />
        <label style={lbl}>Horário</label>
        <input style={field} value={f.t} onChange={up("t")} placeholder="Ex: 15h" />
        <label style={lbl}>Resumo</label>
        <input style={field} value={f.d} onChange={up("d")} placeholder="Uma linha curta" />
        <label style={lbl}>Como chegar</label>
        <textarea style={field} rows={2} value={f.getting} onChange={up("getting")} />
        <label style={lbl}>O que fazer</label>
        <textarea style={field} rows={2} value={f.todo} onChange={up("todo")} />
        <label style={lbl}>Insight</label>
        <textarea style={field} rows={2} value={f.insight} onChange={up("insight")} />
        <label style={lbl}>Link</label>
        <input style={field} value={f.link} onChange={up("link")} placeholder="https://" />
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ ...btn("#fff", { color: "#666", border: "1.5px solid #ccc" }), flex: 1 }}>Cancelar</button>
          <button onClick={() => f.n.trim() && onSave(f)} style={{ ...btn(color), flex: 1 }}>Salvar</button>
        </div>
      </div>
    </Sheet>
  );
}

function BudgetForm({ item, onSave, onClose, onDelete }) {
  const [f, setF] = useState(item || { k: "", v: 0, spent: 0, tag: "outros" });
  const up = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value || 0) : e.target.value });
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{item ? "Editar item" : "Novo item"}</div>
        <label style={lbl}>Descrição</label>
        <input style={field} value={f.k} onChange={up("k")} placeholder="Ex: Uber do aeroporto" />
        <label style={lbl}>Categoria</label>
        <input style={field} value={f.tag} onChange={up("tag")} placeholder="ingressos / comida / transporte…" />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Planejado (US$)</label>
            <input type="number" style={field} value={f.v} onChange={up("v", true)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Gasto (US$)</label>
            <input type="number" style={field} value={f.spent} onChange={up("spent", true)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {item && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
          <button onClick={() => f.k.trim() && onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
        </div>
      </div>
    </Sheet>
  );
}

function TextForm({ title, initial, fields, onSave, onClose, onDelete, canDelete }) {
  const [f, setF] = useState(initial);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{title}</div>
        {fields.map((fl) => (
          <div key={fl.k}>
            <label style={lbl}>{fl.label}</label>
            {fl.area
              ? <textarea style={field} rows={3} value={f[fl.k] || ""} onChange={up(fl.k)} />
              : <input style={field} value={f[fl.k] || ""} onChange={up(fl.k)} placeholder={fl.ph || ""} />}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {canDelete && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
          <button onClick={() => onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- App ----------
// ---------- Background scene (always renders; swap for a real photo when hosting) ----------
const Skyline = () => (
  <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
    style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, opacity: 0.9 }}>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F5E8D4" /><stop offset="0.6" stopColor="#FBF4E9" /><stop offset="1" stopColor="#FBF4E9" />
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b9cad9" /><stop offset="1" stopColor="#8ba6bd" />
      </linearGradient>
      <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#F28C28" stopOpacity="0.55" /><stop offset="1" stopColor="#F28C28" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="flame" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffd873" /><stop offset="1" stopColor="#ff9d3c" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* sky + sun + clouds */}
    <rect x="0" y="0" width="400" height="548" fill="url(#sky)" />
    <circle cx="322" cy="118" r="70" fill="url(#sun)" />
    <circle cx="322" cy="118" r="24" fill="#F28C28" opacity="0.45" />
    <g fill="#ffffff" opacity="0.55">
      <ellipse cx="90" cy="120" rx="46" ry="15" /><ellipse cx="130" cy="128" rx="34" ry="12" />
      <ellipse cx="300" cy="200" rx="40" ry="12" /><ellipse cx="255" cy="90" rx="30" ry="10" />
    </g>

    {/* distant hazy skyline */}
    <g fill="#E9D8BF">
      <rect x="0" y="486" width="26" height="62" /><rect x="30" y="470" width="20" height="78" />
      <rect x="300" y="478" width="24" height="70" /><rect x="330" y="464" width="18" height="84" />
      <rect x="356" y="492" width="26" height="56" /><rect x="380" y="472" width="20" height="76" />
    </g>

    {/* Lower Manhattan cluster */}
    <g>
      <rect x="120" y="452" width="20" height="96" fill="#365D7A" />
      <rect x="142" y="470" width="16" height="78" fill="#4d6f92" />
      <rect x="160" y="430" width="22" height="118" fill="#2f4f70" />
      <rect x="230" y="466" width="18" height="82" fill="#4d6f92" />
      <rect x="250" y="440" width="24" height="108" fill="#365D7A" />
      <rect x="276" y="474" width="16" height="74" fill="#4d6f92" />
      {/* One World Trade Center */}
      <polygon points="196,548 196,392 200,378 214,378 218,392 218,548" fill="#3f6188" />
      <polygon points="207,392 207,548 218,548 218,392" fill="#223A5E" />
      <line x1="207" y1="378" x2="207" y2="338" stroke="#7a97b8" strokeWidth="2.5" />
    </g>

    {/* water */}
    <rect x="0" y="546" width="400" height="254" fill="url(#water)" />
    <g fill="#ffffff" opacity="0.12">
      <rect x="0" y="596" width="400" height="4" /><rect x="0" y="648" width="400" height="5" /><rect x="0" y="712" width="400" height="4" />
    </g>

    {/* Statue of Liberty (foreground) */}
    <g transform="translate(58,532) scale(0.82)">
      <ellipse cx="16" cy="198" rx="52" ry="10" fill="#7A5A3A" />
      <rect x="-10" y="180" width="52" height="18" rx="1" fill="#8a7a63" />
      <rect x="2" y="150" width="28" height="32" fill="#a2937a" />
      <polygon points="4,150 28,150 24,70 8,70" fill="#365D7A" />
      <polygon points="16,150 28,150 24,70 16,70" fill="#223A5E" opacity="0.55" />
      <polygon points="8,70 24,70 22,54 10,54" fill="#365D7A" />
      <rect x="1" y="64" width="8" height="22" fill="#365D7A" />
      <rect x="-3" y="74" width="9" height="15" fill="#223A5E" />
      <circle cx="16" cy="48" r="7" fill="#365D7A" />
      <g fill="#365D7A">
        <polygon points="16,29 14.5,41 17.5,41" /><polygon points="10,32 12.5,42 14,40.5" /><polygon points="22,32 19.5,42 18,40.5" />
        <polygon points="6,38 10.5,44 11.5,42" /><polygon points="26,38 21.5,44 20.5,42" />
      </g>
      <polygon points="21,56 25,55 33,22 30,20" fill="#365D7A" />
      <circle cx="32" cy="16" r="6" fill="url(#flame)" /><circle cx="32" cy="16" r="2.6" fill="#ffe08a" />
    </g>
  </svg>
);

export default function App() {
  const [days, setDays] = useState(seedDays);
  const [budget, setBudget] = useState(seedBudget);
  const [prebuy, setPrebuy] = useState(seedPrebuy);
  const [notes, setNotes] = useState(seedNotes);
  const [active, setActive] = useState("qua");
  const [tab, setTab] = useState("roteiro");
  const [ov, setOv] = useState(null);
  const [reorder, setReorder] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await apiGet();
      if (r) {
        if (r.days) setDays(r.days);
        if (r.budget) setBudget(r.budget);
        if (r.prebuy) setPrebuy(r.prebuy);
        if (r.notes) setNotes(r.notes);
      }
    })();
  }, []);
  const persist = (next) => {
    const snap = { days, budget, prebuy, notes, ...next };
    apiPut(snap);
  };

  const day = days.find((d) => d.id === active) || days[0];
  const totalStops = days.reduce((a, d) => a + d.stops.length, 0);
  const totalDone = days.reduce((a, d) => a + d.stops.filter((s) => s.done).length, 0);
  const overallPct = totalStops ? Math.round((totalDone / totalStops) * 100) : 0;
  const planned = budget.reduce((a, b) => a + Number(b.v || 0), 0);
  const spent = budget.reduce((a, b) => a + Number(b.spent || 0), 0);
  const remaining = TOTAL_BUDGET - planned;

  const setDaysP = (nd) => { setDays(nd); persist({ days: nd }); };
  const setBudgetP = (nb) => { setBudget(nb); persist({ budget: nb }); };
  const setPrebuyP = (np) => { setPrebuy(np); persist({ prebuy: np }); };
  const setNotesP = (nn) => { setNotes(nn); persist({ notes: nn }); };

  const toggleStop = (sid) =>
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.map((s) => s.id === sid ? { ...s, done: !s.done } : s) } : d));
  const moveStop = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= day.stops.length) return;
    const stops = [...day.stops];
    [stops[idx], stops[j]] = [stops[j], stops[idx]];
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops } : d));
  };
  const saveStop = (data) => {
    const exists = day.stops.some((s) => s.id === data.id);
    const stops = exists ? day.stops.map((s) => s.id === data.id ? data : s) : [...day.stops, { ...data, id: uid(), done: false }];
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops } : d));
    setOv(null);
  };
  const deleteStop = (sid) => {
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.filter((s) => s.id !== sid) } : d));
    setOv(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, display: "flex", justifyContent: "center", fontFamily: HELV, position: "relative", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} button{transition:transform .08s ease} button:active{transform:scale(.96)} @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`}</style>
      <Skyline />
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, rgba(251,244,233,0) 0%, rgba(251,244,233,0.18) 45%, rgba(251,244,233,0.62) 100%)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: 440, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, rgba(27,47,77,0.95) 0%, rgba(34,58,94,0.9) 50%, rgba(44,77,112,0.86) 100%)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff", padding: "18px 20px 16px", boxShadow: "0 2px 14px rgba(10,20,40,0.32)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 27, lineHeight: 0.9, color: CREAM }}>Vou</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 27, lineHeight: 0.9, color: ORANGE }}>Ali</span>
                <span style={{ width: 11, height: 11, marginBottom: 6, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
              </div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.05 }}>New York</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 600, marginTop: 1 }}>6 – 13 Outubro</div>
            </div>
            <div style={{ textAlign: "right", paddingTop: 2 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: 700, letterSpacing: 1 }}>PROGRESSO</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: DISPLAY, color: ORANGE }}>{overallPct}%</div>
            </div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.28)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${overallPct}%`, background: ORANGE, transition: "width .4s ease" }} />
          </div>
        </div>

        {/* Day selector */}
        {tab === "roteiro" && (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "14px 16px", background: "linear-gradient(135deg, rgba(27,47,77,0.82), rgba(44,77,112,0.66))", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
            {days.map((d) => {
              const sel = d.id === active;
              const complete = d.stops.length && d.stops.every((s) => s.done);
              return (
                <button key={d.id} onClick={() => setActive(d.id)} style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: sel ? 1 : 0.55 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: d.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, border: sel ? "3px solid #fff" : "3px solid transparent", position: "relative" }}>
                    {d.line}
                    {complete && <div style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: ORANGE, border: "2px solid #223A5E", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                  </div>
                  <div style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{d.label}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 90px" }}>
          {tab === "roteiro" && (
            <>
              <div style={{ fontSize: 11, letterSpacing: 1.4, color: BROWN, fontWeight: 500, marginBottom: 4, fontFamily: MONO, textTransform: "uppercase" }}>{day.date} · {day.sub}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: NAVY, letterSpacing: -0.3, fontFamily: DISPLAY }}>{day.title}</h2>
                <button onClick={() => setReorder(!reorder)} style={btn(reorder ? day.color : "#fff", { color: reorder ? "#fff" : day.color, border: `1.5px solid ${day.color}`, padding: "7px 12px", flex: "0 0 auto", fontSize: 13 })}>{reorder ? "Concluir" : "↕ Reordenar"}</button>
              </div>
              <div style={{ fontSize: 13, color: STEEL, marginBottom: 18, fontWeight: 600 }}>{reorder ? "Use as setas para mudar a ordem" : `${day.stops.filter((s) => s.done).length} de ${day.stops.length} paradas · toque para detalhes`}</div>

              <div style={{ position: "relative" }}>
                {day.stops.map((s, i) => {
                  const last = i === day.stops.length - 1;
                  const arrow = (dir, disabled) => (
                    <button onClick={() => moveStop(i, dir)} disabled={disabled} style={{ width: 30, height: 25, borderRadius: 7, border: "1.5px solid #ccc", background: "#fff", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, fontWeight: 900, fontSize: 14, color: "#223A5E", lineHeight: 1 }}>{dir < 0 ? "↑" : "↓"}</button>
                  );
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: last ? 0 : 22 }}>
                      {!last && !reorder && <div style={{ position: "absolute", left: 12, top: 26, bottom: 0, width: 3, background: s.done ? day.color : "#d9d7d0" }} />}
                      {reorder ? (
                        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4, zIndex: 1 }}>
                          {arrow(-1, i === 0)}
                          {arrow(1, last)}
                        </div>
                      ) : (
                        <div onClick={() => toggleStop(s.id)} style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", zIndex: 1, cursor: "pointer", background: s.done ? day.color : "#fff", border: `3px solid ${s.done ? day.color : "#c9c7c0"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {s.done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                        </div>
                      )}
                      <div onClick={reorder ? undefined : () => setOv({ kind: "detail", stop: s })} style={{ flex: 1, background: "#fff", borderRadius: 13, padding: "12px 14px", boxShadow: "0 5px 16px rgba(10,22,55,0.18)", opacity: (s.done && !reorder) ? 0.6 : 1, cursor: reorder ? "default" : "pointer", borderLeft: `4px solid ${day.color}`, border: reorder ? `1.5px solid ${day.color}` : undefined, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: "#223A5E", textDecoration: (s.done && !reorder) ? "line-through" : "none" }}>{s.n}</span>
                            <span style={{ flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: day.color }}>{s.t}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2, fontWeight: 500 }}>{s.d}</div>
                        </div>
                        {!reorder && <span style={{ color: "#cfcdc6", fontSize: 20, fontWeight: 700, flex: "0 0 auto" }}>›</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!reorder && <button onClick={() => setOv({ kind: "stopForm", stop: null })} style={btn("#fff", { color: day.color, border: `1.5px dashed ${day.color}`, width: "100%", marginTop: 20 })}>+ Adicionar parada</button>}
            </>
          )}

          {tab === "orcamento" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Orçamento</h2>
                <button onClick={() => setOv({ kind: "budgetForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Item</button>
              </div>
              <div style={{ background: CARD_DARK, color: "#fff", borderRadius: 16, padding: "18px 20px", marginBottom: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Teto</span><span style={{ fontWeight: 800 }}>US$ {TOTAL_BUDGET.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Planejado</span><span style={{ fontWeight: 800 }}>US$ {planned.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Já gasto</span><span style={{ fontWeight: 800 }}>US$ {spent.toLocaleString()}</span></div>
                <div style={{ height: 1, background: "#2a2a2a", margin: "12px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14, fontWeight: 700 }}>Sobra p/ compras</span><span style={{ fontWeight: 800, fontSize: 24, color: remaining < 0 ? "#ef4444" : "#F28C28" }}>US$ {remaining.toLocaleString()}</span></div>
              </div>
              {budget.map((b) => (
                <div key={b.id} onClick={() => setOv({ kind: "budgetForm", item: b })} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 4px 14px rgba(10,22,55,0.14)", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#223A5E" }}>{b.k}</div>
                    <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{b.tag}{b.spent ? ` · gasto US$ ${b.spent}` : ""}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#223A5E" }}>US$ {b.v}</div>
                </div>
              ))}
            </>
          )}

          {tab === "info" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Comprar antes</h2>
                <button onClick={() => setOv({ kind: "prebuyForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Item</button>
              </div>
              {prebuy.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", borderRadius: 10, padding: "13px 14px", marginBottom: 8, boxShadow: "0 4px 14px rgba(10,22,55,0.14)" }}>
                  <div onClick={() => setPrebuyP(prebuy.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} style={{ width: 22, height: 22, borderRadius: 6, flex: "0 0 auto", cursor: "pointer", background: p.done ? "#F28C28" : "#fff", border: `2px solid ${p.done ? "#F28C28" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>{p.done && "✓"}</div>
                  <span onClick={() => setOv({ kind: "prebuyForm", item: p })} style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#223A5E", textDecoration: p.done ? "line-through" : "none", opacity: p.done ? 0.5 : 1, cursor: "pointer" }}>{p.text}</span>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 14px" }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Notas</h2>
                <button onClick={() => setOv({ kind: "noteForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Nota</button>
              </div>
              {notes.map((nt) => (
                <div key={nt.id} onClick={() => setOv({ kind: "noteForm", item: nt })} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 10, boxShadow: "0 4px 14px rgba(10,22,55,0.14)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#223A5E", marginBottom: 6 }}>{nt.title}</div>
                  <div style={{ fontSize: 13, color: "#665", lineHeight: 1.5, fontWeight: 500 }}>{nt.body}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Bottom tabs */}
        <div style={{ position: "sticky", bottom: 0, display: "flex", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.5)", padding: "8px 0 10px", boxShadow: "0 -3px 16px rgba(10,20,50,0.16)" }}>
          {[
            { id: "roteiro", label: "Roteiro", Icon: MapIcon },
            { id: "orcamento", label: "Orçamento", Icon: MoneyIcon },
            { id: "info", label: "Info", Icon: PinIcon },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <t.Icon color={on ? "#223A5E" : "#b5b3ac"} />
                <span style={{ fontSize: 11, fontWeight: 800, color: on ? "#223A5E" : "#b5b3ac" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlays */}
      {ov?.kind === "detail" && (
        <StopDetail stop={ov.stop} color={day.color} onClose={() => setOv(null)}
          onEdit={() => setOv({ kind: "stopForm", stop: ov.stop })}
          onDelete={() => deleteStop(ov.stop.id)} />
      )}
      {ov?.kind === "stopForm" && (
        <StopForm stop={ov.stop} color={day.color} onClose={() => setOv(null)} onSave={saveStop} />
      )}
      {ov?.kind === "budgetForm" && (
        <BudgetForm item={ov.item} onClose={() => setOv(null)}
          onSave={(data) => { const nb = ov.item ? budget.map((b) => b.id === data.id ? data : b) : [...budget, { ...data, id: uid() }]; setBudgetP(nb); setOv(null); }}
          onDelete={() => { setBudgetP(budget.filter((b) => b.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "prebuyForm" && (
        <TextForm title={ov.item ? "Editar item" : "Novo item"} canDelete={!!ov.item}
          initial={ov.item || { text: "" }} fields={[{ k: "text", label: "Texto" }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.text?.trim()) return; const np = ov.item ? prebuy.map((p) => p.id === data.id ? data : p) : [...prebuy, { id: uid(), text: data.text, done: false }]; setPrebuyP(np); setOv(null); }}
          onDelete={() => { setPrebuyP(prebuy.filter((p) => p.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "noteForm" && (
        <TextForm title={ov.item ? "Editar nota" : "Nova nota"} canDelete={!!ov.item}
          initial={ov.item || { title: "", body: "" }}
          fields={[{ k: "title", label: "Título", ph: "Ex: 🚕 Táxi do aeroporto" }, { k: "body", label: "Texto", area: true }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.title?.trim()) return; const nn = ov.item ? notes.map((n) => n.id === data.id ? data : n) : [...notes, { ...data, id: uid() }]; setNotesP(nn); setOv(null); }}
          onDelete={() => { setNotesP(notes.filter((n) => n.id !== ov.item.id)); setOv(null); }} />
      )}
    </div>
  );
}
