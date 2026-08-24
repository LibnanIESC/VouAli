import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl } from "../theme";

// Formulário de item de orçamento (planejado x gasto).
export default function BudgetForm({ item, currency = "US$", onSave, onClose, onDelete }) {
  const [f, setF] = useState(item || { k: "", v: 0, spent: 0, tag: "outros" });
  const up = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value || 0) : e.target.value });
  const acoes = (
    <>
      {item && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
      <button onClick={() => f.k.trim() && onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
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
            <input type="number" style={field} value={f.v} onChange={up("v", true)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Gasto ({currency})</label>
            <input type="number" style={field} value={f.spent} onChange={up("spent", true)} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
