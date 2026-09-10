# VouAli — Painel administrativo

Serviço FastAPI separado do backend. Lê o mesmo Postgres do app e escreve
apenas nas tabelas `admin_*`.

O plano, as decisões e o porquê de cada uma estão em
[docs/ADMIN.md](../docs/ADMIN.md). Aqui fica só o operacional.

## Rodar local

```
pip install -r requirements.txt
cp .env.example .env      # preencha ADMIN_PASSWORD e ADMIN_SESSION_SECRET
uvicorn app.main:app --reload --port 8000
```

Sem `DATABASE_URL`, cai no SQLite do backend (`DATA_DIR`) — bom para
desenvolvimento, e não encosta em produção.

Gere o segredo do cookie com:

```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Testar

```
python testar_painel.py
```

Monta um banco descartável, sobe o painel contra ele e percorre login,
enrollment do 2FA, dashboard, bloqueio por IP e fail-closed. Não precisa de
configuração nem toca em produção.

## Primeiro acesso

1. Entre com a senha
2. O painel mostra um QR e **10 códigos de backup** — eles aparecem **uma
   única vez**, guarde-os
3. Confirme um código do autenticador para ativar o 2FA

Perdeu o celular e os códigos? Apague a linha de `admin_security` no banco; o
próximo login refaz o cadastro.

## Publicar no Railway

Serviço novo no mesmo projeto, root directory `admin/`, com as variáveis do
`.env.example` — `DATABASE_URL` referenciando o Postgres existente. O
`railway.json` já traz o start.

Healthcheck em `/health`.
