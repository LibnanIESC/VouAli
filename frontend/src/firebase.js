// Login com Firebase (Google e link mágico por e-mail).
//
// A configuração vem do servidor (/api/config), não do build — assim o mesmo
// pacote roda em staging e em produção sem recompilar. Este módulo só é
// carregado quando o servidor diz que o modo de autenticação é "firebase".
import { initializeApp } from "firebase/app";
import {
  getAuth, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  onIdTokenChanged, signOut as fbSignOut,
} from "firebase/auth";

const EMAIL_KEY = "vouali-login-email";
let _auth = null;
let _token = "";
let _user = null;
const _subs = new Set();

function notify() { _subs.forEach((fn) => fn(_user)); }

// Token atual (o Firebase renova sozinho; onIdTokenChanged mantém isto fresco).
export function getToken() { return _token; }
export function getUser() { return _user; }
export function onUser(fn) { _subs.add(fn); fn(_user); return () => _subs.delete(fn); }

export async function initAuth(config) {
  if (_auth) return _auth;
  const app = initializeApp(config);
  _auth = getAuth(app);
  try { await setPersistence(_auth, browserLocalPersistence); } catch (e) {}

  // Espera a primeira resposta do Firebase antes de decidir a tela a mostrar.
  await new Promise((resolve) => {
    let primeiro = true;
    onIdTokenChanged(_auth, async (user) => {
      _user = user ? { uid: user.uid, email: user.email || "", name: user.displayName || "" } : null;
      _token = user ? await user.getIdToken() : "";
      notify();
      if (primeiro) { primeiro = false; resolve(); }
    });
  });

  await completeMagicLink();   // se a pessoa chegou pelo link do e-mail
  return _auth;
}

// ---------- Google ----------
export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(_auth, provider);
    return { ok: true };
  } catch (e) {
    const code = e && e.code ? e.code : "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return { ok: false, cancelado: true };
    }
    // Alguns navegadores (e o app instalado) bloqueiam pop-up: cai no redirecionamento.
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      try { await signInWithRedirect(_auth, provider); return { ok: true, redirecionando: true }; } catch (e2) {}
    }
    return { ok: false, erro: code || String(e) };
  }
}

// ---------- Link mágico ----------
export async function enviarLink(email) {
  const destino = window.location.origin + window.location.pathname;
  try {
    await sendSignInLinkToEmail(_auth, email, { url: destino, handleCodeInApp: true });
    localStorage.setItem(EMAIL_KEY, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e && e.code) || String(e) };
  }
}

// Conclui o login se a URL atual for um link de e-mail.
export async function completeMagicLink() {
  try {
    if (!isSignInWithEmailLink(_auth, window.location.href)) return false;
    let email = localStorage.getItem(EMAIL_KEY);
    if (!email) email = window.prompt("Confirme seu e-mail para entrar:") || "";
    if (!email) return false;
    await signInWithEmailLink(_auth, email, window.location.href);
    localStorage.removeItem(EMAIL_KEY);
    // limpa o link da barra de endereço (ele contém um código de uso único)
    window.history.replaceState({}, "", window.location.origin + window.location.pathname);
    return true;
  } catch (e) {
    return false;
  }
}

export async function logout() {
  try { await fbSignOut(_auth); } catch (e) {}
}
