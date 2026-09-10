"""
Bloqueio por IP e trilha de auditoria do login.

Cada tentativa vira uma linha em `admin_login_attempts`. Passando de
RATE_LIMIT_MAX_FAILS falhas do mesmo IP dentro da janela, aquele IP fica
bloqueado até a janela correr — o que torna força bruta impraticável mesmo com
uma senha mediana.

Diferente do rate limit do backend do app, que vive em memória, este conta no
banco: sobrevive a reinício e vale para qualquer réplica.
"""

import time
import uuid

from ..config import settings
from ..db import conectar


def _inicio_da_janela() -> int:
    return int(time.time()) - settings.RATE_LIMIT_WINDOW_MIN * 60


def registrar(ip: str, user_agent: str, estagio: int, sucesso: bool) -> None:
    with conectar() as con:
        con.execute(
            "INSERT INTO admin_login_attempts(id, ip, user_agent, estagio, sucesso, quando)"
            " VALUES(?,?,?,?,?,?)",
            (uuid.uuid4().hex, ip, (user_agent or "")[:300], estagio, 1 if sucesso else 0, int(time.time())),
        )


def falhas_recentes(ip: str) -> int:
    with conectar() as con:
        linha = con.um(
            "SELECT COUNT(*) FROM admin_login_attempts"
            " WHERE ip=? AND sucesso=0 AND quando >= ?",
            (ip, _inicio_da_janela()),
        )
    return int(linha[0]) if linha else 0


def bloqueado(ip: str) -> bool:
    return falhas_recentes(ip) >= settings.RATE_LIMIT_MAX_FAILS


def limpar(ip: str) -> None:
    """Depois de um login completo, o histórico de falhas daquele IP deixa de
    contar — senão quem errou a senha duas vezes hoje começa amanhã já perto do
    bloqueio."""
    with conectar() as con:
        con.execute("DELETE FROM admin_login_attempts WHERE ip=? AND sucesso=0", (ip,))
