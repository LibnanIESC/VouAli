import React, { useState, useEffect } from "react";
import Sheet from "./Sheet";
import ActionSheet from "./ActionSheet";
import { apiMembers, apiInvite, apiRemoveMember, apiAliDoConvidado, apiSaldo, saldoGuardado, membrosGuardados, guardarMembros } from "../api";
import { quantos, TIPOS } from "../saldo";
import { toast } from "../toast";
import { SparkIcon, TrashIcon } from "./Icons";
import { btn, field, lbl, NAVY, ORANGE, SAND, STEEL, HELV, INK2, INK3, DANGER, CREAM, cartaoBase } from "../theme";

/**
 * A linha embaixo de "Usa meus créditos do Ali", no cartão de cada convidado.
 * Ligada: quanto já usou dos créditos do dono. Desligada: de onde sai o Ali dela.
 */
export function linhaDaChave(ali) {
  if (!ali || !ali.liberado) return "Não — gasta os da própria conta";
  const usou = ali.usou || {};
  const partes = TIPOS.filter((t) => Number(usou[t]) > 0).map((t) => quantos(usou[t], t));
  return partes.length ? `Já usou ${partes.join(" · ")}` : "Ainda não usou nenhum crédito seu";
}

// Chave liga/desliga, com área de toque de 44px.
function Chave({ ligada, onChange, rotulo, ocupada }) {
  return (
    <button role="switch" aria-checked={ligada} aria-label={rotulo} onClick={() => !ocupada && onChange(!ligada)}
      style={{ width: 56, height: 44, flex: "0 0 auto", border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-end", opacity: ocupada ? 0.6 : 1 }}>
      <span style={{ width: 46, height: 28, borderRadius: 14, background: ligada ? STEEL : "#cfd5dd", position: "relative", transition: "background .2s", display: "block" }}>
        <span style={{ position: "absolute", top: 3, left: ligada ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .2s", display: "block" }} />
      </span>
    </button>
  );
}

// Quem participa da viagem: convidar por e-mail, ver membros e remover. O
// dono também decide, por convidado, se ele usa os créditos do Ali do dono.
export default function ShareSheet({ trip, onClose }) {
  // Abre com a lista da última vez (a tela já nasce inteira) e atualiza por baixo.
  const [dados, setDadosTela] = useState(() => membrosGuardados(trip.id));   // { role, members, invites }
  const setDados = (d) => { setDadosTela(d); guardarMembros(trip.id, d); };
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aRemover, setARemover] = useState(null);   // { quem, nome } — confirmação

  const [cobranca, setCobranca] = useState(() => !!saldoGuardado(trip.id));   // a chave só faz sentido com créditos
  const [mudando, setMudando] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const d = await apiMembers(trip.id);
      if (!vivo) return;
      if (d) setDadosTela(d);
      else setDadosTela((atual) => atual || { role: "", members: [], invites: [] });
    })();
    (async () => {
      const s = await apiSaldo(trip.id);
      if (vivo && (s || saldoGuardado(trip.id) === null)) setCobranca(!!s);
    })();
    return () => { vivo = false; };
  }, [trip.id]);

  const mudarChave = async (quem, liberado) => {
    setMudando(quem);
    const r = await apiAliDoConvidado(trip.id, quem, liberado);
    setMudando(null);
    if (!r || r.error) { toast("Não consegui mudar agora. Tenta de novo."); return; }
    setDados({ role: dados.role, members: r.members, invites: r.invites });
  };

  const souDono = dados && dados.role === "owner";

  const convidar = async () => {
    const e = email.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) { toast("Digite um e-mail válido."); return; }
    setOcupado(true);
    const r = await apiInvite(trip.id, e);
    setOcupado(false);
    if (!r || r.error) {
      toast(r && r.error === "self" ? "Essa é a sua própria conta. 🙂" : "Não consegui convidar agora. Tenta de novo.");
      return;
    }
    setDados({ role: dados.role, members: r.members, invites: r.invites });
    setEmail("");
    toast(r.status === "member" ? "Pronto! Já tem acesso à viagem. ✅" : "Convite guardado — vale assim que a pessoa entrar. ✉️");
  };

  const confirmarRemocao = async () => {
    const quem = aRemover.quem;
    const pendente = aRemover.pendente;
    setARemover(null);
    const r = await apiRemoveMember(trip.id, quem);
    if (!r || r.error) { toast(pendente ? "Não consegui cancelar o convite agora." : "Não consegui remover agora."); return; }
    setDados({ role: dados.role, members: r.members, invites: r.invites });
  };

  // A chave só existe para o dono, e só com a cobrança ligada.
  const comChaves = souDono && cobranca;

  // Um cartão por pessoa, de contorno bem marcado: o que está dentro é dela.
  // A chave dos créditos fica numa faixa recuada DENTRO do cartão, com o
  // próprio rótulo ao lado — nada de rótulo de coluna longe da chave.
  // Remover é a lixeira no canto (e ainda pede confirmação).
  const cartao = (chave, titulo, email, papel, pendente, ali) => {
    const ehDono = papel === "owner";
    const subtitulo = pendente ? "Convite enviado · aguardando" : email;
    const ligada = !!(ali && ali.liberado);
    return (
      <div key={chave} style={{ ...cartaoBase, marginBottom: 12, overflow: "hidden", ...(pendente ? { borderStyle: "dashed" } : {}) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: souDono && !ehDono ? "6px 2px 6px 12px" : 12, minHeight: 44 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: pendente ? SAND : STEEL, color: pendente ? NAVY : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flex: "0 0 auto" }}>
            {(titulo || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
            {subtitulo && <span style={{ display: "block", fontSize: 12.5, color: INK3, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitulo}</span>}
          </span>
          {ehDono ? (
            <span style={{ fontSize: 11, fontWeight: 800, color: "#B45F0E", background: "#FBEBD6", borderRadius: 8, padding: "3px 9px", flex: "0 0 auto" }}>Dono</span>
          ) : souDono ? (
            <button onClick={() => setARemover({ quem: chave, nome: titulo, pendente })}
              aria-label={pendente ? `Cancelar o convite de ${titulo}` : `Remover ${titulo} da viagem`}
              style={{ width: 44, height: 44, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <TrashIcon color="#8a94a3" size={20} />
            </button>
          ) : null}
        </div>
        {comChaves && ali && !ehDono && (
          <div style={{ background: CREAM, borderRadius: 10, margin: "0 10px 10px", padding: "4px 2px 4px 10px", display: "flex", alignItems: "center", gap: 9 }}>
            <SparkIcon color={ligada ? ORANGE : "#bfae92"} size={17} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "clamp(12px, 3.6vw, 13.5px)", fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>Usa meus créditos do Ali</span>
              <span style={{ display: "block", fontSize: 12, color: INK2, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{linhaDaChave(ali)}</span>
            </span>
            <Chave ligada={ligada} ocupada={mudando === chave} onChange={(v) => mudarChave(chave, v)}
              rotulo={`${titulo} usa meus créditos do Ali`} />
          </div>
        )}
      </div>
    );
  };

  const total = dados ? dados.members.length + dados.invites.length : 0;

  return (
    <>
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 28px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Quem vai junto</div>
        <div style={{ fontSize: 14, color: INK2, lineHeight: 1.55, marginTop: 6 }}>
          Todos veem e editam <strong style={{ color: NAVY }}>{trip.name}</strong>.
        </div>

        {/* Convidar é o que mais se vem fazer aqui: fica no topo. */}
        {souDono && (
          <>
            <label style={lbl}>Convidar por e-mail</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") convidar(); }}
                placeholder="email@exemplo.com" aria-label="E-mail de quem vai junto"
                style={{ ...field, marginTop: 0, flex: 1 }} />
              <button onClick={convidar} disabled={ocupado}
                style={{ ...btn(ORANGE, { color: NAVY }), flex: "0 0 auto", opacity: ocupado ? 0.6 : 1 }}>
                {ocupado ? "…" : "Convidar"}
              </button>
            </div>
          </>
        )}

        {!dados ? (
          // Primeira vez nesta viagem: o desenho da lista no lugar de "Carregando…",
          // para nada pular quando os nomes chegarem.
          <div aria-busy="true" aria-label="Carregando participantes">
            <label style={lbl}>Participantes</label>
            <div style={{ marginTop: 8 }}>
              {[0, 1].map((i) => (
                <div key={i} style={{ ...cartaoBase, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", background: "#eee8dc", flex: "0 0 auto" }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", height: 12, width: "55%", borderRadius: 6, background: "#eee8dc" }} />
                    <span style={{ display: "block", height: 10, width: "40%", borderRadius: 5, background: "#f3eee5", marginTop: 7 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <label style={lbl}>Participantes · {total}</label>
            <div style={{ marginTop: 8 }}>
              {dados.members.map((m) => cartao(m.uid, m.name || m.email || "Sem nome", m.email || "", m.role, false, m.ali))}
              {dados.invites.map((i) => cartao(i.email, i.email, "", i.role, true, i.ali))}
            </div>

            {!souDono && (
              <div style={{ fontSize: 13, color: INK3, marginTop: 2, lineHeight: 1.5 }}>
                Você participa como editor. Só quem criou a viagem pode convidar ou remover pessoas.
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
    {aRemover && (
      <ActionSheet message={aRemover.pendente ? `Cancelar o convite de ${aRemover.nome}?` : `Remover ${aRemover.nome} desta viagem?`} onClose={() => setARemover(null)}
        actions={[
          { label: aRemover.pendente ? "Cancelar convite" : "Remover", danger: true, onClick: confirmarRemocao },
          { label: "Voltar", onClick: () => setARemover(null) },
        ]} />
    )}
    </>
  );
}
