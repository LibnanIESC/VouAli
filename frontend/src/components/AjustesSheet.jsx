import React, { useRef, useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiUsage } from "../api";
import { btn, lbl, NAVY, INK2, INK3, ORANGE, STEEL, SAND_L } from "../theme";

// Barrinha de consumo de um recurso da IA no mês.
function Consumo({ rotulo, usado, limite }) {
  const pct = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  const acabou = limite > 0 && usado >= limite;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{rotulo}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: acabou ? "#C62828" : INK3 }}>{usado} de {limite}</span>
      </div>
      <span style={{ display: "block", height: 6, background: SAND_L, borderRadius: 3, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: acabou ? "#C62828" : (pct > 80 ? ORANGE : STEEL), borderRadius: 3, transition: "width .3s ease" }} />
      </span>
    </div>
  );
}

// Ajustes do app (backup por enquanto; ponto natural para futuras configurações).
export default function AjustesSheet({ onExport, onImportFile, onClose, user, onLogout }) {
  const fileRef = useRef(null);
  const [uso, setUso] = useState(null);
  useEffect(() => { (async () => setUso(await apiUsage()))(); }, []);
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 30px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Ajustes</div>

        {user && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>Conta</label>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{user.name || "Você"}</div>
              <div style={{ fontSize: 13.5, color: INK2, marginTop: 2, wordBreak: "break-all" }}>{user.email}</div>
              <button onClick={onLogout} style={{ ...btn("#fff", { color: "#C62828", border: "1.5px solid #C62828" }), width: "100%", marginTop: 14 }}>Sair da conta</button>
            </div>
          </>
        )}

        {uso && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>Ali este mês</label>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
              <Consumo rotulo="Conversas" usado={uso.used.chat} limite={uso.quotas.chat} />
              <Consumo rotulo="Roteiros gerados" usado={uso.used.gen} limite={uso.quotas.gen} />
              <Consumo rotulo="Dicas geradas" usado={uso.used.tip} limite={uso.quotas.tip} />
              <div style={{ fontSize: 12.5, color: INK3, marginTop: 2 }}>Renova no dia 1º de cada mês.</div>
            </div>
          </>
        )}

        <label style={{ ...lbl, marginTop: 18 }}>Backup da viagem</label>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
          <div style={{ fontSize: 14, color: INK2, lineHeight: 1.55, fontWeight: 500, marginBottom: 12 }}>
            Baixe uma cópia de toda a viagem (roteiro, orçamento e notas). Se algo der errado, é só reimportar.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onExport} style={{ ...btn(NAVY), flex: 1 }}>Exportar</button>
            <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), flex: 1 }}>Importar</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { onImportFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {/* Dizia "versão web" — errado dentro do app, e sem utilidade nenhuma.
            A versão é o que serve: é por ela que se sabe o que a pessoa tem
            instalado quando algo dá errado. */}
        <div style={{ fontSize: 12, color: "#98a1ae", fontWeight: 600, marginTop: 18, textAlign: "center" }}>VouAli · versão {__VERSAO__}</div>
      </div>
    </Sheet>
  );
}
