"""Fixtures dos testes.

O main.py lê configuração (DATA_DIR, TRIP_TOKEN…) no momento do import, então
cada teste carrega uma instância nova do módulo apontando para um banco
temporário. Assim os testes não interferem entre si nem tocam dados reais.
"""
import importlib
import importlib.util
import json
import os
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
_counter = 0

# Variáveis lidas pelo app. São zeradas antes de cada carga para um teste não
# herdar a configuração do anterior.
APP_VARS = [
    "TRIP_TOKEN", "ANTHROPIC_API_KEY", "ALI_MODEL", "ALI_RATE_MAX", "ALI_RATE_WINDOW",
    "AUTH_MODE", "DATABASE_URL", "ENVIRONMENT",
    "FIREBASE_CREDENTIALS", "FIREBASE_PROJECT_ID", "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID",
]


def load_main(data_dir, **env):
    """Importa um main.py isolado com o ambiente pedido.

    `auth` e `store` leem configuração no import; como o Python guarda módulos
    em cache, eles são recarregados aqui para enxergar o ambiente deste teste.
    """
    global _counter
    _counter += 1
    for key in APP_VARS:
        os.environ.pop(key, None)
    os.environ["DATA_DIR"] = str(data_dir)
    for key, value in env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = str(value)

    import auth
    import store
    importlib.reload(auth)
    importlib.reload(store)

    spec = importlib.util.spec_from_file_location(f"vouali_main_{_counter}", BACKEND / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def seed_legacy(data_dir, state, ver=1, with_ver_column=True):
    """Cria um banco no formato ANTIGO (viagem única em k='trip')."""
    db = Path(data_dir) / "trip.db"
    con = sqlite3.connect(db)
    if with_ver_column:
        con.execute("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT, ver INTEGER DEFAULT 0)")
        con.execute("INSERT INTO kv(k,v,ver) VALUES('trip',?,?)", (json.dumps(state), ver))
    else:  # banco muito antigo, sem a coluna de versão
        con.execute("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)")
        con.execute("INSERT INTO kv(k,v) VALUES('trip',?)", (json.dumps(state),))
    con.commit()
    con.close()
    return db


def read_raw(data_dir, key):
    """Lê uma chave crua do banco (para conferir o backup intocado)."""
    con = sqlite3.connect(Path(data_dir) / "trip.db")
    row = con.execute("SELECT v, ver FROM kv WHERE k=?", (key,)).fetchone()
    con.close()
    return (json.loads(row[0]), row[1]) if row else (None, None)


@pytest.fixture
def ny_state():
    """Estado parecido com a viagem real de NY."""
    return {
        "days": [{
            "id": "qua", "label": "QUA", "date": "7 OUT", "title": "Chegada + Midtown",
            "sub": "Dia leve", "color": "#6d6e71", "line": "S",
            "stops": [{"id": "s1", "t": "10h", "n": "NY Public Library", "d": "Rose Room",
                       "getting": "a pé", "todo": "subir", "insight": "entrada gratuita",
                       "link": "", "done": False}],
        }],
        "budget": [{"id": "b1", "k": "Metrô (2 pessoas)", "v": 70, "spent": 20, "tag": "transporte"}],
        "prebuy": [{"id": "p1", "text": "Ingresso do Met", "done": False}],
        "notes": [{"id": "n1", "title": "OMNY", "body": "teto de US$35 na semana"}],
    }


@pytest.fixture
def fresh(tmp_path):
    """Instalação nova, sem dados e sem senha."""
    module = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    return module, TestClient(module.app), tmp_path


@pytest.fixture
def legacy(tmp_path, ny_state):
    """Banco antigo (viagem única) já migrado pelo app na primeira leitura."""
    seed_legacy(tmp_path, ny_state, ver=9)
    module = load_main(tmp_path, TRIP_TOKEN="", ANTHROPIC_API_KEY=None)
    return module, TestClient(module.app), tmp_path
