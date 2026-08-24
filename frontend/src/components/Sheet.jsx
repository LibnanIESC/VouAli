import React, { useState, useRef } from "react";
import { CloseIcon } from "./Icons";

const LIMIAR = 8;    // px de movimento antes de decidir entre rolar e arrastar
const FECHA = 120;   // px puxados para baixo que fecham a gaveta

/**
 * Bottom sheet arrastável (fecha ao puxar para baixo).
 *
 * `acoes` é a barra de botões do rodapé (Salvar, Excluir…). Fica FORA da área
 * rolável de propósito: em formulário comprido, ter que rolar até o fim para
 * achar o Salvar é ruim — e pior ainda no celular, onde o teclado come metade
 * da tela.
 *
 * Os dois blocos reservam o espaço da barra de navegação do Android (◀ ● ■),
 * que desenha por cima do app. Sem isso os botões ficam debaixo dela.
 */
export default function Sheet({ children, onClose, acoes }) {
  const [dy, setDy] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [tocado, setTocado] = useState(false);
  const rolagem = useRef(null);
  const gesto = useRef(null);     // gesto em andamento
  const dyRef = useRef(0);        // o mesmo dy, legível na hora de soltar
  const arrastou = useRef(false); // acabou de arrastar? então o toque não é clique

  const mover = (v) => { dyRef.current = v; setDy(v); };

  /**
   * O arrasto vale na gaveta inteira, não só na barrinha do topo — puxar para
   * baixo de qualquer lugar é o gesto que a pessoa espera.
   *
   * Dentro da área rolável há um conflito: o mesmo movimento serve para rolar.
   * A regra é a dos apps nativos — puxar para baixo só fecha quando o conteúdo
   * JÁ ESTÁ no topo; do contrário, a pessoa está rolando.
   */
  const aoPressionar = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesto.current = {
      y0: e.clientY,
      naRolagem: !!(rolagem.current && rolagem.current.contains(e.target)),
      decidido: false,
      arrastando: false,
    };
  };

  const aoMover = (e) => {
    const g = gesto.current;
    if (!g) return;
    const d = e.clientY - g.y0;
    if (!g.decidido) {
      if (Math.abs(d) < LIMIAR) return;
      const noTopo = !g.naRolagem || !rolagem.current || rolagem.current.scrollTop <= 0;
      g.decidido = true;
      g.arrastando = d > 0 && noTopo;
      if (!g.arrastando) { gesto.current = null; return; }   // é rolagem, deixa passar
      setArrastando(true);
      setTocado(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
    arrastou.current = true;
    mover(Math.max(0, d - LIMIAR));
  };

  const aoSoltar = () => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !g.arrastando) return;
    setArrastando(false);
    if (dyRef.current > FECHA) onClose();
    else mover(0);
  };

  // Depois de arrastar, o navegador ainda dispara o clique no que estava sob o
  // dedo. Sem isto, puxar a gaveta a partir de um botão acabaria acionando ele.
  const aoClicarCapturando = (e) => {
    if (!arrastou.current) return;
    arrastou.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const veu = Math.max(0.15, 0.45 - dy / 700);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${veu})`, display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 50, transition: arrastando ? "none" : "background .2s" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        onClickCapture={aoClicarCapturando}
        onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
        style={{ width: "100%", maxWidth: 440, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#f5f4f0", borderRadius: "20px 20px 0 0", overflow: "hidden", transform: tocado ? `translateY(${dy}px)` : undefined, transition: arrastando ? "none" : "transform .26s cubic-bezier(.4,0,.2,1)", animation: tocado ? "none" : "slideUp .25s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.28)" }}>

        {/* Barra do topo: 46px para o botão de fechar (44px de alvo de toque)
            caber inteiro. Mais baixa, ele invadia o conteúdo logo abaixo. */}
        <div style={{ position: "relative", height: 46, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", cursor: arrastando ? "grabbing" : "grab", touchAction: "none" }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.22)" }} />
          <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Fechar"
            style={{ position: "absolute", right: 8, top: 1, width: 44, height: 44, borderRadius: 22, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}><CloseIcon size={14} /></span>
          </button>
        </div>

        <div ref={rolagem} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", touchAction: "pan-y", paddingBottom: acoes ? 0 : "env(safe-area-inset-bottom)" }}>{children}</div>

        {acoes && (
          <div style={{ flex: "0 0 auto", display: "flex", gap: 10, padding: "12px 22px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", background: "#f5f4f0", borderTop: "1px solid #e4e0d7", boxShadow: "0 -6px 16px rgba(20,32,56,0.07)" }}>
            {acoes}
          </div>
        )}
      </div>
    </div>
  );
}
