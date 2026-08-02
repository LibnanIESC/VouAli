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

# --- SPA + static assets (defined last so /api routes win) ---
@app.get("/{full_path:path}")
def spa(full_path: str):
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate)
    return FileResponse(STATIC / "index.html")
