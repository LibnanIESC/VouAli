import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl } from "../theme";

// Formulário de criação/edição de um dia do roteiro.
export default function DayForm({ day, onSave, onClose, onDelete, canDelete }) {
  const [f, setF] = useState(day || { label: "", date: "", title: "", sub: "", line: "", color: "#365D7A" });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const symbol = (f.line || "?").slice(0, 3);
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: f.color || "#365D7A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flex: "0 0 auto" }}>{symbol}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{day ? "Editar dia" : "Novo dia"}</div>
        </div>
        <label style={lbl}>Título</label>
        <input style={field} value={f.title} onChange={up("title")} placeholder="Ex: Estátua + Wall St" />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Dia (sigla)</label>
            <input style={field} value={f.label} onChange={up("label")} placeholder="Ex: QUA" maxLength={4} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Data</label>
            <input style={field} value={f.date} onChange={up("date")} placeholder="Ex: 14 OUT" />
          </div>
        </div>
        <label style={lbl}>Subtítulo</label>
        <input style={field} value={f.sub} onChange={up("sub")} placeholder="Ex: Trem A · dia leve" />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Símbolo (bolinha)</label>
            <input style={field} value={f.line} onChange={up("line")} placeholder="Ex: A, 7, L" maxLength={3} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Cor</label>
            <input type="color" value={f.color || "#365D7A"} onChange={up("color")} style={{ ...field, height: 44, padding: 4, cursor: "pointer" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {canDelete && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
          <button onClick={() => f.title.trim() && onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
        </div>
      </div>
    </Sheet>
  );
}
