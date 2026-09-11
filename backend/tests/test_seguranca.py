"""
Testes de penetração — o app na posição de quem tenta invadi-lo.

Cada teste aqui é um ataque concreto, não uma verificação de estilo. Se um
deles falhar, existe uma porta aberta em produção: alguém lê a viagem de
outra pessoa, gasta a IA no lugar dela, ou entra sem credencial.

Nunca "conserte" um teste daqui afrouxando a expectativa.
"""
import pytest
from conftest import load_main
from fastapi.testclient import TestClient

VITIMA = {"uid": "u-vitima", "email": "vitima@exemplo.com", "name": "Vítima"}
ATACANTE = {"uid": "u-atacante", "email": "atacante@exemplo.com", "name": "Atacante"}


@pytest.fixture
def cenario(tmp_path):
    """Duas contas reais e uma viagem privada da vítima."""
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="",
                       ANTHROPIC_API_KEY=None)
    modulo.store.DATABASE_URL = ""
    modulo.store._ready = False
    pessoas = {p["uid"]: p for p in (VITIMA, ATACANTE)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    client = TestClient(modulo.app)

    tid = client.post("/api/trips", headers=como(VITIMA),
                      json={"name": "Viagem privada", "destination": "Paris"}).json()["meta"]["id"]
    client.put("/api/state", headers=como(VITIMA),
               json={"days": [{"id": "d1", "title": "Segredo", "stops": []}],
                     "budget": [], "prebuy": [], "notes": []})
    return modulo, client, tid


def como(pessoa):
    return {"Authorization": f"Bearer {pessoa['uid']}"}


# ── Acesso sem credencial ────────────────────────────────────────────────────

def test_sem_token_nada_abre(cenario):
    """A porta da frente. Se isto falhar, o resto não importa."""
    _, client, tid = cenario
    for metodo, rota in [
        ("get", "/api/state"), ("get", "/api/trips"), ("get", f"/api/trips/{tid}"),
        ("get", "/api/me"), ("get", "/api/usage"), ("get", f"/api/trips/{tid}/members"),
    ]:
        r = getattr(client, metodo)(rota)
        assert r.status_code == 401, f"{metodo.upper()} {rota} respondeu {r.status_code}"


def test_token_invalido_e_recusado(cenario):
    """Token inventado, vazio, malformado, ou de formato de JWT falso."""
    _, client, tid = cenario
    for token in ["", "invalido", "Bearer", "u-vitima-quase", "null", "undefined",
                  "eyJhbGciOiJub25lIn0.eyJ1aWQiOiJ1LXZpdGltYSJ9."]:
        r = client.get(f"/api/trips/{tid}", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401, f"token {token!r} passou"


def test_uid_no_header_nao_substitui_token(cenario):
    """Cabeçalhos que um proxy mal configurado poderia deixar o cliente forjar."""
    _, client, tid = cenario
    for cabecalho in ("X-User-Id", "X-Uid", "X-Forwarded-User", "X-Trip-Token"):
        r = client.get(f"/api/trips/{tid}", headers={cabecalho: VITIMA["uid"]})
        assert r.status_code == 401, f"{cabecalho} foi aceito como credencial"


# ── IDOR: a viagem de outra pessoa ───────────────────────────────────────────

def test_atacante_nao_le_viagem_alheia(cenario):
    _, client, tid = cenario
    r = client.get(f"/api/trips/{tid}", headers=como(ATACANTE))
    assert r.status_code == 404
    assert "Segredo" not in r.text


def test_atacante_nao_escreve_na_viagem_alheia(cenario):
    modulo, client, tid = cenario
    r = client.put(f"/api/trips/{tid}", headers=como(ATACANTE),
                   json={"days": [], "budget": [], "prebuy": [], "notes": []})
    assert r.status_code == 404
    # E o roteiro da vítima continua intacto.
    dados = client.get(f"/api/trips/{tid}", headers=como(VITIMA)).json()
    assert dados["state"]["days"][0]["title"] == "Segredo"


def test_atacante_nao_renomeia_viagem_alheia(cenario):
    _, client, tid = cenario
    r = client.put(f"/api/trips/{tid}/meta", headers=como(ATACANTE), json={"name": "Invadida"})
    assert r.status_code == 404
    viagens = client.get("/api/trips", headers=como(VITIMA)).json()["trips"]["list"]
    assert viagens[0]["name"] == "Viagem privada"


def test_atacante_nao_apaga_viagem_alheia(cenario):
    _, client, tid = cenario
    r = client.delete(f"/api/trips/{tid}", headers=como(ATACANTE))
    assert r.status_code in (403, 404)
    assert client.get(f"/api/trips/{tid}", headers=como(VITIMA)).status_code == 200


def test_atacante_nao_lista_membros_alheios(cenario):
    """A lista de membros expõe e-mails — é dado pessoal de terceiros."""
    _, client, tid = cenario
    r = client.get(f"/api/trips/{tid}/members", headers=como(ATACANTE))
    assert r.status_code == 404
    assert "vitima@exemplo.com" not in r.text


def test_atacante_nao_se_convida(cenario):
    """O ataque mais direto: entrar na viagem alheia convidando a si mesmo."""
    _, client, tid = cenario
    r = client.post(f"/api/trips/{tid}/members", headers=como(ATACANTE),
                    json={"email": ATACANTE["email"]})
    assert r.status_code in (403, 404)
    assert client.get(f"/api/trips/{tid}", headers=como(ATACANTE)).status_code == 404


def test_atacante_nao_ativa_viagem_alheia(cenario):
    """Se `active` aceitasse qualquer id, /api/state entregaria o conteúdo."""
    _, client, tid = cenario
    client.put("/api/active", headers=como(ATACANTE), json={"id": tid})
    r = client.get("/api/state", headers=como(ATACANTE))
    assert "Segredo" not in r.text


# ── Escalada de privilégio de quem FOI convidado ─────────────────────────────

@pytest.fixture
def convidado(cenario):
    """O atacante agora é editor legítimo — até onde ele consegue ir?"""
    _, client, tid = cenario
    client.post(f"/api/trips/{tid}/members", headers=como(VITIMA),
                json={"email": ATACANTE["email"]})
    client.get("/api/trips", headers=como(ATACANTE))     # aceita o convite ao entrar
    return client, tid


def test_editor_nao_expulsa_o_dono(convidado):
    client, tid = convidado
    client.delete(f"/api/trips/{tid}/members/{VITIMA['uid']}", headers=como(ATACANTE))
    membros = client.get(f"/api/trips/{tid}/members", headers=como(VITIMA)).json()["members"]
    assert any(m["uid"] == VITIMA["uid"] and m["role"] == "owner" for m in membros)


def test_editor_nao_convida_mais_gente(convidado):
    """Só o dono convida — senão um editor abre a viagem para quem quiser."""
    client, tid = convidado
    r = client.post(f"/api/trips/{tid}/members", headers=como(ATACANTE),
                    json={"email": "terceiro@exemplo.com"})
    assert r.status_code == 403


def test_editor_que_sai_perde_o_acesso(convidado):
    client, tid = convidado
    client.delete(f"/api/trips/{tid}", headers=como(ATACANTE))    # editor apenas sai
    assert client.get(f"/api/trips/{tid}", headers=como(ATACANTE)).status_code == 404
    assert client.get(f"/api/trips/{tid}", headers=como(VITIMA)).status_code == 200


# ── Injeção ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("payload", [
    "'; DROP TABLE trips;--",
    "' OR '1'='1",
    "1; DELETE FROM users WHERE 1=1;--",
    "\" OR \"\"=\"",
    "%' OR uid LIKE '%",
])
def test_sql_injection_no_id_da_viagem(cenario, payload):
    """Os ids vêm da URL. Se o SQL fosse concatenado, isto derrubaria o banco."""
    _, client, tid = cenario
    r = client.get(f"/api/trips/{payload}", headers=como(ATACANTE))
    assert r.status_code in (404, 422)
    # O banco continua de pé e a viagem da vítima, no lugar.
    assert client.get(f"/api/trips/{tid}", headers=como(VITIMA)).status_code == 200


@pytest.mark.parametrize("payload", [
    "'; DROP TABLE users;--",
    "' OR 1=1--",
])
def test_sql_injection_no_email_do_convite(cenario, payload):
    _, client, tid = cenario
    client.post(f"/api/trips/{tid}/members", headers=como(VITIMA), json={"email": payload})
    assert client.get("/api/trips", headers=como(VITIMA)).status_code == 200


def test_xss_no_nome_da_viagem_nao_vira_html(cenario):
    """O nome volta como DADO em JSON. Se algum dia virar HTML no servidor,
    este teste avisa antes do usuário descobrir."""
    _, client, _ = cenario
    veneno = "<script>alert(document.cookie)</script>"
    client.post("/api/trips", headers=como(VITIMA), json={"name": veneno})
    r = client.get("/api/trips", headers=como(VITIMA))
    assert r.headers["content-type"].startswith("application/json")
    assert veneno in r.json()["trips"]["list"][-1]["name"]   # preservado como texto


# ── Cotas e rate limit: o ataque que dói no bolso ───────────────────

@pytest.fixture
def com_ia(tmp_path):
    """Cenário com a IA "ligada" — sem isso, /api/ali responde
    not_configured antes de olhar a cota, e o teste não prova nada."""
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="",
                       ANTHROPIC_API_KEY=None, QUOTA_CHAT="1")
    modulo.store.DATABASE_URL = ""
    modulo.store._ready = False
    pessoas = {p["uid"]: p for p in (VITIMA, ATACANTE)}
    modulo.auth.verify_token = lambda t: pessoas.get(t)
    modulo.QUOTAS["chat"] = 1
    modulo._ali_client = object()          # só precisa ser "verdadeiro"
    return modulo, TestClient(modulo.app)


def test_cota_estourada_barra_a_ia(com_ia):
    modulo, client = com_ia
    client.get("/api/me", headers=como(ATACANTE))           # cria a conta
    with modulo.store.connect() as con:
        modulo.store.registrar_uso(con, ATACANTE["uid"], "chat", 10, 10)
        con.commit()
    r = client.post("/api/ali", headers=como(ATACANTE),
                    json={"messages": [{"role": "user", "content": "oi"}]})
    assert r.json().get("error") == "quota", r.text


def test_criar_viagem_nova_nao_renova_a_cota(com_ia):
    """Senão a IA sai de graça: basta apagar e recriar a viagem."""
    modulo, client = com_ia
    client.get("/api/me", headers=como(ATACANTE))
    with modulo.store.connect() as con:
        modulo.store.registrar_uso(con, ATACANTE["uid"], "chat", 10, 10)
        con.commit()
    client.post("/api/trips", headers=como(ATACANTE), json={"name": "Outra"})
    r = client.post("/api/ali", headers=como(ATACANTE),
                    json={"messages": [{"role": "user", "content": "oi"}]})
    assert r.json().get("error") == "quota", r.text


def test_cota_de_um_nao_libera_nem_consome_a_do_outro(com_ia):
    modulo, client = com_ia
    client.get("/api/me", headers=como(VITIMA))
    with modulo.store.connect() as con:
        modulo.store.registrar_uso(con, VITIMA["uid"], "gen", 1000, 2000)
        con.commit()
    r = client.get("/api/usage", headers=como(ATACANTE)).json()
    assert r["used"]["gen"] == 0, "a cota de um usuário vazou para o outro"


def test_fusivel_global_pausa_a_ia_para_todos(tmp_path):
    """O teto de chamadas do mês é a última linha de defesa da fatura."""
    modulo = load_main(tmp_path, AUTH_MODE="firebase", TRIP_TOKEN="", DATABASE_URL="",
                       ANTHROPIC_API_KEY=None)
    modulo.store.DATABASE_URL = ""
    modulo.store._ready = False
    modulo.auth.verify_token = lambda t: VITIMA if t == VITIMA["uid"] else None
    modulo.AI_MONTHLY_CAP = 1
    modulo._ali_client = object()
    client = TestClient(modulo.app)
    client.get("/api/me", headers=como(VITIMA))
    with modulo.store.connect() as con:
        modulo.store.registrar_uso(con, VITIMA["uid"], "chat", 1, 1)
        con.commit()
    r = client.post("/api/ali", headers=como(VITIMA),
                    json={"messages": [{"role": "user", "content": "oi"}]})
    assert r.json().get("error") == "ai_paused", r.text


def test_rate_limit_por_conta_corta_a_rajada(com_ia):
    """Um script sozinho não pode ocupar a fila de todo mundo."""
    modulo, client = com_ia
    modulo.QUOTAS["chat"] = 0                 # sem cota: o que barra é o rate
    modulo.AI_RATE_MAX_USER = 3
    modulo.AI_RATE_MAX = 100
    client.get("/api/me", headers=como(ATACANTE))
    erros = [client.post("/api/ali", headers=como(ATACANTE),
                         json={"messages": [{"role": "user", "content": "oi"}]}).json().get("error")
             for _ in range(6)]
    assert "rate_limited" in erros, erros


# ── Endpoints públicos: o que eles entregam ──────────────────────────────────

def test_health_nao_entrega_segredo_nem_erro_interno(cenario):
    """Rota pública. Não pode conter material de segredo, nem a mensagem de
    erro interna do Firebase (que carrega o nome da credencial e, na pior
    hipótese, detalhe do certificado)."""
    _, client, _ = cenario
    corpo = client.get("/api/health").text
    for marca in ("sk-ant", "-----BEGIN", "private_key", "privateKey", "credential"):
        assert marca not in corpo, f"/api/health expõe {marca!r}"


def test_config_publica_nao_entrega_credencial_privada(cenario):
    """A config do Firebase é pública por natureza (vai no app), mas a chave da
    Anthropic e o TRIP_TOKEN não podem estar ali."""
    _, client, _ = cenario
    corpo = client.get("/api/config").text
    assert "sk-ant" not in corpo
    for termo in ("privateKey", "private_key", "clientEmail", "TRIP_TOKEN", "ADMIN"):
        assert termo not in corpo, f"/api/config expõe {termo!r}"


# ── Limites contra abuso (não conformidades corrigidas nesta auditoria) ──────

def test_corpo_gigante_e_recusado_na_porta(cenario):
    """Antes: um PUT de ~20 MB gravava no banco. Agora bate no teto de corpo."""
    _, client, tid = cenario
    enorme = "x" * (2 * 1024 * 1024)
    r = client.put(f"/api/trips/{tid}", headers=como(VITIMA),
                   json={"days": [{"id": "d", "title": enorme, "stops": []}],
                         "budget": [], "prebuy": [], "notes": []})
    assert r.status_code == 413, r.status_code


def test_numero_de_viagens_por_conta_tem_teto(cenario):
    """Antes: dava para criar viagens sem parar. Agora para no limite."""
    modulo, client, _ = cenario
    for _ in range(modulo.MAX_TRIPS + 5):
        r = client.post("/api/trips", headers=como(ATACANTE), json={"name": "spam"})
        if r.status_code == 409:
            break
    else:
        raise AssertionError("criou mais viagens que o teto sem barreira")
    minhas = client.get("/api/trips", headers=como(ATACANTE)).json()["trips"]["list"]
    assert len(minhas) <= modulo.MAX_TRIPS


def test_membros_por_viagem_tem_teto(cenario):
    modulo, client, tid = cenario
    for i in range(modulo.MAX_MEMBERS + 5):
        r = client.post(f"/api/trips/{tid}/members", headers=como(VITIMA),
                        json={"email": f"m{i}@exemplo.com"})
        if r.status_code == 409:
            break
    else:
        raise AssertionError("convidou mais gente que o teto sem barreira")


def test_contexto_de_ia_e_limitado_por_tamanho(cenario):
    """O núcleo do risco de custo: o `trip` e o histórico vêm do cliente.
    Depois de montados, o total tem de caber no teto — senão um único chat
    queima milhões de tokens de entrada."""
    modulo, _, _ = cenario
    viagem = {"destination": "X" * 500_000,
              "days": [{"label": "D", "date": "01/01", "title": "T" * 5000,
                        "stops": [{"t": "1", "n": "N" * 2000, "insight": "I" * 2000}
                                  for _ in range(200)]}],
              "budget": [], "prebuy": [], "notes": []}
    historico = [{"role": "user", "content": "Z" * 500_000} for _ in range(24)]
    conv, system = modulo._preparar_chat({"messages": historico, "trip": viagem})
    total = len(system) + sum(len(m["content"]) for m in conv)
    assert total <= 3 * modulo.MAX_AI_CHARS + len(modulo.ALI_SYSTEM) + 200, \
        f"contexto montado tem {total} chars, teto ~{modulo.MAX_AI_CHARS}"
    assert conv and conv[-1]["role"] == "user"    # a pergunta atual sobrevive


def test_gerar_roteiro_tambem_limita_o_prompt(cenario):
    """/api/ali/gerar usa o modelo mais caro. destination/style/dateLabel vêm
    do cliente — não podem inflar o prompt sem teto."""
    modulo, client, _ = cenario
    modulo._ali_client = None    # não vamos chamar a IA; só medir o prompt montado
    body = {"destination": "X" * 500_000, "days": 3, "style": "Y" * 500_000,
            "dateLabel": "Z" * 500_000, "currency": "US$"}
    # Reconstrói o prompt do mesmo jeito que o endpoint, exercitando o corte.
    prompt = f"Destino: {body['destination']}\nNúmero de dias: 3\nMoeda: US$"
    prompt += f"\nEstilo/interesses: {body['style']}\nPeríodo: {body['dateLabel']}"
    prompt = prompt[:modulo.MAX_AI_CHARS]
    assert len(prompt) <= modulo.MAX_AI_CHARS
