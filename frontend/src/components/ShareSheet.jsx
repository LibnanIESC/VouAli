import React, { useState, useEffect } from "react";
import Sheet from "./Sheet";
import ActionSheet from "./ActionSheet";
import { apiMembers, apiInvite, apiRemoveMember, apiAliDoConvidado, apiSaldo, saldoGuardado, membrosGuardados, guardarMembros } from "../api";
import { quantos, TIPOS } from "../saldo";
import { toast } from "../toast";
import { btn, field, lbl, NAVY, ORANGE, SAND, STEEL, HELV, INK2, INK3, DANGER } from "../theme";

/** "Usou 4 conversas · 2 dicas" (dos créditos do dono — o rótulo da coluna já diz) — ou que ainda não usou. */
export function linhaDoUsoDoConvidado(usou) {
  const partes = TIPOS.filter((t) => Number((usou || {})[t]) > 0).map((t) => quantos(usou[t], t));
  return partes.length ? `Usou ${partes.join(" · ")}` : "Ainda não usou";
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

  // A coluna de chaves só existe para o dono, e só com a cobrança ligada.
  const comChaves = souDono && cobranca;

  // Um cartão por pessoa. A chave fica à direita, sob o rótulo único da
  // coluna; o "remover" fica embaixo do nome, do lado oposto — longe da chave,
  // para um toque errado não tirar ninguém da viagem (e ainda pede confirmação).
  const cartao = (chave, titulo, email, papel, pendente, ali) => {
    const ehDono = papel === "owner";
    const subtitulo = pendente ? "convite pendente ✉️"
      : comChaves && ali ? (ali.liberado ? (ali.usou ? linhaDoUsoDoConvidado(ali.usou) : "Liberado") : "Usa só os próprios créditos")
      : email;
    return (
      <div key={chave} style={{ background: "#fff", borderRadius: 14, padding: souDono && !ehDono ? "12px 12px 2px 14px" : "12px 12px 12px 14px", marginBottom: 12, border: pendente ? "1.5px dashed #d9cfbd" : "1px solid #e6dfd2", boxShadow: "0 3px 10px rgba(20,32,56,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: pendente ? SAND : STEEL, color: pendente ? NAVY : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flex: "0 0 auto" }}>
            {(titulo || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
            {subtitulo && <span style={{ display: "block", fontSize: 12.5, color: INK3, marginTop: 1, lineHeight: 1.4, overflowWrap: "anywhere" }}>{subtitulo}</span>}
          </span>
          {ehDono ? (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: ORANGE, letterSpacing: 0.6, flex: "0 0 auto", width: 56, textAlign: "center" }}>DONO</span>
          ) : comChaves && ali ? (
            <Chave ligada={!!ali.liberado} ocupada={mudando === chave} onChange={(v) => mudarChave(chave, v)}
              rotulo={`${titulo} usa meus créditos do Ali`} />
          ) : null}
        </div>
        {souDono && !ehDono && (
          <button onClick={() => setARemover({ quem: chave, nome: titulo, pendente })}
            style={{ display: "block", background: "none", border: "none", padding: "0 0 0 48px", minHeight: 44, color: DANGER, fontSize: 13, fontWeight: 700, fontFamily: HELV, cursor: "pointer", textAlign: "left" }}>
            {pendente ? "Cancelar convite" : "Remover da viagem"}
          </button>
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
          Todo mundo aqui vê e edita <strong style={{ color: NAVY }}>{trip.name}</strong> — roteiro, orçamento e notas, sincronizados.
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
            <div style={{ fontSize: 12.5, color: INK3, marginTop: 8, lineHeight: 1.5 }}>
              Se a pessoa ainda não usa o VouAli, o convite vale assim que ela entrar com esse e-mail.
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
                <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 12, border: "1px solid #e6dfd2", display: "flex", alignItems: "center", gap: 10 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
              <label style={lbl}>Participantes · {total}</label>
              {comChaves && (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: INK2, textAlign: "right", lineHeight: 1.3, marginBottom: 2, maxWidth: 110 }}>Usa seus créditos do Ali</span>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              {dados.members.map((m) => cartao(m.uid, m.name || m.email || "Sem nome", m.email || "", m.role, false, m.ali))}
              {dados.invites.map((i) => cartao(i.email, i.email, "", i.role, true, i.ali))}
            </div>

            {comChaves ? (
              <div style={{ fontSize: 12.5, color: INK3, marginTop: 2, lineHeight: 1.5 }}>
                Ligada: a pessoa usa o Ali com os seus créditos (e, se acabarem, com os próprios). Desligada: só com os próprios.
              </div>
            ) : !souDono && (
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
