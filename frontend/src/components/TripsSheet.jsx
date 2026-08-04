import React from "react";
import Sheet from "./Sheet";
import { PencilIcon } from "./Icons";
import { btn, NAVY, ORANGE, SAND, HELV, INK3 } from "../theme";

// Lista de viagens: trocar de viagem, criar nova, editar cada uma.
export default function TripsSheet({ trips, activeId, onSwitch, onNew, onEdit, onClose }) {
  const list = (trips && trips.list) || [];
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 14 }}>Minhas viagens</div>
        {list.length === 0 && (
          <div style={{ fontSize: 14, color: INK3, marginBottom: 14 }}>Você ainda não tem viagens. Crie a primeira abaixo.</div>
        )}
        {list.map((t) => {
          const on = t.id === activeId;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 14, padding: "10px 10px 10px 12px", marginBottom: 8, boxShadow: "0 4px 14px rgba(20,32,56,0.09)", border: on ? `2px solid ${ORANGE}` : "2px solid transparent" }}>
              <button onClick={() => onSwitch(t.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: HELV, textAlign: "left", minHeight: 48 }}>
                <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 12, flex: "0 0 auto", background: SAND, overflow: "hidden", display: "block" }}>
                  {t.bg ? <img src={t.bg} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 16, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                  <span style={{ display: "block", fontSize: 13, color: INK3, fontWeight: 600, marginTop: 1 }}>{t.dateLabel || t.destination || "—"}</span>
                </span>
                {on && <span style={{ fontSize: 10, fontWeight: 800, color: ORANGE, letterSpacing: 1, flex: "0 0 auto" }}>ATUAL</span>}
              </button>
              <button onClick={() => onEdit(t)} aria-label={`Editar viagem ${t.name}`} style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 12, border: "1.5px solid #e2e2e2", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PencilIcon color={NAVY} size={17} />
              </button>
            </div>
          );
        })}
        <button onClick={onNew} style={{ ...btn(NAVY), width: "100%", marginTop: 12 }}>+ Nova viagem</button>
      </div>
    </Sheet>
  );
}
