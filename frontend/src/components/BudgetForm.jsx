import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl } from "../theme";
import { digitarNumero, numeroDoCampo, campoDeNumero } from "../utils";

// Formulário de item de orçamento (planejado x gasto).
export default function BudgetForm({ item, currency = "US$", onSave, onClose, onDelete }) {
  // Os valores ficam como TEXTO enquanto se digita e viram número ao salvar —
  // ver o porquê em utils.js (digitarNumero).
  const [f, setF] = useState(() => {
    const i = item || { k: "", v: 0, spent: 0, tag: "outros" };
    return { ...i, v: campoDeNumero(i.v), spent: campoDeNumero(i.spent) };
  });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const upValor = (k) => (e) => setF({ ...f, [k]: digitarNumero(e.target.value) });
  const salvar = () => f.k.trim() && onSave({ ...f, v: numeroDoCampo(f.v), spent: numeroDoCampo(f.spent) });
  const acoes = (
    <>
      {item && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
      <button onClick={salvar} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
    </>
  );
  return (
    <Sheet onClose={onClose} acoes={acoes}>
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{item ? "Editar item" : "Novo item"}</div>
        <label style={lbl}>Descrição</label>
        <input style={field} value={f.k} onChange={up("k")} placeholder="Ex: Uber do aeroporto" />
        <label style={lbl}>Categoria</label>
        <input style={field} value={f.tag} onChange={up("tag")} placeholder="ingressos / comida / transporte…" />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Planejado ({currency})</label>
            <input inputMode="decimal" style={field} value={f.v} onChange={upValor("v")} placeholder="0" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Gasto ({currency})</label>
            <input inputMode="decimal" style={field} value={f.spent} onChange={upValor("spent")} placeholder="0" />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
