import json, os, sqlite3, mimetypes
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse

mimetypes.add_type("application/manifest+json", ".webmanifest")

DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "trip.db"
TOKEN = os.getenv("TRIP_TOKEN", "")            # empty = no auth (dev)
STATIC = Path(__file__).parent / "static"

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

ALI_SYSTEM = (
    "Você é o Ali, o assistente de viagens do app VouAli. "
    "Personalidade: amigável, experiente, confiável e curioso — fala como um amigo que já esteve lá. "
    "Seja sempre positivo, prestativo e proativo; quando a resposta for 'não', ofereça uma alternativa. "
    "Responda SEMPRE em português do Brasil, de forma concisa, prática e direta ao ponto (evite textos longos). "
    "Não invente reservas, preços exatos ou horários que não estejam nos dados; quando não souber, diga e sugira como descobrir. "
    "O usuário está numa viagem a Nova York (6 a 13 de outubro). "
    "FOCO EM VIAGEM: você só ajuda com assuntos de viagem — roteiro, transporte, comida, orçamento, clima, o que fazer, "
    "compras, cultura local e dicas —, com prioridade para esta viagem a Nova York. "
    "Se perguntarem algo fora desse tema (programação, política, contas de matemática, tarefas aleatórias, conselhos gerais etc.), "
    "NÃO responda o conteúdo pedido. Recuse com leveza e bom humor em NO MÁXIMO 1 ou 2 frases CURTAS: uma brincadeira rápida "
    "e um empurrãozinho de volta para a viagem. NÃO se alongue, não explique o que você faz, não liste opções e não ofereça "
    "cálculos nem tarefas. A pessoa tem que sair sorrindo, nunca sem graça nem entediada."
)

def _trip_context(trip: dict) -> str:
    parts = []
    days = trip.get("days") or []
    if days:
        parts.append("ROTEIRO:")
        for d in days:
            stops = "; ".join(f"{s.get('t','')} {s.get('n','')}".strip() for s in (d.get("stops") or []))
            parts.append(f"- {d.get('label','')} {d.get('date','')} — {d.get('title','')}: {stops}")
    budget = trip.get("budget") or []
    if budget:
        b = "; ".join(
            f"{x.get('k','')} US${x.get('v',0)}" + (f" (gasto US${x.get('spent',0)})" if x.get('spent') else "")
            for x in budget
        )
        parts.append("ORÇAMENTO (teto US$3000): " + b)
    notes = trip.get("notes") or []
    if notes:
        parts.append("NOTAS: " + " | ".join(f"{n.get('title','')}: {n.get('body','')}" for n in notes))
    return "\n".join(parts)

def db():
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, ver INTEGER DEFAULT 0)")
    # migra bancos antigos criados sem a coluna de versão
    cols = [r[1] for r in con.execute("PRAGMA table_info(kv)").fetchall()]
    if "ver" not in cols:
        con.execute("ALTER TABLE kv ADD COLUMN ver INTEGER DEFAULT 0")
    return con

app = FastAPI(title="VouAli")

def check(request: Request):
    if TOKEN and request.headers.get("X-Trip-Token") != TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/api/state")
def get_state(request: Request):
    check(request)
    con = db(); row = con.execute("SELECT v, ver FROM kv WHERE k='trip'").fetchone(); con.close()
    return {"state": json.loads(row[0]) if row else None, "version": row[1] if row else 0}

@app.put("/api/state")
async def put_state(request: Request):
    check(request)
    body = await request.body()
    try:
        json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    con = db()
    row = con.execute("SELECT ver FROM kv WHERE k='trip'").fetchone()
    current = row[0] if row else 0
    # concorrência otimista: se o cliente informou a versão em que baseou a
    # edição e ela ficou defasada, recusa em vez de sobrescrever o outro aparelho
    base = request.headers.get("X-Base-Version")
    if base is not None and base != "" and int(base) != current:
        con.close()
        raise HTTPException(status_code=409, detail={"version": current})
    new_ver = current + 1
    con.execute(
        "INSERT INTO kv(k,v,ver) VALUES('trip',?,?) "
        "ON CONFLICT(k) DO UPDATE SET v=excluded.v, ver=excluded.ver",
        (body.decode("utf-8"), new_ver),
    )
    con.commit(); con.close()
    return {"ok": True, "version": new_ver}

@app.post("/api/ali")
async def ali_chat(request: Request):
    check(request)
    if not _ali_client:
        return {"error": "not_configured"}
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
    system = ALI_SYSTEM + "\n\nDados atuais da viagem:\n" + _trip_context(trip)
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

# --- SPA + static assets (defined last so /api routes win) ---
@app.get("/{full_path:path}")
def spa(full_path: str):
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate)
    return FileResponse(STATIC / "index.html")
