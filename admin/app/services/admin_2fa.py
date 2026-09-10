"""
Segundo fator do login (TOTP, RFC 6238).

O segredo e os códigos de backup vivem numa linha única de `admin_security`.
Os códigos são guardados apenas como SHA-256 e cada um serve UMA vez — se a
tabela vazar, ninguém entra com ela.

As funções de cripto são puras e ficam separadas da I/O, para poderem ser
testadas sem banco.
"""

import hashlib
import json
import secrets
import time

import pyotp
import segno

from ..config import settings
from ..db import conectar

LINHA = "singleton"
QTD_BACKUP = 10


# ── puro (testável sem banco) ────────────────────────────────────────────────

def gerar_segredo() -> str:
    return pyotp.random_base32()


def gerar_codigos_backup(n: int = QTD_BACKUP) -> list[str]:
    """Códigos legíveis, do tipo `a1b2-c3d4`. Entropia vem do secrets."""
    return [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(n)]


def hash_codigo(codigo: str) -> str:
    return hashlib.sha256(_normalizar(codigo).encode()).hexdigest()


def _normalizar(codigo: str) -> str:
    return str(codigo or "").strip().lower().replace(" ", "")


def codigo_confere(segredo: str, codigo: str) -> bool:
    """Tolerância de ±1 período (30 s) — relógio de celular atrasa."""
    if not segredo or not codigo:
        return False
    return pyotp.TOTP(segredo).verify(str(codigo).strip(), valid_window=1)


def uri_otpauth(segredo: str, conta: str = "admin") -> str:
    return pyotp.TOTP(segredo).provisioning_uri(name=conta, issuer_name=settings.TOTP_ISSUER)


def qrcode_svg(uri: str) -> str:
    """QR embutido como SVG inline — o painel não depende de asset externo nem
    manda o segredo para um gerador de QR de terceiros.

    O segno escreve bytes mesmo em SVG, daí o BytesIO e o decode."""
    import io
    buf = io.BytesIO()
    segno.make(uri, error="m").save(buf, kind="svg", scale=4, border=2, xmldecl=False, svgns=True)
    return buf.getvalue().decode("utf-8")


# ── estado (banco) ───────────────────────────────────────────────────────────

def ler_seguranca() -> dict | None:
    with conectar() as con:
        linha = con.um(
            "SELECT totp_secret, confirmado, backup_hashes FROM admin_security WHERE id=?",
            (LINHA,),
        )
    if not linha:
        return None
    return {
        "totp_secret": linha[0] or "",
        "confirmado": bool(linha[1]),
        "backup_hashes": json.loads(linha[2] or "[]"),
    }


def precisa_cadastrar() -> bool:
    """Sem registro ou sem confirmação, o próximo login cai no enrollment."""
    reg = ler_seguranca()
    return not reg or not reg["confirmado"] or not reg["totp_secret"]


def iniciar_cadastro() -> dict:
    """Gera segredo + códigos de backup e devolve o material para exibir UMA
    vez. Ainda não confirma: só um código válido do autenticador confirma."""
    segredo = gerar_segredo()
    codigos = gerar_codigos_backup()
    hashes = [hash_codigo(c) for c in codigos]
    with conectar() as con:
        con.execute("DELETE FROM admin_security WHERE id=?", (LINHA,))
        con.execute(
            "INSERT INTO admin_security(id, totp_secret, confirmado, backup_hashes, criado_em)"
            " VALUES(?,?,?,?,?)",
            (LINHA, segredo, 0, json.dumps(hashes), int(time.time())),
        )
    uri = uri_otpauth(segredo)
    return {"segredo": segredo, "codigos": codigos, "uri": uri, "qr": qrcode_svg(uri)}


def confirmar_cadastro(codigo: str) -> bool:
    reg = ler_seguranca()
    if not reg or not reg["totp_secret"]:
        return False
    if not codigo_confere(reg["totp_secret"], codigo):
        return False
    with conectar() as con:
        con.execute(
            "UPDATE admin_security SET confirmado=1, confirmado_em=? WHERE id=?",
            (int(time.time()), LINHA),
        )
    return True


def verificar(codigo: str) -> bool:
    """Aceita o código do autenticador OU um dos códigos de backup — este
    último é CONSUMIDO no uso."""
    reg = ler_seguranca()
    if not reg or not reg["confirmado"]:
        return False
    if codigo_confere(reg["totp_secret"], codigo):
        return True

    alvo = hash_codigo(codigo)
    if alvo not in reg["backup_hashes"]:
        return False
    restantes = [h for h in reg["backup_hashes"] if h != alvo]
    with conectar() as con:
        con.execute(
            "UPDATE admin_security SET backup_hashes=? WHERE id=?",
            (json.dumps(restantes), LINHA),
        )
    return True
