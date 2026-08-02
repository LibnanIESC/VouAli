import React from "react";
import { NAVY, ORANGE, DISPLAY } from "../theme";

// Avatar do Ali: círculo marinho com o "A" laranja (Baloo 2). Assinatura da
// marca — ver Brand Book, seção "Onde Ali aparece".
export default function AliAvatar({ size = 40, ring }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", border: ring ? `2px solid ${ring}` : undefined }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, color: ORANGE, fontSize: Math.round(size * 0.5), lineHeight: 1 }}>A</span>
    </span>
  );
}
