"""
Aplicação FastAPI do painel administrativo do VouAli.

Serviço separado do backend de propósito: até a viagem de outubro terminar,
produção não é laboratório, e um deploy do painel não pode reiniciar o serviço
que atende os usuários. Ver docs/ADMIN.md.

Lê o mesmo Postgres do app (DATABASE_URL) e escreve apenas nas tabelas
`admin_*`.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse

from .config import settings
from .db import banco_pronto, garantir_schema
from .routers import admin_panel
from .security import aplicar_headers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vouali.admin")

app = FastAPI(title="VouAli Admin", version="1.0.0")


@app.middleware("http")
async def _headers_de_seguranca(request: Request, call_next):
    """Em TODAS as respostas, inclusive nos erros."""
    resposta = await call_next(request)
    aplicar_headers(resposta)
    return resposta


@app.on_event("startup")
def _inicio() -> None:
    logger.info("Painel admin iniciado (env=%s)", settings.ENV)
    if not settings.ADMIN_PASSWORD:
        logger.warning("ADMIN_PASSWORD ausente — painel desabilitado (503).")
    if not settings.ADMIN_SESSION_SECRET:
        logger.warning("ADMIN_SESSION_SECRET ausente — painel desabilitado (503).")
    try:
        garantir_schema()
    except Exception as e:  # noqa: BLE001 — banco fora não impede o processo de subir
        logger.error("Não consegui preparar as tabelas do painel: %s", e)


@app.get("/health")
def health() -> dict:
    """Sem segredo nenhum no corpo: diz se está de pé, não como entrar."""
    return {
        "status": "ok",
        "admin_enabled": settings.HABILITADO,
        "db": banco_pronto(),
    }


@app.get("/")
def _raiz() -> RedirectResponse:
    return RedirectResponse(url="/admin", status_code=307)


app.include_router(admin_panel.router)
