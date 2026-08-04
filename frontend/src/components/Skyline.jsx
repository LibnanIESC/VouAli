import React from "react";

// Cena de fundo (skyline + Estátua da Liberdade). Fica atrás da foto real;
// aparece se a foto não carregar.
export default function Skyline() {
  return (
  <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.9 }}>
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
}
