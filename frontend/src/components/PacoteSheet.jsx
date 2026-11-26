import React, { useState, useEffect, useRef } from "react";
import Sheet from "./Sheet";
import AliAvatar from "./AliAvatar";
import { apiSaldo, apiSincronizarCompras, saldoGuardado, url } from "../api";
import { podeComprarAqui, buscarProduto, ofertaGuardada, comprar, reenviarRecibos, LOJA_URL } from "../compras";
import { textoDoPaywall, quantos, linhaDoSaldo, TIPOS } from "../saldo";
import { toast } from "../toast";
import { btn, HELV, DISPLAY, NAVY, ORANGE, STEEL, INK2, INK3, cartaoBase } from "../theme";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const O_QUE = {
  gen: "gerados pelo Ali, do zero",
  chat: "para tirar dúvidas e ajustar o plano",
  tip: "sob medida para as suas paradas",
};

/**
 * Tela do Pacote VouAli: explica por que o Ali parou e vende o pacote.
 *
 * Três regras que valem aqui:
 *  - O PREÇO vem da loja, nunca do código. Mudou no Play Console, mudou aqui.
 *  - O que o pacote contém vem do SERVIDOR (`pacotes.pacote`), pelo mesmo motivo.
 *  - Pagar não credita nada por si só: depois da loja, o servidor confere a
 *    compra e é ELE quem devolve o saldo novo. Um app adulterado não ganha nada.
 *
 * Os créditos são da CONTA e valem em qualquer viagem. `tripId` só diz de qual
 * viagem é o saldo que o servidor devolve depois da compra.
 */
export default function PacoteSheet({ motivo, tripId, uid, onClose, onAtivado }) {
  // Abre com o que já se sabe (o saldo guardado e o produto que o app buscou
  // ao entrar): o conteúdo do pacote e o preço aparecem na hora.
  const [saldo, setSaldo] = useState(() => saldoGuardado(tripId) || undefined);   // undefined = buscando · null = indisponível
  const [oferta, setOferta] = useState(() => {
    const s = saldoGuardado(tripId);
    return s && podeComprarAqui() ? ofertaGuardada(s.produto || s.produto_passe) : undefined;
  });   // { produto, preco } · null = a loja não respondeu
  const [ocupado, setOcupado] = useState("");          // "" | "comprando" | "conferindo" | "restaurando"
  const [aviso, setAviso] = useState("");
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const naLoja = podeComprarAqui();

  useEffect(() => {
    (async () => {
      const s = await apiSaldo(tripId);
      if (!vivo.current) return;
      if (s || !saldoGuardado(tripId)) setSaldo(s);   // falha de rede não apaga o que está em tela
      if (!naLoja) { setOferta(null); return; }
      const base = s || saldoGuardado(tripId);
      const o = base ? await buscarProduto(uid, base.produto || base.produto_passe) : null;
      if (vivo.current) setOferta(o);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { titulo, texto } = textoDoPaywall(motivo || {});
  const pacote = (saldo && saldo.pacotes && (saldo.pacotes.pacote || saldo.pacotes.passe)) || null;

  // A loja confirma o pagamento antes de o RevenueCat registrar a compra do
  // lado dele; a conferência pode chegar um instante cedo demais. Algumas
  // tentativas curtas cobrem isso sem deixar a pessoa olhando para o nada.
  // Devolve a última resposta do servidor: "conferi e não há compra nova" é
  // uma resposta diferente de "não consegui conferir", e a pessoa precisa
  // saber qual das duas aconteceu.
  const conferir = async (tentativas) => {
    let r = null;
    for (let i = 0; i < tentativas; i++) {
      r = await apiSincronizarCompras(tripId);
      if (r && r.ok && r.novos > 0) return r;
      if (r && r.error && r.error !== "upstream" && r.error !== "offline") return r;
      if (i < tentativas - 1) await espera(1800);
    }
    return r;
  };

  const ativar = (r) => {
    toast("Pacote ativado. Boa viagem! ✅");
    onAtivado && onAtivado(r.saldo || null);
  };

  const aoComprar = async () => {
    if (ocupado || !oferta) return;
    setAviso("");
    setOcupado("comprando");
    const fim = await comprar(uid, oferta.produto);
    if (!vivo.current) return;
    if (fim.cancelado) { setOcupado(""); return; }
    if (fim.pendente) {
      setOcupado("");
      setAviso("O pagamento está em análise. Os créditos aparecem aqui assim que o Google confirmar.");
      return;
    }
    if (!fim.ok) {
      setOcupado("");
      setAviso(fim.erro === "rede"
        ? "Sem conexão com a loja. Confira a internet e tente de novo."
        : "A loja não concluiu a compra. Nada foi cobrado — tente de novo em instantes.");
      return;
    }
    setOcupado("conferindo");
    const r = await conferir(4);
    if (!vivo.current) return;
    setOcupado("");
    if (r && r.ok && r.novos > 0) { ativar(r); return; }
    // Pagou e a conferência não fechou: o servidor ainda recebe o aviso da
    // loja por conta própria. Dizer isso evita a pessoa comprar duas vezes.
    setAviso("Pagamento recebido! O pacote está sendo ativado — se não aparecer em um minuto, toque em “Já comprei”.");
  };

  const aoRestaurar = async () => {
    if (ocupado) return;
    setAviso("");
    setOcupado("restaurando");
    await reenviarRecibos(uid);
    const r = await conferir(1);
    if (!vivo.current) return;
    setOcupado("");
    if (r && r.ok && r.novos > 0) { ativar(r); return; }
    if (r && r.error === "rate_limited") { setAviso("Muitas conferências seguidas. Espere um minutinho e tente de novo."); return; }
    setAviso(r && r.ok
      ? "Não encontrei compra nova nesta conta. Se você pagou há pouco, espere um minuto e tente de novo."
      : "Não consegui conferir agora. Tente de novo em instantes.");
  };

  const rotuloComprar = ocupado === "comprando" ? "Abrindo a loja…"
    : ocupado === "conferindo" ? "Ativando o pacote…"
    : oferta && oferta.preco ? `Comprar pacote · ${oferta.preco}` : "Comprar pacote";

  return (
    <Sheet onClose={ocupado === "comprando" || ocupado === "conferindo" ? () => {} : onClose}>
      <div style={{ padding: "8px 22px 30px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <AliAvatar size={76} portrait ring={ORANGE} />
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginTop: 14, fontFamily: DISPLAY, lineHeight: 1.2 }}>{titulo}</div>
          <div style={{ fontSize: 14.5, color: INK2, fontWeight: 500, marginTop: 8, lineHeight: 1.55, maxWidth: 340 }}>{texto}</div>
        </div>

        <div style={{ ...cartaoBase, borderRadius: 16, padding: "16px 16px 6px", marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>O Pacote VouAli traz</div>
          {saldo === undefined && <div aria-hidden="true" style={{ height: 96, borderRadius: 10, background: "#f1ece2", marginBottom: 10, animation: "pulse 1.4s ease-in-out infinite" }} />}
          {pacote && TIPOS.filter((t) => Number(pacote[t]) > 0).map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
              <span aria-hidden="true" style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 11, background: ORANGE, color: NAVY, fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>✓</span>
              <span style={{ fontSize: 14.5, color: INK2, lineHeight: 1.45 }}>
                <strong style={{ color: NAVY }}>{quantos(pacote[t], t)}</strong> {O_QUE[t]}
              </span>
            </div>
          ))}
          {saldo && saldo.tem_pacote && (
            <div style={{ fontSize: 12.5, color: INK3, lineHeight: 1.5, borderTop: "1px solid #efe9dc", paddingTop: 9, marginBottom: 10 }}>
              Seus créditos agora: <strong style={{ color: NAVY }}>{linhaDoSaldo(saldo.creditos)}</strong>. Um novo pacote soma a eles.
            </div>
          )}
          {saldo === null && (
            <div style={{ fontSize: 14, color: INK2, lineHeight: 1.5, marginBottom: 10 }}>
              Não consegui carregar os detalhes agora. Confira a internet e abra de novo.
            </div>
          )}
        </div>

        {aviso && (
          <div role="status" style={{ background: "#fff6e9", border: "1px solid #f3d9b1", borderRadius: 12, padding: "11px 13px", marginTop: 14, fontSize: 13.5, color: "#7a4b12", fontWeight: 600, lineHeight: 1.45 }}>{aviso}</div>
        )}

        {naLoja ? (
          <>
            <button onClick={aoComprar} disabled={!!ocupado || !oferta}
              style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", marginTop: 18, minHeight: 52, fontSize: 16, opacity: ocupado || !oferta ? 0.6 : 1 }}>
              {oferta === undefined ? "Consultando a loja…" : rotuloComprar}
            </button>
            {oferta === null && saldo !== undefined && (
              <div style={{ fontSize: 13, color: INK3, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
                A loja não respondeu agora. Feche e abra esta tela de novo em instantes.
              </div>
            )}
          </>
        ) : (
          <>
            {/* No site não há como cobrar: quem cobra é a loja do app. Melhor
                dizer onde comprar do que mostrar um botão que não anda. */}
            <a href={LOJA_URL} target="_blank" rel="noreferrer"
              style={{ ...btn(ORANGE, { color: NAVY }), display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box", marginTop: 18, minHeight: 52, fontSize: 16, textDecoration: "none" }}>
              Comprar no app para Android
            </a>
            <div style={{ fontSize: 13, color: INK3, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
              A compra é feita pelo app, na Google Play. Os créditos ficam na sua conta — valem aqui no site também.
            </div>
          </>
        )}

        <button onClick={aoRestaurar} disabled={!!ocupado}
          style={{ width: "100%", marginTop: 8, background: "none", border: "none", padding: "10px 6px", minHeight: 44, color: STEEL, fontSize: 14, fontWeight: 700, fontFamily: HELV, cursor: ocupado ? "default" : "pointer", textDecoration: "underline", opacity: ocupado ? 0.6 : 1 }}>
          {ocupado === "restaurando" ? "Conferindo…" : "Já comprei"}
        </button>

        <div style={{ fontSize: 12, color: INK3, marginTop: 8, textAlign: "center", lineHeight: 1.55 }}>
          Pagamento único, sem assinatura e sem renovação automática. Os créditos são seus e valem em qualquer viagem — e quem viaja com você usa os seus, nas suas viagens.
          Planejar na mão continua grátis. <a href={url("/termos")} target="_blank" rel="noreferrer" style={{ color: STEEL, fontWeight: 700 }}>Termos de uso</a>
        </div>
      </div>
    </Sheet>
  );
}
