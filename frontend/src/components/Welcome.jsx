import React from "react";
import AliAvatar from "./AliAvatar";
import { MapIcon, MoneyIcon, SparkIcon } from "./Icons";
import { btn, CREAM, NAVY, ORANGE, STEEL, DISPLAY, HELV, INK2, INK3, SAND } from "../theme";

// Primeiro acesso: nenhuma viagem ainda. Cobre a tela inteira para o usuário
// novo não ver conteúdo de exemplo de outra pessoa.
export default function Welcome({ onCreate, user, onLogout }) {
  const item = (Icon, titulo, texto) => (
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
      <div style={{ width: "100%", maxWidth: 440, padding: "48px 26px calc(32px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginBottom: 28 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 0.9, color: NAVY }}>Vou</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 0.9, color: ORANGE }}>Ali</span>
          <span style={{ width: 12, height: 12, marginBottom: 6, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
        </div>

        <AliAvatar size={104} portrait ring={ORANGE} />
        <h1 style={{ margin: "20px 0 0", fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY, letterSpacing: -0.3 }}>Oi! Sou o Ali 👋</h1>
        <p style={{ margin: "8px 0 0", fontSize: 15.5, color: INK2, lineHeight: 1.55, fontWeight: 500, maxWidth: 320 }}>
          Seu companheiro de viagem. Me diga para onde vai e eu ajudo com o roteiro, o orçamento e as dicas de quem já esteve lá.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "30px 0 34px", width: "100%", maxWidth: 340 }}>
          {item(MapIcon, "Roteiro dia a dia", "Monto o cronograma com você — ou do zero, se preferir.")}
          {item(MoneyIcon, "Orçamento no controle", "Acompanhe o planejado, o gasto e quanto sobra.")}
          {item(SparkIcon, "Dicas sob medida", "Do que priorizar ao que evitar, no seu ritmo.")}
        </div>

        <button onClick={onCreate} style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", maxWidth: 340, fontSize: 16 }}>
          Criar minha primeira viagem
        </button>
        <div style={{ fontSize: 12.5, color: INK3, marginTop: 12 }}>Leva menos de um minuto.</div>

        {/* Saída sempre disponível: sem isto, quem entra com a conta errada
            fica preso nesta tela (não há viagem nem acesso aos Ajustes). */}
        {user && (
          <div style={{ marginTop: 34, fontSize: 12.5, color: INK3, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
