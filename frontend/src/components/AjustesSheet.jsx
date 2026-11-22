import React, { useRef, useState, useEffect } from "react";
import Sheet from "./Sheet";
import { apiUsage, apiSaldo, url } from "../api";
import { TIPOS, origemDoSaldo, linhaDoSaldo } from "../saldo";
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

/**
 * O Ali visto da lista de viagens.
 *
 * Aqui NÃO se soma nada. O passe é de uma viagem e a degustação é da conta;
 * juntar os dois numa tabela só fazia parecer que existiam dois saldos
 * disputando o mesmo lugar. Cada passe aparece com o nome da sua viagem, e a
 * degustação fica à parte, dizendo para que serve. Comprar fica dentro da
 * viagem, onde o passe vai valer.
 */
function AliNaConta({ saldo }) {
  const viagens = saldo.viagens || [];
  const deg = saldo.degustacao || {};
  const degUsada = TIPOS.every((t) => !(Number(deg[t]) > 0));
  const titulo = { fontSize: 13.5, fontWeight: 800, color: NAVY };
  const linha = (esgotado) => ({ fontSize: 13, fontWeight: 600, color: esgotado ? "#C62828" : INK2, marginTop: 3, lineHeight: 1.45 });
  return (
    <div style={cartao}>
      <div style={{ fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Passes de viagem</div>
      {viagens.length === 0 && (
        <div style={{ fontSize: 13, color: INK2, lineHeight: 1.5 }}>
          Nenhum passe ainda. Ele é comprado dentro de uma viagem, quando o Ali precisar.
        </div>
      )}
      {viagens.map((v) => {
        const txt = linhaDoSaldo(v.restante);
        return (
          <div key={v.id} style={{ marginBottom: 10 }}>
            <div style={titulo}>{v.nome}</div>
            <div style={linha(v.reembolsado || txt === "esgotado")}>{v.reembolsado ? "Passe reembolsado" : txt === "esgotado" ? "Passe esgotado" : txt}</div>
          </div>
        );
      })}
      {saldo.soltos > 0 && (
        <div style={{ fontSize: 12.5, color: INK2, marginTop: 4, lineHeight: 1.5, fontWeight: 600 }}>
          + {saldo.soltos === 1 ? "1 passe comprado" : `${saldo.soltos} passes comprados`} ainda sem viagem. Ele entra na primeira viagem em que você usar o Ali.
        </div>
      )}

      <div style={{ borderTop: "1px solid #efe9dc", margin: "12px 0 10px" }} />
      <div style={{ fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Degustação gratuita</div>
      <div style={{ fontSize: 13, color: INK2, lineHeight: 1.5 }}>
        {degUsada
          ? "Já usada."
          : <>{linhaDoSaldo(deg)}<br /><span style={{ color: INK3 }}>Para experimentar o Ali numa viagem de até {saldo.max_dias} dias. Vale uma vez por conta.</span></>}
      </div>
    </div>
  );
}

/**
 * Quanto resta do Ali — só aparece com a cobrança ligada no servidor.
 *
 * Dentro de uma viagem mostra o que dá para gastar NELA (passe ou degustação).
 * Na lista de viagens a visão é outra (`AliNaConta`).
 */
function SaldoDoAli({ saldo, naViagem, onPasse }) {
  if (!naViagem) return <AliNaConta saldo={saldo} />;
  const origem = origemDoSaldo(saldo);
  const fonte = saldo.disponivel;
  const deg = saldo.degustacao || {};
  const somaDegustacao = origem === "passe" && deg.vale_nesta_viagem && TIPOS.some((t) => Number(deg[t]) > 0);
  const legenda = origem === "passe"
    ? (somaDegustacao
      ? "Do passe desta viagem, mais o que resta da sua degustação gratuita. Quem viaja com você usa o mesmo passe."
      : "Do passe desta viagem. Quem viaja com você usa o mesmo.")
    : origem === "degustacao" ? `Da degustação gratuita, que vale para viagens de até ${saldo.max_dias} dias.`
    : saldo.reembolsado ? "O passe desta viagem foi reembolsado e deixou de valer."
    : saldo.dias > saldo.max_dias ? `A degustação vale para viagens de até ${saldo.max_dias} dias; esta tem ${saldo.dias}.`
    : "A degustação desta conta já foi usada.";
  return (
    <div style={cartao}>
      {TIPOS.map((t) => {
        const n = Math.max(0, Number((fonte || {})[t]) || 0);
        return (
          <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{ROTULO[t]}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: n === 0 ? "#C62828" : INK3 }}>{n === 0 ? "acabou" : `restam ${n}`}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 12.5, color: INK3, marginTop: 2, lineHeight: 1.5 }}>{legenda}</div>
      {saldo.soltos > 0 && (
        <div style={{ fontSize: 12.5, color: INK2, marginTop: 8, lineHeight: 1.5, fontWeight: 600 }}>
          Você tem {saldo.soltos === 1 ? "1 passe comprado" : `${saldo.soltos} passes comprados`} ainda sem viagem. Ele entra na primeira viagem em que você usar o Ali.
        </div>
      )}
      <button onClick={onPasse} style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", marginTop: 14 }}>Passe de viagem</button>
    </div>
  );
}

// Ajustes do app (backup por enquanto; ponto natural para futuras configurações).
// `tripId` é a viagem aberta (vazio na lista de viagens); `saldoVer` muda
// quando uma compra é ativada, para o saldo mostrado aqui se atualizar.
export default function AjustesSheet({ onExport, onImportFile, onClose, user, onLogout, onExcluirConta, tripId, saldoVer, onPasse }) {
  const fileRef = useRef(null);
  const [uso, setUso] = useState(null);
  const [saldo, setSaldo] = useState(null);
  useEffect(() => { (async () => setUso(await apiUsage()))(); }, []);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (async () => { const s = await apiSaldo(tripId); if (vivo) setSaldo(s); })();
    return () => { vivo = false; };
  }, [tripId, saldoVer]); // eslint-disable-line react-hooks/exhaustive-deps
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

        {saldo && (
          <>
            <label style={{ ...lbl, marginTop: 18 }}>{tripId ? "Ali nesta viagem" : "Ali na sua conta"}</label>
            <SaldoDoAli saldo={saldo} naViagem={!!tripId} onPasse={onPasse} />
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
            {/* "Baixe" descrevia só o site. No app o arquivo vai para o menu
                de compartilhamento, e a pessoa escolhe onde guardar. */}
            Guarde uma cópia de toda a viagem (roteiro, orçamento e notas). Se algo der errado, é só reimportar.
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
