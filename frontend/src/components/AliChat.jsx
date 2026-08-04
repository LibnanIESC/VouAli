import React, { useState, useRef, useEffect, useMemo } from "react";
import AliAvatar from "./AliAvatar";
import { apiAli } from "../api";
import { NAVY, STEEL, ORANGE, CREAM, SAND, DISPLAY, HELV } from "../theme";

const WELCOME = "Oi! Sou o Ali 👋 Pode perguntar o que quiser sobre a viagem — o que fazer se chover num dia, onde comer perto de uma parada, como cortar gastos, o que priorizar... tô aqui pra isso.";

// Sugestões montadas a partir da viagem ATIVA (sem custo de IA): usam paradas e
// destino reais, para nunca sugerirem algo de outra viagem.
function buildSugestoes(trip, destino, cur) {
  const dias = (trip && trip.days) || [];
  const stops = [];
  dias.forEach((d) => (d.stops || []).forEach((s) => { if (s && s.n) stops.push({ n: s.n, dia: d.title || d.label }); }));
  const onde = destino ? `em ${destino}` : "nessa viagem";     // evita "em essa viagem"
  const noDestino = destino ? `em ${destino}` : "no destino";
  if (stops.length === 0) {
    return [
      `O que não posso perder ${onde}?`,
      `Quanto devo separar por dia ${noDestino}?`,
      `Como me locomover ${noDestino}?`,
    ];
  }
  const a = stops[0];
  const b = stops[Math.min(stops.length - 1, Math.floor(stops.length / 2))] || a;
  const out = [
    `O que faço se chover no dia ${a.dia ? `de ${a.dia}` : `do ${a.n}`}?`,
    `Onde comer bem e barato perto do ${b.n}?`,
  ];
  const teto = (trip && trip.budgetTotal) || 0;
  out.push(teto > 0
    ? `Consigo cortar ${cur} ${Math.max(50, Math.round(teto * 0.1)).toLocaleString()} do orçamento?`
    : `O que priorizar ${onde} se o tempo for curto?`);
  return out;
}

// Prepara o histórico para o backend: sem a mensagem de boas-vindas, começando por 'user'.
function toHistory(msgs) {
  let h = msgs.slice(1).slice(-24);
  while (h.length && h[0].role === "assistant") h = h.slice(1);
  return h;
}

export default function AliChat({ trip, destino, currency = "US$" }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const SUGESTOES = useMemo(() => buildSugestoes(trip, destino, currency), [trip, destino, currency]);

  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async (textArg) => {
    const text = (textArg != null ? textArg : input).trim();
    if (!text || loading) return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    const r = await apiAli(toHistory(next), trip);
    setLoading(false);
    let reply;
    if (r && r.reply) reply = r.reply;
    else if (r && r.error === "not_configured") reply = "A IA ainda não está ligada aqui — falta configurar a chave ANTHROPIC_API_KEY no servidor. Enquanto isso, sigo bom de dicas no roteiro. 🙂";
    else if (r && r.error === "rate_limited") reply = "Ê, quanta pergunta boa de uma vez! 😄 Dá uns segundinhos e manda de novo.";
    else reply = "Ops, não consegui responder agora. Tenta de novo em instantes.";
    setMsgs((m) => [...m, { role: "assistant", content: reply }]);
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Mensagens */}
      <div aria-live="polite" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 14px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          m.role === "user" ? (
            <div key={i} style={{ alignSelf: "flex-end", maxWidth: "82%", background: STEEL, color: "#fff", fontSize: 14.5, lineHeight: 1.5, padding: "10px 14px", borderRadius: "16px 16px 5px 16px", boxShadow: "0 2px 8px rgba(10,22,55,0.18)" }}>{m.content}</div>
          ) : (
            <div key={i} style={{ alignSelf: "flex-start", display: "flex", gap: 8, alignItems: "flex-end", maxWidth: "88%" }}>
              <AliAvatar size={36} />
              <div style={{ background: "#fff", color: NAVY, fontSize: 14.5, lineHeight: 1.5, padding: "10px 14px", borderRadius: "16px 16px 16px 5px", boxShadow: "0 2px 8px rgba(10,22,55,0.14)" }}>{m.content}</div>
            </div>
          )
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <AliAvatar size={36} />
            <div style={{ background: "#fff", color: "#888", fontSize: 13.5, fontStyle: "italic", padding: "10px 14px", borderRadius: "16px 16px 16px 5px", boxShadow: "0 2px 8px rgba(10,22,55,0.14)" }}>Ali está digitando…</div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Sugestões rápidas (sempre à mão, roláveis na horizontal) */}
      {!loading && (
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8, overflowX: "auto", padding: "8px 12px 2px", background: "rgba(255,255,255,0.86)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => send(s)} style={{ flex: "0 0 auto", whiteSpace: "nowrap", background: "#fff", color: STEEL, border: `1.5px solid ${STEEL}`, borderRadius: 999, padding: "8px 14px", minHeight: 38, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer" }}>{s}</button>
          ))}
        </div>
      )}

      {/* Barra de entrada (acima da barra de abas fixa) */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: 8, alignItems: "flex-end", padding: "8px 12px", paddingBottom: "calc(72px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,0.86)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Pergunte ao Ali…"
          style={{ flex: 1, resize: "none", border: "1.5px solid #ddd", borderRadius: 20, padding: "10px 14px", fontSize: 14.5, fontFamily: HELV, maxHeight: 120, boxSizing: "border-box", outline: "none" }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} aria-label="Enviar"
          style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", border: "none", background: ORANGE, cursor: loading || !input.trim() ? "default" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 15, height: 15, background: NAVY, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
        </button>
      </div>
    </div>
  );
}
