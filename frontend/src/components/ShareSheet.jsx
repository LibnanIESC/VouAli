import React, { useState, useEffect } from "react";
import Sheet from "./Sheet";
import ActionSheet from "./ActionSheet";
import { apiMembers, apiInvite, apiRemoveMember, apiAliDoConvidado, apiSaldo } from "../api";
import { quantos, TIPOS } from "../saldo";
import { toast } from "../toast";
import { btn, field, lbl, NAVY, ORANGE, SAND, STEEL, HELV, INK2, INK3, DANGER } from "../theme";

/** "Usou dos seus: 4 conversas · 2 dicas" — ou que ainda não usou. */
export function linhaDoUsoDoConvidado(usou) {
  const partes = TIPOS.filter((t) => Number((usou || {})[t]) > 0).map((t) => quantos(usou[t], t));
  return partes.length ? `Usou dos seus: ${partes.join(" · ")}` : "Ainda não usou os seus";
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
  const [dados, setDados] = useState(null);      // { role, members, invites }
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aRemover, setARemover] = useState(null);   // { quem, nome } — confirmação

  const [cobranca, setCobranca] = useState(false);   // a chave só faz sentido com créditos
  const [mudando, setMudando] = useState(null);
  useEffect(() => {
    (async () => setDados(await apiMembers(trip.id) || { role: "", members: [], invites: [] }))();
    (async () => setCobranca(!!(await apiSaldo(trip.id))))();
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
    setARemover(null);
    const r = await apiRemoveMember(trip.id, quem);
    if (!r || r.error) { toast("Não consegui remover agora."); return; }
    setDados({ role: dados.role, members: r.members, invites: r.invites });
  };

  const linha = (chave, titulo, subtitulo, papel, pendente, ali) => (
    <div key={chave} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 3px 10px rgba(20,32,56,0.07)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 38, height: 38, borderRadius: "50%", background: pendente ? SAND : STEEL, color: pendente ? NAVY : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flex: "0 0 auto" }}>
        {(titulo || "?").trim().charAt(0).toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 12.5, color: INK3, marginTop: 1 }}>{subtitulo}</span>
      </span>
      {papel === "owner" ? (
        <span style={{ fontSize: 10.5, fontWeight: 800, color: ORANGE, letterSpacing: 0.6, flex: "0 0 auto" }}>DONO</span>
      ) : souDono ? (
        <button onClick={() => setARemover({ quem: chave, nome: titulo })} aria-label={`Remover ${titulo}`}
          style={{ width: 44, height: 44, flex: "0 0 auto", borderRadius: 10, border: "1.5px solid #e6dfd2", background: "#fff", color: DANGER, fontSize: 18, cursor: "pointer" }}>×</button>
      ) : null}
    </div>
    {souDono && cobranca && ali && papel !== "owner" && (
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #efe9dc", marginTop: 10, paddingTop: 4 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: NAVY }}>Usar meus créditos do Ali</span>
          <span style={{ display: "block", fontSize: 12, color: INK3, marginTop: 1, lineHeight: 1.4 }}>
            {ali.liberado ? (ali.usou ? linhaDoUsoDoConvidado(ali.usou) : "Liberado") : "Usa só os próprios créditos"}
          </span>
        </span>
        <Chave ligada={!!ali.liberado} ocupada={mudando === chave} onChange={(v) => mudarChave(chave, v)}
          rotulo={`${titulo} usa meus créditos do Ali`} />
      </div>
    )}
    </div>
  );

  return (
    <>
    <Sheet onClose={onClose}>
      <div style={{ padding: "22px 22px 28px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>Quem vai junto</div>
        <div style={{ fontSize: 14, color: INK2, lineHeight: 1.55, marginTop: 6 }}>
          Todo mundo aqui vê e edita <strong style={{ color: NAVY }}>{trip.name}</strong> — roteiro, orçamento e notas, sincronizados.
        </div>

        {!dados ? (
          <div style={{ fontSize: 14, color: INK3, marginTop: 20 }}>Carregando…</div>
        ) : (
          <>
            <label style={lbl}>Participantes</label>
            <div style={{ marginTop: 6 }}>
              {dados.members.map((m) => linha(m.uid, m.name || m.email || "Sem nome", m.email || "", m.role, false, m.ali))}
              {dados.invites.map((i) => linha(i.email, i.email, "convite pendente ✉️", i.role, true, i.ali))}
            </div>

            {souDono ? (
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
                  Se a pessoa ainda não usa o VouAli, o convite fica guardado e vale assim que ela entrar com esse e-mail.
                </div>
                {cobranca && (
                  <div style={{ fontSize: 12.5, color: INK3, marginTop: 8, lineHeight: 1.5 }}>
                    Com a chave ligada, quem vai junto usa o Ali nesta viagem com os seus créditos (e, se acabarem, com os próprios). Desligada, só com os próprios.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: INK3, marginTop: 14, lineHeight: 1.5 }}>
                Você participa como editor. Só quem criou a viagem pode convidar ou remover pessoas.
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
    {aRemover && (
      <ActionSheet message={`Remover ${aRemover.nome} desta viagem?`} onClose={() => setARemover(null)}
        actions={[
          { label: "Remover", danger: true, onClick: confirmarRemocao },
          { label: "Cancelar", onClick: () => setARemover(null) },
        ]} />
    )}
    </>
  );
}
