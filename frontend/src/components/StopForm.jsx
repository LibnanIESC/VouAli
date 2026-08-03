import React, { useState } from "react";
import Sheet from "./Sheet";
import { apiAliDica } from "../api";
import { btn, field, lbl, ORANGE, NAVY, HELV } from "../theme";

// Formulário de criação/edição de parada.
export default function StopForm({ stop, color, trip, onSave, onClose }) {
  const [f, setF] = useState(stop || { t: "", n: "", d: "", getting: "", todo: "", insight: "", link: "" });
  const [gerando, setGerando] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const gerarDica = async () => {
    if (gerando || !f.n.trim()) return;
    setGerando(true);
    const r = await apiAliDica({ n: f.n, t: f.t, d: f.d, getting: f.getting, todo: f.todo }, trip || {});
    setGerando(false);
    if (r && r.dica) setF((cur) => ({ ...cur, insight: r.dica }));
    else if (r && r.error === "not_configured") alert("A IA ainda não está ligada (falta configurar a chave ANTHROPIC_API_KEY no servidor).");
    else if (r && r.error === "rate_limited") alert("Muitas gerações em pouco tempo. Espera uns segundinhos e tenta de novo. 🙂");
    else alert("Não consegui gerar a dica agora. Tenta de novo em instantes.");
  };

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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <label style={{ ...lbl, marginTop: 0 }}>Dica do Ali</label>
          <button type="button" onClick={gerarDica} disabled={gerando || !f.n.trim()}
            title={!f.n.trim() ? "Preencha o nome da parada primeiro" : ""}
            style={{ background: ORANGE, color: NAVY, border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 800, fontFamily: HELV, cursor: gerando || !f.n.trim() ? "default" : "pointer", opacity: gerando || !f.n.trim() ? 0.5 : 1 }}>
            {gerando ? "Gerando…" : "✨ Gerar com o Ali"}
          </button>
        </div>
        <textarea style={field} rows={2} value={f.insight} onChange={up("insight")} placeholder="Um truque, o que evitar, o melhor horário… ou toque em Gerar com o Ali" />

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
