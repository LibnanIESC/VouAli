import React, { useRef } from "react";
import Sheet from "./Sheet";
import { btn, lbl, NAVY, INK2 } from "../theme";

// Ajustes do app (backup por enquanto; ponto natural para futuras configurações).
export default function AjustesSheet({ onExport, onImportFile, onClose }) {
  const fileRef = useRef(null);
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 30px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Ajustes</div>
        <label style={{ ...lbl, marginTop: 18 }}>Backup da viagem</label>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
          <div style={{ fontSize: 14, color: INK2, lineHeight: 1.55, fontWeight: 500, marginBottom: 12 }}>
            Baixe uma cópia de toda a viagem (roteiro, orçamento e notas). Se algo der errado, é só reimportar.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onExport} style={{ ...btn(NAVY), flex: 1 }}>Exportar</button>
            <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), flex: 1 }}>Importar</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { onImportFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: 12, color: "#98a1ae", fontWeight: 600, marginTop: 18, textAlign: "center" }}>VouAli · versão web</div>
      </div>
    </Sheet>
  );
}
