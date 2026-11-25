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
    """CREATE TABLE IF NOT EXISTS ai_usage (
        uid TEXT NOT NULL,
        period TEXT NOT NULL,
        chat INTEGER NOT NULL DEFAULT 0,
        gen INTEGER NOT NULL DEFAULT 0,
        tip INTEGER NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER,
        PRIMARY KEY (uid, period)
    )""",
    # Saldo de IA que NÃO renova: degustação, passe de viagem, recarga.
    # `trip_id` nulo = degustação (é da conta) ou passe ainda sem viagem.
    """CREATE TABLE IF NOT EXISTS ai_grants (
        id TEXT PRIMARY KEY,
        uid TEXT NOT NULL,
        trip_id TEXT,
        origin TEXT NOT NULL,
        chat INTEGER NOT NULL DEFAULT 0,
        gen INTEGER NOT NULL DEFAULT 0,
        tip INTEGER NOT NULL DEFAULT 0,
        chat_used INTEGER NOT NULL DEFAULT 0,
        gen_used INTEGER NOT NULL DEFAULT 0,
        tip_used INTEGER NOT NULL DEFAULT 0,
        txn_id TEXT,
        store_txn TEXT,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER
    )""",
    # Uma transação da loja vira no máximo UM saldo (NULLs não colidem).
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_txn ON ai_grants(txn_id)",
    # Diário dos avisos da loja (compra, reembolso). Serve para auditar: um
    # reembolso que não achou o passe não pode passar em silêncio.
    """CREATE TABLE IF NOT EXISTS billing_eventos (
        id TEXT PRIMARY KEY,
        uid TEXT,
        tipo TEXT,
        produto TEXT,
        txn TEXT,
        resultado TEXT,
        created_at INTEGER
    )""",
    "CREATE INDEX IF NOT EXISTS idx_billing_eventos_uid ON billing_eventos(uid)",
    "CREATE INDEX IF NOT EXISTS idx_grants_uid ON ai_grants(uid)",
    "CREATE INDEX IF NOT EXISTS idx_grants_trip ON ai_grants(trip_id)",
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
        # O passe pago não some junto com a viagem: volta a ficar solto com
        # quem comprou, e o que sobrou dele serve à próxima viagem.
        con.execute("UPDATE ai_grants SET trip_id=NULL WHERE trip_id=?", (trip_id,))
    else:
        con.execute("DELETE FROM trip_members WHERE trip_id=? AND uid=?", (trip_id, uid))
    con.execute("UPDATE users SET active_trip=NULL WHERE active_trip=?", (trip_id,))
    return True


def resumo_da_conta(con, uid, email=""):
    """O que a exclusão vai levar — para avisar ANTES, não depois."""
    proprias = con.execute("SELECT COUNT(*) FROM trips WHERE owner_uid=?", (uid,)).fetchone()[0]
    convidadas = con.execute(
        "SELECT COUNT(*) FROM trip_members m JOIN trips t ON t.id=m.trip_id "
        "WHERE m.uid=? AND t.owner_uid<>?", (uid, uid)).fetchone()[0]
    # Viagens suas em que há mais gente: essas somem para todos.
    compartilhadas = con.execute(
        "SELECT COUNT(DISTINCT t.id) FROM trips t JOIN trip_members m ON m.trip_id=t.id "
        "WHERE t.owner_uid=? AND m.uid<>?", (uid, uid)).fetchone()[0]
    return {"minhas": int(proprias), "convidado": int(convidadas), "compartilhadas": int(compartilhadas)}


def excluir_conta(con, uid, email=""):
    """Apaga tudo que é desta conta. Devolve o que foi apagado.

    As viagens que a pessoa CRIOU são apagadas de verdade, inclusive para quem
    ela convidou: o dado é dela, e manter a viagem viva sem dono deixaria
    órfãos que ninguém consegue administrar. Das viagens de OUTROS ela apenas
    sai — apagá-las seria destruir o dado alheio.

    Roda numa transação só: ou a conta some inteira, ou nada muda. Conta pela
    metade é pior do que conta inteira.
    """
    resumo = resumo_da_conta(con, uid, email)
    minhas = [r[0] for r in con.execute("SELECT id FROM trips WHERE owner_uid=?", (uid,)).fetchall()]
    for tid in minhas:
        con.execute("DELETE FROM trip_members WHERE trip_id=?", (tid,))
        con.execute("DELETE FROM trip_invites WHERE trip_id=?", (tid,))
        con.execute("DELETE FROM trips WHERE id=?", (tid,))
        # Passe que um convidado comprou para esta viagem volta para ele.
        con.execute("UPDATE ai_grants SET trip_id=NULL WHERE trip_id=?", (tid,))
    con.execute("DELETE FROM trip_members WHERE uid=?", (uid,))
    if email:
        con.execute("DELETE FROM trip_invites WHERE email=?", (norm_email(email),))
    con.execute("DELETE FROM trip_invites WHERE invited_by=?", (uid,))
    con.execute("DELETE FROM ai_usage WHERE uid=?", (uid,))
    con.execute("DELETE FROM ai_grants WHERE uid=?", (uid,))
    con.execute("DELETE FROM billing_eventos WHERE uid=?", (uid,))
    con.execute("DELETE FROM users WHERE uid=?", (uid,))
    return resumo


# ---------- uso da IA (cotas e custo) ----------

TIPOS_USO = ("chat", "gen", "tip")


def periodo_atual():
    """Cota é mensal: 'AAAA-MM' em UTC."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m")


def uso_do_usuario(con, uid, period=None):
    period = period or periodo_atual()
    row = con.execute(
        "SELECT chat, gen, tip, tokens_in, tokens_out FROM ai_usage WHERE uid=? AND period=?",
        (uid, period),
    ).fetchone()
    if not row:
        return {"chat": 0, "gen": 0, "tip": 0, "tokens_in": 0, "tokens_out": 0, "period": period}
    return {"chat": row[0], "gen": row[1], "tip": row[2], "tokens_in": row[3], "tokens_out": row[4], "period": period}


def registrar_uso(con, uid, tipo, tokens_in=0, tokens_out=0, period=None):
    """Conta uma chamada bem-sucedida. Só é chamado DEPOIS da IA responder."""
    if tipo not in TIPOS_USO:
        return
    period = period or periodo_atual()
    atual = uso_do_usuario(con, uid, period)
    novo = dict(atual)
    novo[tipo] = atual[tipo] + 1
    novo["tokens_in"] = atual["tokens_in"] + int(tokens_in or 0)
    novo["tokens_out"] = atual["tokens_out"] + int(tokens_out or 0)
    existe = con.execute("SELECT 1 FROM ai_usage WHERE uid=? AND period=?", (uid, period)).fetchone()
    if existe:
        con.execute(
            "UPDATE ai_usage SET chat=?, gen=?, tip=?, tokens_in=?, tokens_out=?, updated_at=? WHERE uid=? AND period=?",
            (novo["chat"], novo["gen"], novo["tip"], novo["tokens_in"], novo["tokens_out"], _now(), uid, period),
        )
    else:
        con.execute(
            "INSERT INTO ai_usage(uid, period, chat, gen, tip, tokens_in, tokens_out, updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (uid, period, novo["chat"], novo["gen"], novo["tip"], novo["tokens_in"], novo["tokens_out"], _now()),
        )


def uso_total(con, period=None):
    """Soma de todos os usuários no período — alimenta o fusível global."""
    period = period or periodo_atual()
    row = con.execute(
        "SELECT COALESCE(SUM(chat),0), COALESCE(SUM(gen),0), COALESCE(SUM(tip),0), "
        "COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0) FROM ai_usage WHERE period=?",
        (period,),
    ).fetchone()
    return {"chat": row[0], "gen": row[1], "tip": row[2], "tokens_in": row[3], "tokens_out": row[4],
            "chamadas": row[0] + row[1] + row[2], "period": period}


# ---------- saldo da IA (degustação, passe, recarga) ----------
# Diferente do `ai_usage`, que zera todo mês, este saldo NÃO renova: acabou,
# só volta comprando. É o que impede a conta gratuita de custar para sempre.

ORIGEM_DEGUSTACAO = "degustacao"
_COLUNAS_GRANT = ("id, uid, trip_id, origin, chat, gen, tip, "
                  "chat_used, gen_used, tip_used, txn_id, revoked, created_at")


def _grant(row):
    chaves = ("id", "uid", "trip_id", "origin", "chat", "gen", "tip",
              "chat_used", "gen_used", "tip_used", "txn_id", "revoked", "created_at")
    return dict(zip(chaves, row))


def resto(grant, tipo):
    """Quanto ainda dá para usar daquele tipo neste saldo."""
    return max(0, int(grant[tipo] or 0) - int(grant[tipo + "_used"] or 0))


def garantir_degustacao(con, uid, chat=0, gen=0, tip=0):
    """Cria a degustação da conta na primeira vez; depois disso não mexe mais.

    O id é derivado do uid: é a chave primária que garante UMA por conta,
    mesmo com dois pedidos chegando juntos.
    """
    con.execute(
        "INSERT INTO ai_grants(id, uid, trip_id, origin, chat, gen, tip, created_at) "
        "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        (f"deg:{uid}", uid, None, ORIGEM_DEGUSTACAO, int(chat), int(gen), int(tip), _now()),
    )


def degustacao(con, uid):
    row = con.execute(f"SELECT {_COLUNAS_GRANT} FROM ai_grants WHERE id=?", (f"deg:{uid}",)).fetchone()
    return _grant(row) if row else None


def conceder(con, uid, origin, chat=0, gen=0, tip=0, trip_id=None, txn_id=None, store_txn=None):
    """Credita um saldo pago. Devolve o id, ou None se a transação já tinha
    virado saldo antes — a mesma compra nunca credita duas vezes."""
    gid = uuid.uuid4().hex[:12]
    con.execute(
        "INSERT INTO ai_grants(id, uid, trip_id, origin, chat, gen, tip, txn_id, store_txn, created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(txn_id) DO NOTHING",
        (gid, uid, trip_id, origin, int(chat), int(gen), int(tip), txn_id, store_txn, _now()),
    )
    return gid if con.execute("SELECT 1 FROM ai_grants WHERE id=?", (gid,)).fetchone() else None




def creditos(con, uid):
    """Créditos pagos (Pacote VouAli, recargas) que a conta ainda pode gastar,
    do mais antigo ao mais novo. São da CONTA: valem em qualquer viagem."""
    if not uid:
        return []
    rows = con.execute(
        f"SELECT {_COLUNAS_GRANT} FROM ai_grants WHERE uid=? AND revoked=0 AND origin<>? "
        "ORDER BY created_at, id",
        (uid, ORIGEM_DEGUSTACAO),
    ).fetchall()
    return [_grant(r) for r in rows]


def ultimo_pacote(con, uids):
    """O pacote pago mais recente destas contas (valendo, esgotado ou
    estornado), ou None se nunca compraram."""
    uids = [u for u in uids if u]
    if not uids:
        return None
    marcas = ",".join("?" for _ in uids)
    row = con.execute(
        f"SELECT {_COLUNAS_GRANT} FROM ai_grants WHERE uid IN ({marcas}) AND origin<>? "
        "ORDER BY created_at DESC, id DESC LIMIT 1",
        (*uids, ORIGEM_DEGUSTACAO),
    ).fetchone()
    return _grant(row) if row else None


def dono_da_viagem(con, trip_id):
    row = con.execute("SELECT owner_uid FROM trips WHERE id=?", (trip_id,)).fetchone()
    return row[0] if row else None


def nome_de(con, uid):
    row = con.execute("SELECT name, email FROM users WHERE uid=?", (uid,)).fetchone()
    if not row:
        return ""
    return (row[0] or "").strip() or (row[1] or "").split("@")[0]




def consumir(con, grant_id, tipo):
    """Reserva uma unidade ANTES de chamar a IA. Devolve False se não havia.

    A condição mora no próprio UPDATE: com dois pedidos simultâneos e uma
    unidade só, o banco deixa passar um e recusa o outro.
    """
    if tipo not in TIPOS_USO:
        return False
    cur = con.execute(
        f"UPDATE ai_grants SET {tipo}_used = {tipo}_used + 1 "
        f"WHERE id=? AND revoked=0 AND {tipo}_used < {tipo}",
        (grant_id,),
    )
    return cur.rowcount > 0


def devolver(con, grant_id, tipo):
    """Estorna a reserva de um pedido que falhou do nosso lado."""
    if tipo not in TIPOS_USO:
        return
    con.execute(
        f"UPDATE ai_grants SET {tipo}_used = {tipo}_used - 1 WHERE id=? AND {tipo}_used > 0",
        (grant_id,),
    )


def revogar_ausentes(con, uid, validos):
    """Reembolso que não casou pelo id: anula os saldos PAGOS desta conta cuja
    transação a loja não lista mais. `validos` são os ids que ela ainda lista."""
    rows = con.execute(
        "SELECT id, txn_id, store_txn FROM ai_grants WHERE uid=? AND revoked=0 AND origin<>?",
        (uid, ORIGEM_DEGUSTACAO),
    ).fetchall()
    n = 0
    for gid, txn, store_txn in rows:
        if not txn and not store_txn:
            continue                      # sem transação conhecida: não dá para julgar
        if (txn and txn in validos) or (store_txn and store_txn in validos):
            continue
        n += con.execute("UPDATE ai_grants SET revoked=1 WHERE id=? AND revoked=0", (gid,)).rowcount
    return n




def registrar_evento(con, uid, tipo, produto, txn, resultado):
    con.execute(
        "INSERT INTO billing_eventos(id, uid, tipo, produto, txn, resultado, created_at) VALUES(?,?,?,?,?,?,?)",
        (uuid.uuid4().hex, uid, tipo, produto, txn, resultado, _now()),
    )


def cancelamentos_sem_passe(con):
    """Reembolsos avisados pela loja que não encontraram saldo para anular."""
    row = con.execute("SELECT COUNT(*) FROM billing_eventos WHERE resultado='sem_passe'").fetchone()
    return int(row[0] or 0)


def revogar(con, txn):
    """Reembolso: o saldo daquela transação deixa de valer."""
    if not txn:
        return 0
    cur = con.execute("UPDATE ai_grants SET revoked=1 WHERE revoked=0 AND (txn_id=? OR store_txn=?)", (txn, txn))
    return cur.rowcount


def dias_da_viagem(con, trip_id):
    """Tamanho da viagem pelo que está GRAVADO, nunca pelo que o app declara:
    o maior entre os dias do roteiro e o intervalo das datas."""
    row = con.execute("SELECT meta, state FROM trips WHERE id=?", (trip_id,)).fetchone()
    if not row:
        return 0
    meta = json.loads(row[0]) if isinstance(row[0], str) else (row[0] or {})
    state = json.loads(row[1]) if isinstance(row[1], str) else (row[1] or {})
    dias = len(state.get("days") or [])
    try:
        from datetime import date
        ini = date.fromisoformat(str(meta.get("startDate") or ""))
        fim = date.fromisoformat(str(meta.get("endDate") or ""))
        dias = max(dias, (fim - ini).days + 1)
    except ValueError:
        pass
    return dias


class Conflict(Exception):
    """Gravação baseada numa versão defasada (outro aparelho gravou antes)."""

    def __init__(self, version):
        super().__init__("version conflict")
        self.version = version
