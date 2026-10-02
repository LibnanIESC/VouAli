import React, { useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiFotos } from "../api";
import { btn, field, NAVY, INK2, INK3 } from "../theme";

/**
 * Busca de foto de capa na internet (Pixabay, via servidor).
 *
 * Já abre buscando o destino. A pessoa toca numa foto e a URL volta pronta para
 * o campo de link — nada de copiar e colar. A busca é um atalho: qualquer falha
 * vira uma mensagem calma, nunca trava o formulário.
 */
export default function BuscaFotoSheet({ destinoInicial, onPick, onClose }) {
  const [q, setQ] = useState(destinoInicial || "");
  const [fotos, setFotos] = useState([]);
  const [estado, setEstado] = useState("idle");   // idle|carregando|ok|vazio|erro
  const [erro, setErro] = useState("");

  const buscar = async (termo) => {
    const t = String(termo ?? q).trim();
    if (!t) return;
    setEstado("carregando");
    const r = await apiFotos(t);
    if (r.error === "not_configured") { setErro("A busca de fotos ainda não está ligada no servidor."); setEstado("erro"); return; }
    if (r.error === "rate_limited") { setErro("Muitas buscas em pouco tempo. Tente de novo em instantes."); setEstado("erro"); return; }
    if (r.error) { setErro("Não consegui buscar agora. Tente outra vez."); setEstado("erro"); return; }
    setFotos(r.fotos);
    setEstado(r.fotos.length ? "ok" : "vazio");
  };

  // Abriu com um destino: já busca, para a pessoa ver fotos na hora.
  useEffect(() => { if (String(destinoInicial || "").trim()) buscar(destinoInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "6px 18px 22px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Buscar foto na internet</div>
        <div style={{ fontSize: 13, color: INK3, marginBottom: 10 }}>Toque numa foto para usá-la como capa.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={field} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
            placeholder="Ex: Paris" aria-label="Buscar foto" />
          <button type="button" onClick={() => buscar()} disabled={!q.trim() || estado === "carregando"}
            style={{ ...btn(NAVY, {}), flex: "0 0 auto", padding: "0 16px", opacity: (!q.trim() || estado === "carregando") ? 0.6 : 1 }}>
            {estado === "carregando" ? "…" : "Buscar"}
          </button>
        </div>

        {estado === "carregando" && <div style={{ marginTop: 14, fontSize: 14, color: INK2 }}>Buscando…</div>}
        {estado === "erro" && <div style={{ marginTop: 14, fontSize: 14, color: "#C62828", fontWeight: 600 }}>{erro}</div>}
        {estado === "vazio" && <div style={{ marginTop: 14, fontSize: 14, color: INK2 }}>Nada encontrado para “{q}”. Tente outro termo.</div>}

        {estado === "ok" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
              {fotos.map((foto, i) => (
                <button key={i} type="button" onClick={() => { onPick(foto.url); onClose(); }}
                  title={foto.autor ? `Foto de ${foto.autor}` : "Usar esta foto"}
                  style={{ padding: 0, border: "none", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: "#eee", height: 96 }}>
                  <img src={foto.thumb} alt={foto.autor ? `Foto de ${foto.autor}` : "Foto"} loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: INK3, marginTop: 10, textAlign: "center" }}>Fotos por Pixabay</div>
          </>
        )}
      </div>
    </Sheet>
  );
}
