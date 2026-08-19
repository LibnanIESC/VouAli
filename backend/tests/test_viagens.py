"""Múltiplas viagens: criação, troca, metadados e exclusão."""
import json
import sqlite3
from pathlib import Path


def criar(client, **campos):
    return client.post("/api/trips", json=campos).json()


def test_criar_viagem_com_todos_os_metadados(fresh):
    _, client, _ = fresh
    meta = criar(client, name="Bruxelas", destination="Bruxelas, Bélgica", currency="€",
                 budget=2500, startDate="2026-11-01", endDate="2026-11-12",
                 dateLabel="1 – 12 novembro", interests="Museus, Restaurantes",
                 adults=2, children=1, groupTypes="Família")["meta"]
    assert meta["currency"] == "€" and meta["budget"] == 2500
    assert meta["adults"] == 2 and meta["children"] == 1
    assert meta["groupTypes"] == "Família" and meta["interests"] == "Museus, Restaurantes"


def test_viagem_nova_nasce_vazia_e_vira_ativa(fresh):
    _, client, _ = fresh
    tid = criar(client, name="Lisboa")["meta"]["id"]
    assert client.get("/api/trips").json()["trips"]["active"] == tid
    assert client.get(f"/api/trips/{tid}").json()["state"] == {"days": [], "budget": [], "prebuy": [], "notes": []}


def test_viagem_pode_nascer_com_roteiro_gerado(fresh):
    _, client, _ = fresh
    roteiro = {"days": [{"id": "d", "title": "Dia 1", "stops": []}], "budget": [], "prebuy": [], "notes": []}
    tid = criar(client, name="Roma", data=roteiro)["meta"]["id"]
    assert client.get(f"/api/trips/{tid}").json()["state"]["days"][0]["title"] == "Dia 1"


def test_trocar_viagem_ativa_muda_o_que_state_devolve(legacy, ny_state):
    _, client, _ = legacy
    tid = criar(client, name="Paris")["meta"]["id"]          # já vira a ativa
    assert client.get("/api/state").json()["state"]["days"] == []
    client.put("/api/active", json={"id": "ny"})
    assert client.get("/api/state").json()["state"] == ny_state


def test_editar_meta_altera_so_o_campo_enviado(fresh):
    _, client, _ = fresh
    tid = criar(client, name="Tóquio", currency="¥", budget=8000, adults=2, groupTypes="Casal")["meta"]["id"]
    client.put(f"/api/trips/{tid}/meta", json={"budget": 9500})
    meta = next(m for m in client.get("/api/trips").json()["trips"]["list"] if m["id"] == tid)
    assert meta["budget"] == 9500
    assert meta["currency"] == "¥" and meta["adults"] == 2 and meta["groupTypes"] == "Casal"


def test_excluir_viagem_remove_estado_e_reelege_ativa(legacy):
    _, client, _ = legacy
    tid = criar(client, name="Descartável")["meta"]["id"]
    client.delete(f"/api/trips/{tid}")
    assert client.get(f"/api/trips/{tid}").status_code == 404
    assert client.get("/api/trips").json()["trips"]["active"] == "ny"


def test_viagem_legada_recebe_padroes(fresh, tmp_path):
    """Viagens criadas antes dos campos novos não podem quebrar a listagem."""
    _, client, data_dir = fresh
    criar(client, name="Antiga")
    con = sqlite3.connect(Path(data_dir) / "trip.db")
    trips = json.loads(con.execute("SELECT v FROM kv WHERE k='trips'").fetchone()[0])
    trips["list"].append({"id": "velha", "name": "Sem campos"})   # meta incompleta
    con.execute("UPDATE kv SET v=? WHERE k='trips'", (json.dumps(trips),))
    con.commit()
    con.close()

    velha = next(m for m in client.get("/api/trips").json()["trips"]["list"] if m["id"] == "velha")
    assert velha["currency"] == "US$" and velha["budget"] == 0
    assert velha["adults"] == 1 and velha["children"] == 0
    assert velha["interests"] == "" and velha["groupTypes"] == ""


def test_health_responde_sem_senha(tmp_path):
    from conftest import load_main
    from fastapi.testclient import TestClient
    modulo = load_main(tmp_path, TRIP_TOKEN="segredo", ENVIRONMENT="staging", ANTHROPIC_API_KEY=None)
    saude = TestClient(modulo.app).get("/api/health").json()
    assert saude["ok"] is True and saude["environment"] == "staging"
    assert saude["auth"] is True and saude["ai"] is False


def test_viagem_inexistente_responde_404(fresh):
    _, client, _ = fresh
    assert client.get("/api/trips/nao-existe").status_code == 404
    assert client.put("/api/trips/nao-existe", json={"days": []}).status_code == 404
    assert client.put("/api/active", json={"id": "nao-existe"}).status_code == 404


def test_senha_protege_todas_as_rotas(tmp_path):
    from conftest import load_main
    from fastapi.testclient import TestClient
    modulo = load_main(tmp_path, TRIP_TOKEN="segredo", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/trips").status_code == 401
    assert client.post("/api/ali", json={}).status_code == 401
    assert client.put("/api/state", json={"days": []}).status_code == 401
    assert client.get("/api/state", headers={"X-Trip-Token": "segredo"}).status_code == 200
