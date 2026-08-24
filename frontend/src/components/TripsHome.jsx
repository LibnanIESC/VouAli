import React from "react";
import AliAvatar from "./AliAvatar";
import Capa from "./Capa";
import { MapIcon, MoneyIcon, SparkIcon, GearIcon, PencilIcon, PeopleIcon, PlusIcon } from "./Icons";
import { tripStatus } from "../tripmeta";
import { btn, safeTop, CREAM, NAVY, ORANGE, STEEL, SAND, DISPLAY, HELV, INK2, INK3 } from "../theme";

// Cores do selo de situação: o "em viagem" precisa saltar; o resto é discreto.
const SELO = {
  andamento: { bg: ORANGE, fg: NAVY },
  futura: { bg: "rgba(255,255,255,0.92)", fg: NAVY },
  passada: { bg: "rgba(20,32,56,0.55)", fg: "#fff" },
};

// Cabeçalho da home: mesma barra do app (marca centrada entre âncoras de 44px).
function Topo({ onAjustes }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
      <span aria-hidden="true" style={{ width: 44, height: 44, flex: "0 0 auto" }} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, lineHeight: 0.9, color: NAVY }}>Vou</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, lineHeight: 0.9, color: ORANGE }}>Ali</span>
        <span style={{ width: 11, height: 11, marginBottom: 4, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
      </div>
      <button onClick={onAjustes} aria-label="Ajustes" style={{ width: 44, height: 44, flex: "0 0 auto", borderRadius: 22, border: "none", background: "rgba(34,58,94,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GearIcon color={NAVY} size={19} />
      </button>
    </div>
  );
}

// Card de uma viagem: foto grande, nome, período e selo de situação.
// Os botões de ação ficam sobrepostos (irmãos, não filhos) — botão dentro de
// botão é HTML inválido e quebra o toque no Android.
function TripCard({ t, atual, onOpen, onEdit, onShare, podeCompartilhar, abrindo, somenteLeitura }) {
  const st = tripStatus(t.startDate, t.endDate);
  const selo = SELO[st.estado];
  const acao = (rotulo, Icon, onClick) => (
    <button onClick={onClick} aria-label={`${rotulo} — ${t.name}`}
      style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: "rgba(12,22,40,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon color="#fff" size={17} />
    </button>
  );
  return (
    <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 14, boxShadow: atual ? "0 10px 26px rgba(20,32,56,0.20)" : "0 6px 18px rgba(20,32,56,0.12)", outline: atual ? `2.5px solid ${ORANGE}` : "none", outlineOffset: -2.5 }}>
      <button onClick={onOpen} aria-label={`Abrir a viagem ${t.name}`}
        style={{ display: "block", width: "100%", height: 158, padding: 0, border: "none", background: NAVY, cursor: "pointer", fontFamily: HELV, textAlign: "left", position: "relative", opacity: abrindo ? 0.6 : 1 }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "block" }}>
          <Capa semente={t.id} />
          {t.bg
            ? <img src={t.bg} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : null}
          <span style={{ position: "absolute", inset: 0, display: "block", background: "linear-gradient(180deg, rgba(18,30,52,0.15) 0%, rgba(18,30,52,0.30) 45%, rgba(18,30,52,0.88) 100%)" }} />
        </span>
        <span style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "block", color: "#fff" }}>
          <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 23, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.1, textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>{t.name}</span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginTop: 3, textShadow: "0 1px 5px rgba(0,0,0,0.4)" }}>
            {t.dateLabel || t.destination || "sem datas ainda"}
          </span>
        </span>
      </button>

      {selo && (
        <span aria-hidden="true" style={{ position: "absolute", top: 12, left: 14, background: selo.bg, color: selo.fg, borderRadius: 999, padding: "5px 11px", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.2, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
          {st.texto}
        </span>
      )}

      {!somenteLeitura && (
        <div style={{ position: "absolute", top: 10, right: 12, display: "flex", gap: 8 }}>
          {podeCompartilhar && acao("Quem vai junto", PeopleIcon, onShare)}
          {acao("Editar viagem", PencilIcon, onEdit)}
        </div>
      )}
    </div>
  );
}

/**
 * Tela inicial: a lista de viagens.
 *
 * É por onde o app começa. Quando não há nenhuma viagem, ela mesma faz as
 * boas-vindas — sem uma segunda tela só para isso.
 */
export default function TripsHome({ trips, booted, abrindo, somenteLeitura, onOpen, onNew, onEdit, onShare, onAjustes, podeCompartilhar, user, onLogout }) {
  const list = (trips && trips.list) || [];
  const vazia = booted && list.length === 0;

  const beneficio = (Icon, titulo, texto) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left" }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: SAND, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
        <Icon color={NAVY} size={18} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: NAVY }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 13.5, color: INK2, lineHeight: 1.45, marginTop: 1 }}>{texto}</span>
      </span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: CREAM, zIndex: 30, display: "flex", justifyContent: "center", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 440, minHeight: "100%", boxSizing: "border-box", padding: `${safeTop(10)} 18px calc(28px + env(safe-area-inset-bottom))`, display: "flex", flexDirection: "column" }}>
        <Topo onAjustes={onAjustes} />

        {vazia ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "26px 8px 0" }}>
            <AliAvatar size={104} portrait ring={ORANGE} />
            <h1 style={{ margin: "20px 0 0", fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY, letterSpacing: -0.3 }}>Oi! Sou o Ali 👋</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15.5, color: INK2, lineHeight: 1.55, fontWeight: 500, maxWidth: 320 }}>
              Seu companheiro de viagem. Me diga para onde vai e eu ajudo com o roteiro, o orçamento e as dicas de quem já esteve lá.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "30px 0 34px", width: "100%", maxWidth: 340 }}>
              {beneficio(MapIcon, "Roteiro dia a dia", "Monto o cronograma com você — ou do zero, se preferir.")}
              {beneficio(MoneyIcon, "Orçamento no controle", "Acompanhe o planejado, o gasto e quanto sobra.")}
              {beneficio(SparkIcon, "Dicas sob medida", "Do que priorizar ao que evitar, no seu ritmo.")}
            </div>
            {somenteLeitura ? (
              <div style={{ fontSize: 14, color: "#8c3a2c", fontWeight: 600, lineHeight: 1.5, maxWidth: 320 }}>
                📴 Sem internet. Conecte-se para criar sua primeira viagem.
              </div>
            ) : (
              <>
                <button onClick={onNew} style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", maxWidth: 340, fontSize: 16 }}>
                  Criar minha primeira viagem
                </button>
                <div style={{ fontSize: 12.5, color: INK3, marginTop: 12 }}>Leva menos de um minuto.</div>
              </>
            )}
          </div>
        ) : (
          <>
            <h1 style={{ margin: "22px 0 4px", fontSize: 26, fontWeight: 800, color: NAVY, fontFamily: DISPLAY, letterSpacing: -0.4 }}>Minhas viagens</h1>
            <div style={{ fontSize: 13.5, color: INK2, fontWeight: 600, marginBottom: 18 }}>
              {!booted ? "Carregando…"
                : somenteLeitura ? "📴 Sem internet — abrindo a última cópia salva no aparelho."
                : "Toque em uma viagem para abrir o roteiro."}
            </div>

            {!booted && [0, 1].map((i) => (
              <div key={i} aria-hidden="true" style={{ height: 158, borderRadius: 18, background: "#e9e2d4", marginBottom: 14, animation: "pulse 1.4s ease-in-out infinite" }} />
            ))}

            {list.map((t) => (
              <TripCard key={t.id} t={t} atual={t.id === (trips && trips.active)}
                abrindo={abrindo === t.id} somenteLeitura={somenteLeitura}
                onOpen={() => onOpen(t.id)} onEdit={() => onEdit(t)} onShare={() => onShare(t)}
                podeCompartilhar={podeCompartilhar} />
            ))}

            {booted && !somenteLeitura && (
              <button onClick={onNew} style={{ ...btn("#fff", { color: NAVY, border: `1.5px dashed ${STEEL}` }), width: "100%", marginTop: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <PlusIcon color={NAVY} size={18} />Nova viagem
              </button>
            )}
          </>
        )}

        {/* Saída sempre à mão: sem isto, quem entra com a conta errada fica preso.
            O `marginTop: auto` prende ao rodapé — solto no meio da tela, com
            espaço vazio embaixo, parecia que a tela tinha ficado pela metade. */}
        {user && (
          <div style={{ marginTop: "auto", paddingTop: 36, fontSize: 12.5, color: INK3, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>Conectado como <strong style={{ color: INK2, fontWeight: 700 }}>{user.email || user.name}</strong></span>
            <button onClick={onLogout} style={{ background: "none", border: "none", padding: "8px 6px", minHeight: 40, color: STEEL, fontSize: 12.5, fontWeight: 800, fontFamily: HELV, cursor: "pointer", textDecoration: "underline" }}>
              Trocar de conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
