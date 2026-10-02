import React, { useState, useEffect } from "react";
import { btn, NAVY, ORANGE, SAND, CREAM, HELV, INK2, INK3 } from "../theme";
import { formatDateLabel, daysBetween } from "../tripmeta";

/**
 * Calendário de período: toca no início, toca no fim, o intervalo acende, e o
 * OK devolve as duas datas. Um mês no celular (células grandes para o dedo),
 * dois lado a lado quando há largura.
 *
 * As datas são YYYY-MM-DD, que ordena como texto na mesma ordem do calendário —
 * por isso a comparação do intervalo é só `>`/`<` de string, sem fuso nem Date.
 */
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const fmt = (y, mo, d) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const hojeISO = () => { const n = new Date(); return fmt(n.getFullYear(), n.getMonth(), n.getDate()); };
const addMes = (y, mo, delta) => { const t = mo + delta; return { y: y + Math.floor(t / 12), mo: ((t % 12) + 12) % 12 }; };

function Mes({ y, mo, sel, hoje, onPick }) {
  const total = new Date(y, mo + 1, 0).getDate();
  const offset = new Date(y, mo, 1).getDay();           // 0 = domingo
  const celulas = [];
  for (let i = 0; i < offset; i++) celulas.push(null);
  for (let d = 1; d <= total; d++) celulas.push(d);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ textAlign: "center", fontWeight: 800, color: NAVY, fontSize: 15, marginBottom: 8 }}>{MESES[mo]} {y}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {SEMANA.map((s, i) => <div key={"h" + i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: INK3, padding: "2px 0" }}>{s}</div>)}
        {celulas.map((d, i) => {
          if (d == null) return <div key={i} />;
          const iso = fmt(y, mo, d);
          const ponta = iso === sel.start || (sel.end && iso === sel.end);
          const dentro = sel.start && sel.end && iso > sel.start && iso < sel.end;
          const passado = iso < hoje;
          return (
            <button key={i} type="button" onClick={() => onPick(iso)} aria-label={iso} aria-pressed={!!ponta}
              style={{
                height: 40, border: "none", cursor: "pointer", fontFamily: HELV, fontSize: 14,
                fontWeight: ponta ? 800 : 600,
                color: ponta ? "#fff" : passado ? "#b9b4a9" : NAVY,
                background: ponta ? NAVY : dentro ? SAND : "transparent",
                borderRadius: dentro && !ponta ? 0 : 10,
              }}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarioPeriodo({ start, end, onConfirm, onClose }) {
  const [sel, setSel] = useState({ start: start || "", end: end || "" });
  const base = /^\d{4}-\d{2}-\d{2}$/.test(start || "")
    ? { y: +start.slice(0, 4), mo: +start.slice(5, 7) - 1 }
    : (() => { const n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() }; })();
  const [vis, setVis] = useState(base);
  const [dois, setDois] = useState(typeof window !== "undefined" && window.innerWidth >= 640);
  useEffect(() => {
    const onR = () => setDois(window.innerWidth >= 640);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const hoje = hojeISO();

  // 1º toque: início (zera o fim). 2º toque antes do início: recomeça. Depois: fim.
  const pick = (iso) => setSel((s) => {
    if (!s.start || s.end) return { start: iso, end: "" };
    if (iso < s.start) return { start: iso, end: "" };
    return { start: s.start, end: iso };
  });

  const prox = addMes(vis.y, vis.mo, 1);
  const dias = sel.start && sel.end ? daysBetween(sel.start, sel.end) : (sel.start ? 1 : 0);
  const preview = sel.start && sel.end
    ? `${formatDateLabel(sel.start, sel.end)} · ${dias} ${dias === 1 ? "dia" : "dias"}`
    : sel.start ? "Agora toque na data final" : "Toque na data inicial";

  const confirmar = () => { if (sel.start) onConfirm(sel.start, sel.end || sel.start); };

  const seta = { width: 40, height: 40, borderRadius: 10, border: "1.5px solid #ddd", background: "#fff", color: NAVY, fontSize: 18, fontWeight: 800, cursor: "pointer" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Escolher datas"
        style={{ width: "100%", maxWidth: dois ? 640 : 360, background: CREAM, borderRadius: 18, padding: 18, boxShadow: "0 10px 40px rgba(0,0,0,0.3)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button type="button" onClick={() => setVis(addMes(vis.y, vis.mo, -1))} aria-label="Mês anterior" style={seta}>‹</button>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: 15 }}>Escolha o período</div>
          <button type="button" onClick={() => setVis(addMes(vis.y, vis.mo, 1))} aria-label="Próximo mês" style={seta}>›</button>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <Mes y={vis.y} mo={vis.mo} sel={sel} hoje={hoje} onPick={pick} />
          {dois && <Mes y={prox.y} mo={prox.mo} sel={sel} hoje={hoje} onPick={pick} />}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK2, textAlign: "center", marginTop: 14 }}>{preview}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => setSel({ start: "", end: "" })}
            style={{ ...btn("#fff", { color: INK2, border: "1.5px solid #ddd" }), flex: "0 0 auto", padding: "0 16px" }}>Limpar</button>
          <button type="button" onClick={confirmar} disabled={!sel.start}
            style={{ ...btn(ORANGE, { color: NAVY }), flex: 1, opacity: sel.start ? 1 : 0.5 }}>OK</button>
        </div>
      </div>
    </div>
  );
}
