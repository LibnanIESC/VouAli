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
    # Aponta a pasta de estáticos para um lugar descartável. Antes o teste
    # escrevia na pasta real e a apagava no fim, o que só funciona em máquina
    # onde ela não existe — e apagaria um build de verdade onde existe.
    estatico = tmp_path / "static"
    modulo.STATIC = estatico
    (estatico / "assets").mkdir(parents=True)
    (estatico / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (estatico / "sw.js").write_text("// service worker", encoding="utf-8")
    (estatico / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    client = TestClient(modulo.app)
    # arquivo com hash no nome: pode ficar guardado para sempre
    assert "immutable" in client.get("/assets/index-abc123.js").headers["Cache-Control"]
    # o app e o service worker precisam ser sempre conferidos
    assert client.get("/sw.js").headers["Cache-Control"] == "no-cache"
    assert client.get("/").headers["Cache-Control"] == "no-cache"


def test_paginas_publicas_saem_fora_da_spa(tmp_path):
    """A Play Store confere estes links sem instalar o app: têm de ser HTML
    próprio, e não a SPA respondendo a qualquer rota."""
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    estatico = tmp_path / "static"
    modulo.STATIC = estatico
    estatico.mkdir(parents=True)
    (estatico / "index.html").write_text("<html>app</html>", encoding="utf-8")
    for nome in modulo.PAGINAS_PUBLICAS:
        (estatico / f"{nome}.html").write_text(f"<html>{nome}</html>", encoding="utf-8")
    client = TestClient(modulo.app)

    for nome in modulo.PAGINAS_PUBLICAS:
        resposta = client.get(f"/{nome}")
        assert resposta.status_code == 200
        assert nome in resposta.text, f"/{nome} devolveu a SPA em vez da página"
    # e nada mais mudou: o resto continua caindo na SPA
    assert "app" in client.get("/qualquer-outra-rota").text


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


# ---------- streaming: a resposta aparece enquanto o Ali escreve ----------

class _FluxoFake:
    """Imita o streaming do SDK: pedaços de texto + mensagem final."""

    def __init__(self, pedacos):
        self.pedacos = pedacos

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def gerar():
            for p in self.pedacos:
                yield p
        return gerar()

    async def get_final_message(self):
        return _Resposta("".join(self.pedacos))


class _ClienteStream:
    def __init__(self, pedacos):
        self.pedacos = pedacos
        self.ultimo = None
        self.messages = self

    def stream(self, **kwargs):
        self.ultimo = kwargs
        return _FluxoFake(self.pedacos)


def _eventos(resposta):
    """Extrai os eventos JSON de uma resposta SSE."""
    import json as _json
    fora = []
    for bloco in resposta.text.split("\n\n"):
        linha = next((l for l in bloco.split("\n") if l.startswith("data:")), None)
        if linha:
            fora.append(_json.loads(linha[5:].strip()))
    return fora


def test_stream_entrega_o_texto_em_pedacos(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    modulo._ali_client = _ClienteStream(["Vá ", "cedo ", "ao museu."])
    client = TestClient(modulo.app)
    r = client.post("/api/ali/stream", json={"messages": [{"role": "user", "content": "dica?"}], "trip": {}})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    eventos = _eventos(r)
    assert [e["delta"] for e in eventos if "delta" in e] == ["Vá ", "cedo ", "ao museu."]
    assert eventos[-1] == {"done": True}


def test_stream_conta_uso_ao_terminar(tmp_path):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", DATABASE_URL="", ANTHROPIC_API_KEY=None, QUOTA_CHAT="5")
    modulo.auth.verify_token = lambda t: ANA if t == ANA["uid"] else None
    modulo._ali_client = _ClienteStream(["oi", " tudo bem"])
    client = TestClient(modulo.app)
    cab = {"Authorization": f"Bearer {ANA['uid']}"}
    client.post("/api/ali/stream", headers=cab, json={"messages": [{"role": "user", "content": "oi"}], "trip": {}})
    assert client.get("/api/usage", headers=cab).json()["used"]["chat"] == 1


def test_stream_respeita_cota(tmp_path):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", DATABASE_URL="", ANTHROPIC_API_KEY=None, QUOTA_CHAT="1")
    modulo.auth.verify_token = lambda t: ANA if t == ANA["uid"] else None
    modulo._ali_client = _ClienteStream(["ok"])
    client = TestClient(modulo.app)
    cab = {"Authorization": f"Bearer {ANA['uid']}"}
    corpo = {"messages": [{"role": "user", "content": "oi"}], "trip": {}}
    client.post("/api/ali/stream", headers=cab, json=corpo)
    eventos = _eventos(client.post("/api/ali/stream", headers=cab, json=corpo))
    assert eventos[0]["error"] == "quota"


def test_stream_sem_chave_avisa_pelo_proprio_fluxo(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    eventos = _eventos(client.post("/api/ali/stream", json={"messages": [{"role": "user", "content": "oi"}]}))
    assert eventos == [{"error": "not_configured"}]


def test_stream_e_rota_antiga_usam_o_mesmo_preparo(tmp_path):
    """As duas rotas precisam mandar o mesmo contexto para a IA."""
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    viagem = {"adults": 2, "groupTypes": "Casal", "currency": "€", "budget": [{"k": "Trem", "v": 30}], "budgetTotal": 900}
    corpo = {"messages": [{"role": "assistant", "content": "boas-vindas"},
                          {"role": "user", "content": "e se chover?"}], "trip": viagem}
    client = TestClient(modulo.app)

    fluxo = _ClienteStream(["ok"])
    modulo._ali_client = fluxo
    client.post("/api/ali/stream", json=corpo)

    normal = _ClienteFake("ok")
    modulo._ali_client = normal
    client.post("/api/ali", json=corpo)

    assert fluxo.ultimo["messages"] == normal.ultimo["messages"]
    assert fluxo.ultimo["system"] == normal.ultimo["system"]
    assert fluxo.ultimo["model"] == normal.ultimo["model"]


# ---------- CORS: o app Android chama a API de outra origem ----------

def test_app_android_pode_chamar_a_api(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    r = client.get("/api/health", headers={"Origin": "capacitor://localhost"})
    assert r.headers.get("access-control-allow-origin") == "capacitor://localhost"


def test_etag_e_visivel_para_o_app(tmp_path):
    """Sem expor o ETag, o app não consegue lê-lo e perderíamos o 304."""
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    r = client.get("/api/state", headers={"Origin": "capacitor://localhost"})
    assert "etag" in r.headers.get("access-control-expose-headers", "").lower()


def test_preflight_libera_os_cabecalhos_que_usamos(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    r = client.options("/api/state", headers={
        "Origin": "capacitor://localhost",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "authorization,content-type,if-none-match,x-base-version",
    })
    assert r.status_code == 200
    liberados = r.headers.get("access-control-allow-headers", "").lower()
    for cabecalho in ["authorization", "content-type", "if-none-match", "x-base-version"]:
        assert cabecalho in liberados, cabecalho


def test_origem_desconhecida_nao_e_liberada(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    r = client.get("/api/health", headers={"Origin": "https://site-aleatorio.com"})
    assert r.headers.get("access-control-allow-origin") is None


def test_origem_extra_configuravel(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None,
                       ALLOWED_ORIGINS="https://vouali.com.br, https://outro.app")
    client = TestClient(modulo.app)
    r = client.get("/api/health", headers={"Origin": "https://vouali.com.br"})
    assert r.headers.get("access-control-allow-origin") == "https://vouali.com.br"


def test_tokens_de_cache_entram_na_contabilidade(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)

    class UsoComCache(_Uso):
        input_tokens = 10
        cache_read_input_tokens = 900
        cache_creation_input_tokens = 90

    resp = _Resposta("x")
    resp.usage = UsoComCache()
    assert modulo._tokens(resp) == (1000, 50), "leitura de cache também é consumo"
