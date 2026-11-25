import React, { useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiSaldo } from "../api";
import { PencilIcon, PeopleIcon, ChevronIcon } from "./Icons";
import { NAVY, HELV, INK2, INK3, STEEL } from "../theme";

/**
 * O aviso de créditos numa viagem de OUTRA pessoa: de quem o Ali gasta aqui.
 * Na própria viagem não há o que dizer — os créditos são da conta e estão nas
 * Configurações Gerais.
 */
export function avisoDeCreditos(saldo) {
  if (!saldo) return "";
  if (saldo.dono) return `Nesta viagem, o Ali usa primeiro os créditos de ${saldo.dono.nome || "quem convidou você"}.`;
  if (saldo.dono_bloqueou) return `Nesta viagem, o Ali usa os seus créditos: ${saldo.dono_bloqueou} preferiu não compartilhar os do pacote.`;
  return "";
}

// Configurações da Viagem: só o que é DESTA viagem. Conta, créditos e o
// backup de tudo ficam nas Configurações Gerais (link no fim).
export default function ViagemConfigSheet({ trip, podeCompartilhar, somenteLeitura, logado, onEditar, onQuemVaiJunto, onExportar, onGerais, onClose }) {
  const [saldo, setSaldo] = useState(null);
  useEffect(() => {
    if (!logado || !trip.id) return;
    let vivo = true;
    (async () => { const s = await apiSaldo(trip.id); if (vivo) setSaldo(s); })();
    return () => { vivo = false; };
  }, [trip.id, logado]);
  const aviso = avisoDeCreditos(saldo);

  const item = (rotulo, icone, onClick, detalhe) => (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "none", borderRadius: 14, padding: "10px 16px", marginBottom: 8, minHeight: 56, cursor: "pointer", fontFamily: HELV, boxShadow: "0 3px 10px rgba(20,32,56,0.08)", color: NAVY, textAlign: "left" }}>
      {icone}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{rotulo}</span>
        {detalhe && <span style={{ display: "block", fontSize: 12.5, color: INK3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{detalhe}</span>}
      </span>
      <ChevronIcon color={INK3} size={16} />
    </button>
  );

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 18px 30px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, padding: "0 4px" }}>Configurações da Viagem</div>
        <div style={{ fontSize: 14, color: INK2, fontWeight: 600, marginTop: 4, marginBottom: 16, padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.name || "Minha viagem"}</div>

        {!somenteLeitura && item("Editar viagem", <PencilIcon color={NAVY} size={18} />, onEditar, "Nome, datas, destino e capa")}
        {!somenteLeitura && podeCompartilhar && item("Quem vai junto", <PeopleIcon color={NAVY} size={19} />, onQuemVaiJunto, trip.role === "owner" ? "Convidar pessoas e controlar o uso dos seus créditos" : "Ver quem participa desta viagem")}
        {item("Exportar esta viagem", <span aria-hidden="true" style={{ width: 19, textAlign: "center", fontSize: 17, lineHeight: 1 }}>⤓</span>, onExportar, "Uma cópia só desta viagem, em arquivo")}

        {aviso && (
          <div style={{ fontSize: 13, color: INK2, fontWeight: 600, lineHeight: 1.5, background: "#faf7f1", borderRadius: 12, padding: "11px 13px", marginTop: 6 }}>{aviso}</div>
        )}

        <button onClick={onGerais} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", minHeight: 44, padding: "10px 12px", color: STEEL, fontSize: 14, fontWeight: 700, fontFamily: HELV, cursor: "pointer" }}>
          Configurações gerais ›
        </button>
      </div>
    </Sheet>
  );
}
