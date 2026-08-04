import React from "react";
import Sheet from "./Sheet";
import { NAVY, HELV, INK2, INK3 } from "../theme";

// Sheet de ações (menu contextual) e de confirmações.
// actions: [{ icon?, label, danger?, onClick }]
export default function ActionSheet({ title, message, actions, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "6px 16px 28px" }}>
        {title && <div style={{ fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.8, textTransform: "uppercase", padding: "8px 6px 4px" }}>{title}</div>}
        {message && <div style={{ fontSize: 15, fontWeight: 600, color: INK2, lineHeight: 1.5, padding: "6px 6px 12px" }}>{message}</div>}
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "none", borderRadius: 14, padding: "0 16px", marginBottom: 8, minHeight: 56, cursor: "pointer", fontFamily: HELV, boxShadow: "0 3px 10px rgba(20,32,56,0.08)", color: a.danger ? "#C62828" : NAVY }}>
            {a.icon}
            <span style={{ fontSize: 16, fontWeight: 700, textAlign: "left", flex: 1 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
