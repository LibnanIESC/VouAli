import React from "react";

// Indicador do estado de sincronização, exibido no header.
const SYNC_UI = {
  synced:   { label: "Salvo", dot: "#5bd08a" },
  saving:   { label: "Salvando…", dot: "#F28C28" },
  // Sem rede o app fica só para consulta, então não prometemos salvar depois.
  offline:  { label: "Sem internet — modo leitura", dot: "#ef4444" },
  reloaded: { label: "Atualizado em outro aparelho", dot: "#7ab6ff" },
};

export default function SyncPill({ status }) {
  const ui = SYNC_UI[status] || SYNC_UI.synced;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ui.dot, display: "block" }} />
      {ui.label}
    </div>
  );
}
