import json, os, sqlite3, mimetypes, time, uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse

import auth
import store

mimetypes.add_type("application/manifest+json", ".webmanifest")

DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "trip.db"
TOKEN = os.getenv("TRIP_TOKEN", "")            # empty = no auth (dev)
STATIC = Path(__file__).parent / "static"

# Metadados da viagem de NY (usados na migração do dado antigo para o modelo
# multi-viagem). Espelham o que hoje está fixo no frontend, para nada mudar.
NY_BG = "https://images.unsplash.com/photo-1557780486-7347b5578a23?fm=jpg&q=70&w=1600&auto=format&fit=crop"
NY_META = {"id": "ny", "name": "New York", "dateLabel": "6 – 13 Outubro", "destination": "New York", "bg": NY_BG,
           "currency": "US$", "budget": 3000, "startDate": "2026-10-06", "endDate": "2026-10-13", "interests": "",
           "adults": 2, "children": 0, "groupTypes": "Casal"}
# Campos de metadados aceitos ao criar/editar uma viagem.
META_FIELDS = ("name", "dateLabel", "destination", "bg", "currency", "startDate", "endDate", "interests", "groupTypes")
META_NUMS = {"budget": 0, "adults": 1, "children": 0}   # campo -> padrão
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
    "Responda SEMPRE em português do Brasil. "
    "SEJA BREVE — esta é uma regra forte: por padrão responda em ATÉ 3 FRASES CURTAS. "
    "Quando precisar listar, use no máximo 4 tópicos de uma linha cada (com '•'), sem parágrafos antes ou depois. "
    "Vá direto ao ponto: nada de introdução, de repetir a pergunta, de resumir o que você vai dizer, nem de fechar com perguntas de cortesia. "
    "Se o assunto for grande, entregue só o essencial e ofereça detalhar em uma frase curta. "
    "Não invente reservas, preços exatos, horários ou paradas que não estejam nos dados; quando não souber, diga e sugira como descobrir. "
    "VOCÊ NÃO ALTERA O APP: você não edita, adiciona, remove, reordena, salva nem reserva nada — não tem esse poder, apenas conversa e orienta. "
    "NUNCA se ofereça para fazer mudanças (nada de 'quer que eu ajuste?', 'quer que eu troque a ordem?', 'quer que eu adicione/reserve pra você?'). "
    "Quando uma mudança fizer sentido, apenas SUGIRA e explique que quem faz é o próprio usuário, direto no app — tocando na parada para editar, ou no botão '+ Adicionar parada'. "
    "A viagem é a Nova York, de 6 a 13 de outubro de 2026. Use a DATA DE HOJE (informada no fim deste prompt) para situar a viagem no tempo. "
    "Se hoje ainda for antes de 06/10/2026, a viagem está no FUTURO: trate como planejamento (ex.: 'faltam X dias', 'quando você chegar') "
    "e NUNCA fale em 'hoje' ou 'amanhã' como se fossem dias do roteiro. Só chame um dia de 'hoje'/'amanhã' se a data de hoje realmente "
    "cair entre 06 e 13/10/2026. Ao se referir a um dia do roteiro, use sempre o rótulo e a data dele (ex.: 'o dia do Central Park', "
    "'a quinta, 8/10'), nunca 'amanhã'. "
    "QUEM VIAJA: adapte tudo ao número de viajantes e ao perfil do grupo informados no contexto. "
    "Ao citar valores, deixe SEMPRE claro se é por pessoa ou o total do grupo. "
    "Casal: experiências a dois, jantares e pores do sol bons pra dois, evitar filas longas. "
    "Família: ritmo mais calmo com pausas, atrações que funcionam com crianças, ingresso infantil, restaurantes acolhedores, evitar programas que varem a noite. "
    "Amigos: pratos pra compartilhar, vida noturna, atividades em grupo, lembrar que táxi/transporte fica barato dividido. "
    "Sozinho(a): segurança, passeios em grupo pra conhecer gente, balcões e mesas pra um, liberdade pra mudar o plano. "
    "Se houver mais de um perfil, combine os dois com bom senso. "
    "FOCO EM VIAGEM: você só ajuda com assuntos de viagem — roteiro, transporte, comida, orçamento, clima, o que fazer, "
    "compras, cultura local e dicas —, com prioridade para esta viagem a Nova York. "
    "Se perguntarem algo fora desse tema (programação, política, contas de matemática, tarefas aleatórias, conselhos gerais etc.), "
    "NÃO responda o conteúdo pedido. Recuse com leveza e bom humor em NO MÁXIMO 1 ou 2 frases CURTAS: uma brincadeira rápida "
    "e um empurrãozinho de volta para a viagem. NÃO se alongue, não explique o que você faz, não liste opções e não ofereça "
    "cálculos nem tarefas. A pessoa tem que sair sorrindo, nunca sem graça nem entediada."
)

ALI_GERAR_SYSTEM = (
    "Você é o Ali, guia de viagens experiente. Monte um roteiro de viagem completo e realista. "
    "Responda APENAS com um objeto JSON válido (sem markdown, sem cercas ```, sem comentários, sem texto fora do JSON), nesta forma EXATA:\n"
    '{"days":[{"label":"<sigla do dia da semana, ex: SEG>","date":"<ex: 14 SET>","title":"<tema do dia>",'
    '"sub":"<subtítulo curto>","stops":[{"t":"<horário, ex: 10h>","n":"<nome do lugar>","d":"<resumo de 1 linha>",'
    '"getting":"<como chegar>","todo":"<o que fazer>","insight":"<dica do Ali, específica e útil>"}]}],'
    '"budget":[{"k":"<descrição>","v":<número na moeda informada>,"tag":"<ingressos|comida|transporte|hospedagem|outros>"}],'
    '"prebuy":["<item para reservar/comprar antes>"],'
    '"notes":[{"title":"<título curto com emoji>","body":"<texto útil>"}]}\n'
    "Regras: gere EXATAMENTE o número de dias pedido; 3 a 5 paradas por dia, em ordem cronológica; "
    "valores de orçamento realistas para o destino e o estilo; dicas específicas (não genéricas); tudo em português do Brasil. "
    "Adapte o roteiro ao número de viajantes e ao perfil do grupo (casal, família com crianças, amigos ou sozinho): "
    "ritmo, tipo de atração, restaurantes e vida noturna mudam conforme isso. "
    "Os valores do orçamento devem ser o TOTAL DO GRUPO (não por pessoa), e a descrição deve deixar isso claro quando ajudar. "
    "Não inclua campos de id nem 'done' — o app cuida disso."
)

ALI_DICA_SYSTEM = (
    "Você é o Ali, guia de viagens experiente e simpático. "
    "Gere UMA dica curta e prática (1 a 2 frases, no máximo ~220 caracteres) para a parada indicada, na viagem a Nova York. "
    "Foque num truque útil, algo a evitar, o melhor horário, ou o que priorizar no local. "
    "Escreva em português do Brasil, com tom leve de amigo que já esteve lá. "
    "Responda APENAS com o texto da dica — sem introdução, sem aspas, sem prefixos como 'Dica:'. "
    "Não invente preços ou horários exatos; se não souber um detalhe, seja geral."
)

# Paleta de cores de dia (todas escuras o bastante para texto branco na bolinha).
GEN_PALETTE = ["#365D7A", "#ee352e", "#0039a6", "#b933ad", "#00933c", "#ff6319", "#996633", "#6d6e71", "#F28C28", "#7A5A3A", "#2f6f62", "#8a3b8f"]

def _uid():
    return uuid.uuid4().hex[:7]

def _extract_json(text: str) -> str:
    """Isola o objeto JSON de uma resposta (remove cercas markdown e texto ao redor)."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t[:4].lower() == "json":
            t = t[4:]
    i, j = t.find("{"), t.rfind("}")
    return t[i:j + 1] if (i >= 0 and j > i) else t

def _normalize_state(raw: dict) -> dict:
    """Converte o JSON gerado pelo modelo no schema exato do app (ids, done, cores)."""
    days = []
    for i, d in enumerate(raw.get("days") or []):
        stops = []
        for s in (d.get("stops") or []):
            if not isinstance(s, dict):
                continue
            stops.append({
                "id": _uid(),
                "t": str(s.get("t", "")).strip(),
                "n": str(s.get("n", "")).strip(),
                "d": str(s.get("d", "")).strip(),
                "getting": str(s.get("getting", "")).strip(),
                "todo": str(s.get("todo", "")).strip(),
                "insight": str(s.get("insight", "")).strip(),
                "link": str(s.get("link", "")).strip(),
                "done": False,
            })
        days.append({
            "id": _uid(),
            "label": (str(d.get("label", "")).strip()[:4] or f"D{i + 1}"),
            "date": str(d.get("date", "")).strip(),
            "title": (str(d.get("title", "")).strip() or f"Dia {i + 1}"),
            "sub": str(d.get("sub", "")).strip(),
            "color": GEN_PALETTE[i % len(GEN_PALETTE)],
            "line": str(i + 1),
            "stops": stops,
        })
    budget = []
    for b in (raw.get("budget") or []):
        if not isinstance(b, dict):
            continue
        try:
            v = float(b.get("v", 0) or 0)
        except (TypeError, ValueError):
            v = 0
        budget.append({"id": _uid(), "k": str(b.get("k", "")).strip(), "v": v, "spent": 0, "tag": (str(b.get("tag", "outros")).strip() or "outros")})
    prebuy = []
    for p in (raw.get("prebuy") or []):
        txt = p if isinstance(p, str) else (p.get("text", "") if isinstance(p, dict) else "")
        txt = str(txt).strip()
        if txt:
            prebuy.append({"id": _uid(), "text": txt, "done": False})
    notes = []
    for n in (raw.get("notes") or []):
        if not isinstance(n, dict):
            continue
        notes.append({"id": _uid(), "title": str(n.get("title", "")).strip(), "body": str(n.get("body", "")).strip()})
    return {"days": days, "budget": budget, "prebuy": prebuy, "notes": notes}

def _travelers_line(trip: dict) -> str:
    """Linha 'VIAJANTES' do contexto: composição + tipo de grupo."""
    try:
        ad = int(float(trip.get("adults") or 0))
        ch = int(float(trip.get("children") or 0))
    except (TypeError, ValueError):
        ad, ch = 0, 0
    if ad + ch <= 0:
        return ""
    quem = f"{ad} adulto{'s' if ad != 1 else ''}" if ad else ""
    if ch:
        quem += (" e " if quem else "") + f"{ch} criança{'s' if ch != 1 else ''}"
    grupo = str(trip.get("groupTypes") or "").strip()
    return f"VIAJANTES: {quem} (total {ad + ch})" + (f" — perfil: {grupo}" if grupo else "")

def _trip_context(trip: dict) -> str:
    parts = []
    tl = _travelers_line(trip)
    if tl:
        parts.append(tl)
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
    cur = str(trip.get("currency") or "US$").strip() or "US$"
    budget = trip.get("budget") or []
    if budget:
        b = "; ".join(
            f"{x.get('k','')} {cur}{x.get('v',0)}" + (f" (gasto {cur}{x.get('spent',0)})" if x.get('spent') else "")
            for x in budget
        )
        try:
            teto = float(trip.get("budgetTotal") or 0)
        except (TypeError, ValueError):
            teto = 0
        head = f"ORÇAMENTO (teto {cur}{teto:g}): " if teto > 0 else "ORÇAMENTO (sem teto definido): "
        parts.append(head + b)
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
    """Modo legado (produção): senha compartilhada."""
    if auth.AUTH_MODE != "firebase" and TOKEN and request.headers.get("X-Trip-Token") != TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

def me(request: Request):
    """No modo firebase, exige usuário autenticado e devolve {uid,email,name}.
    No modo legado devolve None (e apenas confere a senha compartilhada)."""
    if auth.AUTH_MODE != "firebase":
        check(request)
        return None
    usuario = auth.current_user(request)
    if not usuario:
        raise HTTPException(status_code=401, detail="unauthorized")
    return usuario

def user_con(usuario):
    """Conexão pronta com o usuário já registrado (primeiro login cria a conta)
    e com eventuais convites pendentes já transformados em acesso."""
    store.ensure_schema()
    con = store.connect()
    store.upsert_user(con, usuario["uid"], usuario["email"], usuario["name"])
    store.claim_invites(con, usuario["uid"], usuario["email"])
    con.commit()
    return con

def _put_state_key(con, key, body, base):
    """Grava um estado com concorrência otimista. Retorna a nova versão."""
    _, current = _read(con, key)
    if base is not None and base != "" and int(base) != current:
        raise HTTPException(status_code=409, detail={"version": current})
    new_ver = current + 1
    _write(con, key, json.loads(body), new_ver)
    con.commit()
    return new_ver

# --- /api/state opera na viagem ATIVA (do usuário, no modo firebase) ---
@app.get("/api/state")
def get_state(request: Request):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            viagens = store.list_trips(con, usuario["uid"])
            ativa = viagens["active"]
            if not ativa:
                return {"state": None, "version": 0}
            got = store.get_trip(con, ativa, usuario["uid"])
            return {"state": got[0], "version": got[1]} if got else {"state": None, "version": 0}
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); return {"state": None, "version": 0}
    data, ver = _read(con, key); con.close()
    return {"state": data, "version": ver}

@app.put("/api/state")
async def put_state(request: Request):
    usuario = me(request)
    body = await request.body()
    try:
        novo = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    base = request.headers.get("X-Base-Version")
    if usuario:
        with user_con(usuario) as con:
            ativa = store.list_trips(con, usuario["uid"])["active"]
            if not ativa:
                raise HTTPException(status_code=409, detail="no active trip")
            try:
                nova = store.put_trip(con, ativa, usuario["uid"], novo, base)
            except store.Conflict as c:
                raise HTTPException(status_code=409, detail={"version": c.version})
            return {"ok": True, "version": nova}
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); raise HTTPException(status_code=409, detail="no active trip")
    try:
        new_ver = _put_state_key(con, key, body, base)
    finally:
        con.close()
    return {"ok": True, "version": new_ver}

# --- Multi-viagem ---
def _with_meta_defaults(trips):
    """Preenche campos novos em viagens criadas antes deles existirem."""
    for m in (trips or {}).get("list", []):
        for k in META_FIELDS:
            m.setdefault(k, "")
        for k, default in META_NUMS.items():
            m.setdefault(k, default)
        if not m.get("currency"):
            m["currency"] = "US$"
    return trips

def _build_meta(body):
    """Normaliza os metadados enviados pelo app (texto e números)."""
    meta = {}
    for k in META_FIELDS:
        meta[k] = str(body.get(k) or "").strip()
    meta["name"] = meta["name"] or "Nova viagem"
    meta["currency"] = meta["currency"] or "US$"
    for k, default in META_NUMS.items():
        try:
            meta[k] = float(body[k]) if body.get(k) not in (None, "") else default
        except (TypeError, ValueError, KeyError):
            meta[k] = default
    return meta

@app.get("/api/trips")
def list_trips(request: Request):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"])), "version": 0}
    con = db(); trips, ver = _read(con, "trips"); con.close()
    return {"trips": _with_meta_defaults(trips or {"active": None, "list": []}), "version": ver}

@app.post("/api/trips")
async def create_trip(request: Request):
    usuario = me(request)
    body = await request.json()
    if usuario:
        with user_con(usuario) as con:
            meta = _build_meta(body)
            dados = body.get("data") if isinstance(body.get("data"), dict) else None
            tid = store.create_trip(con, usuario["uid"], meta, dados)
            meta["id"] = tid
            con.commit()
            return {"meta": meta, "trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    tid = uuid.uuid4().hex[:8]
    meta = {"id": tid}
    for k in META_FIELDS:
        meta[k] = str(body.get(k) or "").strip()
    meta["name"] = meta["name"] or "Nova viagem"
    meta["currency"] = meta["currency"] or "US$"
    for k, default in META_NUMS.items():
        try:
            meta[k] = float(body[k]) if body.get(k) not in (None, "") else default
        except (TypeError, ValueError, KeyError):
            meta[k] = default
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
    usuario = me(request)
    body = await request.json()
    tid = body.get("id")
    if usuario:
        with user_con(usuario) as con:
            if not store.set_active(con, usuario["uid"], tid):
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
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
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            got = store.get_trip(con, tid, usuario["uid"])
            if not got:      # inexistente OU de outro usuário: mesma resposta
                raise HTTPException(status_code=404, detail="trip not found")
            return {"state": got[0], "version": got[1]}
    con = db(); data, ver = _read(con, f"trip:{tid}"); con.close()
    if data is None:
        raise HTTPException(status_code=404, detail="trip not found")
    return {"state": data, "version": ver}

@app.put("/api/trips/{tid}")
async def put_trip(request: Request, tid: str):
    usuario = me(request)
    body = await request.body()
    try:
        novo = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    if usuario:
        with user_con(usuario) as con:
            try:
                nova = store.put_trip(con, tid, usuario["uid"], novo, request.headers.get("X-Base-Version"))
            except store.Conflict as c:
                raise HTTPException(status_code=409, detail={"version": c.version})
            if nova is None:
                raise HTTPException(status_code=404, detail="trip not found")
            return {"ok": True, "version": nova}
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
    usuario = me(request)
    body = await request.json()
    if usuario:
        patch = {}
        for k in META_FIELDS:
            if k in body:
                patch[k] = str(body[k] or "").strip()
        for k, default in META_NUMS.items():
            if k in body:
                try:
                    patch[k] = float(body[k]) if body[k] not in (None, "") else default
                except (TypeError, ValueError):
                    patch[k] = default
        with user_con(usuario) as con:
            if store.update_meta(con, tid, usuario["uid"], patch) is None:
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    meta = next((m for m in trips["list"] if m.get("id") == tid), None)
    if meta is None:
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    for k in META_FIELDS:
        if k in body:
            meta[k] = str(body[k] or "").strip()
    for k, default in META_NUMS.items():
        if k in body:
            try:
                meta[k] = float(body[k]) if body[k] not in (None, "") else default
            except (TypeError, ValueError):
                meta[k] = default
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

# --- Compartilhamento de viagem ---
@app.get("/api/trips/{tid}/members")
def list_members(request: Request, tid: str):
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    with user_con(usuario) as con:
        papel = store.role_of(con, tid, usuario["uid"])
        if not papel:
            raise HTTPException(status_code=404, detail="trip not found")
        return {"role": papel, "members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.post("/api/trips/{tid}/members")
async def add_member_route(request: Request, tid: str):
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    body = await request.json()
    email = store.norm_email(body.get("email"))
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="invalid email")
    with user_con(usuario) as con:
        if store.role_of(con, tid, usuario["uid"]) != "owner":
            raise HTTPException(status_code=403, detail="only the owner can invite")
        if email == store.norm_email(usuario["email"]):
            raise HTTPException(status_code=400, detail="already a member")
        situacao = store.invite(con, tid, email, "editor", usuario["uid"])
        con.commit()
        return {"status": situacao, "members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.delete("/api/trips/{tid}/members/{quem}")
def remove_member_route(request: Request, tid: str, quem: str):
    """`quem` pode ser o uid de um membro ou o e-mail de um convite pendente."""
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    with user_con(usuario) as con:
        if store.role_of(con, tid, usuario["uid"]) != "owner":
            raise HTTPException(status_code=403, detail="only the owner can remove")
        if "@" in quem:
            store.cancel_invite(con, tid, quem)
        elif not store.remove_member(con, tid, quem):
            raise HTTPException(status_code=400, detail="cannot remove the owner")
        con.commit()
        return {"members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.delete("/api/trips/{tid}")
def delete_trip(request: Request, tid: str):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            if not store.delete_trip(con, tid, usuario["uid"]):
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
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
    me(request)
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
    kwargs = {"model": ALI_MODEL, "max_tokens": 700, "system": system, "messages": conv}
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
    me(request)
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

@app.post("/api/ali/gerar")
async def ali_gerar(request: Request):
    me(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok():
        return {"error": "rate_limited"}
    body = await request.json()
    destination = str(body.get("destination", "")).strip()
    try:
        days = int(body.get("days") or 0)
    except (TypeError, ValueError):
        days = 0
    if not destination or days < 1:
        return {"error": "invalid"}
    days = min(days, 12)
    style = str(body.get("style", "")).strip()
    date_label = str(body.get("dateLabel", "")).strip()
    budget = body.get("budget")
    cur = str(body.get("currency") or "US$").strip() or "US$"
    prompt = f"Destino: {destination}\nNúmero de dias: {days}\nMoeda: {cur} (use SEMPRE esta moeda nos valores)"
    tl = _travelers_line(body)
    if tl:
        prompt += "\n" + tl
    if date_label:
        prompt += f"\nPeríodo: {date_label}"
    if budget:
        prompt += f"\nOrçamento total aproximado: {cur} {budget}"
    if style:
        prompt += f"\nEstilo/interesses: {style}"
    prompt += f"\n\nGere o roteiro completo em JSON com EXATAMENTE {days} dias, seguindo o schema."
    kwargs = {"model": ALI_MODEL, "max_tokens": 16000, "system": ALI_GERAR_SYSTEM, "messages": [{"role": "user", "content": prompt}]}
    if _ALI_EFFORT_OK:
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        if getattr(resp, "stop_reason", None) == "refusal":
            return {"error": "refusal"}
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        raw = json.loads(_extract_json(text))
        state = _normalize_state(raw if isinstance(raw, dict) else {})
        if not state["days"]:
            return {"error": "empty"}
        return {"state": state}
    except json.JSONDecodeError:
        return {"error": "parse"}
    except Exception as e:
        return {"error": "api_error", "detail": str(e)[:200]}

@app.get("/api/health")
def health():
    """Sem senha, de propósito: usado por monitoramento e pelo deploy."""
    return {
        "ok": True,
        "environment": os.getenv("ENVIRONMENT", "dev"),
        "ai": bool(_ali_client),
        "auth": bool(TOKEN),
        "authMode": auth.status(),
        "db": "postgres" if store.DATABASE_URL else "sqlite",
    }

@app.get("/api/config")
def config():
    """Configuração pública que o app busca ao abrir — evita reconstruir o
    frontend a cada ambiente. Não expõe segredo algum."""
    return {"authMode": auth.AUTH_MODE, "firebase": auth.web_config() if auth.AUTH_MODE == "firebase" else None}

@app.get("/api/me")
def whoami(request: Request):
    """Quem está logado (e cria a conta no primeiro acesso)."""
    usuario = me(request)
    if not usuario:
        return {"mode": "token", "user": None}
    with user_con(usuario) as con:
        return {"mode": "firebase", "user": usuario}

# --- SPA + static assets (defined last so /api routes win) ---
@app.get("/{full_path:path}")
def spa(full_path: str):
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate)
    return FileResponse(STATIC / "index.html")
