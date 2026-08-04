import React, { useState } from "react";
import { NAVY, ORANGE, DISPLAY } from "../theme";

// Avatar do Ali dentro do círculo marinho.
// - padrão: recorte fechado no rosto (legível em ícones pequenos)
// - portrait: retrato completo com turbante e cachecol (para tamanhos grandes)
// Se a imagem falhar, cai no "A" laranja — a marca alternativa do Brand Book.
export default function AliAvatar({ size = 40, ring, portrait = false }) {
  const [broken, setBroken] = useState(false);
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", overflow: "hidden", border: ring ? `2px solid ${ring}` : undefined }}>
      {broken ? (
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, color: ORANGE, fontSize: Math.round(size * 0.5), lineHeight: 1 }}>A</span>
      ) : (
        <img src={portrait ? "/ali-portrait.png" : "/ali-face.png"} alt="Ali" width={size} height={size} onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
    </span>
  );
}
