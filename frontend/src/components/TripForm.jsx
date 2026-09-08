import React, { useState, useEffect, useMemo, useRef } from "react";
import Sheet from "./Sheet";
import AliAvatar from "./AliAvatar";
import { SparkIcon } from "./Icons";
import { apiGenerate } from "../api";
import { toast } from "../toast";
import { CURRENCIES, INTERESSES, GRUPOS, TRANSPORTES, ehTransporteConhecido, guessCurrency, daysBetween, formatDateLabel, suggestGroup } from "../tripmeta";
import { btn, field, lbl, NAVY, ORANGE, SAND, CREAM, HELV, DISPLAY, INK2, INK3 } from "../theme";
import { digitarNumero, numeroDoCampo, campoDeNumero, estimativaGeracao } from "../utils";
import { fotoParaCapa } from "../imagem";

const GEN_MSGS = [
  "Desenhando seus dias…",
  "Espalhando paradas no mapa…",
  "Calculando o orçamento…",
  "Garimpando dicas de quem já foi…",
  "Caprichando nos detalhes…",
];

/**
 * Tela de espera da geração: o Ali "trabalhando", com mensagens rotativas.
 *
 * Ocupa a tela inteira de propósito. Como gaveta, ela deixava aparecer a tela
 * de boas-vindas atrás — com OUTRO retrato do Ali. Dois Alis ao mesmo tempo
 * confundem, e são quinze segundos olhando para isso.
 */
function GenProgress({ dias }) {
  const [i, setI] = useState(0);
  const [passou, setPassou] = useState(0);     // segundos desde que começou
  const { segundos, texto } = estimativaGeracao(dias);
  useEffect(() => {
    const iv = setInterval(() => setI((x) => (x + 1) % GEN_MSGS.length), 2200);
    const relogio = setInterval(() => setPassou((s) => s + 1), 1000);
    return () => { clearInterval(iv); clearInterval(relogio); };
  }, []);
  // Passar da estimativa é normal em roteiros longos. Dizer isso é melhor do
  // que deixar a pessoa achando que o app travou e fechar no meio.
  const pct = Math.min(100, Math.round((passou / segundos) * 100));
  return (
    <div aria-live="polite" role="status"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: CREAM, display: "flex", justifyContent: "center", alignItems: "center", padding: "24px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 340 }}>
        <AliAvatar size={104} portrait ring={ORANGE} />
        <div style={{ fontSize: 21, fontWeight: 800, color: NAVY, marginTop: 20, fontFamily: DISPLAY }}>Ali está montando seu roteiro</div>
        <div key={i} style={{ fontSize: 15.5, fontWeight: 600, color: INK2, marginTop: 10, animation: "fadeUp .35s ease" }}>{GEN_MSGS[i]}</div>
        <div aria-hidden="true" style={{ width: "100%", maxWidth: 260, height: 6, borderRadius: 999, background: "#e9e2d4", marginTop: 26, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 999, transition: "width 1s linear" }} />
        </div>
        <div style={{ fontSize: 13, color: INK3, fontWeight: 500, marginTop: 14, lineHeight: 1.5 }}>
          {passou < segundos
            ? <>Isso leva {texto}. Depois você pode editar tudo.</>
            : <>Roteiros longos levam um pouco mais. Já está terminando.</>}
        </div>
      </div>
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
export default function TripForm({ trip, onSave, onClose, onDelete, canDelete, onGerando }) {
  const [f, setF] = useState(() => {
    const t = trip || { name: "", dateLabel: "", destination: "", origin: "", transport: "", bg: "", currency: "", startDate: "", endDate: "", interests: "", adults: 1, children: 0, groupTypes: "" };
    return { ...t, budget: campoDeNumero(t.budget) };   // o teto é texto enquanto se digita
  });
  const [gerando, setGerando] = useState(false);
  // O app precisa saber que a tela de espera está no ar: ela é CREME, e sem
  // isso a barra de status continuaria pintada como se o fundo fosse escuro —
  // ícones brancos sobre creme somem.
  useEffect(() => { onGerando && onGerando(gerando); }, [gerando, onGerando]);
  useEffect(() => () => { onGerando && onGerando(false); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
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

  // A capa vai junto com a viagem para quem viaja com você, então a foto é
  // reduzida e embutida aqui — guardar o caminho de um arquivo que só existe
  // neste celular não serviria para ninguém mais.
  const fotoRef = useRef(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const escolherFoto = async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = "";                 // permite escolher a mesma foto de novo
    if (!arquivo) return;
    setLendoFoto(true);
    try {
      const capa = await fotoParaCapa(arquivo);
      setF((cur) => ({ ...cur, bg: capa }));
    } catch (err) {
      toast("Não consegui usar essa foto. Tente outra.");
    }
    setLendoFoto(false);
  };

  const submit = async (comAli = false) => {
    if (!f.name.trim() || gerando) return;
    const meta = { ...f, dateLabel: label, interests: interesses, budget: numeroDoCampo(f.budget),
                   adults, children, groupTypes: grupos.join(", "),
                   origin: String(f.origin || "").trim(), transport: transporte };
    if (isNew && comAli) {
      if (nDias < 1) { toast("Informe as datas da viagem (ou o número de dias)."); return; }
      setGerando(true);
      const r = await apiGenerate({
        destination: f.destination || f.name,
        dateLabel: label,
        days: nDias,
        budget: numeroDoCampo(f.budget) > 0 ? numeroDoCampo(f.budget) : undefined,
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

  // Enquanto o Ali monta o roteiro não há o que salvar nem cancelar.
  //
  // Ao criar, a escolha é a PRÓPRIA AÇÃO — dois botões, aqui no rodapé. Antes
  // ela era um par de chips no fim da rolagem, com "começar vazia" já marcado,
  // enquanto o botão de criar ficava fixo à vista o tempo todo. Quem preenchia
  // destino, datas e interesses via "Criar viagem" logo abaixo do orçamento e
  // tocava — criando uma viagem vazia sem nunca ver a opção do Ali.
  const acoes = gerando ? null : (
    <>
      {canDelete && <button onClick={onDelete} style={btn("#fff", { color: "#d11", border: "1.5px solid #d11" })}>Excluir</button>}
      {isNew && (
        <button onClick={() => submit(false)} disabled={!f.name.trim()}
          style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), flex: "0 0 auto", padding: "0 16px", opacity: !f.name.trim() ? 0.6 : 1 }}>
          Criar vazia
        </button>
      )}
      <button onClick={() => submit(isNew)} disabled={!f.name.trim()} style={{ ...btn(isNew ? ORANGE : NAVY, { color: isNew ? NAVY : "#fff" }), flex: 1, opacity: !f.name.trim() ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {trip ? "Salvar" : <><SparkIcon color={NAVY} size={15} />Gerar com o Ali</>}
      </button>
    </>
  );

  // Enquanto gera, a tela de espera toma o lugar da gaveta inteira.
  if (gerando) return <GenProgress dias={nDias} />;

  return (
    <Sheet onClose={onClose} acoes={acoes}>
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

        {/* Sem datas ainda dá para gerar: o Ali só precisa saber quantos dias.
            O campo mora aqui, junto das datas, e não numa seção separada no fim
            do formulário — é o mesmo assunto. */}
        {isNew && diasCalc === 0 && (
          <>
            <label style={lbl}>Quantos dias</label>
            <input type="number" style={field} value={dias} onChange={(e) => setDias(e.target.value)} min={1} max={12} aria-label="Número de dias da viagem" />
            <div style={{ fontSize: 12, color: INK3, marginTop: 6 }}>Usado se você ainda não tem as datas. Preencha-as acima e ele calcula sozinho.</div>
          </>
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
            <input inputMode="decimal" style={field} value={f.budget} onChange={(e) => setF({ ...f, budget: digitarNumero(e.target.value) })} placeholder="Ex: 3000" />
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

        <label style={lbl}>Foto de capa</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button type="button" onClick={() => fotoRef.current && fotoRef.current.click()} disabled={lendoFoto}
            style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), flex: 1, opacity: lendoFoto ? 0.6 : 1 }}>
            {lendoFoto ? "Preparando…" : "Escolher do aparelho"}
          </button>
          {f.bg ? (
            <button type="button" onClick={() => setF((c) => ({ ...c, bg: "" }))}
              style={{ ...btn("#fff", { color: INK2, border: "1.5px solid #ddd" }), flex: "0 0 auto", padding: "0 16px" }}>
              Remover
            </button>
          ) : null}
        </div>
        <input ref={fotoRef} type="file" accept="image/*" onChange={escolherFoto} style={{ display: "none" }} aria-hidden="true" tabIndex={-1} />
        <input style={{ ...field, marginTop: 10 }} value={f.bg && f.bg.startsWith("data:") ? "" : f.bg}
          onChange={up("bg")} disabled={!!(f.bg && f.bg.startsWith("data:"))}
          placeholder="…ou cole o link (URL) de uma foto" aria-label="Link de uma foto" />
        {f.bg ? (
          <div style={{ marginTop: 8, height: 90, borderRadius: 10, overflow: "hidden", border: "1px solid #e5e2da" }}>
            <img src={f.bg} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : (
          <div style={{ fontSize: 12, color: INK3, marginTop: 6 }}>Sem foto, a viagem ganha uma capa ilustrada.</div>
        )}

        {/* Fecha o formulário dizendo o que os dois botões do rodapé fazem. A
            escolha está lá, na hora de agir — aqui fica só o aviso do que o Ali
            leva em conta, para ninguém achar que preencheu à toa. */}
        {isNew && (
          <div style={{ marginTop: 20, background: "#faf7f1", borderRadius: 12, padding: "12px 14px" }}>
            {nDias > 0 ? (
              <div style={{ fontSize: 13.5, color: INK2, fontWeight: 600 }}>
                O Ali monta <strong style={{ color: NAVY }}>{nDias} {nDias === 1 ? "dia" : "dias"}</strong> de roteiro{f.destination ? ` em ${f.destination}` : ""} com o que você preencheu acima.
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: INK2, fontWeight: 600 }}>
                Informe as datas — ou quantos dias — para o Ali montar o roteiro.
              </div>
            )}
            <div style={{ fontSize: 12, color: "#8a7a63", marginTop: 8, lineHeight: 1.5 }}>
              Ele usa o destino, as datas, o orçamento e os interesses. Você pode editar tudo depois — ou criar a viagem vazia e montar aos poucos.
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
