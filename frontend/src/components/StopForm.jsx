import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl } from "../theme";

// Formulário de criação/edição de parada.
export default function StopForm({ stop, color, onSave, onClose }) {
  const [f, setF] = useState(stop || { t: "", n: "", d: "", getting: "", todo: "", insight: "", link: "" });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{stop ? "Editar parada" : "Nova parada"}</div>
        <label style={lbl}>Nome</label>
        <input style={field} value={f.n} onChange={up("n")} placeholder="Ex: Empire State Building" />
        <label style={lbl}>Horário</label>
        <input style={field} value={f.t} onChange={up("t")} placeholder="Ex: 15h" />
        <label style={lbl}>Resumo</label>
        <input style={field} value={f.d} onChange={up("d")} placeholder="Uma linha curta" />
        <label style={lbl}>Como chegar</label>
        <textarea style={field} rows={2} value={f.getting} onChange={up("getting")} />
        <label style={lbl}>O que fazer</label>
        <textarea style={field} rows={2} value={f.todo} onChange={up("todo")} />
        <label style={lbl}>Insight</label>
        <textarea style={field} rows={2} value={f.insight} onChange={up("insight")} />
        <label style={lbl}>Link</label>
        <input style={field} value={f.link} onChange={up("link")} placeholder="https://" />
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ ...btn("#fff", { color: "#666", border: "1.5px solid #ccc" }), flex: 1 }}>Cancelar</button>
          <button onClick={() => f.n.trim() && onSave(f)} style={{ ...btn(color), flex: 1 }}>Salvar</button>
        </div>
      </div>
    </Sheet>
  );
}
