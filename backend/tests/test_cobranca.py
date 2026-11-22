"""Cobrança: degustação única, passe de viagem e compras.

Com `COBRANCA=on` a IA deixa de ter cota mensal (que renova de graça para
sempre) e passa a gastar SALDO que não renova. Estes testes são a garantia de
que conta gratuita tem custo com teto, de que quem paga recebe — e de que
ninguém recebe sem pagar.
"""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient
from test_cotas import ANA, BRUNO, ROTEIRO, _ClienteFake, como

CHAVE = "sk_teste"


def montar(tmp_path, **env):
    base = dict(AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="", ANTHROPIC_API_KEY=None,
                COBRANCA="on", REVENUECAT_API_KEY=CHAVE, ALI_RATE_MAX="999", ALI_RATE_MAX_USER="999")
    base.update(env)
    modulo = load_main(tmp_path, **base)
    pessoas = {p["uid"]: p for p in (ANA, BRUNO)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    modulo._ali_client = _ClienteFake(ROTEIRO)
    return modulo, TestClient(modulo.app)


def viagem(client, pessoa, dias=0, inicio="", fim="", **extra):
    """Cria uma viagem com `dias` dias de roteiro (e/ou um intervalo de datas)."""
    corpo = {"name": "Viagem", "startDate": inicio, "endDate": fim,
             "data": {"days": [{"id": f"d{i}", "stops": []} for i in range(dias)],
                      "budget": [], "prebuy": [], "notes": []}}
    corpo.update(extra)
    return client.post("/api/trips", headers=como(pessoa), json=corpo).json()["meta"]["id"]


def conversar(client, pessoa, trip_id=None):
    corpo = {"messages": [{"role": "user", "content": "oi"}], "trip": {}}
    if trip_id:
        corpo["trip_id"] = trip_id
    return client.post("/api/ali", headers=como(pessoa), json=corpo).json()


def dica(client, pessoa, trip_id=None):
    corpo = {"stop": {"n": "Museu"}, "trip": {}}
    if trip_id:
        corpo["trip_id"] = trip_id
    return client.post("/api/ali/dica", headers=como(pessoa), json=corpo).json()


def gerar(client, pessoa, dias, trip_id=None):
    corpo = {"destination": "Lisboa", "days": dias}
    if trip_id:
        corpo["trip_id"] = trip_id
    return client.post("/api/ali/gerar", headers=como(pessoa), json=corpo).json()


def saldo(client, pessoa, trip_id=None):
    return client.get("/api/saldo" + (f"?trip={trip_id}" if trip_id else ""), headers=como(pessoa)).json()


def compra(txn, produto="passe_viagem", sandbox=False):
    return {"produto": produto, "txn": txn, "store_txn": "GPA." + txn, "sandbox": sandbox, "quando": txn}


def loja(monkeypatch, modulo, compras):
    """Faz o papel do RevenueCat. `compras`: {uid: [compra...]}; None = fora do ar."""
    async def falsa(uid, api_key):
        assert api_key == CHAVE, "o servidor tem que consultar com a chave secreta"
        return None if compras is None else [dict(c) for c in compras.get(uid, [])]
    monkeypatch.setattr(modulo.billing, "compras_de", falsa)


def sincronizar(client, pessoa, trip_id=None):
    return client.post("/api/compras/sincronizar", headers=como(pessoa),
                       json={"trip_id": trip_id} if trip_id else {})


# ---------- a chave: desligada, nada muda ----------

def test_cobranca_desligada_mantem_a_cota_mensal(tmp_path):
    m, client = montar(tmp_path, COBRANCA="off", QUOTA_CHAT="1")
    assert "reply" in conversar(client, ANA)
    assert conversar(client, ANA)["error"] == "quota"
    assert saldo(client, ANA) == {"cobranca": False}


# ---------- degustação ----------

def test_degustacao_tem_teto_e_depois_pede_passe(tmp_path):
    m, client = montar(tmp_path, DEGUSTACAO_CHATS="2")
    tid = viagem(client, ANA, dias=3)
    assert "reply" in conversar(client, ANA, tid)
    assert "reply" in conversar(client, ANA, tid)
    bloqueio = conversar(client, ANA, tid)
    assert bloqueio["error"] == "paywall" and bloqueio["tipo"] == "chat" and bloqueio["motivo"] == "sem_passe"
    assert m._ali_client.chamadas == 2, "sem saldo, a IA não pode nem ser chamada"


def test_degustacao_nao_renova_no_mes_seguinte(tmp_path, monkeypatch):
    m, client = montar(tmp_path, DEGUSTACAO_CHATS="1")
    tid = viagem(client, ANA, dias=2)
    assert "reply" in conversar(client, ANA, tid)
    monkeypatch.setattr(m.store, "periodo_atual", lambda: "2099-01")     # virou o mês
    assert conversar(client, ANA, tid)["error"] == "paywall", "era este o vazamento da cota mensal"


def test_degustacao_e_uma_por_conta(tmp_path):
    m, client = montar(tmp_path, DEGUSTACAO_CHATS="1")
    a, b = viagem(client, ANA, dias=1), viagem(client, BRUNO, dias=1)
    assert "reply" in conversar(client, ANA, a)
    assert conversar(client, ANA, a)["error"] == "paywall"
    assert conversar(client, ANA, viagem(client, ANA, dias=1))["error"] == "paywall", "outra viagem não dá outra degustação"
    assert "reply" in conversar(client, BRUNO, b), "a degustação do Bruno é dele"


def test_degustacao_separa_roteiro_conversa_e_dica(tmp_path):
    m, client = montar(tmp_path)        # padrão: 1 roteiro, 5 conversas, 3 dicas
    assert "state" in gerar(client, ANA, 4)
    assert gerar(client, ANA, 2)["error"] == "paywall"
    tid = viagem(client, ANA, dias=4)
    assert saldo(client, ANA, tid)["disponivel"] == {"chat": 5, "gen": 0, "tip": 3}
    for _ in range(3):
        assert "dica" in dica(client, ANA, tid)
    assert dica(client, ANA, tid)["error"] == "paywall"
    assert "reply" in conversar(client, ANA, tid), "acabar a dica não trava a conversa"


# ---------- limite de dias ----------

def test_roteiro_longo_nao_cabe_na_degustacao(tmp_path):
    m, client = montar(tmp_path)
    bloqueio = gerar(client, ANA, 5)
    assert bloqueio == {"error": "paywall", "tipo": "gen", "motivo": "dias", "dias": 5, "max_dias": 4}
    assert m._ali_client.chamadas == 0
    assert "state" in gerar(client, ANA, 4), "a tentativa barrada não gasta a degustação"


def test_dias_sao_os_gravados_no_servidor_nao_os_do_app(tmp_path):
    m, client = montar(tmp_path)
    longa = viagem(client, ANA, dias=6)
    # O app pode mandar o que quiser no corpo: vale o que está gravado.
    r = client.post("/api/ali", headers=como(ANA),
                    json={"messages": [{"role": "user", "content": "oi"}], "trip": {"days": []},
                          "trip_id": longa, "days": 1}).json()
    assert r["error"] == "paywall" and r["motivo"] == "dias" and r["dias"] == 6


def test_datas_longas_contam_mesmo_com_roteiro_vazio(tmp_path):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=0, inicio="2027-03-01", fim="2027-03-10")
    assert conversar(client, ANA, tid)["dias"] == 10
    curta = viagem(client, ANA, dias=0, inicio="2027-03-01", fim="2027-03-04")
    assert "reply" in conversar(client, ANA, curta)


def test_limite_de_dias_e_ajustavel(tmp_path):
    m, client = montar(tmp_path, DEGUSTACAO_MAX_DIAS="2")
    assert gerar(client, ANA, 3)["max_dias"] == 2
    assert "state" in gerar(client, ANA, 2)


# ---------- só paga o que foi entregue ----------

def test_falha_da_ia_nao_gasta_saldo(tmp_path):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=2)

    class Quebrado:
        async def create(self, **k):
            raise RuntimeError("api fora do ar")

    Quebrado.messages = Quebrado()
    m._ali_client = Quebrado()
    assert conversar(client, ANA, tid)["error"] == "api_error"
    assert saldo(client, ANA, tid)["disponivel"]["chat"] == 5


def test_roteiro_ilegivel_nao_gasta_o_roteiro(tmp_path):
    m, client = montar(tmp_path)
    m._ali_client = _ClienteFake("isto não é json")
    assert gerar(client, ANA, 3)["error"] == "parse"
    m._ali_client = _ClienteFake(ROTEIRO)
    assert "state" in gerar(client, ANA, 3), "o único roteiro da degustação não pode sumir num erro nosso"


def test_dica_recusada_devolve_a_unidade(tmp_path):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=2)

    class Recusa(_ClienteFake):
        async def create(self, **k):
            r = await super().create(**k)
            r.stop_reason = "refusal"
            return r

    m._ali_client = Recusa()
    assert dica(client, ANA, tid)["error"] == "refusal"
    assert saldo(client, ANA, tid)["disponivel"]["tip"] == 3


def test_pedido_vazio_nao_gasta_saldo(tmp_path):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=2)
    r = client.post("/api/ali", headers=como(ANA), json={"messages": [], "trip": {}, "trip_id": tid}).json()
    assert r["error"] == "empty"
    assert client.post("/api/ali/dica", headers=como(ANA), json={"stop": {}, "trip_id": tid}).json()["error"] == "empty"
    assert saldo(client, ANA, tid)["disponivel"] == {"chat": 5, "gen": 1, "tip": 3}


def test_pedidos_simultaneos_nao_passam_com_um_credito_so(tmp_path):
    """Os dois pedidos chegam antes de qualquer um terminar: a unidade é
    reservada na hora, então o segundo já encontra o saldo zerado."""
    m, client = montar(tmp_path)
    conversar(client, ANA, viagem(client, ANA, dias=1))       # cria a conta e a degustação
    primeiro = m._autorizar(ANA, "gen", {}, dias_pedidos=3)
    segundo = m._autorizar(ANA, "gen", {}, dias_pedidos=3)
    assert primeiro[0] is True
    assert segundo[0] is False and segundo[1]["error"] == "paywall"
    m._estornar(ANA, "gen", primeiro[2])                      # o primeiro falhou: a unidade volta
    assert m._autorizar(ANA, "gen", {}, dias_pedidos=3)[0] is True


class _Fluxo:
    """Imita o streaming da SDK: pedaços de texto e a mensagem final."""

    def __init__(self, pedacos, quebra=False):
        self.pedacos, self.quebra = pedacos, quebra

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    @property
    def text_stream(self):
        async def gerador():
            for p in self.pedacos:
                yield p
            if self.quebra:
                raise RuntimeError("caiu no meio")
        return gerador()

    async def get_final_message(self):
        from test_cotas import _Resposta
        return _Resposta("".join(self.pedacos))


def _conversar_stream(client, pessoa, trip_id):
    r = client.post("/api/ali/stream", headers=como(pessoa),
                    json={"messages": [{"role": "user", "content": "oi"}], "trip": {}, "trip_id": trip_id})
    return r.text


def test_conversa_em_streaming_gasta_e_devolve_igual(tmp_path):
    m, client = montar(tmp_path, DEGUSTACAO_CHATS="1")
    tid = viagem(client, ANA, dias=2)
    m._ali_client.stream = lambda **k: _Fluxo(["Olá", "!"], quebra=True)
    assert "api_error" in _conversar_stream(client, ANA, tid)
    assert saldo(client, ANA, tid)["disponivel"]["chat"] == 1, "caiu no meio: devolve"
    m._ali_client.stream = lambda **k: _Fluxo(["Olá", "!"])
    assert '"done": true' in _conversar_stream(client, ANA, tid)
    assert saldo(client, ANA, tid)["disponivel"]["chat"] == 0
    assert '"paywall"' in _conversar_stream(client, ANA, tid)


# ---------- passe de viagem ----------

def test_passe_destrava_a_viagem_longa(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    assert conversar(client, ANA, tid)["error"] == "paywall"
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    r = sincronizar(client, ANA, tid).json()
    assert r["ok"] and r["novos"] == 1
    assert r["saldo"]["passe"] == {"chat": 100, "gen": 3, "tip": 50}
    assert "reply" in conversar(client, ANA, tid)
    assert "dica" in dica(client, ANA, tid)
    assert "state" in gerar(client, ANA, 8, tid)
    assert saldo(client, ANA, tid)["passe"] == {"chat": 99, "gen": 2, "tip": 49}


def test_a_mesma_compra_nunca_credita_duas_vezes(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    assert sincronizar(client, ANA, tid).json()["novos"] == 1
    assert sincronizar(client, ANA, tid).json()["novos"] == 0
    assert sincronizar(client, ANA).json()["novos"] == 0
    assert saldo(client, ANA, tid)["passe"]["gen"] == 3


def test_passe_esgotado_avisa_que_acabou(tmp_path, monkeypatch):
    m, client = montar(tmp_path, PASSE_CHATS="1")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    assert "reply" in conversar(client, ANA, tid)
    bloqueio = conversar(client, ANA, tid)
    assert bloqueio["error"] == "paywall" and bloqueio["motivo"] == "esgotado"
    assert "dica" in dica(client, ANA, tid), "o resto do passe continua valendo"


def test_passe_de_uma_viagem_nao_vale_em_outra(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    uma, outra = viagem(client, ANA, dias=8), viagem(client, ANA, dias=9)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, uma)
    assert "reply" in conversar(client, ANA, uma)
    assert conversar(client, ANA, outra)["error"] == "paywall"


def test_degustacao_e_gasta_antes_do_passe(tmp_path, monkeypatch):
    m, client = montar(tmp_path, DEGUSTACAO_CHATS="1")
    tid = viagem(client, ANA, dias=3)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    conversar(client, ANA, tid)
    s = saldo(client, ANA, tid)
    assert s["degustacao"]["chat"] == 0 and s["passe"]["chat"] == 100
    conversar(client, ANA, tid)
    assert saldo(client, ANA, tid)["passe"]["chat"] == 99


def test_tamanho_do_passe_e_ajustavel(tmp_path, monkeypatch):
    m, client = montar(tmp_path, PASSE_ROTEIROS="7", PASSE_CHATS="20", PASSE_DICAS="9")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    assert sincronizar(client, ANA, tid).json()["saldo"]["passe"] == {"chat": 20, "gen": 7, "tip": 9}


# ---------- passe comprado antes de a viagem existir ----------

def test_passe_solto_gera_o_roteiro_e_fica_na_viagem_criada(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    assert sincronizar(client, ANA).json()["saldo"]["soltos"] == 1
    r = gerar(client, ANA, 10)                       # viagem ainda não existe
    assert "state" in r and r["passe"]
    tid = viagem(client, ANA, dias=10, passe=r["passe"])
    s = saldo(client, ANA, tid)
    assert s["soltos"] == 0 and s["passe"] == {"chat": 100, "gen": 2, "tip": 50}
    assert conversar(client, ANA, viagem(client, ANA, dias=10))["error"] == "paywall"


def test_passe_solto_se_prende_no_primeiro_uso(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    a, b = viagem(client, ANA, dias=8), viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA)
    assert "reply" in conversar(client, ANA, a)
    assert saldo(client, ANA, a)["passe"]["chat"] == 99
    assert conversar(client, ANA, b)["error"] == "paywall", "preso à primeira, não serve à segunda"


def test_nao_da_para_prender_o_passe_de_outra_pessoa(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA)
    do_ana = gerar(client, ANA, 10)["passe"]
    tid = viagem(client, BRUNO, dias=10, passe=do_ana)
    assert conversar(client, BRUNO, tid)["error"] == "paywall"
    assert saldo(client, ANA)["soltos"] == 1, "o passe continua com a Ana"


def test_apagar_a_viagem_devolve_o_passe_a_quem_comprou(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    conversar(client, ANA, tid)
    client.delete(f"/api/trips/{tid}", headers=como(ANA))
    nova = viagem(client, ANA, dias=8)
    assert saldo(client, ANA, nova)["soltos"] == 1
    assert "reply" in conversar(client, ANA, nova)
    assert saldo(client, ANA, nova)["passe"]["chat"] == 98, "volta com o que sobrou, não cheio"


# ---------- viagem compartilhada ----------

def test_convidado_usa_o_passe_da_viagem(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    conversar(client, BRUNO)                                  # Bruno já tem conta
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    assert conversar(client, BRUNO, tid)["error"] == "paywall"
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    assert "reply" in conversar(client, BRUNO, tid)
    assert saldo(client, ANA, tid)["passe"]["chat"] == 99, "saiu do passe da viagem"


def test_ia_em_viagem_alheia_e_recusada(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")], BRUNO["uid"]: [compra("t2")]})
    sincronizar(client, ANA, tid)
    assert conversar(client, BRUNO, tid) == {"error": "trip_not_found"}
    assert client.get(f"/api/saldo?trip={tid}", headers=como(BRUNO)).status_code == 404
    assert sincronizar(client, BRUNO, tid).status_code == 404
    assert saldo(client, ANA, tid)["passe"]["chat"] == 100


def test_app_antigo_sem_trip_id_usa_a_viagem_ativa(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)                         # recém-criada = ativa
    assert conversar(client, ANA)["error"] == "paywall"
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    assert "reply" in conversar(client, ANA)


# ---------- conferência da compra ----------

def test_o_app_nao_decide_o_que_foi_comprado(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {})                                  # o RevenueCat não viu compra nenhuma
    r = client.post("/api/compras/sincronizar", headers=como(ANA),
                    json={"trip_id": tid, "produto": "passe_viagem", "txn": "inventada", "pago": True}).json()
    assert r["novos"] == 0 and r["saldo"]["passe"] is None
    assert conversar(client, ANA, tid)["error"] == "paywall"


def test_compra_de_teste_so_vale_se_ligada(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1", sandbox=True)]})
    assert sincronizar(client, ANA).json()["novos"] == 0
    m2, client2 = montar(tmp_path, REVENUECAT_SANDBOX="1")
    loja(monkeypatch, m2, {ANA["uid"]: [compra("t1", sandbox=True)]})
    assert sincronizar(client2, ANA).json()["novos"] == 1


def test_produto_desconhecido_nao_vira_saldo(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1", produto="outro_app_premium")]})
    assert sincronizar(client, ANA).json()["novos"] == 0


def test_recarga_credita_so_o_seu_tipo(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("r1", produto="recarga_roteiros")]})
    assert sincronizar(client, ANA, tid).json()["saldo"]["passe"] == {"chat": 0, "gen": 3, "tip": 0}
    assert "state" in gerar(client, ANA, 8, tid)
    assert conversar(client, ANA, tid)["motivo"] == "esgotado"


def test_revenuecat_fora_do_ar_nao_credita_nem_quebra(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    loja(monkeypatch, m, None)
    assert sincronizar(client, ANA).json() == {"error": "upstream"}


def test_sem_chave_configurada_nao_ha_compra(tmp_path):
    m, client = montar(tmp_path, REVENUECAT_API_KEY=None)
    assert sincronizar(client, ANA).json() == {"error": "not_configured"}


def test_conferencia_tem_limite_por_conta(tmp_path, monkeypatch):
    m, client = montar(tmp_path, COMPRA_RATE_MAX="2")
    loja(monkeypatch, m, {})
    assert sincronizar(client, ANA).json()["ok"]
    assert sincronizar(client, ANA).json()["ok"]
    assert sincronizar(client, ANA).json() == {"error": "rate_limited"}
    assert sincronizar(client, BRUNO).json()["ok"]


def test_compras_exigem_login(tmp_path):
    m, client = montar(tmp_path)
    assert client.post("/api/compras/sincronizar", json={}).status_code == 401
    assert client.get("/api/saldo").status_code == 401


# ---------- aviso do RevenueCat (webhook) ----------

def aviso(client, corpo, segredo="segredo-do-webhook"):
    return client.post("/api/revenuecat/webhook", json={"event": corpo},
                       headers={"Authorization": segredo} if segredo else {})


def test_webhook_credita_mesmo_se_o_app_fechou(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    r = aviso(client, {"type": "NON_RENEWING_PURCHASE", "app_user_id": ANA["uid"], "product_id": "passe_viagem"})
    assert r.status_code == 200
    assert saldo(client, ANA, tid)["soltos"] == 1
    assert sincronizar(client, ANA, tid).json()["novos"] == 0, "o app avisando depois não credita de novo"
    assert "reply" in conversar(client, ANA, tid)


def test_webhook_exige_o_segredo(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    conversar(client, ANA)
    evento = {"type": "NON_RENEWING_PURCHASE", "app_user_id": ANA["uid"]}
    assert aviso(client, evento, segredo="errado").status_code == 401
    assert aviso(client, evento, segredo=None).status_code == 401
    assert saldo(client, ANA)["soltos"] == 0


def test_webhook_sem_segredo_configurado_fica_fechado(tmp_path):
    m, client = montar(tmp_path)
    assert aviso(client, {"type": "NON_RENEWING_PURCHASE", "app_user_id": ANA["uid"]}, segredo="").status_code == 401
    assert aviso(client, {"type": "TEST", "app_user_id": "x"}, segredo="Bearer ").status_code == 401


def test_webhook_tolera_enganos_de_colagem(tmp_path):
    """Espaço/quebra de linha colados no Railway e "Bearer " na frente não
    podem fechar o webhook — mas segredo errado continua barrado."""
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="  segredo-do-webhook\n")
    teste = {"type": "TEST", "app_user_id": "conta-que-nao-existe"}
    assert aviso(client, teste, segredo="segredo-do-webhook").status_code == 200
    assert aviso(client, teste, segredo="Bearer segredo-do-webhook").status_code == 200
    assert aviso(client, teste, segredo="segredo-do-webhook ").status_code == 200
    assert aviso(client, teste, segredo="Bearer errado").status_code == 401
    assert aviso(client, teste, segredo="segredo-do-webhoo").status_code == 401


def test_conta_de_teste_ja_e_cobrada_com_a_chave_geral_desligada(tmp_path, monkeypatch):
    """É assim que se testa a compra de verdade sem mexer com mais ninguém:
    só a conta listada vê saldo e paywall; as outras seguem na cota mensal."""
    m, client = montar(tmp_path, COBRANCA="off", COBRANCA_TESTE=" Ana@Exemplo.com , outra@x.com ")
    tid = viagem(client, ANA, dias=8)
    # a conta de teste: sem cota mensal, com saldo — e bloqueada na viagem longa
    assert saldo(client, ANA, tid)["cobranca"] is True
    assert client.get("/api/usage", headers=como(ANA)).json()["quotas"] is None
    r = conversar(client, ANA, tid)
    assert r["error"] == "paywall" and r["motivo"] == "dias"
    # comprou: passa
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    assert sincronizar(client, ANA, tid).json()["novos"] == 1
    assert "reply" in conversar(client, ANA, tid)
    # os demais não percebem nada
    assert saldo(client, BRUNO) == {"cobranca": False}
    assert client.get("/api/usage", headers=como(BRUNO)).json()["quotas"]["chat"] > 0
    assert "reply" in conversar(client, BRUNO)
    saude = client.get("/api/health")
    assert saude.json()["cobranca"] == {"ligada": False, "contas_de_teste": 2, "cancelamentos_sem_passe": 0,
                                        "revenuecat": True, "webhook": False, "sandbox": False}
    assert "exemplo.com" not in saude.text.lower()


def test_produto_com_opcao_de_compra_do_google_vira_o_mesmo_passe(tmp_path, monkeypatch):
    """No modelo novo do Google a compra pode vir como `produto:opção`."""
    m, client = montar(tmp_path)
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1", produto="passe_viagem:comprar"),
                                       compra("t2", produto="outro_app:comprar")]})
    assert sincronizar(client, ANA, tid).json()["novos"] == 1
    assert saldo(client, ANA, tid)["passe"]["chat"] == m.PASSE["chat"]


def test_visao_da_conta_lista_o_passe_de_cada_viagem(tmp_path, monkeypatch):
    """Na lista de viagens o saldo não é somado: degustação de um lado, e o
    passe de cada viagem do outro — com o nome dela."""
    m, client = montar(tmp_path)
    viagem(client, ANA, dias=2, name="Porto")
    miami = viagem(client, ANA, dias=8, name="Miami")
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, miami)
    conversar(client, ANA, miami)
    conta = saldo(client, ANA)
    assert conta["viagens"] == [{"id": miami, "nome": "Miami",
                                 "restante": {"chat": m.PASSE["chat"] - 1, "gen": m.PASSE["gen"], "tip": m.PASSE["tip"]}}]
    assert conta["degustacao"]["chat"] == m.DEGUSTACAO["chat"]
    # dentro da viagem, o formato de sempre (sem a lista)
    assert "viagens" not in saldo(client, ANA, miami)
    # viagem compartilhada: quem foi convidado vê o passe dela também
    client.post(f"/api/trips/{miami}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    conversar(client, BRUNO)
    assert [v["nome"] for v in saldo(client, BRUNO)["viagens"]] == ["Miami"]


def test_health_diz_se_a_cobranca_esta_configurada_sem_expor_segredo(tmp_path):
    m, client = montar(tmp_path)
    assert client.get("/api/health").json()["cobranca"]["webhook"] is False
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook", REVENUECAT_API_KEY="sk_teste_123")
    r = client.get("/api/health")
    assert r.json()["cobranca"]["webhook"] is True and r.json()["cobranca"]["revenuecat"] is True
    assert "segredo-do-webhook" not in r.text and "sk_teste_123" not in r.text


def test_webhook_falha_se_nao_conseguir_conferir(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    conversar(client, ANA)                                    # a conta existe
    loja(monkeypatch, m, None)
    r = aviso(client, {"type": "NON_RENEWING_PURCHASE", "app_user_id": ANA["uid"]})
    assert r.status_code == 503, "sem 200 o RevenueCat tenta de novo"


def test_webhook_de_teste_responde_ok_sem_consultar_nada(tmp_path, monkeypatch):
    """O botão "enviar evento de teste" do RevenueCat usa uma conta que não
    existe aqui: tem que dar 200 mesmo com o RevenueCat fora do ar."""
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    loja(monkeypatch, m, None)
    r = aviso(client, {"type": "TEST", "app_user_id": "conta-que-nao-existe"})
    assert r.status_code == 200 and r.json()["revogados"] == 0


def test_webhook_malformado_nao_derruba(tmp_path):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    cab = {"Authorization": "segredo-do-webhook"}
    assert client.post("/api/revenuecat/webhook", json={"event": "texto"}, headers=cab).status_code == 400
    assert client.post("/api/revenuecat/webhook", content=b"nao e json", headers=cab).status_code == 400
    r = client.post("/api/revenuecat/webhook", json={"event": {"type": "TEST", "app_user_id": "$RCAnonymousID:abc"}}, headers=cab)
    assert r.json() == {"ok": True, "ignorado": True}


def test_reembolso_tira_o_saldo(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    assert "reply" in conversar(client, ANA, tid)
    r = aviso(client, {"type": "CANCELLATION", "app_user_id": ANA["uid"], "product_id": "passe_viagem",
                       "transaction_id": "GPA.t1", "cancel_reason": "CUSTOMER_SUPPORT"})
    assert r.json()["revogados"] == 1
    assert conversar(client, ANA, tid)["error"] == "paywall"
    assert sincronizar(client, ANA, tid).json()["novos"] == 0, "reembolsado não volta numa nova conferência"


def _reembolso(client, txn="GPA.t1", **extra):
    corpo = {"type": "CANCELLATION", "app_user_id": ANA["uid"], "product_id": "passe_viagem",
             "transaction_id": txn, "cancel_reason": "CUSTOMER_SUPPORT", **extra}
    return aviso(client, corpo)


def test_reembolso_que_nao_casa_pelo_id_anula_o_que_a_loja_deixou_de_listar(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1"), compra("t2")]})
    sincronizar(client, ANA, tid)
    # a loja passa a listar só a t2: a t1 foi estornada, mas o aviso traz outro id
    loja(monkeypatch, m, {ANA["uid"]: [compra("t2")]})
    assert _reembolso(client, txn="id-que-nao-conhecemos").json()["revogados"] == 1
    assert saldo(client, ANA, tid)["passe"]["chat"] == m.PASSE["chat"], "a t2 continua valendo"


def test_reembolso_sem_passe_fica_registrado_e_aparece_na_saude(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    # a loja ainda lista a compra e o id não bate: não dá para anular nada
    assert _reembolso(client, txn="id-que-nao-conhecemos").json()["revogados"] == 0
    assert "reply" in conversar(client, ANA, tid), "na dúvida, não tira o que foi pago"
    saude = client.get("/api/health").json()
    assert saude["cobranca"]["cancelamentos_sem_passe"] == 1
    with m.store.connect() as con:
        assert con.execute("SELECT tipo, resultado FROM billing_eventos").fetchall() == [("CANCELLATION", "sem_passe")]


def test_reembolso_com_a_loja_fora_do_ar_nao_anula_no_escuro(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    loja(monkeypatch, m, None)
    assert _reembolso(client, txn="id-que-nao-conhecemos").status_code == 503, "o RevenueCat tenta de novo"
    assert "reply" in conversar(client, ANA, tid)


def test_passe_reembolsado_e_explicado_e_nao_some_em_silencio(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8, name="Miami")
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    _reembolso(client)
    r = conversar(client, ANA, tid)
    assert r["error"] == "paywall" and r["motivo"] == "reembolsado"
    assert saldo(client, ANA, tid)["reembolsado"] is True
    assert saldo(client, ANA)["viagens"] == [{"id": tid, "nome": "Miami", "reembolsado": True,
                                              "restante": {"chat": 0, "gen": 0, "tip": 0}}]
    # comprou de novo: volta a valer, e deixa de constar como reembolsado
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1"), compra("t2")]})
    sincronizar(client, ANA, tid)
    assert saldo(client, ANA, tid)["reembolsado"] is False
    assert "reply" in conversar(client, ANA, tid)


def test_excluir_a_conta_apaga_o_diario_de_compras(tmp_path, monkeypatch):
    m, client = montar(tmp_path, REVENUECAT_WEBHOOK_AUTH="segredo-do-webhook")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    aviso(client, {"type": "NON_RENEWING_PURCHASE", "app_user_id": ANA["uid"], "product_id": "passe_viagem"})
    with m.store.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM billing_eventos").fetchone()[0] == 1
        m.store.excluir_conta(con, ANA["uid"])
        assert con.execute("SELECT COUNT(*) FROM billing_eventos").fetchone()[0] == 0


# ---------- o que continua valendo ----------

def test_fusivel_global_continua_acima_de_tudo(tmp_path, monkeypatch):
    m, client = montar(tmp_path, ALI_MONTHLY_CAP="1")
    tid = viagem(client, ANA, dias=8)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, tid)
    assert "reply" in conversar(client, ANA, tid)
    assert conversar(client, ANA, tid)["error"] == "ai_paused"


def test_planejar_na_mao_nunca_e_cobrado(tmp_path):
    m, client = montar(tmp_path, DEGUSTACAO_ROTEIROS="0", DEGUSTACAO_CHATS="0", DEGUSTACAO_DICAS="0")
    tid = viagem(client, ANA, dias=12)
    estado = client.get(f"/api/trips/{tid}", headers=como(ANA)).json()
    estado["state"]["notes"].append({"id": "n1", "title": "Mala", "body": "casaco"})
    r = client.put(f"/api/trips/{tid}", headers={**como(ANA), "X-Base-Version": str(estado["version"])},
                   json=estado["state"])
    assert r.status_code == 200
    assert client.put(f"/api/trips/{tid}/meta", headers=como(ANA), json={"name": "Europa"}).status_code == 200
    assert viagem(client, ANA, dias=12)


def test_uso_do_mes_segue_contando_tokens(tmp_path):
    m, client = montar(tmp_path)
    conversar(client, ANA, viagem(client, ANA, dias=1))
    uso = client.get("/api/usage", headers=como(ANA)).json()
    assert uso["quotas"] is None, "app antigo esconde o painel de cota do mês"
    assert uso["used"]["chat"] == 1 and uso["tokens"]["in"] == 100


def test_excluir_a_conta_leva_o_saldo_junto(tmp_path, monkeypatch):
    m, client = montar(tmp_path)
    monkeypatch.setattr(m.auth, "delete_user", lambda uid: True)
    loja(monkeypatch, m, {ANA["uid"]: [compra("t1")]})
    sincronizar(client, ANA, viagem(client, ANA, dias=8))
    client.delete("/api/me", headers=como(ANA))
    with m.store.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM ai_grants WHERE uid=?", (ANA["uid"],)).fetchone()[0] == 0


def test_modo_token_segue_sem_cobranca(tmp_path):
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None, COBRANCA="on")
    modulo._ali_client = _ClienteFake()
    client = TestClient(modulo.app)
    for _ in range(8):
        r = client.post("/api/ali", json={"messages": [{"role": "user", "content": "oi"}], "trip": {}}).json()
        assert "reply" in r
    assert client.get("/api/saldo").json() == {"cobranca": False}


# ---------- leitura da resposta do RevenueCat ----------

class _RespostaHttp:
    def __init__(self, status, corpo):
        self.status_code = status
        self._corpo = corpo

    def json(self):
        return self._corpo


def _http_falso(monkeypatch, status, corpo, visto):
    class Cliente:
        def __init__(self, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None):
            visto.update(url=url, headers=headers)
            return _RespostaHttp(status, corpo)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", Cliente)


@pytest.mark.parametrize("status", [200, 201])
def test_le_as_compras_avulsas_do_revenuecat(monkeypatch, status):
    import asyncio
    import billing
    visto = {}
    corpo = {"subscriber": {"non_subscriptions": {
        "passe_viagem": [
            {"id": "b2", "is_sandbox": False, "purchase_date": "2027-02-01T10:00:00Z", "store": "play_store",
             "store_transaction_id": "GPA.2"},
            {"id": "a1", "is_sandbox": True, "purchase_date": "2027-01-01T10:00:00Z", "store": "play_store"},
        ]}}}
    _http_falso(monkeypatch, status, corpo, visto)
    compras = asyncio.run(billing.compras_de("u/1", "sk_x"))
    assert [c["txn"] for c in compras] == ["a1", "b2"], "da mais antiga à mais nova"
    assert compras[0]["sandbox"] is True and compras[0]["store_txn"] is None
    assert compras[1]["produto"] == "passe_viagem" and compras[1]["store_txn"] == "GPA.2"
    assert visto["headers"] == {"Authorization": "Bearer sk_x"}
    assert visto["url"].endswith("/subscribers/u%2F1"), "o uid vai escapado na URL"


def test_resposta_ruim_do_revenuecat_nunca_vira_saldo(monkeypatch):
    import asyncio
    import billing
    _http_falso(monkeypatch, 500, {}, {})
    assert asyncio.run(billing.compras_de("u1", "sk_x")) is None
    _http_falso(monkeypatch, 200, {"subscriber": {}}, {})
    assert asyncio.run(billing.compras_de("u1", "sk_x")) == []
    assert asyncio.run(billing.compras_de("u1", "")) is None, "sem chave nem tenta"
