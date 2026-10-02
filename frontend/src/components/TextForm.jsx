import React, { useState, useRef, useEffect } from "react";
import Sheet from "./Sheet";
import { btn, field, lbl, DANGER} from "../theme";

// Formulário genérico de campos de texto (usado por "comprar antes" e notas).
export default function TextForm({ title, initial, fields, onSave, onClose, onDelete, canDelete, onSujo }) {
  const [f, setF] = useState(initial);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const snap = JSON.stringify(f);
  const inicialRef = useRef(snap);
  useEffect(() => { onSujo && onSujo(snap !== inicialRef.current); return () => onSujo && onSujo(false); }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const acoes = (
    <>
      {canDelete && <button onClick={onDelete} style={btn("#fff", { color: DANGER, border: `1.5px solid ${DANGER}` })}>Excluir</button>}
      <button onClick={() => onSave(f)} style={{ ...btn("#223A5E"), flex: 1 }}>Salvar</button>
    </>
  );
  return (
    <Sheet onClose={onClose} acoes={acoes}>
      <div style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#223A5E" }}>{title}</div>
        {fields.map((fl) => (
          <div key={fl.k}>
            <label style={lbl}>{fl.label}</label>
            {fl.area
              ? <textarea style={field} rows={3} value={f[fl.k] || ""} onChange={up(fl.k)} />
              : <input style={field} value={f[fl.k] || ""} onChange={up(fl.k)} placeholder={fl.ph || ""} />}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
