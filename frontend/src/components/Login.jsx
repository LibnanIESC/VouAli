import React, { useState } from "react";
import AliAvatar from "./AliAvatar";
import { btn, field, CREAM, NAVY, ORANGE, DISPLAY, HELV, INK2, INK3 } from "../theme";

// Ícone do Google (multicolorido, como manda a marca deles).
const GoogleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.4l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-1.9 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.900l-.3.1-6.7 5.2-.1.3C8 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.5 27.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6v-.3l-6.8-5.3-.2.1C2.9 16 2 19.9 2 24s.9 8 2.5 11.1l7-7.5z" />
    <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.3 29.9 1 24 1 15.4 1 8 6 4.5 12.9l7 5.5C13.3 13.3 18.2 9.5 24 9.5z" />
  </svg>
);

// Tela de entrada: Google (1 toque) ou link mágico por e-mail (sem senha).
export default function Login({ onGoogle, onLink }) {
  const [email, setEmail] = useState("");
  const [modo, setModo] = useState("inicio");     // inicio | email | enviado
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const entrarGoogle = async () => {
    setErro(""); setOcupado(true);
    const r = await onGoogle();
    setOcupado(false);
    if (!r.ok && !r.cancelado) setErro("Não consegui entrar com o Google agora. Tente de novo ou use o e-mail.");
  };

  const enviar = async () => {
    const e = email.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) { setErro("Digite um e-mail válido."); return; }
    setErro(""); setOcupado(true);
    const r = await onLink(e);
    setOcupado(false);
    if (r.ok) setModo("enviado");
    else setErro("Não consegui enviar o link agora. Tente de novo em instantes.");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: CREAM, zIndex: 40, display: "flex", justifyContent: "center", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 440, padding: "52px 26px calc(32px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginBottom: 30 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 0.9, color: NAVY }}>Vou</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 0.9, color: ORANGE }}>Ali</span>
          <span style={{ width: 12, height: 12, marginBottom: 6, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
        </div>

        <AliAvatar size={96} portrait ring={ORANGE} />

        {modo === "enviado" ? (
          <>
            <h1 style={{ margin: "20px 0 0", fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Link enviado! ✉️</h1>
            <p style={{ margin: "10px 0 0", fontSize: 15, color: INK2, lineHeight: 1.55, maxWidth: 320 }}>
              Abra o e-mail que mandei para <strong style={{ color: NAVY }}>{email}</strong> e toque no link para entrar. Pode fechar esta tela.
            </p>
            <button onClick={() => setModo("inicio")} style={{ ...btn("#fff", { color: NAVY, border: `1.5px solid ${NAVY}` }), width: "100%", maxWidth: 340, marginTop: 26 }}>
              Voltar
            </button>
          </>
        ) : (
          <>
            <h1 style={{ margin: "20px 0 0", fontSize: 23, fontWeight: 800, color: NAVY, fontFamily: DISPLAY, letterSpacing: -0.3 }}>Bem-vindo ao VouAli</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15, color: INK2, lineHeight: 1.55, maxWidth: 320 }}>
              Entre para começar a planejar — suas viagens ficam salvas e sincronizadas.
            </p>

            <div style={{ width: "100%", maxWidth: 340, marginTop: 30, display: "flex", flexDirection: "column", gap: 12 }}>
              <button onClick={entrarGoogle} disabled={ocupado}
                style={{ ...btn("#fff", { color: NAVY, border: "1.5px solid #dcd7cc" }), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: ocupado ? 0.6 : 1 }}>
                <GoogleIcon />Entrar com Google
              </button>

              {modo === "inicio" ? (
                <button onClick={() => setModo("email")} disabled={ocupado}
                  style={{ background: "none", border: "none", color: INK2, fontSize: 14, fontWeight: 700, fontFamily: HELV, cursor: "pointer", minHeight: 44 }}>
                  ou entrar com e-mail
                </button>
              ) : (
                <>
                  <input type="email" inputMode="email" autoComplete="email" value={email} autoFocus
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
                    placeholder="seu@email.com" aria-label="Seu e-mail"
                    style={{ ...field, textAlign: "center", marginTop: 4 }} />
                  <button onClick={enviar} disabled={ocupado}
                    style={{ ...btn(ORANGE, { color: NAVY }), opacity: ocupado ? 0.6 : 1 }}>
                    {ocupado ? "Enviando…" : "Enviar link de acesso"}
                  </button>
                  <div style={{ fontSize: 12.5, color: INK3, lineHeight: 1.5 }}>
                    Sem senha: você recebe um link e entra com um toque.
                  </div>
                </>
              )}
            </div>

            {erro && <div style={{ fontSize: 13.5, color: "#C62828", fontWeight: 600, marginTop: 16, maxWidth: 340 }}>{erro}</div>}
          </>
        )}
      </div>
    </div>
  );
}
