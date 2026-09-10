"""
Autenticação do painel — login em DOIS ESTÁGIOS com cookie endurecido.

Estágio 1 = senha correta. Estágio 2 = código TOTP correto. SÓ o estágio 2
abre as telas de dados: o estágio 1 existe apenas para concluir o 2FA.

O estágio viaja dentro do cookie, assinado com HMAC-SHA256 usando um segredo
dedicado. Assinatura e TTL são conferidos a cada requisição, então um cookie
forjado ou vencido vale zero — não há sessão guardada no servidor para alguém
adivinhar o identificador.
"""

import hashlib
import hmac
import time

from fastapi import Request, Response

from .config import settings

# Em produção o cookie usa o prefixo "__Host-", que o navegador só aceita com
# Secure, Path=/ e sem Domain — isso impede que um subdomínio fixe o cookie.
# Em desenvolvimento (http://localhost) o prefixo seria recusado, então cai no
# nome simples.
_COOKIE_BASE = "vouali_admin"

STAGE1_TTL = 10 * 60      # tempo para digitar o código do autenticador
STAGE2_TTL = 8 * 3600     # jornada de trabalho
_STAGE_TTL = {1: STAGE1_TTL, 2: STAGE2_TTL}


def cookie_name() -> str:
    return f"__Host-{_COOKIE_BASE}" if settings.IS_PRODUCTION else _COOKIE_BASE


def _assinar(payload: str) -> str:
    return hmac.new(settings.ADMIN_SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _montar(stage: int) -> str:
    payload = f"{stage}.{int(time.time())}"
    return f"{payload}.{_assinar(payload)}"


def estagio(request: Request) -> int:
    """Estágio válido do cookie (1 ou 2). Zero quando não há, foi adulterado
    ou venceu."""
    bruto = request.cookies.get(cookie_name())
    if not bruto or bruto.count(".") != 2:
        return 0
    stage_s, emitido_s, assinatura = bruto.split(".")
    try:
        stage, emitido = int(stage_s), int(emitido_s)
    except (TypeError, ValueError):
        return 0
    if stage not in _STAGE_TTL:
        return 0
    # compare_digest: comparação em tempo constante, para a checagem não virar
    # um oráculo que revela a assinatura byte a byte.
    if not hmac.compare_digest(_assinar(f"{stage}.{emitido}"), assinatura):
        return 0
    if time.time() - emitido > _STAGE_TTL[stage]:
        return 0
    return stage


def definir_estagio(response: Response, stage: int) -> None:
    response.set_cookie(
        cookie_name(),
        _montar(stage),
        max_age=_STAGE_TTL[stage],
        httponly=True,
        samesite="lax",
        secure=settings.IS_PRODUCTION,   # exigido pelo prefixo __Host-
        path="/",
    )


def encerrar(response: Response) -> None:
    response.delete_cookie(cookie_name(), path="/")


def senha_confere(digitada: str) -> bool:
    """Comparação em tempo constante: sem isso, o tempo de resposta entrega o
    tamanho e o prefixo da senha."""
    return hmac.compare_digest(str(digitada or ""), settings.ADMIN_PASSWORD)


def ip_do_pedido(request: Request) -> str:
    """IP real atrás do proxy do Railway. Só o primeiro da cadeia é confiável
    aqui — os seguintes podem ser forjados pelo cliente."""
    encaminhado = request.headers.get("x-forwarded-for", "")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.client.host if request.client else "?"


def aplicar_headers(response: Response) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
