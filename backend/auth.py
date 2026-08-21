"""Autenticação.

Dois modos, escolhidos por AUTH_MODE:

- "token"    (padrão) — comportamento antigo: uma senha compartilhada
              (TRIP_TOKEN). É o que roda em PRODUÇÃO hoje, e não muda.
- "firebase" — contas de verdade: o app manda o ID token do Firebase e aqui
              ele é verificado. É o modo do staging e do futuro app público.
"""
import base64
import json
import os

AUTH_MODE = os.getenv("AUTH_MODE", "token").strip().lower()
TRIP_TOKEN = os.getenv("TRIP_TOKEN", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")

_firebase_app = None
_firebase_error = None


def _load_credentials():
    """Aceita a credencial como JSON puro ou em base64 (o painel pode reformatar)."""
    bruto = os.getenv("FIREBASE_CREDENTIALS", "").strip()
    if not bruto:
        return None
    try:
        return json.loads(bruto)
    except Exception:
        pass
    try:
        return json.loads(base64.b64decode(bruto).decode("utf-8"))
    except Exception:
        return None


def init_firebase():
    """Inicializa uma vez. NUNCA levanta exceção: guarda o erro e devolve None,
    para uma credencial errada não derrubar o app inteiro."""
    global _firebase_app, _firebase_error
    if _firebase_app or _firebase_error:
        return _firebase_app
    dados = _load_credentials()
    if not dados:
        _firebase_error = "FIREBASE_CREDENTIALS ausente ou não é um JSON válido"
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
    except Exception as e:
        _firebase_error = f"firebase-admin indisponível: {e}"[:200]
        return None
    try:                                    # já inicializado num reload?
        _firebase_app = firebase_admin.get_app("vouali")
        return _firebase_app
    except ValueError:
        pass                                # ainda não existe: criar abaixo
    try:
        cred = credentials.Certificate(dados)
        _firebase_app = firebase_admin.initialize_app(cred, name="vouali")
    except Exception as e:
        _firebase_error = f"credencial inválida: {e}"[:200]
    return _firebase_app


def verify_token(id_token):
    """Devolve {uid, email, name} ou None se o token for inválido."""
    app = init_firebase()
    if not app or not id_token:
        return None
    try:
        from firebase_admin import auth as fb_auth
        info = fb_auth.verify_id_token(id_token, app=app)
    except Exception:
        return None
    uid = info.get("uid") or info.get("user_id")
    if not uid:
        return None
    return {
        "uid": uid,
        "email": info.get("email") or "",
        "name": info.get("name") or (info.get("email") or "").split("@")[0],
    }


def bearer(request):
    cabecalho = request.headers.get("Authorization") or ""
    if cabecalho.lower().startswith("bearer "):
        return cabecalho[7:].strip()
    return ""


def current_user(request):
    """Usuário autenticado no modo firebase; None caso contrário."""
    if AUTH_MODE != "firebase":
        return None
    return verify_token(bearer(request))


def legacy_token_ok(request):
    """Modo antigo: confere a senha compartilhada."""
    if not TRIP_TOKEN:
        return True
    return request.headers.get("X-Trip-Token") == TRIP_TOKEN


def web_config():
    """Configuração pública do Firebase, servida ao app (evita rebuild por ambiente)."""
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": FIREBASE_PROJECT_ID,
        "appId": os.getenv("FIREBASE_APP_ID", ""),
    }


def status():
    return {
        "mode": AUTH_MODE,
        "ready": bool(init_firebase()) if AUTH_MODE == "firebase" else True,
        "error": _firebase_error if AUTH_MODE == "firebase" else None,
    }
