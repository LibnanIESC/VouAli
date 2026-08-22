import React, { useState, useRef, useEffect, useMemo } from "react";
import AliAvatar from "./AliAvatar";
import { apiAli, apiAliStream } from "../api";
import { NAVY, STEEL, ORANGE, SAND_L, HELV, INK3 } from "../theme";

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
  let h = msgs.slice(1).slice(-24).map((m) => ({ role: m.role, content: m.content }));
  while (h.length && h[0].role === "assistant") h = h.slice(1);
  return h;
}

const hora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function AliChat({ trip, destino, currency = "US$", status = "synced" }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: WELCOME, at: Date.now() }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const SUGESTOES = useMemo(() => buildSugestoes(trip, destino, currency), [trip, destino, currency]);
  const subtitulo = status === "offline" ? "offline" : (destino ? `seu guia em ${destino}` : "seu guia de viagem");

  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async (textArg) => {
    const text = (textArg != null ? textArg : input).trim();
    if (!text || loading) return;
    const next = [...msgs, { role: "user", content: text, at: Date.now() }];
    setMsgs(next);
    setInput("");
    setLoading(true);

    // Primeiro tenta receber a resposta conforme ela sai: a bolha do Ali
    // aparece já no primeiro trecho e vai crescendo enquanto ele escreve.
    let primeiro = true;
    const historico = toHistory(next);
    let r = await apiAliStream(historico, trip, (pedaco) => {
      setMsgs((m) => {
        if (primeiro) {
          primeiro = false;
          setLoading(false);
          return [...m, { role: "assistant", content: pedaco, at: Date.now(), streaming: true }];
        }
        const copia = [...m];
        const ultima = copia[copia.length - 1];
        copia[copia.length - 1] = { ...ultima, content: ultima.content + pedaco };
        return copia;
      });
    });

    if (r && r.fallback) r = await apiAli(historico, trip);   // servidor sem streaming
    else if (r && r.reply && !primeiro) {                     // streaming completou
      setMsgs((m) => {
        const copia = [...m];
        copia[copia.length - 1] = { ...copia[copia.length - 1], content: r.reply, streaming: false };
        return copia;
      });
      setLoading(false);
      return;
    }

    setLoading(false);
    let reply;
    if (r && r.reply) reply = r.reply;
    else if (r && r.error === "not_configured") reply = "A IA ainda não está ligada aqui — falta configurar a chave ANTHROPIC_API_KEY no servidor. Enquanto isso, sigo bom de dicas no roteiro. 🙂";
    else if (r && r.error === "rate_limited") reply = "Ê, quanta pergunta boa de uma vez! 😄 Dá uns segundinhos e manda de novo.";
    else if (r && r.error === "quota") reply = `Por hoje o papo comigo chegou no limite do mês (${r.limite} conversas) 😅 Ele renova no dia 1º — e o roteiro, o orçamento e as dicas que já estão salvos continuam todos aqui.`;
    else if (r && r.error === "ai_paused") reply = "Estou de recesso rapidinho por aqui ⏸️ Volto já — o app segue funcionando normalmente.";
    else reply = "Ops, não consegui responder agora. Tenta de novo em instantes.";
    setMsgs((m) => [...m, { role: "assistant", content: reply, at: Date.now() }]);
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Cabeçalho da conversa: foto + nome (padrão WhatsApp) */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderBottom: "1px solid rgba(20,32,56,0.08)", boxShadow: "0 2px 8px rgba(20,32,56,0.06)", zIndex: 2 }}>
        <AliAvatar size={46} portrait />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, lineHeight: 1.2 }}>Ali</div>
          <div style={{ fontSize: 12.5, color: status === "offline" ? "#C62828" : INK3, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {loading ? "digitando…" : subtitulo}
          </div>
        </div>
      </div>

      {/* Mensagens (sem avatar repetido; fundo areia com textura sutil) */}
      <div aria-live="polite" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 12px 8px", display: "flex", flexDirection: "column", gap: 8,
        backgroundColor: SAND_L, backgroundImage: "radial-gradient(rgba(122,90,58,0.06) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
        {msgs.map((m, i) => {
          const meu = m.role === "user";
          return (
            <div key={i} className={`bub ${meu ? "bub-out" : "bub-in"}`}
              style={{ alignSelf: meu ? "flex-end" : "flex-start", maxWidth: "84%", background: meu ? STEEL : "#fff", color: meu ? "#fff" : NAVY,
                fontSize: 14.5, lineHeight: 1.5, padding: "8px 12px 6px", borderRadius: meu ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                boxShadow: "0 1px 2px rgba(20,32,56,0.14)", whiteSpace: "pre-wrap" }}>
              {m.content}
              <span style={{ display: "block", textAlign: "right", fontSize: 10.5, fontWeight: 600, marginTop: 3, color: meu ? "rgba(255,255,255,0.72)" : "#9aa4b2" }}>{hora(m.at)}</span>
            </div>
          );
        })}
        {loading && (
          <div className="bub bub-in" style={{ alignSelf: "flex-start", background: "#fff", borderRadius: "14px 14px 14px 3px", padding: "12px 14px", boxShadow: "0 1px 2px rgba(20,32,56,0.14)", display: "flex", gap: 4, alignItems: "center" }}>
            {[0, 1, 2].map((k) => (
              <span key={k} style={{ width: 7, height: 7, borderRadius: "50%", background: "#c3ccd8", display: "block", animation: `pulse 1.1s ease-in-out ${k * 0.18}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Sugestões rápidas (sempre à mão, roláveis na horizontal) */}
      {!loading && (
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8, overflowX: "auto", padding: "8px 12px 2px", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => send(s)} style={{ flex: "0 0 auto", whiteSpace: "nowrap", background: "#fff", color: STEEL, border: `1.5px solid ${STEEL}`, borderRadius: 999, padding: "8px 14px", minHeight: 38, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer" }}>{s}</button>
          ))}
        </div>
      )}

      {/* Barra de entrada (acima da barra de abas fixa) */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: 8, alignItems: "flex-end", padding: "8px 12px", paddingBottom: "calc(72px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
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
