import React, { useId } from "react";

/**
 * Capa da viagem quando não há foto.
 *
 * Antes entrava aqui um skyline com a Estátua da Liberdade — herança de quando
 * o app era só a viagem de Nova York. Numa viagem ao Guarujá aquilo estava
 * simplesmente errado.
 *
 * O desenho é feito na proporção em que ele realmente aparece: uma faixa larga
 * e baixa. Cena com muitos elementos — nuvens, ondas, cordilheira — vira
 * listra colorida nesse formato. Aqui há um gesto só: o céu em degradê, o sol
 * e uma encosta atravessando o quadro na diagonal. O canto de baixo fica
 * calmo e escuro de propósito: é onde o nome da viagem é escrito, em branco.
 *
 * É desenho vetorial, não imagem: não pesa no carregamento, aparece sem
 * internet e fica nítido em qualquer tela.
 *
 * A paleta é sorteada pelo id da viagem — sempre a mesma para a mesma viagem,
 * diferente entre viagens. Duas capas lado a lado na lista não saem iguais.
 */
const PALETAS = [
  { ceu: ["#101f3d", "#39497a", "#e8a273"], sol: "#ffdcae", cume: "#3d4f79", base: "#141f38" }, // crepúsculo
  { ceu: ["#08293a", "#256274", "#f3c88f"], sol: "#ffe8bd", cume: "#2c6377", base: "#0b2c37" }, // litoral
  { ceu: ["#331a38", "#7c4257", "#ef9c6f"], sol: "#ffd2a2", cume: "#7d4356", base: "#2a1626" }, // deserto
  { ceu: ["#1d2947", "#525f83", "#d8ab9f"], sol: "#fbe2d0", cume: "#59668a", base: "#212a44" }, // serra
  { ceu: ["#082e28", "#22624f", "#f2cb85"], sol: "#ffeab4", cume: "#26654f", base: "#0b2f27" }, // tropical
];

function paletaDe(semente) {
  const s = String(semente || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETAS[h % PALETAS.length];
}

export default function Capa({ semente }) {
  const p = paletaDe(semente);
  // Duas capas na mesma tela não podem dividir os mesmos ids de gradiente.
  const n = useId().replace(/:/g, "");
  const id = (nome) => `${nome}-${n}`;

  return (
    <svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={id("ceu")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.ceu[0]} />
          <stop offset="0.46" stopColor={p.ceu[1]} />
          <stop offset="0.82" stopColor={p.ceu[2]} />
        </linearGradient>
        {/* A encosta não é chapada: clareia um pouco na crista, como a luz que
            ainda bate no alto quando o sol já está baixo. */}
        <linearGradient id={id("encosta")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.cume} />
          <stop offset="1" stopColor={p.base} />
        </linearGradient>
        <radialGradient id={id("brilho")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.sol} stopOpacity="0.46" />
          <stop offset="0.5" stopColor={p.sol} stopOpacity="0.13" />
          <stop offset="1" stopColor={p.sol} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="400" height="180" fill={`url(#${id("ceu")})`} />

      {/* Sol no lado aberto do quadro, onde a encosta já desceu */}
      <circle cx="292" cy="62" r="82" fill={`url(#${id("brilho")})`} />
      <circle cx="292" cy="62" r="21" fill={p.sol} opacity="0.95" />

      {/* Um gesto só: a encosta sobe à esquerda e atravessa descendo */}
      <path fill={`url(#${id("encosta")})`}
        d="M0,180 L0,104 C 28,74 60,54 96,58 C 134,63 160,96 200,112 C 244,129 306,124 348,116 C 370,112 386,116 400,110 L400,180 Z" />
    </svg>
  );
}
