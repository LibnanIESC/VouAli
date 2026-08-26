// Login com Firebase (Google e link mágico por e-mail).
//
// A configuração vem do servidor (/api/config), não do build — assim o mesmo
// pacote roda em staging e em produção sem recompilar. Este módulo só é
// carregado quando o servidor diz que o modo de autenticação é "firebase".
import { initializeApp } from "firebase/app";
import {
  getAuth, setPersistence, browserLocalPersistence, indexedDBLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithCredential,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  onIdTokenChanged, signOut as fbSignOut,
} from "firebase/auth";
import { noApp } from "./api";

const EMAIL_KEY = "vouali-login-email";
let _auth = null;
let _token = "";
let _user = null;
const _subs = new Set();

function notify() { _subs.forEach((fn) => fn(_user)); }

/**
 * Token válido AGORA.
 *
 * Guardar o token numa variável não basta: ele vence em uma hora. Quem
 * mantinha a cópia fresca era o `onIdTokenChanged`, mas entre o app voltar do
 * segundo plano e o Firebase renovar existe uma janela em que a cópia já está
 * vencida — e toda chamada nela volta 401.
 *
 * `getIdToken()` resolve na fonte: devolve o do cache enquanto vale, e renova
 * sozinho quando não vale mais. Por isso é assíncrono.
 */
export async function getToken(forcar = false) {
  const usuario = _auth && _auth.currentUser;
  if (!usuario) return "";
  try {
    _token = await usuario.getIdToken(forcar);
  } catch (e) {}   // sem rede: segue com o último que tínhamos
  return _token;
}
export function getUser() { return _user; }
export function onUser(fn) { _subs.add(fn); fn(_user); return () => _subs.delete(fn); }

export async function initAuth(config) {
  if (_auth) return _auth;
  const app = initializeApp(config);
  _auth = getAuth(app);
  // No WebView do app, o armazenamento local pode ser limpo com mais
  // facilidade; o IndexedDB segura melhor a sessão entre aberturas.
  try {
    await setPersistence(_auth, noApp() ? indexedDBLocalPersistence : browserLocalPersistence);
  } catch (e) {
    try { await setPersistence(_auth, browserLocalPersistence); } catch (e2) {}
  }

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

/**
 * Dentro do app instalado, a janelinha de login do navegador não funciona
 * (o WebView bloqueia). Aqui usamos a tela de contas NATIVA do Android e
 * depois entregamos a credencial ao Firebase do JavaScript — assim o resto
 * do app (token, sessão, logout) continua funcionando igual ao site.
 */
async function loginGoogleNativo() {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const r = await FirebaseAuthentication.signInWithGoogle();
  const idToken = r && r.credential && r.credential.idToken;
  if (!idToken) throw new Error("sem credencial do Google");
  await signInWithCredential(_auth, GoogleAuthProvider.credential(idToken));
}

export async function loginGoogle() {
  if (noApp()) {
    try {
      await loginGoogleNativo();
      return { ok: true };
    } catch (e) {
      const code = (e && (e.code || e.message)) || "";
      if (/cancel|closed|12501/i.test(String(code))) return { ok: false, cancelado: true };
      return { ok: false, erro: String(code).slice(0, 120) };
    }
  }
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
  // No app, sair do Firebase do JavaScript não basta: a sessão nativa
  // continuaria valendo e o próximo login entraria sozinho na mesma conta.
  if (noApp()) {
    try {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      await FirebaseAuthentication.signOut();
    } catch (e) {}
  }
  try { await fbSignOut(_auth); } catch (e) {}
}
