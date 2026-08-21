"""Isolamento entre usuários — o teste mais importante do produto público.

Se algum destes falhar, um usuário pode ver ou alterar a viagem de outro.
Nunca "conserte" um teste daqui afrouxando a expectativa.
"""
import json

import pytest
from conftest import load_main
from fastapi.testclient import TestClient

ANA = {"uid": "u-ana", "email": "ana@exemplo.com", "name": "Ana"}
BRUNO = {"uid": "u-bruno", "email": "bruno@exemplo.com", "name": "Bruno"}


@pytest.fixture
def app_multi(tmp_path, monkeypatch):
    """App no modo firebase, com verificação de token simulada.

    O token enviado é só o uid — assim testamos as REGRAS de acesso sem
    depender da rede nem de credenciais do Firebase.
    """
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="", ANTHROPIC_API_KEY=None)
    modulo.store.DATABASE_URL = ""          # usa SQLite no teste, mesmo SQL do Postgres
    modulo.store._ready = False
    pessoas = {p["uid"]: p for p in (ANA, BRUNO)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    return modulo, TestClient(modulo.app)


def como(pessoa):
    return {"Authorization": f"Bearer {pessoa['uid']}"}


def criar_viagem(client, pessoa, nome, **extra):
    return client.post("/api/trips", headers=como(pessoa), json={"name": nome, **extra}).json()["meta"]["id"]


# ---------- porta de entrada ----------

def test_sem_token_ninguem_entra(app_multi):
    _, client = app_multi
    for metodo, rota in [("get", "/api/state"), ("get", "/api/trips"), ("get", "/api/me")]:
        assert getattr(client, metodo)(rota).status_code == 401, rota
    assert client.post("/api/trips", json={"name": "X"}).status_code == 401


def test_token_invalido_e_recusado(app_multi):
    _, client = app_multi
    assert client.get("/api/trips", headers={"Authorization": "Bearer token-falso"}).status_code == 401


def test_primeiro_acesso_cria_a_conta(app_multi):
    _, client = app_multi
    r = client.get("/api/me", headers=como(ANA)).json()
    assert r["mode"] == "firebase" and r["user"]["email"] == "ana@exemplo.com"


def test_usuario_novo_comeca_sem_viagens(app_multi):
    _, client = app_multi
    assert client.get("/api/trips", headers=como(ANA)).json()["trips"] == {"active": None, "list": []}
    assert client.get("/api/state", headers=como(ANA)).json() == {"state": None, "version": 0}


# ---------- isolamento ----------

def test_bruno_nao_ve_a_viagem_da_ana(app_multi):
    _, client = app_multi
    criar_viagem(client, ANA, "Paris da Ana")
    lista = client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"]
    assert lista == [], "a viagem da Ana apareceu para o Bruno"


def test_bruno_nao_le_a_viagem_da_ana_nem_com_o_id(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Paris da Ana")
    assert client.get(f"/api/trips/{tid}", headers=como(BRUNO)).status_code == 404


def test_bruno_nao_escreve_na_viagem_da_ana(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Paris da Ana")
    invasao = {"days": [{"id": "x", "title": "invadido", "stops": []}], "budget": [], "prebuy": [], "notes": []}
    assert client.put(f"/api/trips/{tid}", headers=como(BRUNO), json=invasao).status_code == 404
    # e o dado da Ana continua intacto
    assert client.get(f"/api/trips/{tid}", headers=como(ANA)).json()["state"]["days"] == []


def test_bruno_nao_altera_metadados_alheios(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Paris da Ana")
    assert client.put(f"/api/trips/{tid}/meta", headers=como(BRUNO), json={"name": "Roubada"}).status_code == 404
    meta = client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"][0]
    assert meta["name"] == "Paris da Ana"


def test_bruno_nao_apaga_viagem_alheia(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Paris da Ana")
    assert client.delete(f"/api/trips/{tid}", headers=como(BRUNO)).status_code == 404
    assert len(client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"]) == 1


def test_bruno_nao_ativa_viagem_alheia(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Paris da Ana")
    assert client.put("/api/active", headers=como(BRUNO), json={"id": tid}).status_code == 404
    assert client.get("/api/state", headers=como(BRUNO)).json()["state"] is None


def test_cada_um_tem_a_propria_viagem_ativa(app_multi):
    _, client = app_multi
    criar_viagem(client, ANA, "Paris")
    criar_viagem(client, BRUNO, "Tóquio")
    assert client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"][0]["name"] == "Paris"
    assert client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"][0]["name"] == "Tóquio"


# ---------- compartilhamento ----------

def test_convidado_passa_a_ver_e_editar(app_multi):
    modulo, client = app_multi
    tid = criar_viagem(client, ANA, "Nossa viagem")
    with modulo.store.connect() as con:                     # convite (API vem depois)
        modulo.store.upsert_user(con, BRUNO["uid"], BRUNO["email"], BRUNO["name"])
        modulo.store.add_member(con, tid, BRUNO["uid"], "editor")

    lista = client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"]
    assert [m["name"] for m in lista] == ["Nossa viagem"]
    assert lista[0]["role"] == "editor"

    novo = {"days": [{"id": "d1", "title": "Dia do Bruno", "stops": []}], "budget": [], "prebuy": [], "notes": []}
    assert client.put(f"/api/trips/{tid}", headers=como(BRUNO), json=novo).json()["ok"] is True
    # a Ana vê a edição do Bruno
    assert client.get(f"/api/trips/{tid}", headers=como(ANA)).json()["state"]["days"][0]["title"] == "Dia do Bruno"


def test_convidado_que_sai_nao_apaga_a_viagem_do_dono(app_multi):
    modulo, client = app_multi
    tid = criar_viagem(client, ANA, "Nossa viagem")
    with modulo.store.connect() as con:
        modulo.store.upsert_user(con, BRUNO["uid"], BRUNO["email"], BRUNO["name"])
        modulo.store.add_member(con, tid, BRUNO["uid"], "editor")

    client.delete(f"/api/trips/{tid}", headers=como(BRUNO))          # Bruno só sai
    assert client.get(f"/api/trips/{tid}", headers=como(BRUNO)).status_code == 404
    assert client.get(f"/api/trips/{tid}", headers=como(ANA)).status_code == 200


def test_dono_nao_pode_ser_removido_da_propria_viagem(app_multi):
    modulo, client = app_multi
    tid = criar_viagem(client, ANA, "Minha")
    with modulo.store.connect() as con:
        assert modulo.store.remove_member(con, tid, ANA["uid"]) is False
        assert modulo.store.role_of(con, tid, ANA["uid"]) == "owner"


# ---------- comportamento do app ----------

def test_state_segue_a_viagem_ativa_do_usuario(app_multi):
    _, client = app_multi
    criar_viagem(client, ANA, "Primeira")
    segunda = criar_viagem(client, ANA, "Segunda")       # criar já torna ativa
    roteiro = {"days": [{"id": "d", "title": "Só da segunda", "stops": []}], "budget": [], "prebuy": [], "notes": []}
    client.put("/api/state", headers=como(ANA), json=roteiro)
    assert client.get("/api/state", headers=como(ANA)).json()["state"]["days"][0]["title"] == "Só da segunda"
    assert client.get("/api/trips", headers=como(ANA)).json()["trips"]["active"] == segunda


def test_concorrencia_tambem_vale_entre_membros(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Viagem")
    vazio = {"days": [], "budget": [], "prebuy": [], "notes": []}
    v1 = client.put(f"/api/trips/{tid}", headers={**como(ANA), "X-Base-Version": "0"}, json=vazio).json()["version"]
    assert v1 == 1
    r = client.put(f"/api/trips/{tid}", headers={**como(ANA), "X-Base-Version": "0"}, json=vazio)
    assert r.status_code == 409


def test_metadados_completos_sao_preservados(app_multi):
    _, client = app_multi
    tid = criar_viagem(client, ANA, "Bruxelas", currency="€", budget=2500, adults=2, children=1,
                       groupTypes="Família", interests="Museus", startDate="2026-11-01", endDate="2026-11-12")
    meta = client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"][0]
    assert meta["currency"] == "€" and meta["budget"] == 2500
    assert meta["adults"] == 2 and meta["children"] == 1 and meta["groupTypes"] == "Família"
    assert meta["role"] == "owner"


def test_viagem_pode_nascer_com_roteiro_gerado(app_multi):
    _, client = app_multi
    roteiro = {"days": [{"id": "d", "title": "Dia 1", "stops": []}], "budget": [], "prebuy": [], "notes": []}
    tid = client.post("/api/trips", headers=como(ANA), json={"name": "Roma", "data": roteiro}).json()["meta"]["id"]
    assert client.get(f"/api/trips/{tid}", headers=como(ANA)).json()["state"]["days"][0]["title"] == "Dia 1"


def test_credencial_invalida_nao_derruba_o_app(tmp_path):
    """Se a credencial for colada errada, o app tem que continuar de pé e
    dizer qual é o problema — nunca responder erro 500."""
    modulo = load_main(tmp_path, AUTH_MODE="firebase", DATABASE_URL="",
                       FIREBASE_CREDENTIALS='{"type":"service_account"}',   # incompleta
                       ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    saude = client.get("/api/health")
    assert saude.status_code == 200
    estado = saude.json()["authMode"]
    assert estado["mode"] == "firebase" and estado["ready"] is False
    assert estado["error"], "o health precisa dizer o que houve"
    # e ninguém entra com credencial quebrada
    assert client.get("/api/trips", headers={"Authorization": "Bearer x"}).status_code == 401


def test_config_publica_nao_vaza_segredo(app_multi):
    _, client = app_multi
    cfg = client.get("/api/config").json()          # sem token, de propósito
    assert cfg["authMode"] == "firebase"
    texto = json.dumps(cfg)
    assert "private_key" not in texto and "FIREBASE_CREDENTIALS" not in texto
