# VouAli — guia de viagem com IA

FastAPI + React (PWA), rodando no Railway. O personagem **Ali** conversa sobre a
viagem, gera roteiros e dá dicas usando a Claude API.

📍 **Plano de evolução para produto Android:** [`docs/ROADMAP.md`](docs/ROADMAP.md)

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
| `ALI_MODEL_CHAT` / `ALI_MODEL_GEN` | Opcionais: modelo separado para conversa/dicas e para gerar roteiro. Sem eles, tudo usa `ALI_MODEL`. |
| `ALI_RATE_MAX` / `ALI_RATE_WINDOW` | Limite global de chamadas de IA por janela (padrão 20/60s). |
| `ALI_RATE_MAX_USER` | Limite por conta na mesma janela (padrão 8) — evita que uma pessoa consuma a fila de todos. |
| `QUOTA_CHAT` / `QUOTA_GEN` / `QUOTA_TIP` | Cota mensal por usuário (padrão 50 / 3 / 30). Só vale no modo com contas. |
| `ALI_MONTHLY_CAP` | Fusível global: total de chamadas de IA no mês para o app inteiro. `0` = sem teto. |
| `MAX_BODY_BYTES` | Teto de tamanho de qualquer requisição (padrão ~1,5 MB; 413 acima). Ver [docs/SEGURANCA.md](docs/SEGURANCA.md). |
| `ALI_MAX_CONTEXT_CHARS` | Teto do contexto enviado à IA por chamada (padrão 60 000 ≈ 15 k tokens) — trava o custo de um pedido só. |
| `MAX_TRIPS_POR_CONTA` / `MAX_MEMBROS_POR_VIAGEM` | Tetos anti-abuso (padrão 60 / 20; 409 ao estourar). |
| `ENVIRONMENT` | Rótulo do ambiente, exposto em `/api/health`. |
| `DATA_DIR` | Pasta do SQLite (padrão `/app/data`). |
| `PORT` | Definido automaticamente pelo Railway. |

### O que está em produção (`vouali-app`)

| Variável | Valor | Por quê |
|---|---|---|
| `ENVIRONMENT` | `production` | |
| `ALI_MODEL` | `claude-sonnet-5` | corta ~60% do custo do item mais caro, a geração de roteiro |
| `QUOTA_GEN` | `3` | cada roteiro custa ~R$ 0,80; 30/mês sairiam a R$ 24 por usuário que não paga nada |
| `QUOTA_CHAT` | `50` | ~R$ 0,07 por mensagem |
| `QUOTA_TIP` | `30` | ~R$ 0,02 por dica |
| `ALI_MONTHLY_CAP` | `2000` | ~R$ 240/mês, ao custo médio de R$ 0,12 por chamada |
| `ALI_RATE_MAX` | `60` | global, por minuto |
| `ALI_RATE_MAX_USER` | `8` | por conta, por minuto |

Duas armadilhas nesses números, ambas já pagas uma vez:

O **`ALI_MONTHLY_CAP` é do app inteiro**, não por pessoa — é a soma de chat, geração
e dicas de todos os usuários no mês. Um valor baixo (200, digamos) acaba em dias e
põe o Ali "de recesso" para todo mundo de uma vez.

E o **`ALI_RATE_MAX` também é global**, enquanto o `ALI_RATE_MAX_USER` é por conta.
Deixá-los perto um do outro (10 e 8) permite que uma única pessoa ocupe quase toda
a fila e faça o app recusar chamadas de quem não fez nada. O rate limit é proteção
contra abuso, não contra custo — quem cuida do custo são as cotas e o fusível — então
pode ser folgado.

> ⚠️ O rate limit é contado **em memória, por instância**. Com mais de uma réplica,
> cada uma passa a ter seu próprio contador e o limite real se multiplica. Resolver
> isso é a Fase 2.5 (Redis) do [ROADMAP](docs/ROADMAP.md).

## Saúde
`GET /api/health` (sem senha) → ambiente, se a IA está configurada e se há senha ativa.
