import React, { useState, useEffect, useMemo } from "react";
import Sheet from "./Sheet";
import AliAvatar from "./AliAvatar";
import { SparkIcon } from "./Icons";
import { apiGenerate } from "../api";
import { toast } from "../toast";
import { CURRENCIES, INTERESSES, GRUPOS, TRANSPORTES, ehTransporteConhecido, guessCurrency, daysBetween, formatDateLabel, suggestGroup } from "../tripmeta";
import { btn, field, lbl, NAVY, ORANGE, SAND, HELV, INK2, INK3 } from "../theme";

const GEN_MSGS = [
  "Desenhando seus dias…",
  "Espalhando paradas no mapa…",
  "Calculando o orçamento…",
  "Garimpando dicas de quem já foi…",
  "Caprichando nos detalhes…",
];

// Tela de espera da geração: o Ali "trabalhando", com mensagens rotativas.
function GenProgress() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setI((x) => (x + 1) % GEN_MSGS.length), 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ padding: "40px 22px 48px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }} aria-live="polite">
      <AliAvatar size={88} portrait ring={ORANGE} />
      <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginTop: 18 }}>Ali está montando seu roteiro</div>
      <div key={i} style={{ fontSize: 15, fontWeight: 600, color: INK2, marginTop: 10, animation: "fadeUp .35s ease" }}>{GEN_MSGS[i]}</div>
      <div style={{ fontSize: 13, color: INK3, fontWeight: 500, marginTop: 22 }}>Isso leva uns 15 segundos. Depois você pode editar tudo.</div>
    </div>
  );
}

// Contador -/+ com alvos de toque de 44px (usado em adultos e crianças).
function Stepper({ value, onChange, min = 0, max = 20, label }) {
  const btn44 = (txt, on, dis) => (
    <button type="button" onClick={on} disabled={dis} aria-label={txt === "−" ? `Menos ${label}` : `Mais ${label}`}
      style={{ width: 44, height: 44, flex: "0 0 auto", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: NAVY, fontSize: 20, fontWeight: 800, lineHeight: 1, cursor: dis ? "default" : "pointer", opacity: dis ? 0.35 : 1 }}>{txt}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      {btn44("−", () => onChange(Math.max(min, value - 1)), value <= min)}
      <span aria-live="polite" style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 800, color: NAVY, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {btn44("+", () => onChange(Math.min(max, value + 1)), value >= max)}
    </div>
  );
}

// Converte a lista de interesses (texto salvo) em {marcados, outros}.
function parseInteresses(txt) {
  const itens = String(txt || "").split(",").map((s) => s.trim()).filter(Boolean);
  const marcados = [], outros = [];
  itens.forEach((i) => (INTERESSES.some((k) => k.toLowerCase() === i.toLowerCase()) ? marcados.push(INTERESSES.find((k) => k.toLowerCase() === i.toLowerCase())) : outros.push(i)));
  return { marcados, outros: outros.join(", ") };
}

// Formulário de criação/edição de uma viagem.
// Ao criar, permite escolher entre "começar vazia" ou "gerar com o Ali".
export default function TripForm({ trip, onSave, onClose, onDelete, canDelete }) {
  const [f, setF] = useState(trip || { name: "", dateLabel: "", destination: "", origin: "", transport: "", bg: "", currency: "", budget: "", startDate: "", endDate: "", interests: "", adults: 1, children: 0, groupTypes: "" });
  const [mode, setMode] = useState("empty");     // empty | ai (só na criação)
  const [gerando, setGerando] = useState(false);
  const ini = useMemo(() => parseInteresses((trip || {}).interests), [trip]);
  const [tags, setTags] = useState(ini.marcados);
  const [outros, setOutros] = useState(ini.outros);
  const [dias, setDias] = useState("5");         // usado só quando não há datas
  const isNew = !trip;
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Viajantes e perfil do grupo
  const adults = Number(f.adults) >= 0 ? Number(f.adults) : 1;
  const children = Number(f.children) > 0 ? Number(f.children) : 0;
  const totalViajantes = adults + children;
  const [grupos, setGrupos] = useState(() => String((trip || {}).groupTypes || "").split(",").map((s) => s.trim()).filter(Boolean));
  const [grupoTocado, setGrupoTocado] = useState(!!String((trip || {}).groupTypes || "").trim());
  // Enquanto o usuário não escolher, o perfil acompanha a composição do grupo.
  useEffect(() => {
    if (!grupoTocado) setGrupos(suggestGroup(adults, children));
  }, [adults, children, grupoTocado]);
  const toggleGrupo = (g) => {
    setGrupoTocado(true);
    setGrupos((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  };

  // Meio de transporte: um dos conhecidos OU o que a pessoa escrever em "Outro".
  // Guardar num campo só mantém o dado simples para o Ali e para o orçamento.
  const transpSalvo = String((trip || {}).transport || "").trim();
  const [transp, setTransp] = useState(ehTransporteConhecido(transpSalvo) ? transpSalvo : "");
  const [outroTransp, setOutroTransp] = useState(ehTransporteConhecido(transpSalvo) ? "" : transpSalvo);
  const transporte = transp || outroTransp.trim();

  const diasCalc = daysBetween(f.startDate, f.endDate);
  const label = formatDateLabel(f.startDate, f.endDate) || f.dateLabel;
  const nDias = diasCalc || Number(dias || 0);
  const interesses = [...tags, ...String(outros || "").split(",").map((s) => s.trim()).filter(Boolean)].join(", ");

  // Sugere a moeda pelo destino enquanto o usuário ainda não escolheu uma.
  useEffect(() => {
    if (f.currency) return;
    const g = guessCurrency(f.destination || f.name);
    if (g) setF((cur) => (cur.currency ? cur : { ...cur, currency: g }));
  }, [f.destination, f.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (t) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = async () => {
    if (!f.name.trim() || gerando) return;
    const meta = { ...f, dateLabel: label, interests: interesses, budget: Number(f.budget || 0),
                   adults, children, groupTypes: grupos.join(", "),
                   origin: String(f.origin || "").trim(), transport: transporte };
    if (isNew && mode === "ai") {
      if (nDias < 1) { toast("Informe as datas da viagem (ou o número de dias)."); return; }
      setGerando(true);
      const r = await apiGenerate({
        destination: f.destination || f.name,
        dateLabel: label,
        days: nDias,
        budget: Number(f.budget) > 0 ? Number(f.budget) : undefined,
        currency: f.currency || "US$",
        style: interesses,
        adults, children, groupTypes: grupos.join(", "),
        origin: String(f.origin || "").trim(), transport: transporte,
      });
      setGerando(false);
      if (r && r.state) { onSave({ ...meta, data: r.state }); return; }
      if (r && r.error === "not_configured") { toast("A IA ainda não está ligada — falta a chave no servidor."); return; }
      if (r && r.error === "rate_limited") { toast("Muitas gerações em pouco tempo. Espera uns segundinhos. 🙂"); return; }
      if (r && r.error === "quota") { toast(`Você já usou os ${r.limite} roteiros do mês. Crie a viagem vazia e monte com o Ali aos poucos. 🙂`); return; }
      if (r && r.error === "ai_paused") { toast("O Ali está de recesso rapidinho. Crie a viagem vazia por enquanto."); return; }
      if (r && r.error === "invalid") { toast("Informe o destino e o número de dias (pelo menos 1)."); return; }
      toast("Não consegui gerar o roteiro agora. Tenta de novo, ou crie a viagem vazia."); return;
    }
    onSave(meta); // criar vazia OU salvar edição
  };

  const modeBtn = (id, label2) => (
    <button type="button" onClick={() => setMode(id)} disabled={gerando}
      style={{ flex: 1, padding: "10px 8px", minHeight: 44, borderRadius: 12, fontSize: 13.5, fontWeight: 800, fontFamily: HELV, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        border: mode === id ? `2px solid ${NAVY}` : "1.5px solid #ddd",
        background: mode === id ? SAND : "#fff", color: NAVY }}>{label2}</button>
  );

  // Enquanto o Ali monta o roteiro não há o que salvar nem cancelar.
  const acoes = gerando ? null : (
    <>
      {canDelete && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
      <button onClick={submit} disabled={!f.name.trim()} style={{ ...btn(isNew && mode === "ai" ? ORANGE : NAVY, { color: isNew && mode === "ai" ? NAVY : "#fff" }), flex: 1, opacity: !f.name.trim() ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {trip ? "Salvar" : (mode === "ai" ? <><SparkIcon color={NAVY} size={15} />Gerar e criar</> : "Criar viagem")}
      </button>
    </>
  );

  return (
    <Sheet onClose={gerando ? () => {} : onClose} acoes={acoes}>
      {gerando ? <GenProgress /> : (
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{trip ? "Editar viagem" : "Nova viagem"}</div>

        <label style={lbl}>Nome</label>
        <input style={field} value={f.name} onChange={up("name")} placeholder="Ex: New York" />
        <label style={lbl}>Destino</label>
        <input style={field} value={f.destination} onChange={up("destination")} placeholder="Ex: New York, EUA" />

        {/* Origem e meio: sem isso o roteiro começa com você já no destino,
            sem embarque, sem tempo de viagem e sem o custo de chegar lá. */}
        <label style={lbl}>Saindo de</label>
        <input style={field} value={f.origin || ""} onChange={up("origin")} placeholder="Ex: Belo Horizonte, MG" />

        <label style={lbl}>Meio de transporte</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {TRANSPORTES.map((t) => {
            const on = transp === t.id;
            return (
              <button key={t.id} type="button" aria-pressed={on}
                onClick={() => { setTransp(on ? "" : t.id); if (!on) setOutroTransp(""); }}
                style={{ padding: "9px 14px", minHeight: 40, borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                  border: on ? `2px solid ${NAVY}` : "1.5px solid #ddd", background: on ? SAND : "#fff", color: NAVY }}>
                <span aria-hidden="true">{t.emoji}</span>{t.id}
              </button>
            );
          })}
        </div>
        <input style={{ ...field, marginTop: 10 }} value={outroTransp}
          onChange={(e) => { setOutroTransp(e.target.value); if (e.target.value.trim()) setTransp(""); }}
          placeholder="Outro (ex: van, motorhome)" aria-label="Outro meio de transporte" />
        {(f.origin || "").trim() && transporte && (
          <div style={{ fontSize: 12, color: INK3, marginTop: 6 }}>
            O Ali inclui a ida e a volta no roteiro e estima o custo do deslocamento.
          </div>
        )}

        {/* Datas com seletor de calendário */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Início</label>
            <input type="date" style={field} value={f.startDate || ""} onChange={up("startDate")} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Fim</label>
            <input type="date" style={field} value={f.endDate || ""} onChange={up("endDate")} min={f.startDate || undefined} />
          </div>
        </div>
        {(label || diasCalc > 0) && (
          <div style={{ fontSize: 13, color: INK2, fontWeight: 600, marginTop: 8 }}>
            {label}{diasCalc > 0 ? ` · ${diasCalc} ${diasCalc === 1 ? "dia" : "dias"}` : ""}
          </div>
        )}
        {f.startDate && f.endDate && diasCalc === 0 && (
          <div style={{ fontSize: 13, color: "#C62828", fontWeight: 600, marginTop: 8 }}>A data final precisa ser igual ou depois da inicial.</div>
        )}

        {/* Viajantes + perfil do grupo */}
        <label style={lbl}>Viajantes</label>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK3 }}>Adultos</div>
            <Stepper value={adults} min={0} label="adultos" onChange={(v) => setF((c) => ({ ...c, adults: v }))} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK3 }}>Crianças</div>
            <Stepper value={children} min={0} label="crianças" onChange={(v) => setF((c) => ({ ...c, children: v }))} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {GRUPOS.filter((g) => (totalViajantes > 1 ? g !== "Sozinho(a)" : g === "Sozinho(a)")).map((g) => {
            const on = grupos.includes(g);
            return (
              <button key={g} type="button" onClick={() => toggleGrupo(g)} aria-pressed={on}
                style={{ padding: "9px 14px", minHeight: 40, borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer",
                  border: on ? `2px solid ${NAVY}` : "1.5px solid #ddd", background: on ? SAND : "#fff", color: NAVY }}>{g}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: INK3, marginTop: 6 }}>
          {totalViajantes > 1
            ? "O Ali adapta ritmo, comida e dicas ao perfil do grupo."
            : "Viajando só? O Ali foca em segurança e liberdade pra mudar o plano."}
        </div>

        {/* Orçamento + moeda */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1.3 }}>
            <label style={lbl}>Orçamento (teto)</label>
            <input type="number" inputMode="decimal" style={field} value={f.budget} onChange={up("budget")} placeholder="Ex: 3000" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Moeda</label>
            <select style={{ ...field, appearance: "auto" }} value={f.currency || "US$"} onChange={up("currency")}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Interesses */}
        <label style={lbl}>Interesses</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {INTERESSES.map((t) => {
            const on = tags.includes(t);
            return (
              <button key={t} type="button" onClick={() => toggleTag(t)} aria-pressed={on}
                style={{ padding: "9px 14px", minHeight: 40, borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer",
                  border: on ? `2px solid ${NAVY}` : "1.5px solid #ddd", background: on ? SAND : "#fff", color: NAVY }}>{t}</button>
            );
          })}
        </div>
        <input style={{ ...field, marginTop: 10 }} value={outros} onChange={(e) => setOutros(e.target.value)} placeholder="Outros (separe por vírgula)" aria-label="Outros interesses" />

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
                {diasCalc > 0 ? (
                  <div style={{ fontSize: 13.5, color: INK2, fontWeight: 600 }}>
                    O Ali vai montar <strong style={{ color: NAVY }}>{diasCalc} {diasCalc === 1 ? "dia" : "dias"}</strong> de roteiro{f.destination ? ` em ${f.destination}` : ""}.
                  </div>
                ) : (
                  <>
                    <label style={{ ...lbl, marginTop: 0 }}>Nº de dias</label>
                    <input type="number" style={field} value={dias} onChange={(e) => setDias(e.target.value)} min={1} max={12} />
                    <div style={{ fontSize: 12, color: INK3, marginTop: 6 }}>Preencha as datas acima para calcular sozinho.</div>
                  </>
                )}
                <div style={{ fontSize: 12, color: "#8a7a63", marginTop: 8, lineHeight: 1.5 }}>Ele usa o destino, as datas, o orçamento e os interesses. Você pode editar tudo depois.</div>
              </div>
            )}
          </>
        )}

      </div>
      )}
    </Sheet>
  );
}
