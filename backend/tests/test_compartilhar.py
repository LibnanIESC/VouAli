"""Compartilhamento de viagem: convite, convite pendente e remoção."""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient

ANA = {"uid": "u-ana", "email": "ana@exemplo.com", "name": "Ana"}
BRUNO = {"uid": "u-bruno", "email": "bruno@exemplo.com", "name": "Bruno"}
CARLA = {"uid": "u-carla", "email": "carla@exemplo.com", "name": "Carla"}


@pytest.fixture
def app_multi(tmp_path):
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="", ANTHROPIC_API_KEY=None)
    pessoas = {p["uid"]: p for p in (ANA, BRUNO, CARLA)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    return modulo, TestClient(modulo.app)


def como(p):
    return {"Authorization": f"Bearer {p['uid']}"}


def criar(client, pessoa, nome="Nossa viagem"):
    return client.post("/api/trips", headers=como(pessoa), json={"name": nome}).json()["meta"]["id"]


def test_convidar_quem_ja_tem_conta_entra_na_hora(app_multi):
    _, client = app_multi
    client.get("/api/me", headers=como(BRUNO))          # Bruno já usou o app
    tid = criar(client, ANA)
    r = client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]}).json()
    assert r["status"] == "member"
    assert sorted(m["uid"] for m in r["members"]) == ["u-ana", "u-bruno"]
    # e o Bruno já enxerga a viagem
    assert [t["name"] for t in client.get("/api/trips", headers=como(BRUNO)).json()["trips"]["list"]] == ["Nossa viagem"]


def test_convite_para_quem_ainda_nao_tem_conta_fica_pendente(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    r = client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": "carla@exemplo.com"}).json()
    assert r["status"] == "pending"
    assert [i["email"] for i in r["invites"]] == ["carla@exemplo.com"]
    assert len(r["members"]) == 1                       # ainda só a Ana


def test_convite_pendente_e_resgatado_no_primeiro_login(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": CARLA["email"]})

    # Carla entra no app pela primeira vez
    lista = client.get("/api/trips", headers=como(CARLA)).json()["trips"]["list"]
    assert [t["name"] for t in lista] == ["Nossa viagem"]
    assert lista[0]["role"] == "editor"
    # o convite deixou de estar pendente
    assert client.get(f"/api/trips/{tid}/members", headers=como(ANA)).json()["invites"] == []


def test_email_com_maiusculas_e_espacos_funciona(app_multi):
    _, client = app_multi
    client.get("/api/me", headers=como(BRUNO))
    tid = criar(client, ANA)
    r = client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": "  BRUNO@Exemplo.COM  "}).json()
    assert r["status"] == "member"


def test_so_o_dono_convida(app_multi):
    _, client = app_multi
    client.get("/api/me", headers=como(BRUNO))
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    # Bruno é editor: não pode convidar nem remover
    assert client.post(f"/api/trips/{tid}/members", headers=como(BRUNO), json={"email": CARLA["email"]}).status_code == 403
    assert client.delete(f"/api/trips/{tid}/members/{ANA['uid']}", headers=como(BRUNO)).status_code == 403


def test_estranho_nao_ve_nem_convida(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    assert client.get(f"/api/trips/{tid}/members", headers=como(CARLA)).status_code == 404
    assert client.post(f"/api/trips/{tid}/members", headers=como(CARLA), json={"email": "x@y.com"}).status_code == 403


def test_dono_remove_membro_e_ele_perde_acesso(app_multi):
    _, client = app_multi
    client.get("/api/me", headers=como(BRUNO))
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    r = client.delete(f"/api/trips/{tid}/members/{BRUNO['uid']}", headers=como(ANA)).json()
    assert [m["uid"] for m in r["members"]] == ["u-ana"]
    assert client.get(f"/api/trips/{tid}", headers=como(BRUNO)).status_code == 404


def test_dono_nao_pode_ser_removido(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    assert client.delete(f"/api/trips/{tid}/members/{ANA['uid']}", headers=como(ANA)).status_code == 400


def test_cancelar_convite_pendente(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": CARLA["email"]})
    r = client.delete(f"/api/trips/{tid}/members/carla@exemplo.com", headers=como(ANA)).json()
    assert r["invites"] == []
    # e a Carla, ao entrar, não recebe nada
    assert client.get("/api/trips", headers=como(CARLA)).json()["trips"]["list"] == []


def test_email_invalido_e_convite_a_si_mesmo(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    assert client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": "sem-arroba"}).status_code == 400
    assert client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": ANA["email"]}).status_code == 400


def test_convite_para_viagem_apagada_nao_ressuscita(app_multi):
    _, client = app_multi
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": CARLA["email"]})
    client.delete(f"/api/trips/{tid}", headers=como(ANA))
    assert client.get("/api/trips", headers=como(CARLA)).json()["trips"]["list"] == []


def test_membros_trazem_papel_e_dados_de_contato(app_multi):
    _, client = app_multi
    client.get("/api/me", headers=como(BRUNO))
    tid = criar(client, ANA)
    client.post(f"/api/trips/{tid}/members", headers=como(ANA), json={"email": BRUNO["email"]})
    r = client.get(f"/api/trips/{tid}/members", headers=como(BRUNO)).json()
    assert r["role"] == "editor"
    dono = next(m for m in r["members"] if m["role"] == "owner")
    assert dono["email"] == "ana@exemplo.com" and dono["name"] == "Ana"
