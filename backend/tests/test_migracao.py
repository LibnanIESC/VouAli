"""Garantias de preservação dos dados — a rede de segurança da viagem real.

Se algum destes testes falhar, existe risco de perder ou corromper a viagem
que está em produção. Nunca "conserte" um teste daqui baixando a expectativa.
"""
from conftest import load_main, read_raw, seed_legacy
from fastapi.testclient import TestClient


def test_migracao_preserva_estado_e_versao(legacy, ny_state):
    _, client, _ = legacy
    resposta = client.get("/api/state").json()
    assert resposta["state"] == ny_state, "o estado da viagem mudou na migração"
    assert resposta["version"] == 9, "a versão foi perdida na migração"


def test_migracao_mantem_backup_intocado(legacy, ny_state, tmp_path):
    _, client, data_dir = legacy
    # edita a viagem depois de migrada
    novo = dict(ny_state, notes=[{"id": "n9", "title": "Nova", "body": "x"}])
    assert client.put("/api/state", json=novo).status_code == 200
    # o registro antigo continua exatamente como estava
    backup, ver = read_raw(data_dir, "trip")
    assert backup == ny_state, "o backup k='trip' foi alterado"
    assert ver == 9


def test_migracao_e_idempotente(legacy, ny_state, tmp_path):
    """Reiniciar o servidor várias vezes não pode recriar nem duplicar nada."""
    _, client, data_dir = legacy
    client.put("/api/state", json=dict(ny_state, prebuy=[]))
    antes = client.get("/api/state").json()

    for _ in range(3):  # simula reinícios do container
        modulo = load_main(data_dir, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
        cliente = TestClient(modulo.app)
        depois = cliente.get("/api/state").json()
        assert depois == antes, "reiniciar o app alterou o estado"
        viagens = cliente.get("/api/trips").json()["trips"]
        assert len(viagens["list"]) == 1, "a migração duplicou viagens"


def test_ny_migra_com_metadados_esperados(legacy):
    _, client, _ = legacy
    ny = client.get("/api/trips").json()["trips"]["list"][0]
    assert ny["id"] == "ny" and ny["name"] == "New York"
    assert ny["currency"] == "US$" and ny["budget"] == 3000
    assert ny["adults"] == 2 and ny["children"] == 0 and ny["groupTypes"] == "Casal"
    assert ny["startDate"] == "2026-10-06" and ny["endDate"] == "2026-10-13"


def test_banco_muito_antigo_sem_coluna_de_versao(tmp_path, ny_state):
    """Bancos criados antes do versionamento continuam abrindo sem perder dados."""
    seed_legacy(tmp_path, ny_state, with_ver_column=False)
    modulo = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    client = TestClient(modulo.app)
    resposta = client.get("/api/state").json()
    assert resposta["state"] == ny_state
    assert resposta["version"] == 0
    assert client.get("/api/trips").json()["trips"]["active"] == "ny"


def test_instalacao_nova_comeca_vazia(fresh):
    _, client, _ = fresh
    assert client.get("/api/state").json() == {"state": None, "version": 0}
    assert client.get("/api/trips").json()["trips"] == {"active": None, "list": []}


def test_concorrencia_recusa_gravacao_defasada(legacy, ny_state):
    """Dois celulares editando: a gravação defasada é recusada, não sobrescreve."""
    _, client, _ = legacy
    # celular A grava sobre a versão 9
    assert client.put("/api/state", json=dict(ny_state, prebuy=[]), headers={"X-Base-Version": "9"}).json()["version"] == 10
    # celular B ainda achava que estava na 9
    conflito = client.put("/api/state", json=dict(ny_state, notes=[]), headers={"X-Base-Version": "9"})
    assert conflito.status_code == 409
    # e o dado do celular A continua lá
    assert client.get("/api/state").json()["state"]["prebuy"] == []


def test_estado_invalido_e_recusado(legacy):
    _, client, _ = legacy
    assert client.put("/api/state", content=b"nao e json").status_code == 400
