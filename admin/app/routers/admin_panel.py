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
    data_curta,
    data_hora,
    esc,
    linha,
    moeda,
    numero,
    pagina,
    pagina_2fa,
    pagina_bloqueado,
    pagina_cadastro_2fa,
    pagina_desabilitado,
    pagina_login,
    plural,
    sub,
    tabela,
    td,
    vazio,
)
from .. import acoes, consultas

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
  {tabela("<tr><th>Usuário</th><th class='num'>Chamadas</th><th class='num'>Tokens</th><th class='num'>Custo</th></tr>", linhas_top)}
</div>
"""
    return HTMLResponse(pagina("Dashboard", corpo, "/admin"))


# ── Usuários ─────────────────────────────────────────────────────────────────

def _linha_usuario(u: dict) -> str:
    link = f"<a href='/admin/usuarios/{esc(u['uid'])}'>{esc(u['email'] or u['uid'])}</a>"
    return linha(
        td(link + sub(u["nome"])),
        td(esc(data_curta(u["criado_em"]))),
        td(str(u["viagens"]), "num"),
        td(str(u["chamadas"]) if u["chamadas"] else "—", "num"),
        td(moeda(u["custo"]) if u["custo"] else "—", "num"),
    )


@router.get("/usuarios", response_class=HTMLResponse)
def usuarios(request: Request, busca: str = ""):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    lista = consultas.listar_usuarios(busca)
    linhas = "".join(_linha_usuario(u) for u in lista) or vazio(5, "Nenhum usuário encontrado.")

    corpo = f"""
<h1>Usuários</h1>

<div class='card'>
  <form method='get' action='/admin/usuarios' class='form-linha' style='display:flex;gap:10px'>
    <input name='busca' value='{esc(busca)}' placeholder='Buscar por e-mail ou nome'>
    <button class='btn' type='submit' style='flex:0 0 auto'>Buscar</button>
  </form>
</div>

<div class='card'>
  <h2>{numero(len(lista))} {plural(len(lista), "usuário", "usuários")}
      <span style='font-weight:600;color:#8a8272;font-size:13px'>· consumo do mês corrente</span></h2>
  {tabela("<tr><th>Conta</th><th>Entrou em</th><th class='num'>Viagens</th><th class='num'>Chamadas</th><th class='num'>Custo</th></tr>", linhas)}
</div>
"""
    return HTMLResponse(pagina("Usuários", corpo, "/admin/usuarios"))


def _linha_viagem(v: dict) -> str:
    papel = ("<span class='badge ok'>dono</span>" if v["papel"] == "owner"
             else "<span class='badge warn'>editor</span>")
    return linha(
        td(esc(v["name"]) + sub(v["destination"])),
        td(esc(v["dateLabel"] or "—")),
        td(papel),
        td(esc(data_curta(v["atualizada_em"]))),
    )


def _linha_uso(m: dict) -> str:
    return linha(
        td(esc(m["periodo"])),
        td(str(m["gen"]), "num"),
        td(str(m["chat"]), "num"),
        td(str(m["tip"]), "num"),
        td(numero(m["tokens"]), "num"),
        td(moeda(m["custo"]), "num"),
    )


@router.get("/usuarios/{uid}", response_class=HTMLResponse)
def usuario(request: Request, uid: str, aviso: str = "", tipo: str = "ok"):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    u = consultas.detalhe_usuario(uid)
    if not u:
        return HTMLResponse(
            pagina("Usuário", "<div class='notice bad'>Conta não encontrada.</div>", "/admin/usuarios"),
            status_code=404,
        )

    aviso = f"<div class='notice {'ok' if tipo == 'ok' else 'bad'}'>{esc(aviso)}</div>" if aviso else ""
    viagens = "".join(_linha_viagem(v) for v in u["viagens"]) or vazio(4, "Nenhuma viagem.")
    uso = "".join(_linha_uso(m) for m in u["uso"]) or vazio(6, "Nunca usou a IA.")
    total = sum(m["custo"] for m in u["uso"])

    corpo = f"""
<h1>{esc(u["email"] or u["uid"])}</h1>
<p style='margin:-8px 0 18px;color:#8a8272;font-size:14px'>
  {esc(u["nome"] or "sem nome")} · entrou em {esc(data_curta(u["criado_em"]))} ·
  <code>{esc(u["uid"])}</code>
</p>

<div class='grid cols-3'>
  {_metrica("Viagens", numero(len(u["viagens"])))}
  {_metrica("Meses com uso", numero(len(u["uso"])))}
  {_metrica("Custo acumulado", moeda(total), "desde que a conta existe")}
</div>

<div class='card'>
  <h2>Viagens</h2>
  <p style='margin:-6px 0 10px;font-size:13px;color:#8a8272'>
    Só a identidade da viagem. Roteiro, orçamento e notas ficam no app, com quem escreveu.
  </p>
  {tabela("<tr><th>Viagem</th><th>Datas</th><th>Papel</th><th>Última edição</th></tr>", viagens)}
</div>

<div class='card'>
  <h2>Uso da IA, mês a mês</h2>
  {tabela("<tr><th>Período</th><th class='num'>Roteiros</th><th class='num'>Conversas</th><th class='num'>Dicas</th><th class='num'>Tokens</th><th class='num'>Custo</th></tr>", uso)}
</div>

{_acoes_do_usuario(u, aviso)}

<p><a href='/admin/usuarios'>← Voltar</a></p>
"""
    return HTMLResponse(pagina(u["email"] or "Usuário", corpo, "/admin/usuarios"))


# ── Custo ────────────────────────────────────────────────────────────────────

def _linha_custo(u: dict) -> str:
    link = f"<a href='/admin/usuarios/{esc(u['uid'])}'>{esc(u['email'] or u['uid'])}</a>"
    return linha(
        td(link),
        td(str(u["gen"]), "num"),
        td(str(u["chat"]), "num"),
        td(str(u["tip"]), "num"),
        td(numero(u["tokens"]), "num"),
        td(moeda(u["custo"]), "num"),
    )


@router.get("/custo", response_class=HTMLResponse)
def custo(request: Request, periodo: str = ""):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    c = consultas.custos(periodo)
    opcoes = "".join(
        f"<option value='{esc(p)}'{' selected' if p == c['periodo'] else ''}>{esc(p)}</option>"
        for p in (c["periodos"] or [c["periodo"]])
    )
    linhas = "".join(_linha_custo(u) for u in c["usuarios"]) or vazio(6, "Ninguém usou a IA neste período.")

    projecao = ""
    if c["periodo"] == consultas.periodo_atual():
        projecao = f"""
<div class='card'>
  <h2>Se o mês seguir neste ritmo</h2>
  <p style='margin:0;font-size:14px'>
    Fecharia em <strong>{moeda(c["projecao"])}</strong> — o gasto até agora,
    esticado até o fim do mês. Serve para ver se o fusível vai apertar, não para orçamento.
  </p>
</div>"""

    corpo = f"""
<h1>Custo</h1>

<div class='card'>
  <form method='get' action='/admin/custo' class='form-linha' style='display:flex;gap:10px;align-items:center'>
    <label style='font-size:14px;font-weight:700;flex:0 0 auto'>Período</label>
    <select name='periodo' onchange='this.form.submit()'>{opcoes}</select>
    <noscript><button class='btn' type='submit'>Ver</button></noscript>
  </form>
</div>

<div class='grid cols-4'>
  {_metrica("Total do período", moeda(c["total"]),
            f"{c['ativos']} de {c['total_usuarios']} contas usaram")}
  {_metrica("Média por conta ativa", moeda(c["media_por_ativo"]), "só quem usou a IA")}
  {_metrica("Média por conta", moeda(c["media_por_usuario"]), "diluído por toda a base")}
  {_metrica("p90", moeda(c["p90"]), "9 em cada 10 gastam menos que isso")}
</div>

<div class='card'>
  <h2>Custo por roteiro <span class='badge warn'>teto</span></h2>
  <p style='margin:0;font-size:14px'>
    <strong style='font-size:22px'>{moeda(c["custo_por_roteiro"])}</strong>
    &nbsp;·&nbsp; {c["gen"]} {plural(c["gen"], "roteiro")} no período.
  </p>
  <p style='margin:8px 0 0;font-size:13px;color:#8a8272'>
    <strong>Limite superior, não valor exato.</strong> O banco soma os tokens de
    todas as operações por conta, sem separar geração de conversa — então este
    número divide o gasto das contas que geraram pelo número de roteiros, e
    carrega junto as conversas delas. O roteiro custa isso <em>ou menos</em>.
  </p>
  <p style='margin:6px 0 0;font-size:13px;color:#8a8272'>
    Mesmo como teto serve para decidir preço: gerar é a operação cara, e é por
    ela que o plano gratuito se paga — ou não.
  </p>
</div>
{projecao}

<div class='card'>
  <h2>Por conta</h2>
  {tabela("<tr><th>Conta</th><th class='num'>Roteiros</th><th class='num'>Conversas</th><th class='num'>Dicas</th><th class='num'>Tokens</th><th class='num'>Custo</th></tr>", linhas)}
</div>
"""
    return HTMLResponse(pagina("Custo", corpo, "/admin/custo"))


# ── Ações (A5) ───────────────────────────────────────────────────────────────
#
# As únicas rotas que escrevem. Todas exigem confirmação digitada, todas deixam
# rastro em `admin_acoes`, e nenhuma delas aceita GET — link não apaga conta.

def _acoes_do_usuario(u: dict, aviso: str) -> str:
    periodo = consultas.periodo_atual()
    return f"""
<div class='card'>
  <h2>Ações</h2>
  {aviso}

  <h3 style='font-size:14px;margin:14px 0 6px;color:#223A5E'>Devolver a cota de {esc(periodo)}</h3>
  <p style='margin:0 0 8px;font-size:13px;color:#8a8272'>
    Zera as chamadas do mês desta conta e libera o uso de novo. Os tokens
    continuam contados — o gasto do mês não é apagado, só a cota.
  </p>
  <form method='post' action='/admin/usuarios/{esc(u["uid"])}/cota'>
    <button class='btn' type='submit'>Zerar cota do mês</button>
  </form>

  <h3 style='font-size:14px;margin:22px 0 6px;color:#C62828'>Apagar os dados desta conta</h3>
  <p style='margin:0 0 8px;font-size:13px;color:#8a8272'>
    Apaga a conta, as viagens que ela criou (inclusive para quem foi convidado)
    e o histórico de uso. Das viagens de outras pessoas, ela apenas sai.
    <strong>Não tem desfazer.</strong>
  </p>
  <div class='notice warn'>
    A conta do <strong>Firebase</strong> continua existindo — o painel não tem
    credencial dela, de propósito. Para exclusão definitiva, apague também o
    usuário no Firebase Console; senão o próximo login recria uma conta vazia
    com o mesmo e-mail.
  </div>
  <form method='post' action='/admin/usuarios/{esc(u["uid"])}/apagar'
        class='form-linha' style='display:flex;gap:10px;align-items:center'>
    <input name='confirmacao' placeholder='Digite {esc(u["email"] or u["uid"])} para confirmar' required>
    <button class='btn danger' type='submit' style='flex:0 0 auto'>Apagar dados</button>
  </form>
</div>"""


@router.post("/usuarios/{uid}/cota")
def zerar_cota(request: Request, uid: str):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    periodo = consultas.periodo_atual()
    r = acoes.zerar_cotas(uid, periodo)
    if not r["ok"]:
        return _voltar_ao_usuario(uid, f"Nada a zerar: {r['motivo']}.", "bad")

    acoes.registrar(ip_do_pedido(request), "zerar_cota", uid,
                    f"periodo={periodo} chat={r['chat']} gen={r['gen']} tip={r['tip']}")
    return _voltar_ao_usuario(
        uid,
        f"Cota de {periodo} zerada ({r['gen']} roteiros, {r['chat']} conversas, "
        f"{r['tip']} dicas). Os tokens continuam contados.",
    )


@router.post("/usuarios/{uid}/apagar")
def apagar_usuario(request: Request, uid: str, confirmacao: str = Form("")):
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    u = consultas.detalhe_usuario(uid)
    if not u:
        return RedirectResponse("/admin/usuarios", status_code=303)

    # A confirmação é digitada, não um clique em "ok": apagar dados de alguém
    # não pode acontecer por engano de mira.
    esperado = (u["email"] or u["uid"]).strip().lower()
    if confirmacao.strip().lower() != esperado:
        return _voltar_ao_usuario(uid, "Confirmação não confere. Nada foi apagado.", "bad")

    r = acoes.apagar_dados(uid)
    if not r["ok"]:
        return _voltar_ao_usuario(uid, f"Não consegui apagar: {r['motivo']}.", "bad")

    acoes.registrar(ip_do_pedido(request), "apagar_dados", uid,
                    f"email={r['email']} viagens_apagadas={r['viagens_apagadas']} "
                    f"viagens_deixadas={r['viagens_deixadas']}")
    return RedirectResponse("/admin/usuarios?apagado=1", status_code=303)


def _voltar_ao_usuario(uid: str, aviso: str, tipo: str = "ok") -> RedirectResponse:
    from urllib.parse import quote
    return RedirectResponse(
        f"/admin/usuarios/{uid}?aviso={quote(aviso)}&tipo={tipo}",
        status_code=303,
    )


@router.get("/auditoria", response_class=HTMLResponse)
def auditoria(request: Request):
    """Toda ação que escreveu alguma coisa, com IP e horário."""
    barrado = _exigir_sessao(request)
    if barrado:
        return barrado

    registros = acoes.historico()
    linhas = "".join(
        linha(
            td(esc(data_hora(a["quando"]))),
            td(f"<code>{esc(a['acao'])}</code>"),
            td(esc(a["alvo"])),
            td(esc(a["detalhe"])),
            td(esc(a["ip"])),
        )
        for a in registros
    ) or vazio(5, "Nenhuma ação registrada.")

    corpo = f"""
<h1>Auditoria</h1>
<div class='card'>
  <p style='margin:-4px 0 12px;font-size:13px;color:#8a8272'>
    Tudo o que o painel escreveu no banco. Leitura não entra aqui — só o que muda dado.
  </p>
  {tabela("<tr><th>Quando</th><th>Ação</th><th>Alvo</th><th>Detalhe</th><th>IP</th></tr>", linhas)}
</div>
"""
    return HTMLResponse(pagina("Auditoria", corpo, "/admin/auditoria"))
