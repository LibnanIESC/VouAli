"""
Teste de ponta a ponta do painel: fail-closed, login em dois estágios,
enrollment do 2FA, dashboard, bloqueio por IP e proteção das rotas.

Roda sozinho, sem pytest e sem configuração:

    python testar_painel.py

Monta um SQLite descartável numa pasta temporária, com usuários e viagens de
mentira, e sobe o painel contra ele. Nunca toca em produção — `DATABASE_URL`
é forçado a vazio.
"""

import os
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
BACKEND = RAIZ.parent / "backend"
TMP = Path(tempfile.mkdtemp(prefix="vouali-admin-teste-"))

os.environ["DATA_DIR"] = str(TMP)
os.environ["DATABASE_URL"] = ""             # SQLite descartável, nunca o Postgres
os.environ["ADMIN_ENV"] = "development"     # sem Secure/__Host-, senão o TestClient não guarda o cookie
os.environ["ADMIN_PASSWORD"] = "senha-de-teste"
os.environ["ADMIN_SESSION_SECRET"] = "segredo-de-teste-para-assinar-cookie"
os.environ["ALI_MONTHLY_CAP"] = "2000"
os.environ["ALI_MODEL"] = "claude-sonnet-5"

sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(BACKEND))

import pyotp                                  # noqa: E402
from fastapi.testclient import TestClient     # noqa: E402

import store                                  # noqa: E402  (schema do app, do backend)
from app.db import conectar, garantir_schema  # noqa: E402
from app.main import app                      # noqa: E402
from app.services import admin_2fa            # noqa: E402

falhas: list[str] = []


def checa(nome: str, condicao, detalhe: str = "") -> None:
    print(("  OK    " if condicao else "  FALHA ") + nome + (f" — {detalhe}" if detalhe and not condicao else ""))
    if not condicao:
        falhas.append(nome)


def semear() -> None:
    """Três usuários, duas viagens (uma compartilhada) e uso de IA conhecido —
    os números do dashboard são conferidos contra estes."""
    store.ensure_schema()
    with store.connect() as con:
        for uid, email, nome in [
            ("u1", "ana@exemplo.com", "Ana"),
            ("u2", "bruno@exemplo.com", "Bruno"),
            ("u3", "caio@exemplo.com", "Caio"),
        ]:
            store.upsert_user(con, uid, email, nome)
        tid = store.create_trip(con, "u1", {"name": "New York", "startDate": "2026-10-06"}, None)
        store.create_trip(con, "u2", {"name": "Lisboa"}, None)
        store.add_member(con, tid, "u2", "editor")
        p = store.periodo_atual()
        store.registrar_uso(con, "u1", "gen", 2100, 14200, p)
        store.registrar_uso(con, "u1", "chat", 4000, 400, p)
        store.registrar_uso(con, "u2", "chat", 3800, 350, p)
        store.registrar_uso(con, "u2", "tip", 900, 300, p)

    garantir_schema()
    with conectar() as con:                   # estado do painel sempre do zero
        con.execute("DELETE FROM admin_security")
        con.execute("DELETE FROM admin_login_attempts")


def rodar() -> None:
    semear()

    print("== health ==")
    c = TestClient(app)
    r = c.get("/health")
    checa("health responde 200", r.status_code == 200, r.text)
    checa("health diz que o painel está habilitado", r.json().get("admin_enabled") is True)
    checa("health enxerga o banco", r.json().get("db") is True, r.text)

    print("\n== rota protegida sem sessão ==")
    r = c.get("/admin", follow_redirects=False)
    checa("dashboard manda para o login", r.status_code == 303 and "/admin/login" in r.headers.get("location", ""))

    print("\n== senha errada ==")
    r = c.post("/admin/login", data={"senha": "errada"}, follow_redirects=False)
    checa("senha errada devolve 401", r.status_code == 401)
    checa("senha errada não entrega cookie", "vouali_admin" not in r.cookies)

    print("\n== senha certa leva ao enrollment ==")
    r = c.post("/admin/login", data={"senha": "senha-de-teste"}, follow_redirects=False)
    checa("senha certa redireciona", r.status_code == 303)
    checa("primeiro acesso vai para o enrollment", "/admin/2fa/ativar" in r.headers.get("location", ""))

    print("\n== estágio 1 NÃO abre o painel ==")
    r = c.get("/admin", follow_redirects=False)
    checa("só com a senha, o dashboard ainda barra", r.status_code == 303, f"status={r.status_code}")

    print("\n== enrollment ==")
    r = c.get("/admin/2fa/ativar")
    checa("tela de enrollment abre", r.status_code == 200)
    checa("mostra o QR", "<svg" in r.text)
    checa("mostra 10 códigos de backup", r.text.count("<code>") >= 10)

    reg = admin_2fa.ler_seguranca()
    checa("segredo guardado", bool(reg and reg["totp_secret"]))
    checa("ainda NÃO confirmado", reg and reg["confirmado"] is False)
    checa("backup guardado só como hash", all(len(h) == 64 for h in reg["backup_hashes"]))

    print("\n== código errado não ativa ==")
    r = c.post("/admin/2fa/ativar", data={"codigo": "000000"}, follow_redirects=False)
    checa("código errado devolve 401", r.status_code == 401)

    print("\n== código certo ativa e abre o painel ==")
    reg = admin_2fa.ler_seguranca()           # o enrollment recomeça após a falha
    r = c.post("/admin/2fa/ativar",
               data={"codigo": pyotp.TOTP(reg["totp_secret"]).now()},
               follow_redirects=False)
    checa("código certo leva ao painel", r.status_code == 303 and r.headers.get("location") == "/admin")

    r = c.get("/admin")
    checa("dashboard abre com sessão completa", r.status_code == 200, f"status={r.status_code}")
    checa("conta os 3 usuários", ">3<" in r.text)
    checa("singular: '1 compartilhada', sem s", "1 compartilhada<" in r.text and "compartilhadas" not in r.text)
    # 10.800 tokens de entrada e 15.250 de saída em Sonnet 5, a US$ 5,50.
    checa("custo em pt-BR e com a conta certa", "R$ 0,96" in r.text, "esperava R$ 0,96")
    checa("milhar com ponto no fusível", "de 2.000 chamadas" in r.text)
    checa("lista quem mais consumiu", "ana@exemplo.com" in r.text)

    print("\n== o painel NÃO expõe conteúdo de viagem ==")
    checa("sem roteiro, orçamento ou notas no HTML",
          not any(x in r.text for x in ("stops", "prebuy", '"days"', "insight")))

    print("\n== usuários (A3) ==")
    r = c.get("/admin/usuarios")
    checa("lista abre", r.status_code == 200)
    checa("mostra as 3 contas", all(e in r.text for e in
          ("ana@exemplo.com", "bruno@exemplo.com", "caio@exemplo.com")))
    checa("quem não usou a IA aparece com travessão, não com zero", ">—<" in r.text)

    r = c.get("/admin/usuarios?busca=bruno")
    checa("busca filtra", "bruno@exemplo.com" in r.text and "ana@exemplo.com" not in r.text)
    checa("busca sem resultado não quebra",
          "Nenhum usuário" in c.get("/admin/usuarios?busca=ninguem").text)

    r = c.get("/admin/usuarios/u1")
    checa("detalhe abre", r.status_code == 200)
    checa("mostra a viagem pelo nome", "New York" in r.text)
    checa("marca o papel de dono", "dono" in r.text)
    checa("mostra o uso mês a mês", store.periodo_atual() in r.text)
    checa("o detalhe NÃO expõe conteúdo da viagem",
          not any(x in r.text for x in ("stops", "prebuy", '"days"', "insight")))

    checa("uid inexistente devolve 404", c.get("/admin/usuarios/nao-existe").status_code == 404)

    r = c.get("/admin/usuarios/u3")
    checa("conta sem viagem nem uso não quebra",
          r.status_code == 200 and "Nenhuma viagem" in r.text and "Nunca usou" in r.text)

    print("\n== custo (A4) ==")
    r = c.get("/admin/custo")
    checa("tela de custo abre", r.status_code == 200)
    checa("total do período confere", "R$ 0,96" in r.text)
    checa("custo por roteiro aparece", "Custo por roteiro" in r.text)
    checa("e se diz teto, nao valor exato", "teto" in r.text and "Limite superior" in r.text)
    checa("p90 aparece", "p90" in r.text)
    checa("projeção aparece no mês corrente", "Se o mês seguir neste ritmo" in r.text)
    checa("2 de 3 contas usaram a IA", "2 de 3 contas usaram" in r.text)

    r = c.get("/admin/custo?periodo=2020-01")
    checa("período sem uso não quebra",
          r.status_code == 200 and "Ninguém usou a IA neste período" in r.text)
    checa("mês fechado não mostra projeção", "Se o mês seguir" not in r.text)

    print("\n== as telas novas também exigem sessão ==")
    sem = TestClient(app)
    for rota in ("/admin/usuarios", "/admin/usuarios/u1", "/admin/custo"):
        checa(f"{rota} barra sem login",
              sem.get(rota, follow_redirects=False).status_code == 303)

    print("\n== logout ==")
    r = c.get("/admin/sair", follow_redirects=False)
    checa("logout redireciona ao login", r.status_code == 303)
    checa("depois do logout o painel barra de novo",
          c.get("/admin", follow_redirects=False).status_code == 303)

    print("\n== com 2FA ativo, o login vai para verificação ==")
    r = c.post("/admin/login", data={"senha": "senha-de-teste"}, follow_redirects=False)
    destino = r.headers.get("location", "")
    checa("segundo login pula o enrollment", "/admin/2fa" in destino and "ativar" not in destino)

    print("\n== código de backup entra e é consumido ==")
    material = admin_2fa.iniciar_cadastro()
    admin_2fa.confirmar_cadastro(pyotp.TOTP(material["segredo"]).now())
    backup = material["codigos"][0]
    checa("backup válido é aceito", admin_2fa.verificar(backup) is True)
    checa("o mesmo backup NÃO serve duas vezes", admin_2fa.verificar(backup) is False)

    print("\n== bloqueio por IP ==")
    c2 = TestClient(app)
    for _ in range(5):
        c2.post("/admin/login", data={"senha": "chute"}, follow_redirects=False)
    r = c2.post("/admin/login", data={"senha": "senha-de-teste"}, follow_redirects=False)
    checa("5 falhas bloqueiam o IP", r.status_code == 429, f"status={r.status_code}")
    checa("bloqueio vale mesmo com a senha certa", r.status_code == 429)

    print("\n== fail-closed ==")
    from app.config import settings
    settings.ADMIN_SESSION_SECRET = ""
    checa("sem o segredo, o painel responde 503",
          TestClient(app).get("/admin/login").status_code == 503)


if __name__ == "__main__":
    try:
        rodar()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print("\n" + ("TODOS OS TESTES PASSARAM" if not falhas else f"{len(falhas)} FALHA(S): {falhas}"))
    sys.exit(1 if falhas else 0)
