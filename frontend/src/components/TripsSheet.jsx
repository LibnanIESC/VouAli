import React from "react";
import Sheet from "./Sheet";
import { btn, NAVY, ORANGE } from "../theme";

// Lista de viagens: trocar de viagem, criar nova, editar cada uma.
export default function TripsSheet({ trips, activeId, onSwitch, onNew, onEdit, onClose }) {
  const list = (trips && trips.list) || [];
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 14 }}>Minhas viagens</div>
        {list.length === 0 && (
          <div style={{ fontSize: 14, color: "#777", marginBottom: 14 }}>Você ainda não tem viagens. Crie a primeira abaixo.</div>
        )}
        {list.map((t) => {
          const on = t.id === activeId;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 4px 14px rgba(10,22,55,0.14)", border: on ? `2px solid ${ORANGE}` : "2px solid transparent" }}>
              <div onClick={() => onSwitch(t.id)} style={{ flex: 1, cursor: "pointer", minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#8a8a8a", fontWeight: 600 }}>{t.dateLabel || t.destination || "—"}</div>
              </div>
              {on && <span style={{ fontSize: 10, fontWeight: 800, color: ORANGE, letterSpacing: 1 }}>ATUAL</span>}
              <button onClick={() => onEdit(t)} aria-label="Editar viagem" style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 9, border: "1.5px solid #ddd", background: "#fff", color: NAVY, fontSize: 15, cursor: "pointer" }}>✎</button>
            </div>
          );
        })}
        <button onClick={onNew} style={{ ...btn(NAVY), width: "100%", marginTop: 12 }}>+ Nova viagem</button>
      </div>
    </Sheet>
  );
}
