"""
Rotas do painel.

Ordem do login: senha (estágio 1) → TOTP (estágio 2). Só o estágio 2 abre
qualquer tela de dados — `_exigir_sessao` é a única porta, e toda rota de
conteúdo passa por ela.

Nenhuma rota daqui mostra o conteúdo de uma viagem. Nome, datas e contagem de
dias bastam para dar suporte; roteiro, orçamento e notas são de quem escreveu.
"""

import time

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from ..config import settings
from ..db import garantir_schema
from ..security import (
    definir_estagio,
    encerrar,
    estagio,
    ip_do_pedido,
    senha_confere,
)
from ..services import admin_2fa, rate_limit
from ..style import (
    esc,
    moeda,
    numero,
    pagina,
    pagina_2fa,
    pagina_bloqueado,
    pagina_cadastro_2fa,
    pagina_desabilitado,
    pagina_login,
    plural,
)
from .. import consultas

router = APIRouter(prefix="/admin")


def _desabilitado() -> HTMLResponse:
    """Fail-closed: configuração incompleta nunca vira painel aberto."""
    return HTMLResponse(pagina_desabilitado(), status_code=503)


def _exigir_sessao(request: Request):
    """Devolve None quando pode seguir, ou a resposta que barra o acesso."""
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) != 2:
        return RedirectResponse("/admin/login", status_code=303)
    return None


# ── Login ────────────────────────────────────────────────────────────────────

@router.get("/login", response_class=HTMLResponse)
def tela_login(request: Request):
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) == 2:
        return RedirectResponse("/admin", status_code=303)
    if rate_limit.bloqueado(ip_do_pedido(request)):
        return HTMLResponse(pagina_bloqueado(settings.RATE_LIMIT_WINDOW_MIN), status_code=429)
    return HTMLResponse(pagina_login())


@router.post("/login")
def enviar_login(request: Request, senha: str = Form("")):
    if not settings.HABILITADO:
        return _desabilitado()
    garantir_schema()

    ip = ip_do_pedido(request)
    agente = request.headers.get("user-agent", "")
    if rate_limit.bloqueado(ip):
        return HTMLResponse(pagina_bloqueado(settings.RATE_LIMIT_WINDOW_MIN), status_code=429)

    if not senha_confere(senha):
        rate_limit.registrar(ip, agente, 1, False)
        # Mensagem única para senha errada e usuário inexistente — não há o que
        # enumerar aqui, mas o hábito evita entregar pistas.
        return HTMLResponse(pagina_login("Senha incorreta."), status_code=401)

    rate_limit.registrar(ip, agente, 1, True)
    destino = "/admin/2fa/ativar" if admin_2fa.precisa_cadastrar() else "/admin/2fa"
    resposta = RedirectResponse(destino, status_code=303)
    definir_estagio(resposta, 1)
    return resposta


@router.get("/2fa", response_class=HTMLResponse)
def tela_2fa(request: Request):
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) < 1:
        return RedirectResponse("/admin/login", status_code=303)
    if admin_2fa.precisa_cadastrar():
        return RedirectResponse("/admin/2fa/ativar", status_code=303)
    return HTMLResponse(pagina_2fa())


@router.post("/2fa")
def enviar_2fa(request: Request, codigo: str = Form("")):
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) < 1:
        return RedirectResponse("/admin/login", status_code=303)

    ip = ip_do_pedido(request)
    agente = request.headers.get("user-agent", "")
    if rate_limit.bloqueado(ip):
        return HTMLResponse(pagina_bloqueado(settings.RATE_LIMIT_WINDOW_MIN), status_code=429)

    if not admin_2fa.verificar(codigo):
        rate_limit.registrar(ip, agente, 2, False)
        return HTMLResponse(pagina_2fa("Código inválido."), status_code=401)

    rate_limit.registrar(ip, agente, 2, True)
    rate_limit.limpar(ip)          # sessão completa zera o histórico daquele IP
    resposta = RedirectResponse("/admin", status_code=303)
    definir_estagio(resposta, 2)
    return resposta


@router.get("/2fa/ativar", response_class=HTMLResponse)
def tela_cadastro_2fa(request: Request):
    """Enrollment. Gera segredo e códigos novos a cada visita — enquanto não
    houver confirmação, nada disso vale para entrar."""
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) < 1:
        return RedirectResponse("/admin/login", status_code=303)
    garantir_schema()
    return HTMLResponse(pagina_cadastro_2fa(admin_2fa.iniciar_cadastro()))


@router.post("/2fa/ativar")
def confirmar_cadastro_2fa(request: Request, codigo: str = Form("")):
    if not settings.HABILITADO:
        return _desabilitado()
    if estagio(request) < 1:
        return RedirectResponse("/admin/login", status_code=303)

    if not admin_2fa.confirmar_cadastro(codigo):
        # Recomeça o enrollment: o segredo anterior não foi confirmado, então
        # descartá-lo não custa nada e evita meio-cadastro pendurado.
        return HTMLResponse(
            pagina_cadastro_2fa(admin_2fa.iniciar_cadastro(), "Código inválido. Tente de novo."),
            status_code=401,
        )

    resposta = RedirectResponse("/admin", status_code=303)
    definir_estagio(resposta, 2)
    return resposta


@router.get("/sair")
def sair() -> Response:
    resposta = RedirectResponse("/admin/login", status_code=303)
    encerrar(resposta)
    return resposta


# ── Dashboard ────────────────────────────────────────────────────────────────

def _metrica(rotulo: str, valor, dica: str = "") -> str:
    linha_dica = f"<div class='hint'>{esc(dica)}</div>" if dica else ""
    return (f"<div class='metric'><div class='label'>{esc(rotulo)}</div>"
            f"<div class='value'>{esc(valor)}</div>{linha_dica}</div>")


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    garantir_schema()
    try:
        d = consultas.resumo()
    except Exception as e:  # noqa: BLE001 — banco fora do ar não derruba o painel
        return HTMLResponse(pagina(
            "Dashboard",
            f"<div class='notice bad'>Não consegui ler o banco: {esc(e)}</div>",
            "/admin",
        ), status_code=200)

    cap = d["cap"]
    if cap["limite"] <= 0:
        selo = "<span class='badge warn'>sem teto</span>"
    elif cap["pct"] >= 80:
        selo = f"<span class='badge bad'>{cap['pct']}% do teto</span>"
    else:
        selo = f"<span class='badge ok'>{cap['pct']}% do teto</span>"

    linhas_top = "".join(
        f"<tr><td>{esc(u['email'] or u['uid'])}</td>"
        f"<td class='num'>{u['chamadas']}</td>"
        f"<td class='num'>{numero(u['tokens'])}</td>"
        f"<td class='num'>{moeda(u['custo'])}</td></tr>"
        for u in d["top"]
    ) or "<tr><td colspan='4' class='vazio'>Ninguém usou a IA neste mês ainda.</td></tr>"

    corpo = f"""
<h1>Dashboard <span style='font-size:14px;font-weight:600;color:#8a8272'>· {esc(d['periodo'])}</span></h1>

<div class='grid cols-4'>
  {_metrica("Usuários", numero(d["usuarios"]), f"+{d['usuarios_30d']} em 30 dias")}
  {_metrica("Viagens", numero(d["viagens"]),
              f"{d['viagens_compartilhadas']} {plural(d['viagens_compartilhadas'], 'compartilhada')}")}
  {_metrica("Chamadas de IA", numero(d["chamadas"]),
              f"{d['gen']} {plural(d['gen'], 'roteiro')} · {d['chat']} {plural(d['chat'], 'conversa')}"
              f" · {d['tip']} {plural(d['tip'], 'dica')}")}
  {_metrica("Custo do mês", moeda(d["custo"]), f"{numero(d['tokens'])} tokens")}
</div>

<div class='card'>
  <h2>Fusível global {selo}</h2>
  <p style='margin:0;font-size:14px'>
    {numero(d['chamadas'])} de {numero(cap['limite']) if cap['limite'] > 0 else '∞'} chamadas no mês.
    Passando do teto, o Ali para para <strong>todo mundo</strong> — não é orçamento, é fusível.
  </p>
</div>

<div class='card'>
  <h2>Quem mais consumiu no mês</h2>
  <table>
    <tr><th>Usuário</th><th class='num'>Chamadas</th><th class='num'>Tokens</th><th class='num'>Custo</th></tr>
    {linhas_top}
  </table>
</div>
"""
    return HTMLResponse(pagina("Dashboard", corpo, "/admin"))
