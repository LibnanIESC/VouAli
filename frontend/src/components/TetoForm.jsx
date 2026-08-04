import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl, NAVY, INK2 } from "../theme";

// Ajuste do teto de orçamento da viagem (fica salvo no cadastro da viagem).
export default function TetoForm({ value, currency, onSave, onClose }) {
  const [v, setV] = useState(value > 0 ? String(value) : "");
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 28px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Teto do orçamento</div>
        <div style={{ fontSize: 14, color: INK2, fontWeight: 500, lineHeight: 1.5, marginTop: 6 }}>
          Quanto você quer gastar no total nesta viagem. É a referência para a sobra e para as dicas do Ali.
        </div>
        <label style={lbl}>Valor ({currency})</label>
        <input type="number" inputMode="decimal" autoFocus style={field} value={v} onChange={(e) => setV(e.target.value)} placeholder="Ex: 3000"
          onKeyDown={(e) => { if (e.key === "Enter") onSave(Number(v || 0)); }} />
        <button onClick={() => onSave(Number(v || 0))} style={{ ...btn(NAVY), width: "100%", marginTop: 20 }}>Salvar</button>
      </div>
    </Sheet>
  );
}
