import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl, NAVY, INK2 } from "../theme";
import { digitarNumero, numeroDoCampo, campoDeNumero } from "../utils";

// Ajuste do teto de orçamento da viagem (fica salvo no cadastro da viagem).
export default function TetoForm({ value, currency, onSave, onClose }) {
  const [v, setV] = useState(() => campoDeNumero(value));
  const salvar = () => onSave(numeroDoCampo(v));
  return (
    <Sheet onClose={onClose} acoes={<button onClick={salvar} style={{ ...btn(NAVY), flex: 1 }}>Salvar</button>}>
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Teto do orçamento</div>
        <div style={{ fontSize: 14, color: INK2, fontWeight: 500, lineHeight: 1.5, marginTop: 6 }}>
          Quanto você quer gastar no total nesta viagem. É a referência para a sobra e para as dicas do Ali.
        </div>
        <label style={lbl}>Valor ({currency})</label>
        <input inputMode="decimal" autoFocus style={field} value={v} onChange={(e) => setV(digitarNumero(e.target.value))} placeholder="Ex: 3000"
          onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
      </div>
    </Sheet>
  );
}
