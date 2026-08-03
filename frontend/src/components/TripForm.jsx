import React, { useState } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl } from "../theme";

// Formulário de criação/edição de uma viagem (metadados).
export default function TripForm({ trip, onSave, onClose, onDelete, canDelete }) {
  const [f, setF] = useState(trip || { name: "", dateLabel: "", destination: "", bg: "" });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{trip ? "Editar viagem" : "Nova viagem"}</div>
        <label style={lbl}>Nome</label>
        <input style={field} value={f.name} onChange={up("name")} placeholder="Ex: New York" />
        <label style={lbl}>Datas</label>
        <input style={field} value={f.dateLabel} onChange={up("dateLabel")} placeholder="Ex: 6 – 13 Outubro" />
        <label style={lbl}>Destino</label>
        <input style={field} value={f.destination} onChange={up("destination")} placeholder="Ex: New York, EUA" />
        <label style={lbl}>Imagem de fundo (link)</label>
        <input style={field} value={f.bg} onChange={up("bg")} placeholder="Cole o link (URL) de uma foto" />
        {f.bg ? (
          <div style={{ marginTop: 8, height: 90, borderRadius: 10, overflow: "hidden", border: "1px solid #e5e2da" }}>
            <img src={f.bg} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {canDelete && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
          <button onClick={() => f.name.trim() && onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>{trip ? "Salvar" : "Criar viagem"}</button>
        </div>
      </div>
    </Sheet>
  );
}
