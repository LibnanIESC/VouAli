import React from "react";
import AliAvatar from "./AliAvatar";
import { SAND, NAVY, CREAM } from "../theme";

// Cartão de dica proativa do Ali. Padrão do Brand Book: avatar + texto num card
// bege (tom claro) ou marinho (tom "navy"). O laranja fica só no avatar.
export default function AliTip({ children, tone = "sand", size = 32 }) {
  const navy = tone === "navy";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", background: navy ? NAVY : SAND, borderRadius: 16, padding: "13px 15px", boxShadow: "0 4px 14px rgba(10,22,55,0.14)" }}>
      <AliAvatar size={size} />
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: navy ? CREAM : NAVY, fontWeight: 500 }}>{children}</div>
    </div>
  );
}
