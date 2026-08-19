# VouAli — guia de viagem com IA

FastAPI + React (PWA), rodando no Railway. O personagem **Ali** conversa sobre a
viagem, gera roteiros e dá dicas usando a Claude API.

## Estrutura
- `frontend/` — React + Vite (UI, PWA)
- `backend/` — FastAPI (API + serve o build do front)
- `backend/tests/` — testes automatizados (pytest)
- `Dockerfile` — build multi-stage (Node compila o front, Python serve tudo)

## Rodar local
Backend:

    cd backend && pip install -r requirements-dev.txt && DATA_DIR=./data python -m uvicorn main:app --reload

Frontend (outro terminal):

    cd frontend && npm install && npm run dev

## Testes
Rode antes de qualquer push — protegem principalmente a **preservação dos dados**
da viagem que está em produção.

    cd backend && python -m pytest      # 39 testes
    cd frontend && npm test             # 13 testes

O GitHub Actions (`.github/workflows/ci.yml`) roda os dois em cada push/PR.

## Ambientes

| Ambiente | Branch | Para quê |
|---|---|---|
| **produção** | `main` | A viagem real. Só recebe código já testado em staging. |
| **staging** | `staging` | Onde tudo é validado primeiro, com dados de mentira. |

### Criar o staging no Railway (uma vez)
1. No projeto do Railway: **New → GitHub Repo** → mesmo repositório.
2. Em **Settings → Source**, troque a branch para `staging`.
3. **Settings → Volumes → New Volume**, mount path `/app/data` (volume **próprio**,
   separado do de produção — nunca reaproveite o mesmo).
4. **Variables**: `ENVIRONMENT=staging`, `TRIP_TOKEN` (senha diferente da de
   produção) e, se for testar IA, uma `ANTHROPIC_API_KEY` com teto baixo.
5. **Settings → Networking → Generate Domain**.

Fluxo de trabalho: desenvolver → `staging` → validar → abrir PR para `main`.

## Deploy de produção
O Railway faz build pelo `Dockerfile` a cada push na `main`.
Volume em `/app/data` guarda o SQLite.

## Variáveis de ambiente
| Variável | Papel |
|---|---|
| `TRIP_TOKEN` | Senha do app. Vazio = sem autenticação (só para dev). |
| `ANTHROPIC_API_KEY` | Liga o Ali. Sem ela, o app funciona e a IA responde "não configurada". |
| `ALI_MODEL` | Modelo da Claude (padrão `claude-opus-5`; em produção usamos `claude-sonnet-5`). |
| `ALI_RATE_MAX` / `ALI_RATE_WINDOW` | Limite de chamadas de IA por janela (padrão 20/60s). |
| `ENVIRONMENT` | Rótulo do ambiente, exposto em `/api/health`. |
| `DATA_DIR` | Pasta do SQLite (padrão `/app/data`). |
| `PORT` | Definido automaticamente pelo Railway. |

## Saúde
`GET /api/health` (sem senha) → ambiente, se a IA está configurada e se há senha ativa.
