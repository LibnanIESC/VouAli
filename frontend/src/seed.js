import { uid } from "./utils";

// ---------- Dados iniciais: viagem de New York (6–13 out) ----------
export const seedDays = () => [
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

export const seedBudget = () => [
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

export const seedPrebuy = () => [
  { id: uid(), text: "Ingresso do Met (online, p/ 9/10)", done: false },
  { id: uid(), text: "Summit — horário do pôr do sol", done: false },
  { id: uid(), text: "Balsa da Estátua (site oficial)", done: false },
  { id: uid(), text: "Museu 11/09 (grátis seg, 7h)", done: false },
  { id: uid(), text: "Little Island — horário", done: false },
  { id: uid(), text: "Show da Broadway", done: false },
];

export const seedNotes = () => [
  { id: uid(), title: "💳 Regra do metrô (OMNY)", body: "US$3 por viagem, teto de US$35 na semana. Cada um usa sempre o mesmo cartão/celular, senão o teto não conta. O teleférico entra no mesmo teto." },
  { id: uid(), title: "🧥 Outubro em NY", body: "12–22°C, noite fria e vento nos observatórios. Camadas + tênis. Gorjeta 18–20%, imposto 8,875% nunca vem na etiqueta." },
];

export const TOTAL_BUDGET = 3000;
