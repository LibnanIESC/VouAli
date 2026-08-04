import React, { useState } from "react";
import Sheet from "./Sheet";
import { SparkIcon } from "./Icons";
import { apiGenerate } from "../api";
import { btn, field, lbl, NAVY, ORANGE, SAND, HELV } from "../theme";

// Formulário de criação/edição de uma viagem.
// Ao criar, permite escolher entre "começar vazia" ou "gerar com o Ali".
export default function TripForm({ trip, onSave, onClose, onDelete, canDelete }) {
  const [f, setF] = useState(trip || { name: "", dateLabel: "", destination: "", bg: "" });
  const [mode, setMode] = useState("empty");     // empty | ai (só na criação)
  const [gen, setGen] = useState({ days: "5", budget: "", style: "" });
  const [gerando, setGerando] = useState(false);
  const isNew = !trip;
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const upGen = (k) => (e) => setGen({ ...gen, [k]: e.target.value });

  const submit = async () => {
    if (!f.name.trim() || gerando) return;
    if (isNew && mode === "ai") {
      setGerando(true);
      const r = await apiGenerate({
        destination: f.destination || f.name,
        dateLabel: f.dateLabel,
        days: Number(gen.days || 0),
        budget: gen.budget ? Number(gen.budget) : undefined,
        style: gen.style,
      });
      setGerando(false);
      if (r && r.state) { onSave({ ...f, data: r.state }); return; }
      if (r && r.error === "not_configured") { alert("A IA ainda não está ligada (falta a chave ANTHROPIC_API_KEY no servidor)."); return; }
      if (r && r.error === "rate_limited") { alert("Muitas gerações em pouco tempo. Espera uns segundinhos e tenta de novo. 🙂"); return; }
      if (r && r.error === "invalid") { alert("Informe o destino e o número de dias (pelo menos 1)."); return; }
      alert("Não consegui gerar o roteiro agora. Tenta de novo, ou crie a viagem vazia."); return;
    }
    onSave(f); // criar vazia OU salvar edição
  };

  const modeBtn = (id, label) => (
    <button type="button" onClick={() => setMode(id)} disabled={gerando}
      style={{ flex: 1, padding: "10px 8px", minHeight: 44, borderRadius: 12, fontSize: 13.5, fontWeight: 800, fontFamily: HELV, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        border: mode === id ? `2px solid ${NAVY}` : "1.5px solid #ddd",
        background: mode === id ? SAND : "#fff", color: NAVY }}>{label}</button>
  );

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{trip ? "Editar viagem" : "Nova viagem"}</div>
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

        {isNew && (
          <>
            <label style={lbl}>Como criar o roteiro?</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {modeBtn("empty", "Começar vazia")}
              {modeBtn("ai", <><SparkIcon color={NAVY} size={14} />Gerar com o Ali</>)}
            </div>
            {mode === "ai" && (
              <div style={{ marginTop: 10, background: "#faf7f1", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Nº de dias</label>
                    <input type="number" style={field} value={gen.days} onChange={upGen("days")} min={1} max={12} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Orçamento US$ (opcional)</label>
                    <input type="number" style={field} value={gen.budget} onChange={upGen("budget")} placeholder="Ex: 3000" />
                  </div>
                </div>
                <label style={lbl}>Estilo / interesses (opcional)</label>
                <input style={field} value={gen.style} onChange={upGen("style")} placeholder="Ex: gastronomia, museus, econômico, com crianças…" />
                <div style={{ fontSize: 12, color: "#8a7a63", marginTop: 8, lineHeight: 1.5 }}>O Ali monta o cronograma dia a dia. Você pode editar tudo depois.</div>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {canDelete && <button onClick={onDelete} disabled={gerando} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
          <button onClick={submit} disabled={gerando || !f.name.trim()} style={{ ...btn(isNew && mode === "ai" ? ORANGE : NAVY, { color: isNew && mode === "ai" ? NAVY : "#fff" }), flex: 1, opacity: gerando || !f.name.trim() ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {gerando ? "Ali está montando…" : (trip ? "Salvar" : (mode === "ai" ? <><SparkIcon color={NAVY} size={15} />Gerar e criar</> : "Criar viagem"))}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
