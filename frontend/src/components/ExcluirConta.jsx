import React, { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { apiPreviaExclusao } from "../api";
import { btn, field, NAVY, INK2, INK3, HELV, DISPLAY } from "../theme";

const CONFIRMACAO = "EXCLUIR";

/**
 * Confirmação de exclusão da conta.
 *
 * Não tem desfazer, então a tela faz três coisas antes de deixar seguir:
 * conta o que exatamente vai ser apagado (buscado no servidor, não estimado),
 * avisa quando isso atinge OUTRAS pessoas, e pede a palavra escrita — um
 * toque distraído não pode apagar a conta de ninguém.
 */
export default function ExcluirConta({ onClose, onConfirmar }) {
  const [previa, setPrevia] = useState(undefined);   // undefined = carregando
  const [texto, setTexto] = useState("");
  const [indo, setIndo] = useState(false);

  useEffect(() => { (async () => setPrevia(await apiPreviaExclusao()))(); }, []);

  const pode = texto.trim().toUpperCase() === CONFIRMACAO && !indo;
  const confirmar = async () => { if (!pode) return; setIndo(true); await onConfirmar(); };

  const linha = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

  const acoes = (
    <>
      <button onClick={onClose} disabled={indo} style={{ ...btn("#fff", { color: "#666", border: "1.5px solid #ccc" }), flex: 1 }}>Cancelar</button>
      <button onClick={confirmar} disabled={!pode}
        style={{ ...btn("#C62828"), flex: 1, opacity: pode ? 1 : 0.45, cursor: pode ? "pointer" : "default" }}>
        {indo ? "Excluindo…" : "Excluir conta"}
      </button>
    </>
  );

  return (
    <Sheet onClose={indo ? () => {} : onClose} acoes={acoes}>
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Excluir minha conta</div>
        <p style={{ fontSize: 15, color: INK2, lineHeight: 1.55, fontWeight: 500, margin: "10px 0 0" }}>
          Isso apaga sua conta e seus dados dos nossos servidores. <strong style={{ color: NAVY }}>Não dá para desfazer.</strong>
        </p>

        <div style={{ background: "#fdece9", border: "1px solid #f3cdc6", borderRadius: 14, padding: "14px 16px", marginTop: 16 }}>
          {previa === undefined ? (
            <div style={{ fontSize: 14, color: INK3, fontWeight: 600 }}>Conferindo o que será apagado…</div>
          ) : previa === null ? (
            <div style={{ fontSize: 14, color: "#8c3a2c", fontWeight: 600, lineHeight: 1.5 }}>
              Não consegui conferir o que será apagado agora. Vale tentar de novo com internet melhor.
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "#8c3a2c", fontWeight: 600, lineHeight: 1.6 }}>
              <li><strong>{linha(previa.minhas, "viagem que você criou", "viagens que você criou")}</strong>, com roteiro, orçamento e notas</li>
              {previa.compartilhadas > 0 && (
                <li>
                  {linha(previa.compartilhadas, "dessas viagens está compartilhada", "dessas viagens estão compartilhadas")} —
                  quem você convidou <strong>também perde o acesso</strong>
                </li>
              )}
              {previa.convidado > 0 && (
                <li>você sai de {linha(previa.convidado, "viagem de outra pessoa", "viagens de outras pessoas")} (elas continuam lá)</li>
              )}
              <li>seu histórico de uso do Ali</li>
            </ul>
          )}
        </div>

        <p style={{ fontSize: 13.5, color: INK2, lineHeight: 1.5, margin: "16px 0 0" }}>
          Quer guardar uma cópia antes? Feche isto e use <strong style={{ color: NAVY }}>Exportar</strong>, nos Ajustes.
        </p>

        <label style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, display: "block", marginTop: 18 }}>
          Para confirmar, escreva <strong>{CONFIRMACAO}</strong>
        </label>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={indo}
          autoCapitalize="characters" autoCorrect="off" spellCheck="false"
          aria-label={`Escreva ${CONFIRMACAO} para confirmar`}
          style={{ ...field, marginTop: 6, letterSpacing: 1, fontFamily: HELV }} />
      </div>
    </Sheet>
  );
}
