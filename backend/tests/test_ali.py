"""Rotas do Ali: proteção, contexto enviado ao modelo e normalização do roteiro."""
import json

import pytest
from conftest import load_main
from fastapi.testclient import TestClient


# ---------- contexto enviado ao modelo ----------

def test_linha_de_viajantes(fresh):
    m, _, _ = fresh
    assert m._travelers_line({"adults": 2, "children": 0, "groupTypes": "Casal"}) == \
        "VIAJANTES: 2 adultos (total 2) — perfil: Casal"
    assert m._travelers_line({"adults": 1, "children": 0}) == "VIAJANTES: 1 adulto (total 1)"
    assert m._travelers_line({"adults": 2, "children": 3, "groupTypes": "Família"}) == \
        "VIAJANTES: 2 adultos e 3 crianças (total 5) — perfil: Família"
    assert m._travelers_line({}) == "", "sem viajantes não deve poluir o prompt"


def test_linha_de_deslocamento(fresh):
    m, _, _ = fresh
    assert m._route_line({"origin": "Belo Horizonte", "transport": "Avião"}) == \
        "DESLOCAMENTO: saindo de Belo Horizonte, de avião"
    assert m._route_line({"origin": "Curitiba"}) == "DESLOCAMENTO: saindo de Curitiba"
    assert m._route_line({"transport": "Carro"}) == "DESLOCAMENTO: de carro"
    assert m._route_line({}) == "", "sem origem nem meio não deve poluir o prompt"
    assert m._route_line({"origin": "  ", "transport": " "}) == "", "espaços em branco não contam"


def test_contexto_conhece_destino_origem_e_meio(fresh):
    """Sem o destino no contexto, o Ali dava dica do lugar errado."""
    m, _, _ = fresh
    ctx = m._trip_context({"destination": "Nápoles, Itália", "origin": "São Paulo", "transport": "Avião"})
    assert "DESTINO: Nápoles, Itália" in ctx
    assert "saindo de São Paulo" in ctx and "de avião" in ctx


def test_prompt_da_dica_nao_fixa_um_destino(fresh):
    """O destino tem que vir do contexto da viagem, nunca escrito no prompt."""
    m, _, _ = fresh
    assert "Nova York" not in m.ALI_DICA_SYSTEM
    assert "Nova Iorque" not in m.ALI_DICA_SYSTEM


def test_contexto_usa_moeda_e_teto_da_viagem(fresh):
    m, _, _ = fresh
    ctx = m._trip_context({"currency": "€", "budgetTotal": 2500, "budget": [{"k": "Trem", "v": 30}]})
    assert "teto €2500" in ctx and "€30" in ctx
    assert "US$" not in ctx, "não pode vazar dólar fixo no contexto"


def test_contexto_sem_teto_definido(fresh):
    m, _, _ = fresh
    assert "sem teto definido" in m._trip_context({"currency": "R$", "budget": [{"k": "X", "v": 10}]})


def test_contexto_traz_dicas_e_pendencias(fresh, ny_state):
    m, _, _ = fresh
    ctx = m._trip_context(ny_state)
    assert "NY Public Library" in ctx
    assert "dica: entrada gratuita" in ctx
    assert "COMPRAR ANTES" in ctx and "Ingresso do Met" in ctx
    assert "OMNY" in ctx


def test_contexto_ignora_pendencias_ja_concluidas(fresh):
    m, _, _ = fresh
    ctx = m._trip_context({"prebuy": [{"text": "Feito", "done": True}, {"text": "Falta", "done": False}]})
    assert "Falta" in ctx and "Feito" not in ctx


# ---------- proteção das rotas ----------

@pytest.mark.parametrize("rota", ["/api/ali", "/api/ali/dica", "/api/ali/gerar"])
def test_rotas_de_ia_exigem_senha(tmp_path, rota):
    modulo = load_main(tmp_path, TRIP_TOKEN="segredo", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    assert client.post(rota, json={}).status_code == 401


@pytest.mark.parametrize("rota,corpo", [
    ("/api/ali", {"messages": [{"role": "user", "content": "oi"}]}),
    ("/api/ali/dica", {"stop": {"n": "Grand Central"}}),
    ("/api/ali/gerar", {"destination": "Lisboa", "days": 3}),
])
def test_sem_chave_configurada_responde_sem_quebrar(fresh, rota, corpo):
    _, client, _ = fresh
    assert client.post(rota, json=corpo).json() == {"error": "not_configured"}


def test_rate_limit_protege_o_credito(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ALI_RATE_MAX="3", ALI_RATE_WINDOW="60", ANTHROPIC_API_KEY=None)
    assert [modulo._rate_ok() for _ in range(4)] == [True, True, True, False]


# ---------- normalização do roteiro gerado ----------

def test_extrai_json_mesmo_com_markdown(fresh):
    m, _, _ = fresh
    assert m._extract_json('Claro!\n```json\n{"days":[]}\n```\nAbraço').strip() == '{"days":[]}'
    assert m._extract_json('{"days":[]}').strip() == '{"days":[]}'


def test_normaliza_roteiro_gerado(fresh):
    m, _, _ = fresh
    bruto = {
        "days": [{"label": "SEGUNDA", "date": "14 SET", "title": "Chegada", "sub": "leve",
                  "stops": [{"t": "10h", "n": "Praça", "insight": "vá cedo"}, "lixo"]}],
        "budget": [{"k": "Trem", "v": "30", "tag": "transporte"}],
        "prebuy": ["Ingresso", {"text": "Outro"}, "", 123],
        "notes": [{"title": "Clima", "body": "leve casaco"}],
    }
    estado = m._normalize_state(bruto)
    dia = estado["days"][0]
    assert dia["label"] == "SEGU" and dia["line"] == "1" and dia["color"]
    assert len(dia["stops"]) == 1, "itens inválidos devem ser descartados"
    parada = dia["stops"][0]
    assert parada["id"] and parada["done"] is False and parada["link"] == ""
    assert estado["budget"][0]["v"] == 30.0 and estado["budget"][0]["spent"] == 0
    # strings e {text} viram itens; vazios e valores estranhos (123) são descartados
    assert [p["text"] for p in estado["prebuy"]] == ["Ingresso", "Outro"]
    assert all(p["done"] is False and p["id"] for p in estado["prebuy"])
    assert estado["notes"][0]["title"] == "Clima"


def test_normaliza_entrada_vazia_sem_estourar(fresh):
    m, _, _ = fresh
    assert m._normalize_state({}) == {"days": [], "budget": [], "prebuy": [], "notes": []}


# ---------- geração com um cliente de IA simulado ----------

class _Bloco:
    type = "text"

    def __init__(self, texto):
        self.text = texto


class _Resposta:
    stop_reason = "end_turn"

    def __init__(self, texto):
        self.content = [_Bloco(texto)]


class _ClienteFake:
    """Simula o SDK da Anthropic, guardando os argumentos recebidos."""

    def __init__(self, texto):
        self.texto = texto
        self.chamado_com = None
        self.messages = self

    async def create(self, **kwargs):
        self.chamado_com = kwargs
        return _Resposta(self.texto)


ROTEIRO_FAKE = ('```json\n{"days":[{"label":"SEG","date":"14 SET","title":"Chegada","sub":"leve",'
                '"stops":[{"t":"10h","n":"Praça","d":"centro","getting":"metrô","todo":"andar","insight":"vá cedo"}]}],'
                '"budget":[{"k":"Trem","v":30,"tag":"transporte"}],"prebuy":["Ingresso"],'
                '"notes":[{"title":"Clima","body":"casaco"}]}\n```')


def test_geracao_devolve_estado_pronto_para_o_app(fresh):
    m, client, _ = fresh
    m._ali_client = _ClienteFake(ROTEIRO_FAKE)
    estado = client.post("/api/ali/gerar", json={"destination": "Lisboa", "days": 1, "currency": "€",
                                                 "adults": 2, "children": 0, "groupTypes": "Casal"}).json()["state"]
    assert estado["days"][0]["stops"][0]["n"] == "Praça"
    assert estado["days"][0]["stops"][0]["done"] is False


def test_geracao_informa_moeda_e_viajantes_ao_modelo(fresh):
    m, client, _ = fresh
    fake = _ClienteFake(ROTEIRO_FAKE)
    m._ali_client = fake
    client.post("/api/ali/gerar", json={"destination": "Lisboa", "days": 2, "currency": "€",
                                        "adults": 2, "children": 3, "groupTypes": "Família"})
    prompt = fake.chamado_com["messages"][0]["content"]
    assert "Moeda: €" in prompt
    assert "VIAJANTES: 2 adultos e 3 crianças" in prompt and "Família" in prompt


def test_geracao_valida_entrada(fresh):
    m, client, _ = fresh
    m._ali_client = _ClienteFake(ROTEIRO_FAKE)
    assert client.post("/api/ali/gerar", json={"destination": "", "days": 3}).json() == {"error": "invalid"}
    assert client.post("/api/ali/gerar", json={"destination": "Lisboa", "days": 0}).json() == {"error": "invalid"}


def test_geracao_com_json_quebrado_nao_derruba_a_rota(fresh):
    m, client, _ = fresh
    m._ali_client = _ClienteFake("desculpa, não consegui")
    assert client.post("/api/ali/gerar", json={"destination": "Lisboa", "days": 2}).json() == {"error": "parse"}


def test_chat_monta_historico_valido(fresh):
    m, client, _ = fresh
    fake = _ClienteFake("resposta curta")
    m._ali_client = fake
    client.post("/api/ali", json={
        "messages": [{"role": "assistant", "content": "boas-vindas"},   # deve ser descartada
                     {"role": "user", "content": "e se chover?"}],
        "trip": {"adults": 2, "groupTypes": "Casal", "currency": "US$"},
    })
    assert fake.chamado_com["messages"][0]["role"] == "user", "histórico precisa começar por 'user'"
    assert "VIAJANTES: 2 adultos" in fake.chamado_com["system"]


def test_chat_sem_mensagem_util(fresh):
    m, client, _ = fresh
    m._ali_client = _ClienteFake("x")
    assert client.post("/api/ali", json={"messages": [{"role": "assistant", "content": "oi"}]}).json() == {"error": "empty"}
