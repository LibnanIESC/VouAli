import React, { useState } from "react";

// Bottom sheet arrastável (fecha ao puxar para baixo).
export default function Sheet({ children, onClose }) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const startY = React.useRef(0);
  const onDown = (e) => { startY.current = e.clientY; setDragging(true); setTouched(true); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} };
  const onMove = (e) => { if (!dragging) return; setDy(Math.max(0, e.clientY - startY.current)); };
  const end = () => { if (!dragging) return; setDragging(false); if (dy > 120) onClose(); else setDy(0); };
  const overlayAlpha = Math.max(0.15, 0.45 - dy / 700);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${overlayAlpha})`, display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 50, transition: dragging ? "none" : "background .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#f5f4f0", borderRadius: "20px 20px 0 0", overflow: "hidden", transform: touched ? `translateY(${dy}px)` : undefined, transition: dragging ? "none" : "transform .26s cubic-bezier(.4,0,.2,1)", animation: touched ? "none" : "slideUp .25s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.28)" }}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
          style={{ position: "relative", height: 34, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.22)" }} />
          <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Fechar"
            style={{ position: "absolute", right: 12, top: 5, width: 30, height: 30, borderRadius: 15, border: "none", background: "rgba(0,0,0,0.30)", color: "#fff", fontSize: 15, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
