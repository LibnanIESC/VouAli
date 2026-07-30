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
    con.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)")
    return con

app = FastAPI(title="VouAli")

def check(request: Request):
    if TOKEN and request.headers.get("X-Trip-Token") != TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/api/state")
def get_state(request: Request):
    check(request)
    con = db(); row = con.execute("SELECT v FROM kv WHERE k='trip'").fetchone(); con.close()
    return {"state": json.loads(row[0]) if row else None}

@app.put("/api/state")
async def put_state(request: Request):
    check(request)
    body = await request.body()
    try:
        json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    con = db()
    con.execute("INSERT INTO kv(k,v) VALUES('trip',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (body.decode("utf-8"),))
    con.commit(); con.close()
    return {"ok": True}

# --- SPA + static assets (defined last so /api routes win) ---
@app.get("/{full_path:path}")
def spa(full_path: str):
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate)
    return FileResponse(STATIC / "index.html")
