import React, { useRef, useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiUsage, apiSaldo, saldoGuardado, usoGuardado, url } from "../api";
import { TIPOS, linhaDoSaldo, linhaDasCompras } from "../saldo";
import { btn, lbl, HELV, NAVY, INK2, INK3, ORANGE, STEEL, SAND_L } from "../theme";

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

const ROTULO = { gen: "Roteiros", chat: "Conversas", tip: "Dicas" };

const cartao = { background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 };
const rotuloCaixa = { fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 };

/**
 * Os créditos do Ali — só aparece com a cobrança ligada no servidor.
 *
 * Um saldo só: o do Pacote VouAli, que é da CONTA e vale em qualquer viagem.
 * A degustação fica à parte, dizendo para que serve. (O aviso de "de quem o
 * Ali gasta nesta viagem" mora nas Configurações da Viagem.)
 */
function CreditosDoAli({ saldo, onPacote }) {
  const deg = saldo.degustacao || {};
  const degUsada = TIPOS.every((t) => !(Number(deg[t]) > 0));
  const txt = linhaDoSaldo(saldo.creditos);
  const pacote = saldo.tem_pacote
    ? txt
    : saldo.reembolsado ? "Reembolsado" : "Nenhum pacote ainda";
  const compras = linhaDasCompras(saldo.compras);
  return (
    <div style={cartao}>
      <div style={rotuloCaixa}>Pacote VouAli</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: saldo.tem_pacote ? NAVY : INK2, lineHeight: 1.45 }}>{pacote}</div>
      <div style={{ fontSize: 12.5, color: INK3, marginTop: 3, lineHeight: 1.5 }}>Valem em qualquer viagem.</div>
      {compras && (
        <div style={{ fontSize: 12.5, color: INK3, marginTop: 2, lineHeight: 1.5 }}>{compras}.</div>
      )}


      <div style={{ borderTop: "1px solid #efe9dc", margin: "12px 0 10px" }} />
      <div style={rotuloCaixa}>Degustação gratuita</div>
      <div style={{ fontSize: 13, color: INK2, lineHeight: 1.5 }}>
        {degUsada
          ? "Já usada."
          : <>{linhaDoSaldo(deg)}<br /><span style={{ color: INK3 }}>Para experimentar o Ali numa viagem de até {saldo.max_dias} dias. Vale uma vez por conta.</span></>}
      </div>

      <button onClick={onPacote} style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", marginTop: 14 }}>Comprar Pacote VouAli</button>
    </div>
  );
}

// Configurações Gerais: tudo o que é da CONTA — créditos, conta, backup de
// todas as viagens. O que é de uma viagem está em ViagemConfigSheet.
// `saldoVer` muda quando uma compra é ativada, para o saldo se atualizar.
export default function AjustesSheet({ onExport, onImportFile, onClose, user, onLogout, onExcluirConta, saldoVer, onPacote }) {
  const fileRef = useRef(null);
  // Abre com a última resposta guardada (a tela já nasce inteira) e atualiza
  // por baixo. Falha de rede não apaga o que está em tela.
  const [uso, setUso] = useState(() => usoGuardado() || null);
  const [saldo, setSaldo] = useState(() => (user ? saldoGuardado(null) || null : null));
  useEffect(() => {
    let vivo = true;
    (async () => { const u = await apiUsage(); if (vivo && (u || usoGuardado() === null)) setUso(u); })();
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (async () => { const s = await apiSaldo(null); if (vivo && (s || saldoGuardado(null) === null)) setSaldo(s); })();
    return () => { vivo = false; };
  }, [saldoVer]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 30px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Configurações Gerais</div>

        {saldo && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>Créditos do Ali</label>
            <CreditosDoAli saldo={saldo} onPacote={onPacote} />
          </>
        )}

        {user && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>Conta</label>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{user.name || "Você"}</div>
              <div style={{ fontSize: 13.5, color: INK2, marginTop: 2, wordBreak: "break-all" }}>{user.email}</div>
              <button onClick={onLogout} style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), width: "100%", marginTop: 14 }}>Sair da conta</button>
              {/* Excluir a conta tem de estar aqui dentro: o Google exige um
                  caminho pelo app, não só por e-mail ou site. Fica discreto e
                  em segundo plano, porque não tem desfazer. */}
              {onExcluirConta && (
                <button onClick={onExcluirConta} style={{ width: "100%", marginTop: 10, background: "none", border: "none", padding: "10px 6px", minHeight: 44, color: "#C62828", fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer", textDecoration: "underline" }}>
                  Excluir minha conta
                </button>
              )}
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

        <label style={{ ...lbl, marginTop: 18 }}>Backup</label>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", marginTop: 6 }}>
          <div style={{ fontSize: 14, color: INK2, lineHeight: 1.55, fontWeight: 500, marginBottom: 12 }}>
            {/* "Baixe" descrevia só o site. No app o arquivo vai para o menu
                de compartilhamento, e a pessoa escolhe onde guardar. */}
            Guarde uma cópia de todas as suas viagens (roteiro, orçamento e notas) num arquivo só. Ao importar, elas voltam como viagens novas, sem mexer nas que já estão aqui.
          </div>
          <button onClick={onExport} style={{ ...btn(NAVY), width: "100%" }}>Exportar todas as viagens</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), width: "100%", marginTop: 10 }}>Importar viagens</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { onImportFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {/* Dizia "versão web" — errado dentro do app, e sem utilidade nenhuma.
            A versão é o que serve: é por ela que se sabe o que a pessoa tem
            instalado quando algo dá errado. */}
        {/* A Play Store exige que a política seja alcançável de dentro do app,
            e não só pelo link da ficha da loja.

            O endereço tem de ser ABSOLUTO. Um `/privacidade` relativo funciona
            no site, onde o backend serve essa rota, mas no app instalado a
            interface roda em `https://localhost` — dentro do APK não existe
            servidor nessa rota, e o link simplesmente não ia a lugar nenhum.
            `url()` resolve para o servidor de produção, e o Capacitor abre
            endereço externo no navegador do sistema em vez de sequestrar a
            tela do app. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 22, fontSize: 12.5 }}>
          <a href={url("/privacidade")} target="_blank" rel="noreferrer" style={{ color: STEEL, fontWeight: 700 }}>Privacidade</a>
          <span style={{ color: "#c9cfd8" }}>·</span>
          <a href={url("/termos")} target="_blank" rel="noreferrer" style={{ color: STEEL, fontWeight: 700 }}>Termos de uso</a>
        </div>
        <div style={{ fontSize: 12, color: "#98a1ae", fontWeight: 600, marginTop: 12, textAlign: "center" }}>VouAli · versão {__VERSAO__}</div>
      </div>
    </Sheet>
  );
}
