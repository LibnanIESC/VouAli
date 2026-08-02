import React, { useState, useEffect, useRef } from "react";
import { uid } from "./utils";
import { HELV, DISPLAY, MONO, CREAM, NAVY, ORANGE, CARD_DARK, HSHADOW, PHOTO, btn } from "./theme";
import { apiGet, apiPut, onStatus, setRemoteHandler, isDirty, flushPending } from "./api";
import { seedDays, seedBudget, seedPrebuy, seedNotes, TOTAL_BUDGET } from "./seed";
import { MapIcon, MoneyIcon, PinIcon } from "./components/Icons";
import Skyline from "./components/Skyline";
import SyncPill from "./components/SyncPill";
import AliTip from "./components/AliTip";
import StopDetail from "./components/StopDetail";
import StopForm from "./components/StopForm";
import BudgetForm from "./components/BudgetForm";
import TextForm from "./components/TextForm";

export default function App() {
  const [days, setDays] = useState(seedDays);
  const [budget, setBudget] = useState(seedBudget);
  const [prebuy, setPrebuy] = useState(seedPrebuy);
  const [notes, setNotes] = useState(seedNotes);
  const [active, setActive] = useState("qua");
  const [tab, setTab] = useState("roteiro");
  const [ov, setOv] = useState(null);
  const [reorder, setReorder] = useState(false);
  const [sync, setSync] = useState("synced");

  // aplica um estado (do servidor ou de um import) na UI
  const applyState = (s) => {
    if (!s) return;
    if (s.days) setDays(s.days);
    if (s.budget) setBudget(s.budget);
    if (s.prebuy) setPrebuy(s.prebuy);
    if (s.notes) setNotes(s.notes);
  };

  useEffect(() => onStatus(setSync), []);

  useEffect(() => {
    setRemoteHandler(applyState);
    (async () => {
      const r = await apiGet();
      if (r && r.state) applyState(r.state);
    })();
  }, []);

  // Polling: o outro aparelho passa a aparecer. Só adota o remoto quando não há
  // edição local pendente, para não descartar algo que você acabou de digitar.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden || isDirty()) return;
      const r = await apiGet();
      if (alive && r && r.state) applyState(r.state);
    };
    const iv = setInterval(poll, 12000);
    const onVis = () => { if (!document.hidden) { flushPending(); poll(); } };
    const onOnline = () => flushPending();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("online", onOnline);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.removeEventListener("online", onOnline); };
  }, []);

  const persist = (next) => {
    const snap = { days, budget, prebuy, notes, ...next };
    apiPut(snap);
  };

  const day = days.find((d) => d.id === active) || days[0];
  const totalStops = days.reduce((a, d) => a + d.stops.length, 0);
  const totalDone = days.reduce((a, d) => a + d.stops.filter((s) => s.done).length, 0);
  const overallPct = totalStops ? Math.round((totalDone / totalStops) * 100) : 0;
  const planned = budget.reduce((a, b) => a + Number(b.v || 0), 0);
  const spent = budget.reduce((a, b) => a + Number(b.spent || 0), 0);
  const remaining = TOTAL_BUDGET - planned;

  // Dica do Ali para o dia: a primeira parada com insight vira o "briefing".
  const aliDayTip = (day.stops.find((s) => s.insight && s.insight.trim()) || {}).insight;
  // Observação proativa do Ali sobre o orçamento (calculada, não armazenada).
  const aliBudgetTip = remaining < 0
    ? `Você passou US$ ${Math.abs(remaining).toLocaleString()} do teto planejado. Quer rever onde dá pra cortar?`
    : remaining >= 100
      ? `Sobram US$ ${remaining.toLocaleString()} dentro do teto — folga boa pra compras e imprevistos.`
      : `Sobram US$ ${remaining.toLocaleString()} dentro do teto. Tá justo, vale ficar de olho nos gastos.`;

  const setDaysP = (nd) => { setDays(nd); persist({ days: nd }); };
  const setBudgetP = (nb) => { setBudget(nb); persist({ budget: nb }); };
  const setPrebuyP = (np) => { setPrebuy(np); persist({ prebuy: np }); };
  const setNotesP = (nn) => { setNotes(nn); persist({ notes: nn }); };

  // ---------- Backup (export / import JSON) ----------
  const fileRef = useRef(null);
  const exportBackup = () => {
    const data = { days, budget, prebuy, notes, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vouali-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { alert("Não consegui ler o arquivo: JSON inválido."); return; }
      if (!obj || (!obj.days && !obj.budget && !obj.prebuy && !obj.notes)) {
        alert("Arquivo inválido: não parece um backup do VouAli."); return;
      }
      if (!window.confirm("Isso vai substituir todos os dados atuais pela cópia do arquivo. Continuar?")) return;
      applyState(obj);
      apiPut({ days: obj.days || days, budget: obj.budget || budget, prebuy: obj.prebuy || prebuy, notes: obj.notes || notes });
    };
    reader.readAsText(file);
  };

  const toggleStop = (sid) =>
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.map((s) => s.id === sid ? { ...s, done: !s.done } : s) } : d));
  const moveStop = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= day.stops.length) return;
    const stops = [...day.stops];
    [stops[idx], stops[j]] = [stops[j], stops[idx]];
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops } : d));
  };
  const saveStop = (data) => {
    const exists = day.stops.some((s) => s.id === data.id);
    const stops = exists ? day.stops.map((s) => s.id === data.id ? data : s) : [...day.stops, { ...data, id: uid(), done: false }];
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops } : d));
    setOv(null);
  };
  const deleteStop = (sid) => {
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.filter((s) => s.id !== sid) } : d));
    setOv(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", justifyContent: "center", fontFamily: HELV, position: "relative", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} button{transition:transform .08s ease} button:active{transform:scale(.96)} @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`}</style>
      <Skyline />
      <img src={PHOTO} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, rgba(20,36,64,0.48) 0%, rgba(20,36,64,0.34) 45%, rgba(20,36,64,0.66) 100%)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: 440, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, rgba(27,47,77,0.95) 0%, rgba(34,58,94,0.9) 50%, rgba(44,77,112,0.86) 100%)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff", padding: "18px 20px 16px", boxShadow: "0 2px 14px rgba(10,20,40,0.32)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 27, lineHeight: 0.9, color: CREAM }}>Vou</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 27, lineHeight: 0.9, color: ORANGE }}>Ali</span>
                <span style={{ width: 11, height: 11, marginBottom: 6, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
              </div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.05 }}>New York</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 600, marginTop: 1 }}>6 – 13 Outubro</div>
            </div>
            <div style={{ textAlign: "right", paddingTop: 2 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: 700, letterSpacing: 1 }}>PROGRESSO</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: DISPLAY, color: ORANGE }}>{overallPct}%</div>
            </div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.28)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${overallPct}%`, background: ORANGE, transition: "width .4s ease" }} />
          </div>
          <SyncPill status={sync} />
        </div>

        {/* Day selector */}
        {tab === "roteiro" && (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "14px 16px", background: "linear-gradient(135deg, rgba(27,47,77,0.82), rgba(44,77,112,0.66))", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
            {days.map((d) => {
              const sel = d.id === active;
              const complete = d.stops.length && d.stops.every((s) => s.done);
              return (
                <button key={d.id} onClick={() => setActive(d.id)} style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: sel ? 1 : 0.55 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: d.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, border: sel ? "3px solid #fff" : "3px solid transparent", position: "relative" }}>
                    {d.line}
                    {complete && <div style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: ORANGE, border: "2px solid #223A5E", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                  </div>
                  <div style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{d.label}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 90px" }}>
          {tab === "roteiro" && (
            <>
              <div style={{ fontSize: 11, letterSpacing: 1.4, color: "rgba(251,244,233,0.92)", fontWeight: 500, marginBottom: 4, fontFamily: MONO, textTransform: "uppercase", textShadow: HSHADOW }}>{day.date} · {day.sub}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: -0.3, fontFamily: DISPLAY, textShadow: HSHADOW }}>{day.title}</h2>
                <button onClick={() => setReorder(!reorder)} style={btn(reorder ? day.color : "#fff", { color: reorder ? "#fff" : day.color, border: `1.5px solid ${day.color}`, padding: "7px 12px", flex: "0 0 auto", fontSize: 13 })}>{reorder ? "Concluir" : "↕ Reordenar"}</button>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", marginBottom: 18, fontWeight: 600, textShadow: HSHADOW }}>{reorder ? "Use as setas para mudar a ordem" : `${day.stops.filter((s) => s.done).length} de ${day.stops.length} paradas · toque para detalhes`}</div>

              {!reorder && aliDayTip && (
                <div style={{ marginBottom: 18 }}><AliTip>{aliDayTip}</AliTip></div>
              )}

              <div style={{ position: "relative" }}>
                {day.stops.map((s, i) => {
                  const last = i === day.stops.length - 1;
                  const arrow = (dir, disabled) => (
                    <button onClick={() => moveStop(i, dir)} disabled={disabled} style={{ width: 30, height: 25, borderRadius: 7, border: "1.5px solid #ccc", background: "#fff", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, fontWeight: 900, fontSize: 14, color: "#223A5E", lineHeight: 1 }}>{dir < 0 ? "↑" : "↓"}</button>
                  );
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: last ? 0 : 22 }}>
                      {!last && !reorder && <div style={{ position: "absolute", left: 12, top: 26, bottom: 0, width: 3, background: s.done ? day.color : "#d9d7d0" }} />}
                      {reorder ? (
                        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4, zIndex: 1 }}>
                          {arrow(-1, i === 0)}
                          {arrow(1, last)}
                        </div>
                      ) : (
                        <div onClick={() => toggleStop(s.id)} style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", zIndex: 1, cursor: "pointer", background: s.done ? day.color : "#fff", border: `3px solid ${s.done ? day.color : "#c9c7c0"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {s.done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                        </div>
                      )}
                      <div onClick={reorder ? undefined : () => setOv({ kind: "detail", stop: s })} style={{ flex: 1, background: "#fff", borderRadius: 13, padding: "12px 14px", boxShadow: "0 5px 16px rgba(10,22,55,0.18)", opacity: (s.done && !reorder) ? 0.6 : 1, cursor: reorder ? "default" : "pointer", borderLeft: `4px solid ${day.color}`, border: reorder ? `1.5px solid ${day.color}` : undefined, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: "#223A5E", textDecoration: (s.done && !reorder) ? "line-through" : "none" }}>{s.n}</span>
                            <span style={{ flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: day.color }}>{s.t}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2, fontWeight: 500 }}>{s.d}</div>
                        </div>
                        {!reorder && <span style={{ color: "#cfcdc6", fontSize: 20, fontWeight: 700, flex: "0 0 auto" }}>›</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!reorder && <button onClick={() => setOv({ kind: "stopForm", stop: null })} style={btn("#fff", { color: day.color, border: `1.5px dashed ${day.color}`, width: "100%", marginTop: 20 })}>+ Adicionar parada</button>}
            </>
          )}

          {tab === "orcamento" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: DISPLAY, textShadow: HSHADOW }}>Orçamento</h2>
                <button onClick={() => setOv({ kind: "budgetForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Item</button>
              </div>
              <div style={{ background: CARD_DARK, color: "#fff", borderRadius: 16, padding: "18px 20px", marginBottom: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Teto</span><span style={{ fontWeight: 800 }}>US$ {TOTAL_BUDGET.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Planejado</span><span style={{ fontWeight: 800 }}>US$ {planned.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8a8a8a", fontSize: 13, fontWeight: 600 }}>Já gasto</span><span style={{ fontWeight: 800 }}>US$ {spent.toLocaleString()}</span></div>
                <div style={{ height: 1, background: "#2a2a2a", margin: "12px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14, fontWeight: 700 }}>Sobra p/ compras</span><span style={{ fontWeight: 800, fontSize: 24, color: remaining < 0 ? "#ef4444" : "#F28C28" }}>US$ {remaining.toLocaleString()}</span></div>
              </div>
              <div style={{ marginBottom: 20 }}><AliTip>{aliBudgetTip}</AliTip></div>
              {budget.map((b) => (
                <div key={b.id} onClick={() => setOv({ kind: "budgetForm", item: b })} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 4px 14px rgba(10,22,55,0.14)", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#223A5E" }}>{b.k}</div>
                    <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{b.tag}{b.spent ? ` · gasto US$ ${b.spent}` : ""}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#223A5E" }}>US$ {b.v}</div>
                </div>
              ))}
            </>
          )}

          {tab === "info" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: DISPLAY, textShadow: HSHADOW }}>Comprar antes</h2>
                <button onClick={() => setOv({ kind: "prebuyForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Item</button>
              </div>
              {prebuy.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", borderRadius: 10, padding: "13px 14px", marginBottom: 8, boxShadow: "0 4px 14px rgba(10,22,55,0.14)" }}>
                  <div onClick={() => setPrebuyP(prebuy.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} style={{ width: 22, height: 22, borderRadius: 6, flex: "0 0 auto", cursor: "pointer", background: p.done ? "#F28C28" : "#fff", border: `2px solid ${p.done ? "#F28C28" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>{p.done && "✓"}</div>
                  <span onClick={() => setOv({ kind: "prebuyForm", item: p })} style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#223A5E", textDecoration: p.done ? "line-through" : "none", opacity: p.done ? 0.5 : 1, cursor: "pointer" }}>{p.text}</span>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 14px" }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: DISPLAY, textShadow: HSHADOW }}>Notas</h2>
                <button onClick={() => setOv({ kind: "noteForm", item: null })} style={btn("#223A5E", { padding: "8px 12px" })}>+ Nota</button>
              </div>
              {notes.map((nt) => (
                <div key={nt.id} onClick={() => setOv({ kind: "noteForm", item: nt })} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 10, boxShadow: "0 4px 14px rgba(10,22,55,0.14)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#223A5E", marginBottom: 6 }}>{nt.title}</div>
                  <div style={{ fontSize: 13, color: "#665", lineHeight: 1.5, fontWeight: 500 }}>{nt.body}</div>
                </div>
              ))}

              <div style={{ margin: "26px 0 14px" }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: DISPLAY, textShadow: HSHADOW }}>Backup</h2>
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px", boxShadow: "0 4px 14px rgba(10,22,55,0.14)" }}>
                <div style={{ fontSize: 13, color: "#665", lineHeight: 1.5, fontWeight: 500, marginBottom: 12 }}>
                  Baixe uma cópia de toda a viagem (roteiro, orçamento e notas) antes de viajar. Se algo der errado, é só reimportar.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={exportBackup} style={{ ...btn("#223A5E"), flex: 1 }}>↓ Exportar</button>
                  <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btn("#fff", { color: "#223A5E", border: "1.5px solid #223A5E" }), flex: 1 }}>↑ Importar</button>
                </div>
                <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                  onChange={(e) => { importBackup(e.target.files[0]); e.target.value = ""; }} />
              </div>
            </>
          )}
        </div>

        {/* Bottom tabs (fixas no rodapé da tela) */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, margin: "0 auto", width: "100%", maxWidth: 440, zIndex: 20, display: "flex", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.5)", padding: "8px 0 calc(10px + env(safe-area-inset-bottom))", boxShadow: "0 -3px 16px rgba(10,20,50,0.16)" }}>
          {[
            { id: "roteiro", label: "Roteiro", Icon: MapIcon },
            { id: "orcamento", label: "Orçamento", Icon: MoneyIcon },
            { id: "info", label: "Info", Icon: PinIcon },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <t.Icon color={on ? "#223A5E" : "#b5b3ac"} />
                <span style={{ fontSize: 11, fontWeight: 800, color: on ? "#223A5E" : "#b5b3ac" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlays */}
      {ov?.kind === "detail" && (
        <StopDetail stop={ov.stop} color={day.color} onClose={() => setOv(null)}
          onEdit={() => setOv({ kind: "stopForm", stop: ov.stop })}
          onDelete={() => deleteStop(ov.stop.id)} />
      )}
      {ov?.kind === "stopForm" && (
        <StopForm stop={ov.stop} color={day.color} onClose={() => setOv(null)} onSave={saveStop} />
      )}
      {ov?.kind === "budgetForm" && (
        <BudgetForm item={ov.item} onClose={() => setOv(null)}
          onSave={(data) => { const nb = ov.item ? budget.map((b) => b.id === data.id ? data : b) : [...budget, { ...data, id: uid() }]; setBudgetP(nb); setOv(null); }}
          onDelete={() => { setBudgetP(budget.filter((b) => b.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "prebuyForm" && (
        <TextForm title={ov.item ? "Editar item" : "Novo item"} canDelete={!!ov.item}
          initial={ov.item || { text: "" }} fields={[{ k: "text", label: "Texto" }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.text?.trim()) return; const np = ov.item ? prebuy.map((p) => p.id === data.id ? data : p) : [...prebuy, { id: uid(), text: data.text, done: false }]; setPrebuyP(np); setOv(null); }}
          onDelete={() => { setPrebuyP(prebuy.filter((p) => p.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "noteForm" && (
        <TextForm title={ov.item ? "Editar nota" : "Nova nota"} canDelete={!!ov.item}
          initial={ov.item || { title: "", body: "" }}
          fields={[{ k: "title", label: "Título", ph: "Ex: 🚕 Táxi do aeroporto" }, { k: "body", label: "Texto", area: true }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.title?.trim()) return; const nn = ov.item ? notes.map((n) => n.id === data.id ? data : n) : [...notes, { ...data, id: uid() }]; setNotesP(nn); setOv(null); }}
          onDelete={() => { setNotesP(notes.filter((n) => n.id !== ov.item.id)); setOv(null); }} />
      )}
    </div>
  );
}
