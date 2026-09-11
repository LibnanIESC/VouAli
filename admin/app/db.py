"""
Acesso ao banco do VouAli — o MESMO Postgres que o app usa.

O painel lê as tabelas do app (`users`, `trips`, `trip_members`, `ai_usage`) e
escreve apenas nas suas próprias (`admin_security`, `admin_login_attempts`).
Essa fronteira é de propósito: um bug aqui não pode corromper a viagem de
ninguém.

O wrapper `Conn` repete o do backend ([backend/store.py]) porque o mesmo SQL
precisa rodar em psycopg (produção) e em sqlite3 (desenvolvimento) — o `?` do
sqlite vira `%s` no Postgres, e é só isso que muda.
"""

import os

from .config import settings

# Tabelas do painel. Ficam no mesmo banco por simplicidade operacional (um
# Postgres só), mas com prefixo próprio: nada aqui se confunde com dado de
# usuário.
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS admin_security (
        id TEXT PRIMARY KEY,
        totp_secret TEXT,
        confirmado INTEGER NOT NULL DEFAULT 0,
        backup_hashes TEXT,
        criado_em INTEGER,
        confirmado_em INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS admin_login_attempts (
        id TEXT PRIMARY KEY,
        ip TEXT,
        user_agent TEXT,
        estagio INTEGER,
        sucesso INTEGER,
        quando INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS admin_acoes (
        id TEXT PRIMARY KEY,
        quando INTEGER,
        ip TEXT,
        acao TEXT,
        alvo TEXT,
        detalhe TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_tentativas_ip ON admin_login_attempts(ip, quando)",
    "CREATE INDEX IF NOT EXISTS idx_acoes_quando ON admin_acoes(quando)",
]


class Conn:
    """Conexão fina que esconde as diferenças entre psycopg e sqlite3."""

    def __init__(self, raw, is_pg):
        self.raw = raw
        self.pg = is_pg

    def execute(self, sql, params=()):
        if self.pg:
            cur = self.raw.cursor()
            cur.execute(sql.replace("?", "%s"), params)
            return cur
        return self.raw.execute(sql, params)

    def um(self, sql, params=()):
        return self.execute(sql, params).fetchone()

    def todos(self, sql, params=()):
        return self.execute(sql, params).fetchall()

    def commit(self):
        self.raw.commit()

    def close(self):
        try:
            self.raw.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        if exc[0] is None:
            self.commit()
        self.close()


def _caminho_sqlite():
    return os.path.join(os.getenv("DATA_DIR", "."), "vouali.db")


def conectar():
    if settings.DATABASE_URL:
        import psycopg
        return Conn(psycopg.connect(settings.DATABASE_URL), True)
    import sqlite3
    return Conn(sqlite3.connect(_caminho_sqlite()), False)


_pronto = False


def garantir_schema():
    """Cria só as tabelas DO PAINEL. As do app são criadas pelo backend — o
    painel nunca as altera."""
    global _pronto
    if _pronto:
        return
    with conectar() as con:
        for ddl in SCHEMA:
            con.execute(ddl)
    _pronto = True


def banco_pronto() -> bool:
    """Usado pelo /health: diz se dá para falar com o banco agora."""
    try:
        with conectar() as con:
            con.um("SELECT 1")
        return True
    except Exception:
        return False
