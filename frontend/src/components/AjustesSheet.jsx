import React, { useRef, useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiUsage, apiSaldo, saldoGuardado, usoGuardado, url } from "../api";
import { TIPOS, quantos, linhaDasCompras } from "../saldo";
import { GiftIcon, LogoutIcon, UserXIcon, DownloadIcon, UploadIcon, ChevronIcon } from "./Icons";
import { btn, lbl, HELV, NAVY, INK2, INK3, ORANGE, STEEL, SAND_L, CREAM, DANGER, cartaoBase } from "../theme";

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

const cartao = { ...cartaoBase, marginTop: 6, overflow: "hidden" };

// Uma opção de lista (ícone, nome, frase curta, seta): o jeito Android de
// ajustes. Substitui parágrafo + botão grande — o nome já diz o que faz.
function Opcao({ icone, titulo, detalhe, onClick, cor = NAVY, primeira }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderTop: primeira ? "none" : "1px solid #efe9dc", padding: "10px 14px", minHeight: 56, cursor: "pointer", fontFamily: HELV, textAlign: "left" }}>
      {icone}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: cor }}>{titulo}</span>
        {detalhe && <span style={{ display: "block", fontSize: 12.5, color: INK3, marginTop: 1 }}>{detalhe}</span>}
      </span>
      <ChevronIcon color="#b4bcc8" size={16} />
    </button>
  );
}

// "2" grande e "roteiros" embaixo: o saldo se lê de relance, sem frase.
function Numero({ n, tipo }) {
  const v = Math.max(0, Number(n) || 0);
  return (
    <div style={{ background: CREAM, borderRadius: 10, padding: "10px 4px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, lineHeight: 1.15 }}>{v}</div>
      <div style={{ fontSize: 12, color: INK2, fontWeight: 600 }}>{quantos(v, tipo).replace(/^\d+ /, "")}</div>
    </div>
  );
}

/**
 * Os créditos do Ali — só aparece com a cobrança ligada no servidor.
 *
 * Três números grandes (roteiros, conversas, dicas). Com pacote, são os do
 * Pacote VouAli, que é da CONTA e vale em qualquer viagem; a degustação vira
 * uma linha só. Sem pacote, os números grandes são os da degustação.
 * Compras só aparecem se houve reembolso (aí o saldo precisa de explicação).
 */
function CreditosDoAli({ saldo, onPacote }) {
  const deg = saldo.degustacao || {};
  const degLivre = TIPOS.some((t) => Number(deg[t]) > 0);
  const linhaDeg = TIPOS.map((t) => quantos(deg[t], t)).join(" · ");
  const mostraDeg = !saldo.tem_pacote && degLivre;
  const numeros = mostraDeg ? deg : (saldo.creditos || {});
  const titulo = mostraDeg ? "Degustação grátis" : "Seu saldo";
  const nota = mostraDeg ? `viagens de até ${saldo.max_dias} dias` : "vale em qualquer viagem";
  const reembolsos = Number((saldo.compras || {}).reembolsados) > 0 ? linhaDasCompras(saldo.compras) : "";
  return (
    <div style={{ ...cartao, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{titulo}</span>
        <span style={{ fontSize: 12, color: INK3, fontWeight: 600, textAlign: "right" }}>{nota}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
        {TIPOS.map((t) => <Numero key={t} n={numeros[t]} tipo={t} />)}
      </div>
      {saldo.tem_pacote && degLivre && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <GiftIcon color={ORANGE} size={18} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: NAVY }}>Degustação grátis</span>
            <span style={{ display: "block", fontSize: 12.5, color: INK2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{linhaDeg}</span>
          </span>
        </div>
      )}
      {!saldo.tem_pacote && !degLivre && (
        <div style={{ fontSize: 12.5, color: INK3, marginTop: 12 }}>Degustação grátis já usada.</div>
      )}
      {reembolsos && <div style={{ fontSize: 12, color: INK3, marginTop: 8 }}>{reembolsos}.</div>}
      <button onClick={onPacote} style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", marginTop: 14 }}>
        {saldo.tem_pacote ? "Comprar mais créditos" : "Comprar Pacote VouAli"}
      </button>
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
            <div style={cartao}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                <span style={{ width: 38, height: 38, borderRadius: "50%", background: STEEL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flex: "0 0 auto" }}>
                  {(user.name || user.email || "?").trim().charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name || "Você"}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: INK3, marginTop: 1, wordBreak: "break-all" }}>{user.email}</span>
                </span>
              </div>
              <Opcao icone={<LogoutIcon color={STEEL} />} titulo="Sair da conta" onClick={onLogout} />
              {/* Excluir a conta tem de estar aqui dentro: o Google exige um
                  caminho pelo app, não só por e-mail ou site. Fica por último,
                  em vermelho, porque não tem desfazer (e pede confirmação). */}
              {onExcluirConta && (
                <Opcao icone={<UserXIcon color={DANGER} />} titulo="Excluir minha conta" cor={DANGER} onClick={onExcluirConta} />
              )}
            </div>
          </>
        )}

        {uso && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>Ali este mês</label>
            <div style={{ ...cartao, padding: 16 }}>
              <Consumo rotulo="Conversas" usado={uso.used.chat} limite={uso.quotas.chat} />
              <Consumo rotulo="Roteiros gerados" usado={uso.used.gen} limite={uso.quotas.gen} />
              <Consumo rotulo="Dicas geradas" usado={uso.used.tip} limite={uso.quotas.tip} />
              <div style={{ fontSize: 12.5, color: INK3, marginTop: 2 }}>Renova no dia 1º de cada mês.</div>
            </div>
          </>
        )}

        {/* Backup: o nome de cada opção já diz o que faz; a frase curta tira a
            dúvida que sobra (importar não mexe no que já está aqui). No app,
            exportar abre o menu de compartilhamento e a pessoa escolhe onde guardar. */}
        <label style={{ ...lbl, marginTop: 18 }}>Backup</label>
        <div style={cartao}>
          <Opcao primeira icone={<DownloadIcon color={STEEL} />} titulo="Exportar viagens" detalhe="Todas num arquivo só" onClick={onExport} />
          <Opcao icone={<UploadIcon color={STEEL} />} titulo="Importar viagens" detalhe="Entram como viagens novas" onClick={() => fileRef.current && fileRef.current.click()} />
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
