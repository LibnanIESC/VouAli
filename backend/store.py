"""Camada de dados multiusuário.

Um mesmo SQL roda em PostgreSQL (produção/staging, via DATABASE_URL) e em
SQLite (testes e desenvolvimento). Por isso o schema usa só tipos portáveis
(TEXT/INTEGER) e o JSON é guardado como texto, já que o app sempre lê e
escreve o documento inteiro da viagem.

Regra de ouro deste módulo: **toda leitura e escrita passa por uma checagem
de acesso**. Nenhuma função devolve dados de viagem sem confirmar que o
usuário é dono ou membro.
"""
import json
import os
import time
import uuid

DATABASE_URL = os.getenv("DATABASE_URL", "")

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        active_trip TEXT,
        created_at INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL,
        meta TEXT NOT NULL,
        state TEXT NOT NULL,
        ver INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS trip_members (
        trip_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        created_at INTEGER,
        PRIMARY KEY (trip_id, uid)
    )""",
    """CREATE TABLE IF NOT EXISTS trip_invites (
        trip_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        invited_by TEXT,
        created_at INTEGER,
        PRIMARY KEY (trip_id, email)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_members_uid ON trip_members(uid)",
    "CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_uid)",
    "CREATE INDEX IF NOT EXISTS idx_invites_email ON trip_invites(email)",
]

EMPTY_STATE = {"days": [], "budget": [], "prebuy": [], "notes": []}


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


def _sqlite_path():
    return os.path.join(os.getenv("DATA_DIR", "."), "vouali.db")


def connect():
    if DATABASE_URL:
        import psycopg
        return Conn(psycopg.connect(DATABASE_URL), True)
    import sqlite3
    return Conn(sqlite3.connect(_sqlite_path()), False)


_ready = False


def ensure_schema(force=False):
    global _ready
    if _ready and not force:
        return
    with connect() as con:
        for ddl in SCHEMA:
            con.execute(ddl)
    _ready = True


def _now():
    return int(time.time())


def _uid():
    return uuid.uuid4().hex[:8]


# ---------- usuários ----------

def upsert_user(con, uid, email="", name=""):
    """Cria o usuário no primeiro login; nos seguintes, atualiza nome/e-mail."""
    row = con.execute("SELECT uid FROM users WHERE uid=?", (uid,)).fetchone()
    if row:
        con.execute("UPDATE users SET email=?, name=? WHERE uid=?", (email, name, uid))
    else:
        con.execute(
            "INSERT INTO users(uid, email, name, active_trip, created_at) VALUES(?,?,?,?,?)",
            (uid, email, name, None, _now()),
        )


def get_active(con, uid):
    row = con.execute("SELECT active_trip FROM users WHERE uid=?", (uid,)).fetchone()
    return row[0] if row else None


def set_active(con, uid, trip_id):
    """Só aceita viagem à qual o usuário tem acesso."""
    if trip_id is not None and not role_of(con, trip_id, uid):
        return False
    con.execute("UPDATE users SET active_trip=? WHERE uid=?", (trip_id, uid))
    return True


# ---------- acesso ----------

def role_of(con, trip_id, uid):
    """'owner', 'editor' ou None. Base de toda a checagem de acesso."""
    row = con.execute("SELECT role FROM trip_members WHERE trip_id=? AND uid=?", (trip_id, uid)).fetchone()
    return row[0] if row else None


def add_member(con, trip_id, uid, role="editor"):
    if role_of(con, trip_id, uid):
        return
    con.execute(
        "INSERT INTO trip_members(trip_id, uid, role, created_at) VALUES(?,?,?,?)",
        (trip_id, uid, role, _now()),
    )


def remove_member(con, trip_id, uid):
    """O dono não pode ser removido (ficaria uma viagem órfã)."""
    if role_of(con, trip_id, uid) == "owner":
        return False
    con.execute("DELETE FROM trip_members WHERE trip_id=? AND uid=?", (trip_id, uid))
    return True


# ---------- convites ----------

def norm_email(email):
    return str(email or "").strip().lower()


def user_by_email(con, email):
    row = con.execute("SELECT uid FROM users WHERE lower(email)=?", (norm_email(email),)).fetchone()
    return row[0] if row else None


def invite(con, trip_id, email, role="editor", invited_by=None):
    """Convida por e-mail.

    Se a pessoa já tem conta, entra como membro na hora. Se ainda não tem,
    fica um convite pendente que é resgatado no primeiro login dela.
    Retorna "member" ou "pending".
    """
    email = norm_email(email)
    uid = user_by_email(con, email)
    if uid:
        add_member(con, trip_id, uid, role)
        con.execute("DELETE FROM trip_invites WHERE trip_id=? AND email=?", (trip_id, email))
        return "member"
    linha = con.execute("SELECT 1 FROM trip_invites WHERE trip_id=? AND email=?", (trip_id, email)).fetchone()
    if not linha:
        con.execute(
            "INSERT INTO trip_invites(trip_id, email, role, invited_by, created_at) VALUES(?,?,?,?,?)",
            (trip_id, email, role, invited_by, _now()),
        )
    return "pending"


def pending_invites(con, trip_id):
    rows = con.execute("SELECT email, role FROM trip_invites WHERE trip_id=? ORDER BY created_at", (trip_id,)).fetchall()
    return [{"email": r[0], "role": r[1], "pending": True} for r in rows]


def cancel_invite(con, trip_id, email):
    con.execute("DELETE FROM trip_invites WHERE trip_id=? AND email=?", (trip_id, norm_email(email)))


def claim_invites(con, uid, email):
    """Chamado a cada login: transforma convites pendentes em acesso real."""
    email = norm_email(email)
    if not email:
        return 0
    rows = con.execute("SELECT trip_id, role FROM trip_invites WHERE email=?", (email,)).fetchall()
    for trip_id, role in rows:
        existe = con.execute("SELECT 1 FROM trips WHERE id=?", (trip_id,)).fetchone()
        if existe:
            add_member(con, trip_id, uid, role)
    if rows:
        con.execute("DELETE FROM trip_invites WHERE email=?", (email,))
    return len(rows)


def members_of(con, trip_id):
    rows = con.execute(
        "SELECT m.uid, m.role, u.email, u.name FROM trip_members m "
        "LEFT JOIN users u ON u.uid = m.uid WHERE m.trip_id=? ORDER BY m.role DESC, m.created_at",
        (trip_id,),
    ).fetchall()
    return [{"uid": r[0], "role": r[1], "email": r[2] or "", "name": r[3] or ""} for r in rows]


# ---------- viagens ----------

def list_trips(con, uid):
    """Índice no formato que o app já entende: {active, list:[meta...]}."""
    rows = con.execute(
        "SELECT t.id, t.meta, m.role FROM trips t "
        "JOIN trip_members m ON m.trip_id = t.id "
        "WHERE m.uid=? ORDER BY t.created_at",
        (uid,),
    ).fetchall()
    lista = []
    for tid, meta, role in rows:
        m = json.loads(meta) if isinstance(meta, str) else (meta or {})
        m["id"] = tid
        m["role"] = role
        lista.append(m)
    ativa = get_active(con, uid)
    if ativa and not any(m["id"] == ativa for m in lista):
        ativa = None                      # perdeu acesso: não aponta para viagem alheia
    if not ativa and lista:
        ativa = lista[0]["id"]
        con.execute("UPDATE users SET active_trip=? WHERE uid=?", (ativa, uid))
    return {"active": ativa, "list": lista}


def create_trip(con, uid, meta, state=None):
    tid = _uid()
    agora = _now()
    con.execute(
        "INSERT INTO trips(id, owner_uid, meta, state, ver, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
        (tid, uid, json.dumps(meta, ensure_ascii=False),
         json.dumps(state or EMPTY_STATE, ensure_ascii=False), 0, agora, agora),
    )
    add_member(con, tid, uid, "owner")
    con.execute("UPDATE users SET active_trip=? WHERE uid=?", (tid, uid))
    return tid


def get_trip(con, trip_id, uid):
    """Devolve (state, ver) ou None se o usuário não tiver acesso."""
    if not role_of(con, trip_id, uid):
        return None
    row = con.execute("SELECT state, ver FROM trips WHERE id=?", (trip_id,)).fetchone()
    if not row:
        return None
    state = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    return state, row[1]


def put_trip(con, trip_id, uid, state, base_ver=None):
    """Grava com concorrência otimista. Levanta Conflict se a versão estiver defasada."""
    if not role_of(con, trip_id, uid):
        return None
    row = con.execute("SELECT ver FROM trips WHERE id=?", (trip_id,)).fetchone()
    if not row:
        return None
    atual = row[0]
    if base_ver is not None and base_ver != "" and int(base_ver) != atual:
        raise Conflict(atual)
    nova = atual + 1
    con.execute(
        "UPDATE trips SET state=?, ver=?, updated_at=? WHERE id=?",
        (json.dumps(state, ensure_ascii=False), nova, _now(), trip_id),
    )
    return nova


def get_meta(con, trip_id, uid):
    if not role_of(con, trip_id, uid):
        return None
    row = con.execute("SELECT meta FROM trips WHERE id=?", (trip_id,)).fetchone()
    if not row:
        return None
    meta = json.loads(row[0]) if isinstance(row[0], str) else (row[0] or {})
    meta["id"] = trip_id
    return meta


def update_meta(con, trip_id, uid, patch):
    """Atualiza só os campos enviados (não sobrescreve o resto)."""
    meta = get_meta(con, trip_id, uid)
    if meta is None:
        return None
    meta.update(patch)
    meta.pop("id", None)
    meta.pop("role", None)
    con.execute("UPDATE trips SET meta=?, updated_at=? WHERE id=?",
                (json.dumps(meta, ensure_ascii=False), _now(), trip_id))
    return meta


def delete_trip(con, trip_id, uid):
    """Dono apaga a viagem; membro convidado apenas sai dela."""
    papel = role_of(con, trip_id, uid)
    if not papel:
        return False
    if papel == "owner":
        con.execute("DELETE FROM trip_members WHERE trip_id=?", (trip_id,))
        con.execute("DELETE FROM trips WHERE id=?", (trip_id,))
    else:
        con.execute("DELETE FROM trip_members WHERE trip_id=? AND uid=?", (trip_id, uid))
    con.execute("UPDATE users SET active_trip=NULL WHERE active_trip=?", (trip_id,))
    return True


class Conflict(Exception):
    """Gravação baseada numa versão defasada (outro aparelho gravou antes)."""

    def __init__(self, version):
        super().__init__("version conflict")
        self.version = version
