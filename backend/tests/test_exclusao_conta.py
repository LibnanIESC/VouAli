"""Exclusão de conta — exigência do Google para publicar na Play Store.

É a operação mais destrutiva do app e não tem desfazer. Estes testes fixam
exatamente o que ela leva e, sobretudo, o que ela NÃO pode levar: o dado de
outra pessoa.
"""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient

ANA = {"uid": "u-ana", "email": "ana@exemplo.com", "name": "Ana"}
BRUNO = {"uid": "u-bruno", "email": "bruno@exemplo.com", "name": "Bruno"}


@pytest.fixture
def app_multi(tmp_path):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="", ANTHROPIC_API_KEY=None)
    modulo.store.DATABASE_URL = ""
    modulo.store._ready = False
    pessoas = {p["uid"]: p for p in (ANA, BRUNO)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    apagados = []
    modulo.auth.delete_user = lambda uid: (apagados.append(uid), True)[1]
    return modulo, TestClient(modulo.app), apagados


def como(p):
    return {"Authorization": f"Bearer {p['uid']}"}


def criar(client, pessoa, nome):
    return client.post("/api/trips", headers=como(pessoa), json={"name": nome}).json()["meta"]["id"]


def test_previa_avisa_o_que_sera_apagado(app_multi):
    _, client, _ = app_multi
    criar(client, ANA, "Roma")
    tid = criar(client, ANA, "Lisboa")
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    client.get("/api/me", headers=como(BRUNO))          # Bruno aceita o convite
    do_bruno = criar(client, BRUNO, "Tóquio")
    client.post(f"/api/trips/{do_bruno}/members", headers=como(BRUNO), json={"email": ANA["email"]})
    client.get("/api/me", headers=como(ANA))

    r = client.get("/api/me/exclusao", headers=como(ANA)).json()
    assert r == {"minhas": 2, "convidado": 1, "compartilhadas": 1}


def test_exclusao_apaga_a_conta_e_as_viagens_dela(app_multi):
    modulo, client, apagados = app_multi
    criar(client, ANA, "Roma")
    assert client.delete("/api/me", headers=como(ANA)).json()["ok"] is True
    assert apagados == [ANA["uid"]], "o login no Firebase também tem de sair"

    # Entrando de novo, a conta nasce vazia: nada sobrou.
    assert client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"] == []


def test_nao_leva_junto_a_viagem_de_outra_pessoa(app_multi):
    """O teste que não pode falhar: sair não é destruir o dado alheio."""
    _, client, _ = app_multi
    do_bruno = criar(client, BRUNO, "Tóquio")
    client.post(f"/api/trips/{do_bruno}/members", headers=como(BRUNO), json={"email": ANA["email"]})
    client.get("/api/me", headers=como(ANA))
    assert len(client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"]) == 1

    client.delete("/api/me", headers=como(ANA))

    viagens = client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"]
    assert [v["id"] for v in viagens] == [do_bruno], "a viagem do Bruno tinha de continuar lá"
    membros = client.get(f"/api/trips/{do_bruno}/members", headers=como(BRUNO)).json()["members"]
    assert ANA["email"] not in [m.get("email") for m in membros], "a Ana devia ter saído da viagem"


def test_a_viagem_que_eu_criei_some_para_quem_convidei(app_multi):
    """Consequência declarada na tela: o dado é do dono, e vai com ele."""
    _, client, _ = app_multi
    tid = criar(client, ANA, "Lisboa")
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    client.get("/api/me", headers=como(BRUNO))
    assert len(client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"]) == 1

    client.delete("/api/me", headers=como(ANA))
    assert client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"] == []
    assert client.get(f"/api/trips/{tid}", headers=como(BRUNO)).status_code == 404


def test_convite_pendente_para_o_meu_email_tambem_some(app_multi):
    """Senão a conta apagada voltaria a existir sozinha no próximo convite."""
    modulo, client, _ = app_multi
    do_bruno = criar(client, BRUNO, "Tóquio")
    client.post(f"/api/trips/{do_bruno}/members", headers=como(BRUNO), json={"email": ANA["email"]})
    client.delete("/api/me", headers=como(ANA))        # Ana nunca chegou a aceitar

    client.get("/api/me", headers=como(ANA))           # entra de novo, do zero
    assert client.get("/api/trips", headers=como(ANA)).json()["trips"]["list"] == []


def test_o_consumo_de_ia_do_mes_some_com_a_conta(app_multi):
    modulo, client, _ = app_multi
    con = modulo.store.connect()
    modulo.store.ensure_schema()
    modulo.store.upsert_user(con, ANA["uid"], ANA["email"], ANA["name"])
    modulo.store.registrar_uso(con, ANA["uid"], "chat", 100, 200)
    con.commit()
    assert modulo.store.uso_do_usuario(con, ANA["uid"])["chat"] == 1
    con.close()

    client.delete("/api/me", headers=como(ANA))

    con = modulo.store.connect()
    assert modulo.store.uso_do_usuario(con, ANA["uid"])["chat"] == 0
    con.close()


def test_exclusao_exige_estar_logado(app_multi):
    _, client, _ = app_multi
    assert client.delete("/api/me").status_code == 401
    assert client.delete("/api/me", headers={"Authorization": "Bearer intruso"}).status_code == 401
