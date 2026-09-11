"""
Casca visual do painel — HTML montado no servidor, sem framework.

Mesma estrutura dos painéis do Refix e do Já Tomou (topbar com marca, nav,
cards, tabelas, badges) com a paleta do VouAli: navy #223A5E e laranja #F28C28
sobre creme. A marca é HTML puro, o mesmo wordmark do app, para o painel não
depender de nenhum asset externo.
"""

from html import escape as _escape

MARCA_HTML = (
    "<span class='marca'>"
    "<span class='marca-vou'>Vou</span><span class='marca-ali'>Ali</span>"
    "<span class='marca-seta' aria-hidden='true'></span>"
    "</span>"
)

ADMIN_STYLE = """
:root {
  --bg:#f6f3ec; --surface:#ffffff; --border:#e6ded0; --text:#223A5E;
  --muted:#4A5A6E; --soft:#8a8272; --brand:#223A5E; --brand-dark:#16273f;
  --brand-soft:#e8eef7; --accent:#F28C28; --accent-soft:#fdeede;
  --success:#2e7d52; --success-soft:#dcf0e5; --danger:#C62828; --danger-soft:#fdeae8;
  --shadow:0 1px 2px rgba(34,58,94,.05), 0 4px 12px rgba(34,58,94,.07);
}
* { box-sizing:border-box; }
html, body { margin:0; padding:0; }
body {
  font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  background:var(--bg); color:var(--muted); line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
a { color:var(--brand); text-decoration:none; }
a:hover { text-decoration:underline; }
.wrap { max-width:1100px; margin:0 auto; padding:18px 22px 48px; }

.marca { display:inline-flex; align-items:flex-end; gap:3px; font-weight:800;
  font-size:19px; letter-spacing:-.3px; line-height:1; }
.marca-vou { color:var(--brand); }
.marca-ali { color:var(--accent); }
.marca-seta { width:9px; height:9px; margin-bottom:2px; background:var(--accent);
  clip-path:polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%); display:block; }

.topbar { display:flex; align-items:center; justify-content:space-between;
  padding:12px 0 16px; border-bottom:1px solid var(--border); margin-bottom:24px; }
.brand-sub { color:var(--soft); font-size:13px; margin-left:8px; font-weight:600; }
.topbar nav { display:flex; gap:16px; align-items:center; font-size:14px; flex-wrap:wrap; }
.topbar nav a { color:var(--text); font-weight:600; padding:4px 2px; }
.topbar nav a.active { color:var(--accent); border-bottom:2px solid var(--accent); }

h1 { font-size:22px; margin:0 0 16px; color:var(--text); letter-spacing:-.2px; }
h2 { font-size:16px; margin:0 0 12px; color:var(--text); }
.card { background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:18px 20px; box-shadow:var(--shadow); margin-bottom:18px; }
.grid { display:grid; gap:14px; margin-bottom:18px; }
.grid.cols-4 { grid-template-columns:repeat(4,1fr); }
.grid.cols-3 { grid-template-columns:repeat(3,1fr); }
@media (max-width:760px){ .grid.cols-4,.grid.cols-3 { grid-template-columns:repeat(2,1fr); } }
.metric { background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:16px 18px; box-shadow:var(--shadow); }
.metric .label { color:var(--soft); font-size:13px; font-weight:700; }
.metric .value { font-size:28px; font-weight:800; margin-top:4px; color:var(--text); }
.metric .hint { color:var(--soft); font-size:12px; margin-top:2px; }

table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--border); }
th { color:var(--soft); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
tr:last-child td { border-bottom:0; }
.num { text-align:right; font-variant-numeric:tabular-nums; }

.badge { display:inline-block; padding:3px 9px; border-radius:999px; font-size:12px; font-weight:700; }
.badge.ok { background:var(--success-soft); color:var(--success); }
.badge.warn { background:var(--accent-soft); color:#8a5a12; }
.badge.bad { background:var(--danger-soft); color:var(--danger); }

.btn { background:var(--brand); color:#fff; border:0; border-radius:10px;
  padding:11px 16px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
.btn:hover { background:var(--brand-dark); }
.btn.accent { background:var(--accent); color:var(--brand); }
.btn.danger { background:#fff; color:var(--danger); border:1.5px solid var(--danger); }
input, select { width:100%; padding:11px 12px; border:1px solid var(--border);
  border-radius:10px; font-size:15px; font-family:inherit; background:#fff; color:var(--text); }
input:focus, select:focus { outline:2px solid var(--accent); outline-offset:1px; }

.notice { border-radius:10px; padding:11px 14px; font-size:14px; font-weight:600; margin-bottom:12px; }
.notice.bad { background:var(--danger-soft); color:var(--danger); }
.notice.ok { background:var(--success-soft); color:var(--success); }
.notice.warn { background:var(--accent-soft); color:#8a5a12; }
.vazio { color:var(--soft); font-size:14px; padding:10px 0; }
code { background:var(--brand-soft); padding:2px 6px; border-radius:6px;
  font-size:13px; color:var(--brand-dark); }
"""

_NAV = [
    ("/admin", "Dashboard"),
    ("/admin/usuarios", "Usuários"),
    ("/admin/custo", "Custo"),
    ("/admin/auditoria", "Auditoria"),
]


def esc(valor) -> str:
    return _escape("" if valor is None else str(valor))


def numero(n) -> str:
    """1234567 -> '1.234.567'. O painel é em português; ponto separa milhar."""
    return f"{int(n or 0):,}".replace(",", ".")


def moeda(v) -> str:
    """0.96 -> 'R$ 0,96'. Vírgula decimal, ponto de milhar."""
    inteiro, _, decimal = f"{float(v or 0):,.2f}".partition(".")
    return f"R$ {inteiro.replace(',', '.')},{decimal}"


def data_curta(ts) -> str:
    """Timestamp unix -> '10/09/2026'. Zero vira travessão, não 1970."""
    from datetime import datetime, timezone
    n = int(ts or 0)
    if n <= 0:
        return "—"
    return datetime.fromtimestamp(n, timezone.utc).strftime("%d/%m/%Y")


def data_hora(ts) -> str:
    """Timestamp unix -> '10/09/2026 14:32'. Auditoria sem hora não serve."""
    from datetime import datetime, timezone
    n = int(ts or 0)
    if n <= 0:
        return "—"
    return datetime.fromtimestamp(n, timezone.utc).strftime("%d/%m/%Y %H:%M")


def linha(*celulas: str) -> str:
    return "<tr>" + "".join(celulas) + "</tr>"


def td(conteudo: str, classe: str = "") -> str:
    return f"<td class='{classe}'>{conteudo}</td>" if classe else f"<td>{conteudo}</td>"


def sub(texto: str) -> str:
    """Segunda linha de uma célula, em cinza — nome sob o e-mail, destino sob
    o nome da viagem."""
    return f"<div class='hint'>{esc(texto)}</div>" if texto else ""


def vazio(colunas: int, texto: str) -> str:
    return f"<tr><td colspan='{colunas}' class='vazio'>{esc(texto)}</td></tr>"


def plural(n: int, singular: str, plural_: str = "") -> str:
    """'1 compartilhada' / '2 compartilhadas' — sem o 's' solto entre parênteses."""
    return singular if abs(int(n or 0)) == 1 else (plural_ or f"{singular}s")


def _nav_html(ativo: str) -> str:
    itens = []
    for href, rotulo in _NAV:
        classe = " class='active'" if href == ativo else ""
        itens.append(f"<a href='{href}'{classe}>{rotulo}</a>")
    itens.append("<a href='/admin/sair'>Sair</a>")
    return "".join(itens)


def pagina(titulo: str, corpo: str, ativo: str = "") -> str:
    return f"""<!doctype html><html lang='pt-BR'><head>
<meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>
<title>{esc(titulo)} · VouAli Admin</title><style>{ADMIN_STYLE}</style></head>
<body><div class='wrap'>
  <div class='topbar'>
    <a href='/admin' style='text-decoration:none'>{MARCA_HTML}<span class='brand-sub'>Admin</span></a>
    <nav>{_nav_html(ativo)}</nav>
  </div>
  {corpo}
</div></body></html>"""


def _casca_auth(titulo: str, interno: str) -> str:
    """Telas de login: sem nav, para não sugerir caminho a quem não entrou."""
    return f"""<!doctype html><html lang='pt-BR'><head>
<meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>
<title>{esc(titulo)} · VouAli Admin</title><style>{ADMIN_STYLE}
.auth {{ max-width:400px; margin:8vh auto; padding:0 18px; }}
.auth form {{ display:flex; flex-direction:column; gap:12px; margin-top:8px; }}
.auth .topo {{ text-align:center; margin-bottom:16px; }}</style></head>
<body><div class='auth'>
  <div class='topo'>{MARCA_HTML}<div class='brand-sub'>Admin</div></div>
  {interno}
</div></body></html>"""


def pagina_login(erro: str = "") -> str:
    aviso = f"<div class='notice bad'>{esc(erro)}</div>" if erro else ""
    return _casca_auth("Entrar", f"""<div class='card'>
  {aviso}
  <form method='post' action='/admin/login'>
    <input type='password' name='senha' placeholder='Senha do painel' autofocus required
           autocomplete='current-password'>
    <button class='btn' type='submit'>Continuar</button>
  </form>
</div>""")


def pagina_2fa(erro: str = "") -> str:
    aviso = f"<div class='notice bad'>{esc(erro)}</div>" if erro else ""
    return _casca_auth("Verificação", f"""<div class='card'>
  {aviso}
  <h2>Código do autenticador</h2>
  <p style='font-size:14px;margin:0 0 4px'>Digite o código de 6 dígitos — ou um
     código de backup, se estiver sem o celular.</p>
  <form method='post' action='/admin/2fa'>
    <input name='codigo' placeholder='000000' autofocus required
           autocomplete='one-time-code' inputmode='text'>
    <button class='btn' type='submit'>Entrar</button>
  </form>
</div>""")


def pagina_cadastro_2fa(material: dict, erro: str = "") -> str:
    aviso = f"<div class='notice bad'>{esc(erro)}</div>" if erro else ""
    codigos = "".join(f"<code>{esc(c)}</code> " for c in material.get("codigos", []))
    return _casca_auth("Ativar 2FA", f"""<div class='card'>
  {aviso}
  <h2>Ative o segundo fator</h2>
  <p style='font-size:14px'>Leia o QR no Google Authenticator (ou Authy) e confirme
     um código para ativar.</p>
  <div style='text-align:center;margin:14px 0'>{material.get('qr', '')}</div>
  <p style='font-size:13px'>Não consegue ler o QR? Digite o segredo:<br>
     <code>{esc(material.get('segredo', ''))}</code></p>
  <div class='notice warn'>
    <strong>Guarde os códigos de backup — eles aparecem só desta vez.</strong>
    Cada um serve uma vez, e é o que te salva se perder o celular.
  </div>
  <div style='line-height:2.2'>{codigos}</div>
  <form method='post' action='/admin/2fa/ativar'>
    <input name='codigo' placeholder='Código do app para confirmar' required
           autocomplete='one-time-code'>
    <button class='btn accent' type='submit'>Confirmar e ativar</button>
  </form>
</div>""")


def pagina_bloqueado(minutos: int) -> str:
    return _casca_auth("Bloqueado", f"""<div class='card'>
  <div class='notice bad'>Muitas tentativas deste endereço.</div>
  <p style='font-size:14px;margin:0'>Tente de novo em até {minutos} minutos.</p>
</div>""")


def pagina_desabilitado() -> str:
    return _casca_auth("Indisponível", """<div class='card'>
  <div class='notice bad'>Painel desabilitado.</div>
  <p style='font-size:14px;margin:0'>Faltam <code>ADMIN_PASSWORD</code> ou
     <code>ADMIN_SESSION_SECRET</code> no ambiente.</p>
</div>""")
