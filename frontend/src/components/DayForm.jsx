import React, { useState, useRef, useEffect } from "react";
import Sheet from "./Sheet";
import { ChevronIcon, ChevronsIcon } from "./Icons";
import { btn, field, lbl, onColor, NAVY, DANGER, CORES_DIA } from "../theme";

// Formulário de criação/edição de um dia do roteiro.
// `rotulo` vem preenchido quando a viagem tem data de início: aí a data do dia
// é calculada pela posição dele no roteiro, e os campos de sigla, data e
// símbolo somem — deixar um campo que não faz mais nada é pior que não tê-lo.
export default function DayForm({ day, onSave, onClose, onDelete, canDelete, index = -1, total = 0, onMove, rotulo, onSujo }) {
  const [f, setF] = useState(day || { label: "", date: "", title: "", sub: "", line: "", color: "#365D7A" });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const snap = JSON.stringify(f);
  const inicialRef = useRef(snap);
  useEffect(() => { onSujo && onSujo(snap !== inicialRef.current); return () => onSujo && onSujo(false); }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const symbol = rotulo ? rotulo.numero : (f.line || "?").slice(0, 3);
  const isFirst = index <= 0;
  const isLast = index === total - 1;
  const moveBtn = (where, icon, disabled, label) => (
    <button type="button" onClick={() => onMove && onMove(where)} disabled={disabled} aria-label={label}
      style={{ flex: "0 0 auto", minWidth: 48, height: 44, borderRadius: 12, border: "1.5px solid #ccc", background: "#fff", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</button>
  );
  const acoes = (
    <>
      {canDelete && <button onClick={onDelete} style={btn("#fff", { color: DANGER, border: `1.5px solid ${DANGER}` })}>Excluir</button>}
      <button onClick={() => f.title.trim() && onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
    </>
  );
  return (
    <Sheet onClose={onClose} acoes={acoes}>
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: f.color || "#365D7A", color: onColor(f.color || "#365D7A"), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flex: "0 0 auto" }}>{symbol}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{day ? "Editar dia" : "Novo dia"}</div>
        </div>
        <label style={lbl}>Título</label>
        <input style={field} value={f.title} onChange={up("title")} placeholder="Ex: Estátua + Wall St" />
        {rotulo ? (
          <div style={{ fontSize: 12.5, color: "#66738A", fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
            Data: <strong style={{ color: NAVY }}>{rotulo.semana}, {rotulo.numero} {rotulo.mes}</strong> — vem da posição
            no roteiro e das datas da viagem. Mova o dia abaixo para mudá-la.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Dia (sigla)</label>
              <input style={field} value={f.label} onChange={up("label")} placeholder="Ex: QUA" maxLength={4} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Data</label>
              <input style={field} value={f.date} onChange={up("date")} placeholder="Ex: 14 OUT" />
            </div>
          </div>
        )}
        <label style={lbl}>Subtítulo</label>
        <input style={field} value={f.sub} onChange={up("sub")} placeholder="Ex: Trem A · dia leve" />
        {!rotulo && (
          <>
            <label style={lbl}>Símbolo (bolinha)</label>
            <input style={field} value={f.line} onChange={up("line")} placeholder="Ex: A, 7, L" maxLength={3} />
          </>
        )}
        <label style={lbl}>Cor</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          {CORES_DIA.map((c) => {
            const on = (f.color || "#365D7A").toLowerCase() === c.toLowerCase();
            return (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Cor ${c}`} aria-pressed={on}
                style={{ width: 42, height: 42, flex: "0 0 auto", borderRadius: "50%", background: c, cursor: "pointer", border: on ? `3px solid ${NAVY}` : "3px solid transparent", boxShadow: on ? "0 0 0 2px #fff inset" : "none" }} />
            );
          })}
        </div>
        {day && total > 1 && (
          <>
            <label style={lbl}>Posição no roteiro</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              {moveBtn("start", <ChevronsIcon color={NAVY} size={17} dir="left" />, isFirst, "Mover para o início")}
              {moveBtn("left", <ChevronIcon color={NAVY} size={17} dir="left" />, isFirst, "Mover para antes")}
              <span style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#365D7A" }}>{index + 1} de {total}</span>
              {moveBtn("right", <ChevronIcon color={NAVY} size={17} dir="right" />, isLast, "Mover para depois")}
              {moveBtn("end", <ChevronsIcon color={NAVY} size={17} dir="right" />, isLast, "Mover para o fim")}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
