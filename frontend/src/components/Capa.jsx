import React, { useId } from "react";

/**
 * Capa da viagem quando não há foto.
 *
 * Desenhada no vocabulário da ilustração das boas-vindas: formas chapadas,
 * sem degradê, nas três cores da marca — tiradas da própria ilustração.
 *
 * Não é uma paisagem, é o MAPA: estradas serpenteando, quarteirões, um
 * alfinete e o rastro do avião. Cena com céu e horizonte foi tentada antes e
 * não funciona aqui — a capa é uma faixa larga e baixa, e paisagem nesse
 * formato vira listra colorida. Mapa é horizontal por natureza.
 *
 * O fundo é o marinho, e não o creme da ilustração, por um motivo prático: por
 * cima da capa vão o nome da viagem em branco e o selo "Faltam N dias", também
 * claro. Sobre creme nenhum dos dois se lê.
 *
 * A variação por viagem é feita espelhando o mesmo desenho. Assim toda capa
 * tem a mesma qualidade do original — quatro composições diferentes sem
 * quatro desenhos para manter.
 */

// Tiradas da ilustração fundo_viagem, contando os pixels.
const CEU = "#1F3660";
const CEU_CLARO = "#395682";
const CREME = "#FDF3E7";
const AREIA = "#F0D2B1";
const LARANJA = "#FD8B2B";

const ESPELHOS = ["", "scale(-1 1) translate(-400 0)", "scale(1 -1) translate(0 -180)", "scale(-1 -1) translate(-400 -180)"];

function variacaoDe(semente) {
  const s = String(semente || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % ESPELHOS.length;
}

export default function Capa({ semente }) {
  const espelho = ESPELHOS[variacaoDe(semente)];
  const n = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      <rect x="0" y="0" width="400" height="180" fill={CEU} />

      <g transform={espelho}>
        {/* Quarteirões: manchas largas que dão fundo às estradas */}
        <g fill={CEU_CLARO} opacity="0.55">
          <rect x="28" y="18" width="86" height="42" rx="10" />
          <rect x="150" y="112" width="104" height="52" rx="12" />
          <rect x="288" y="26" width="72" height="38" rx="10" />
          <rect x="-14" y="118" width="82" height="46" rx="12" />
        </g>

        {/* Estradas. A laranja é a principal e atravessa o quadro inteiro. */}
        <g fill="none" strokeLinecap="round">
          <path d="M-14,140 C64,132 96,102 158,86 C220,70 272,64 414,48" stroke={LARANJA} strokeWidth="13" />
          <path d="M46,-14 C62,42 98,72 128,116 C148,146 156,166 160,196" stroke={CREME} strokeWidth="5" opacity="0.92" />
          <path d="M-14,54 C72,48 126,28 208,24 C266,21 330,30 414,20" stroke={AREIA} strokeWidth="3.5" opacity="0.8" />
          <path d="M212,196 C224,156 252,136 300,128 C338,122 372,128 414,120" stroke={AREIA} strokeWidth="3.5" opacity="0.8" />
        </g>

        {/* O rastro pontilhado do avião, como no ícone */}
        <g fill="none" stroke={CREME} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="7 10" opacity="0.75">
          <path d="M262,150 C286,124 320,110 356,104" />
        </g>
        <g transform="translate(356 100) rotate(-24)" fill={CREME}>
          <path d="M0,0 L22,-2.5 L29,0 L22,2.5 Z" />
          <path d="M7,-1 L12,-10 L15,-10 L13.5,-1 Z" />
          <path d="M7,1 L12,10 L15,10 L13.5,1 Z" />
        </g>

        {/* Alfinete de mapa, pousado num cruzamento */}
        <g transform="translate(126 108)">
          <path d="M0,0 C-9,-11 -13,-16 -13,-22 A13,13 0 1 1 13,-22 C13,-16 9,-11 0,0 Z" fill={LARANJA} />
          <circle cx="0" cy="-22" r="5" fill={CEU} />
        </g>
      </g>
    </svg>
  );
}
