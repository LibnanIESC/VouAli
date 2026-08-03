import json, os, sqlite3, mimetypes, time, uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse

mimetypes.add_type("application/manifest+json", ".webmanifest")

DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "trip.db"
TOKEN = os.getenv("TRIP_TOKEN", "")            # empty = no auth (dev)
STATIC = Path(__file__).parent / "static"

# Metadados da viagem de NY (usados na migração do dado antigo para o modelo
# multi-viagem). Espelham o que hoje está fixo no frontend, para nada mudar.
NY_BG = "https://images.unsplash.com/photo-1557780486-7347b5578a23?fm=jpg&q=70&w=1600&auto=format&fit=crop"
NY_META = {"id": "ny", "name": "New York", "dateLabel": "6 – 13 Outubro", "destination": "New York", "bg": NY_BG}
EMPTY_STATE = {"days": [], "budget": [], "prebuy": [], "notes": []}

# --- Ali (assistente com IA) ---
ALI_MODEL = os.getenv("ALI_MODEL", "claude-opus-5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
# effort só é aceito pelos modelos recentes; num modelo sem suporte (ex.: Haiku) daria 400
_ALI_EFFORT_OK = any(k in ALI_MODEL for k in ("opus-5", "opus-4-8", "opus-4-7", "opus-4-6", "sonnet-5", "sonnet-4-6", "fable-5", "mythos-5"))
try:
    import anthropic
    _ali_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
except Exception:
    _ali_client = None

# Rate limit simples (janela deslizante, em memória) para as rotas de IA —
# fusível contra loop/abuso que gastaria crédito de API. Configurável por env.
AI_RATE_MAX = int(os.getenv("ALI_RATE_MAX", "20"))       # nº de chamadas
AI_RATE_WINDOW = int(os.getenv("ALI_RATE_WINDOW", "60"))  # por janela de segundos
_ai_calls = deque()
def _rate_ok() -> bool:
    now = time.time()
    while _ai_calls and now - _ai_calls[0] > AI_RATE_WINDOW:
        _ai_calls.popleft()
    if len(_ai_calls) >= AI_RATE_MAX:
        return False
    _ai_calls.append(now)
    return True

ALI_SYSTEM = (
    "Você é o Ali, o assistente de viagens do app VouAli. "
    "Personalidade: amigável, experiente, confiável e curioso — fala como um amigo que já esteve lá. "
    "Seja sempre positivo, prestativo e proativo; quando a resposta for 'não', ofereça uma alternativa. "
    "Responda SEMPRE em português do Brasil, de forma concisa, prática e direta ao ponto (evite textos longos). "
    "Não invente reservas, preços exatos, horários ou paradas que não estejam nos dados; quando não souber, diga e sugira como descobrir. "
    "VOCÊ NÃO ALTERA O APP: você não edita, adiciona, remove, reordena, salva nem reserva nada — não tem esse poder, apenas conversa e orienta. "
    "NUNCA se ofereça para fazer mudanças (nada de 'quer que eu ajuste?', 'quer que eu troque a ordem?', 'quer que eu adicione/reserve pra você?'). "
    "Quando uma mudança fizer sentido, apenas SUGIRA e explique que quem faz é o próprio usuário, direto no app — tocando na parada para editar, ou no botão '+ Adicionar parada'. "
    "A viagem é a Nova York, de 6 a 13 de outubro de 2026. Use a DATA DE HOJE (informada no fim deste prompt) para situar a viagem no tempo. "
    "Se hoje ainda for antes de 06/10/2026, a viagem está no FUTURO: trate como planejamento (ex.: 'faltam X dias', 'quando você chegar') "
    "e NUNCA fale em 'hoje' ou 'amanhã' como se fossem dias do roteiro. Só chame um dia de 'hoje'/'amanhã' se a data de hoje realmente "
    "cair entre 06 e 13/10/2026. Ao se referir a um dia do roteiro, use sempre o rótulo e a data dele (ex.: 'o dia do Central Park', "
    "'a quinta, 8/10'), nunca 'amanhã'. "
    "FOCO EM VIAGEM: você só ajuda com assuntos de viagem — roteiro, transporte, comida, orçamento, clima, o que fazer, "
    "compras, cultura local e dicas —, com prioridade para esta viagem a Nova York. "
    "Se perguntarem algo fora desse tema (programação, política, contas de matemática, tarefas aleatórias, conselhos gerais etc.), "
    "NÃO responda o conteúdo pedido. Recuse com leveza e bom humor em NO MÁXIMO 1 ou 2 frases CURTAS: uma brincadeira rápida "
    "e um empurrãozinho de volta para a viagem. NÃO se alongue, não explique o que você faz, não liste opções e não ofereça "
    "cálculos nem tarefas. A pessoa tem que sair sorrindo, nunca sem graça nem entediada."
)

ALI_DICA_SYSTEM = (
    "Você é o Ali, guia de viagens experiente e simpático. "
    "Gere UMA dica curta e prática (1 a 2 frases, no máximo ~220 caracteres) para a parada indicada, na viagem a Nova York. "
    "Foque num truque útil, algo a evitar, o melhor horário, ou o que priorizar no local. "
    "Escreva em português do Brasil, com tom leve de amigo que já esteve lá. "
    "Responda APENAS com o texto da dica — sem introdução, sem aspas, sem prefixos como 'Dica:'. "
    "Não invente preços ou horários exatos; se não souber um detalhe, seja geral."
)

def _trip_context(trip: dict) -> str:
    parts = []
    days = trip.get("days") or []
    if days:
        parts.append("ROTEIRO:")
        for d in days:
            parts.append(f"- {d.get('label','')} {d.get('date','')} — {d.get('title','')}:")
            for s in (d.get("stops") or []):
                line = f"   • {s.get('t','')} {s.get('n','')}".rstrip()
                ins = (s.get("insight") or "").strip()
                if ins:
                    line += f" — dica: {ins}"
                parts.append(line)
    budget = trip.get("budget") or []
    if budget:
        b = "; ".join(
            f"{x.get('k','')} US${x.get('v',0)}" + (f" (gasto US${x.get('spent',0)})" if x.get('spent') else "")
            for x in budget
        )
        parts.append("ORÇAMENTO (teto US$3000): " + b)
    prebuy = trip.get("prebuy") or []
    pend = [str(p.get("text", "")).strip() for p in prebuy if not p.get("done") and str(p.get("text", "")).strip()]
    if pend:
        parts.append("COMPRAR ANTES (ainda pendente): " + "; ".join(pend))
    notes = trip.get("notes") or []
    if notes:
        parts.append("NOTAS: " + " | ".join(f"{n.get('title','')}: {n.get('body','')}" for n in notes))
    return "\n".join(parts)

# ---------- Camada de armazenamento (kv: chave -> {valor json, versão}) ----------
# 'trips'      -> índice {active, list:[metas...]}
# 'trip:<id>'  -> estado da viagem {days, budget, prebuy, notes}
# 'trip'       -> dado ANTIGO (viagem única). Mantido como backup, nunca apagado.
def _read(con, key):
    row = con.execute("SELECT v, ver FROM kv WHERE k=?", (key,)).fetchone()
    if not row:
        return None, 0
    return json.loads(row[0]), row[1]

def _write(con, key, value, ver):
    con.execute(
        "INSERT INTO kv(k,v,ver) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ver=excluded.ver",
        (key, json.dumps(value, ensure_ascii=False), ver),
    )

def _ensure_migrated(con):
    # já migrado?
    if con.execute("SELECT 1 FROM kv WHERE k='trips'").fetchone():
        return
    old = con.execute("SELECT v, ver FROM kv WHERE k='trip'").fetchone()
    if old:
        # a viagem única antiga vira a viagem 'ny' (preserva o dado E a versão);
        # 'trip' permanece intacto como backup
        _write(con, "trip:ny", json.loads(old[0]), old[1])
        trips = {"active": "ny", "list": [dict(NY_META)]}
    else:
        trips = {"active": None, "list": []}
    _write(con, "trips", trips, 0)
    con.commit()

def db():
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, ver INTEGER DEFAULT 0)")
    # migra bancos antigos criados sem a coluna de versão
    cols = [r[1] for r in con.execute("PRAGMA table_info(kv)").fetchall()]
    if "ver" not in cols:
        con.execute("ALTER TABLE kv ADD COLUMN ver INTEGER DEFAULT 0")
    _ensure_migrated(con)
    return con

def _active_key(con):
    trips, _ = _read(con, "trips")
    active = (trips or {}).get("active")
    return f"trip:{active}" if active else None

app = FastAPI(title="VouAli")

def check(request: Request):
    if TOKEN and request.headers.get("X-Trip-Token") != TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

def _put_state_key(con, key, body, base):
    """Grava um estado com concorrência otimista. Retorna a nova versão."""
    _, current = _read(con, key)
    if base is not None and base != "" and int(base) != current:
        raise HTTPException(status_code=409, detail={"version": current})
    new_ver = current + 1
    _write(con, key, json.loads(body), new_ver)
    con.commit()
    return new_ver

# --- Retrocompat: /api/state opera na viagem ATIVA (era a viagem única) ---
@app.get("/api/state")
def get_state(request: Request):
    check(request)
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); return {"state": None, "version": 0}
    data, ver = _read(con, key); con.close()
    return {"state": data, "version": ver}

@app.put("/api/state")
async def put_state(request: Request):
    check(request)
    body = await request.body()
    try:
        json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); raise HTTPException(status_code=409, detail="no active trip")
    try:
        new_ver = _put_state_key(con, key, body, request.headers.get("X-Base-Version"))
    finally:
        con.close()
    return {"ok": True, "version": new_ver}

# --- Multi-viagem ---
@app.get("/api/trips")
def list_trips(request: Request):
    check(request)
    con = db(); trips, ver = _read(con, "trips"); con.close()
    return {"trips": trips or {"active": None, "list": []}, "version": ver}

@app.post("/api/trips")
async def create_trip(request: Request):
    check(request)
    body = await request.json()
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    tid = uuid.uuid4().hex[:8]
    meta = {
        "id": tid,
        "name": (body.get("name") or "Nova viagem").strip() or "Nova viagem",
        "dateLabel": (body.get("dateLabel") or "").strip(),
        "destination": (body.get("destination") or "").strip(),
        "bg": (body.get("bg") or "").strip(),
    }
    data = body.get("data") if isinstance(body.get("data"), dict) else None
    _write(con, f"trip:{tid}", data or dict(EMPTY_STATE), 0)
    trips["list"].append(meta)
    if body.get("makeActive", True):
        trips["active"] = tid
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"meta": meta, "trips": trips}

@app.put("/api/active")
async def set_active(request: Request):
    check(request)
    body = await request.json()
    tid = body.get("id")
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    if not any(m.get("id") == tid for m in trips["list"]):
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    trips["active"] = tid
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

@app.get("/api/trips/{tid}")
def get_trip(request: Request, tid: str):
    check(request)
    con = db(); data, ver = _read(con, f"trip:{tid}"); con.close()
    if data is None:
        raise HTTPException(status_code=404, detail="trip not found")
    return {"state": data, "version": ver}

@app.put("/api/trips/{tid}")
async def put_trip(request: Request, tid: str):
    check(request)
    body = await request.body()
    try:
        json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    con = db()
    if not con.execute("SELECT 1 FROM kv WHERE k=?", (f"trip:{tid}",)).fetchone():
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    try:
        new_ver = _put_state_key(con, f"trip:{tid}", body, request.headers.get("X-Base-Version"))
    finally:
        con.close()
    return {"ok": True, "version": new_ver}

@app.put("/api/trips/{tid}/meta")
async def put_trip_meta(request: Request, tid: str):
    check(request)
    body = await request.json()
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    meta = next((m for m in trips["list"] if m.get("id") == tid), None)
    if meta is None:
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    for k in ("name", "dateLabel", "destination", "bg"):
        if k in body:
            meta[k] = str(body[k]).strip()
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

@app.delete("/api/trips/{tid}")
def delete_trip(request: Request, tid: str):
    check(request)
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    trips["list"] = [m for m in trips["list"] if m.get("id") != tid]
    con.execute("DELETE FROM kv WHERE k=?", (f"trip:{tid}",))
    if trips["active"] == tid:
        trips["active"] = trips["list"][0]["id"] if trips["list"] else None
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

@app.post("/api/ali")
async def ali_chat(request: Request):
    check(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok():
        return {"error": "rate_limited"}
    body = await request.json()
    msgs = body.get("messages") or []
    trip = body.get("trip") or {}
    # normaliza, mantém só turnos válidos, limita o histórico e começa por 'user'
    conv = [
        {"role": m.get("role"), "content": str(m.get("content", ""))}
        for m in msgs
        if m.get("role") in ("user", "assistant") and str(m.get("content", "")).strip()
    ][-24:]
    while conv and conv[0]["role"] != "user":
        conv.pop(0)
    if not conv:
        return {"error": "empty"}
    today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    system = ALI_SYSTEM + f"\n\nDATA DE HOJE: {today}.\n\nDados atuais da viagem:\n" + _trip_context(trip)
    kwargs = {"model": ALI_MODEL, "max_tokens": 1500, "system": system, "messages": conv}
    if _ALI_EFFORT_OK:
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        if getattr(resp, "stop_reason", None) == "refusal":
            return {"reply": "Sobre isso eu prefiro não opinar — mas posso ajudar com qualquer coisa do roteiro, orçamento ou dicas da viagem. 🙂"}
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        return {"reply": text or "…"}
    except Exception as e:
        return {"error": "api_error", "detail": str(e)[:200]}

@app.post("/api/ali/dica")
async def ali_dica(request: Request):
    check(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok():
        return {"error": "rate_limited"}
    body = await request.json()
    stop = body.get("stop") or {}
    trip = body.get("trip") or {}
    name = str(stop.get("n", "")).strip()
    if not name:
        return {"error": "empty"}
    prompt = f"Parada: {name}"
    for k, label in (("t", "Horário"), ("d", "Resumo"), ("getting", "Como chegar"), ("todo", "O que fazer")):
        v = str(stop.get(k, "")).strip()
        if v:
            prompt += f"\n{label}: {v}"
    prompt += "\n\nContexto geral da viagem:\n" + _trip_context(trip) + "\n\nGere a dica do Ali para essa parada."
    kwargs = {"model": ALI_MODEL, "max_tokens": 600, "system": ALI_DICA_SYSTEM, "messages": [{"role": "user", "content": prompt}]}
    if _ALI_EFFORT_OK:
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        if getattr(resp, "stop_reason", None) == "refusal":
            return {"error": "refusal"}
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip().strip('"').strip()
        return {"dica": text}
    except Exception as e:
        return {"error": "api_error", "detail": str(e)[:200]}

# --- SPA + static assets (defined last so /api routes win) ---
@app.get("/{full_path:path}")
def spa(full_path: str):
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate)
    return FileResponse(STATIC / "index.html")
