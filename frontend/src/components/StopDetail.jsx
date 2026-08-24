import React from "react";
import Sheet from "./Sheet";
import AliTip from "./AliTip";
import { btn } from "../theme";

// Detalhe de uma parada do roteiro (como chegar, o que fazer, insight).
export default function StopDetail({ stop, color, onEdit, onDelete, onClose, somenteLeitura }) {
  const Section = ({ title, children }) => children ? (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 14.5, color: "#333", lineHeight: 1.55, marginTop: 5, fontWeight: 500 }}>{children}</div>
    </div>
  ) : null;
  const acoes = somenteLeitura ? null : (
    <>
      <button onClick={onEdit} style={{ ...btn("#223A5E"), flex: 1 }}>Editar</button>
      <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>
    </>
  );
  return (
    <Sheet onClose={onClose} acoes={acoes}>
      <div style={{ background: color, color: "#fff", padding: "18px 22px 20px", borderRadius: "0" }}>
        <div style={{ fontSize: 13, fontWeight: 800, opacity: .9 }}>{stop.t}</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{stop.n}</div>
        {stop.d && <div style={{ fontSize: 14, opacity: .92, marginTop: 4, fontWeight: 500 }}>{stop.d}</div>}
      </div>
      <div style={{ padding: "6px 22px 26px" }}>
        <Section title="Como chegar">{stop.getting}</Section>
        <Section title="O que fazer">{stop.todo}</Section>
        {stop.insight && stop.insight.trim() && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color, textTransform: "uppercase", marginBottom: 8 }}>Dica do Ali</div>
            <AliTip>{stop.insight}</AliTip>
          </div>
        )}
        {stop.link && (
          <div style={{ marginTop: 18 }}>
            <a href={stop.link} target="_blank" rel="noreferrer" style={{ ...btn(color), display: "inline-block", textDecoration: "none" }}>Abrir link oficial ↗</a>
          </div>
        )}
      </div>
    </Sheet>
  );
}
