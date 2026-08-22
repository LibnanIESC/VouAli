"""Cotas de IA por usuário, limite por conta e contabilidade de consumo.

É o que impede um app público de gastar o crédito do dono sem controle.
"""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient

ANA = {"uid": "u-ana", "email": "ana@exemplo.com", "name": "Ana"}
BRUNO = {"uid": "u-bruno", "email": "bruno@exemplo.com", "name": "Bruno"}


class _Bloco:
    type = "text"

    def __init__(self, t):
        self.text = t


class _Uso:
    def __init__(self, entrada, saida):
        self.input_tokens = entrada
        self.output_tokens = saida


class _Resposta:
    stop_reason = "end_turn"

    def __init__(self, texto, entrada=100, saida=50):
        self.content = [_Bloco(texto)]
        self.usage = _Uso(entrada, saida)


class _ClienteFake:
    def __init__(self, texto="tudo certo"):
        self.texto = texto
        self.chamadas = 0
        self.ultimo = None
        self.messages = self

    async def create(self, **kwargs):
        self.chamadas += 1
        self.ultimo = kwargs
        return _Resposta(self.texto)


ROTEIRO = ('{"days":[{"label":"SEG","date":"1 SET","title":"Dia 1","sub":"","stops":'
           '[{"t":"10h","n":"Praça","d":"","getting":"","todo":"","insight":"vá cedo"}]}],'
           '"budget":[],"prebuy":[],"notes":[]}')


def montar(tmp_path, **env):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="",
                       ANTHROPIC_API_KEY=None, **env)
    pessoas = {p["uid"]: p for p in (ANA, BRUNO)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    return modulo, TestClient(modulo.app)


def como(p):
    return {"Authorization": f"Bearer {p['uid']}"}


def conversar(client, pessoa, texto="oi"):
    return client.post("/api/ali", headers=como(pessoa),
                       json={"messages": [{"role": "user", "content": texto}], "trip": {}}).json()


# ---------- cota de conversa ----------

def test_cota_de_chat_bloqueia_no_limite(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="3")
    m._ali_client = _ClienteFake()
    for i in range(3):
        assert "reply" in conversar(client, ANA), f"chamada {i+1} deveria passar"
    bloqueio = conversar(client, ANA)
    assert bloqueio["error"] == "quota" and bloqueio["limite"] == 3 and bloqueio["usado"] == 3
    assert m._ali_client.chamadas == 3, "não pode chamar a IA depois de estourar a cota"


def test_cota_e_por_usuario(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="1")
    m._ali_client = _ClienteFake()
    assert "reply" in conversar(client, ANA)
    assert conversar(client, ANA)["error"] == "quota"
    assert "reply" in conversar(client, BRUNO), "a cota da Ana não pode afetar o Bruno"


def test_falha_da_ia_nao_consome_cota(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="2")

    class Quebrado:
        messages = None

        async def create(self, **k):
            raise RuntimeError("api fora do ar")

    Quebrado.messages = Quebrado()
    m._ali_client = Quebrado()
    assert conversar(client, ANA)["error"] == "api_error"
    assert client.get("/api/usage", headers=como(ANA)).json()["used"]["chat"] == 0


def test_cotas_sao_separadas_por_tipo(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="1", QUOTA_GEN="1", QUOTA_TIP="1")
    m._ali_client = _ClienteFake(ROTEIRO)
    assert "reply" in conversar(client, ANA)
    assert "dica" in client.post("/api/ali/dica", headers=como(ANA), json={"stop": {"n": "Museu"}, "trip": {}}).json()
    assert "state" in client.post("/api/ali/gerar", headers=como(ANA),
                                  json={"destination": "Lisboa", "days": 1}).json()
    usado = client.get("/api/usage", headers=como(ANA)).json()["used"]
    assert usado == {"chat": 1, "gen": 1, "tip": 1}
    # cada uma agora bloqueia sozinha
    assert conversar(client, ANA)["error"] == "quota"
    assert client.post("/api/ali/gerar", headers=como(ANA), json={"destination": "Roma", "days": 1}).json()["error"] == "quota"


# ---------- consumo e relatório ----------

def test_usage_conta_tokens(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="10")
    m._ali_client = _ClienteFake()
    conversar(client, ANA)
    conversar(client, ANA)
    r = client.get("/api/usage", headers=como(ANA)).json()
    assert r["used"]["chat"] == 2
    assert r["tokens"] == {"in": 200, "out": 100}     # 2 chamadas de 100/50
    assert r["quotas"]["chat"] == 10 and r["period"]


def test_usage_exige_login(tmp_path):
    m, client = montar(tmp_path)
    assert client.get("/api/usage").status_code == 401


# ---------- fusível global ----------

def test_teto_global_pausa_a_ia_para_todos(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="99", ALI_MONTHLY_CAP="2")
    m._ali_client = _ClienteFake()
    assert "reply" in conversar(client, ANA)
    assert "reply" in conversar(client, BRUNO)
    assert conversar(client, ANA)["error"] == "ai_paused"
    assert conversar(client, BRUNO)["error"] == "ai_paused"


# ---------- limite por conta (rajada) ----------

def test_limite_por_conta_nao_derruba_os_outros(tmp_path):
    m, client = montar(tmp_path, QUOTA_CHAT="99", ALI_RATE_MAX="50", ALI_RATE_MAX_USER="2")
    m._ali_client = _ClienteFake()
    assert "reply" in conversar(client, ANA)
    assert "reply" in conversar(client, ANA)
    assert conversar(client, ANA)["error"] == "rate_limited"
    assert "reply" in conversar(client, BRUNO), "o excesso da Ana não pode travar o Bruno"


# ---------- roteamento de modelo ----------

def test_modelos_separados_para_conversa_e_geracao(tmp_path):
    m, client = montar(tmp_path, ALI_MODEL_CHAT="claude-haiku-4-5", ALI_MODEL_GEN="claude-sonnet-5",
                       QUOTA_CHAT="9", QUOTA_GEN="9")
    fake = _ClienteFake(ROTEIRO)
    m._ali_client = fake
    conversar(client, ANA)
    assert fake.ultimo["model"] == "claude-haiku-4-5"
    assert "output_config" not in fake.ultimo, "haiku não aceita effort"
    client.post("/api/ali/gerar", headers=como(ANA), json={"destination": "Lisboa", "days": 1})
    assert fake.ultimo["model"] == "claude-sonnet-5"
    assert fake.ultimo["output_config"] == {"effort": "low"}


def test_sem_configurar_segue_no_modelo_unico(tmp_path):
    m, client = montar(tmp_path, ALI_MODEL="claude-sonnet-5", QUOTA_CHAT="9")
    fake = _ClienteFake()
    m._ali_client = fake
    conversar(client, ANA)
    assert fake.ultimo["model"] == "claude-sonnet-5"


# ---------- modo antigo (produção) não muda ----------

def test_modo_token_nao_tem_cota(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None, QUOTA_CHAT="1")
    modulo._ali_client = _ClienteFake()
    client = TestClient(modulo.app)
    for _ in range(4):
        r = client.post("/api/ali", json={"messages": [{"role": "user", "content": "oi"}], "trip": {}}).json()
        assert "reply" in r, "produção (usuário único) não deve ter cota"
    assert client.get("/api/usage").json() == {"quotas": None}
