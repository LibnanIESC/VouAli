"""Preparação para escala: tráfego, cache de estáticos e cache de prompt.

Nenhum destes muda o que o usuário vê — todos reduzem custo por usuário
atendido, que é o que decide se o app aguenta volume.
"""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient

ANA = {"uid": "u-ana", "email": "ana@exemplo.com", "name": "Ana"}


class _Bloco:
    type = "text"

    def __init__(self, t):
        self.text = t


class _Uso:
    input_tokens = 100
    output_tokens = 50
    cache_read_input_tokens = 0
    cache_creation_input_tokens = 0


class _Resposta:
    stop_reason = "end_turn"

    def __init__(self, texto):
        self.content = [_Bloco(texto)]
        self.usage = _Uso()


class _ClienteFake:
    def __init__(self, texto="ok"):
        self.texto = texto
        self.ultimo = None
        self.messages = self

    async def create(self, **kwargs):
        self.ultimo = kwargs
        return _Resposta(self.texto)


# ---------- ETag: o app pergunta "mudou?" a cada poucos segundos ----------

def test_state_responde_304_quando_nada_mudou(legacy, ny_state):
    _, client, _ = legacy
    primeira = client.get("/api/state")
    etag = primeira.headers.get("ETag")
    assert etag and primeira.json()["state"] == ny_state

    segunda = client.get("/api/state", headers={"If-None-Match": etag})
    assert segunda.status_code == 304
    assert segunda.content == b"", "304 não pode trazer corpo"


def test_etag_muda_quando_a_viagem_muda(legacy, ny_state):
    _, client, _ = legacy
    etag = client.get("/api/state").headers["ETag"]
    client.put("/api/state", json=dict(ny_state, notes=[{"id": "n", "title": "Nova", "body": "x"}]))
    depois = client.get("/api/state", headers={"If-None-Match": etag})
    assert depois.status_code == 200, "depois de editar, o app precisa receber o dado novo"
    assert depois.headers["ETag"] != etag


def test_etag_por_usuario_no_modo_com_contas(tmp_path):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", DATABASE_URL="", ANTHROPIC_API_KEY=None)
    modulo.auth.verify_token = lambda t: ANA if t == ANA["uid"] else None
    client = TestClient(modulo.app)
    cab = {"Authorization": f"Bearer {ANA['uid']}"}
    client.post("/api/trips", headers=cab, json={"name": "Lisboa"})

    primeira = client.get("/api/state", headers=cab)
    etag = primeira.headers.get("ETag")
    assert etag
    assert client.get("/api/state", headers={**cab, "If-None-Match": etag}).status_code == 304


# ---------- cache dos arquivos estáticos ----------

def test_cache_dos_estaticos(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    estatico = modulo.STATIC
    estatico.mkdir(parents=True, exist_ok=True)
    (estatico / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (estatico / "sw.js").write_text("// service worker", encoding="utf-8")
    (estatico / "assets").mkdir(exist_ok=True)
    (estatico / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    client = TestClient(modulo.app)
    try:
        # arquivo com hash no nome: pode ficar guardado para sempre
        assert "immutable" in client.get("/assets/index-abc123.js").headers["Cache-Control"]
        # o app e o service worker precisam ser sempre conferidos
        assert client.get("/sw.js").headers["Cache-Control"] == "no-cache"
        assert client.get("/").headers["Cache-Control"] == "no-cache"
    finally:
        for f in ["index.html", "sw.js", "assets/index-abc123.js"]:
            (estatico / f).unlink(missing_ok=True)
        (estatico / "assets").rmdir()
        estatico.rmdir()


# ---------- cache do prompt (custo da IA) ----------

def test_prompt_grande_pede_cache(tmp_path):
    """Persona + roteiro são reenviados a cada mensagem: marcar para cache
    faz as mensagens seguintes custarem uma fração."""
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None, ALI_CACHE_MIN_CHARS="100")
    fake = _ClienteFake()
    modulo._ali_client = fake
    client = TestClient(modulo.app)
    client.post("/api/ali", json={"messages": [{"role": "user", "content": "oi"}], "trip": {}})
    system = fake.ultimo["system"]
    assert isinstance(system, list) and system[0]["cache_control"] == {"type": "ephemeral"}


def test_prompt_pequeno_nao_pede_cache(tmp_path):
    """Abaixo do mínimo de tokens o cache não compensa — e nem é aceito."""
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None, ALI_CACHE_MIN_CHARS="999999")
    fake = _ClienteFake()
    modulo._ali_client = fake
    client = TestClient(modulo.app)
    client.post("/api/ali", json={"messages": [{"role": "user", "content": "oi"}], "trip": {}})
    assert isinstance(fake.ultimo["system"], str)


def test_tokens_de_cache_entram_na_contabilidade(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)

    class UsoComCache(_Uso):
        input_tokens = 10
        cache_read_input_tokens = 900
        cache_creation_input_tokens = 90

    resp = _Resposta("x")
    resp.usage = UsoComCache()
    assert modulo._tokens(resp) == (1000, 50), "leitura de cache também é consumo"
