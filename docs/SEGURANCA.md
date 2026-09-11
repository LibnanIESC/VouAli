# Auditoria de segurança do VouAli

Feita em 11/09/2026, sobre o backend em produção e o painel administrativo.
Não é um checklist teórico: cada afirmação abaixo foi provada por um ataque
real, rodando contra o código. Os ataques viraram testes permanentes em
`backend/tests/test_seguranca.py` (32 casos) — se alguma porta reabrir, a
suíte quebra antes do deploy.

O contexto que motivou a auditoria: nos primeiros dias de um app público, boa
parte dos "usuários" não são genuínos — são pessoas sondando o que dá para
extrair, gastar ou vender. As duas não conformidades encontradas eram
exatamente disso: **gastar a fatura da IA** e **encher/derrubar o banco**.

---

## O que resistiu aos ataques

Verificado com dois usuários reais (vítima e atacante) e uma viagem privada.

| Vetor | Ataque tentado | Resultado |
|---|---|---|
| **Acesso sem credencial** | GET em `/api/state`, `/trips`, `/me`, `/usage`, `/members` sem token | **401** em todas |
| **Token forjado** | token vazio, inventado, "null", JWT falso com `alg:none` | **401** em todas |
| **Header de proxy** | `X-User-Id`, `X-Forwarded-User`, `X-Trip-Token` no lugar do token | ignorados, **401** |
| **IDOR — ler** | atacante lê a viagem alheia por id | **404**, conteúdo não vaza |
| **IDOR — escrever** | atacante sobrescreve o roteiro alheio | **404**, roteiro intacto |
| **IDOR — renomear** | `PUT /meta` na viagem alheia | **404** |
| **IDOR — apagar** | `DELETE` na viagem alheia | **403/404**, viagem de pé |
| **IDOR — membros** | listar membros alheios (expõe e-mails de terceiros) | **404** |
| **IDOR — auto-convite** | atacante se convida para a viagem alheia | **403/404** |
| **IDOR — ativar** | apontar `active` para viagem alheia e ler `/state` | conteúdo não vaza |
| **Escalada de editor** | convidado tenta expulsar o dono / convidar mais gente | dono fica; convite **403** |
| **SQL injection** | payloads clássicos no id da viagem e no e-mail do convite | consultas parametrizadas, banco de pé |
| **XSS no app** | nome de viagem com `<script>` | volta como **JSON**, nunca HTML |
| **XSS no painel** | conta e viagem nomeadas com `<script>`/`<img onerror>` | tudo escapado por `esc()` em todas as telas |
| **Path traversal** | `../store.py`, `..%2f`, `....//`, `\..\` no catch-all da SPA | barreira `startswith`, cai na SPA |
| **Força bruta no login admin** | senha errada em série | 2FA obrigatório + bloqueio por IP após 5 falhas |
| **Segredos no repo** | varredura de `git ls-files` e do histórico | nenhuma chave, `.jks`, `google-services` ou `sk-ant` rastreado |
| **Isolamento de cota** | uso de uma conta aparecer na cota de outra | contado por `uid`, não vaza |

**Validação de token.** `auth.verify_token` usa `firebase_admin.verify_id_token`
— verificação criptográfica completa da assinatura do Google. Qualquer exceção
devolve `None`, e `me()` transforma isso em 401. Não há caminho que aceite um
uid sem token válido.

**Credenciais fora de perigo.** A config do Firebase em `/api/config` é pública
por natureza (vai embutida no app). A chave da Anthropic, o `TRIP_TOKEN` e o
segredo do painel nunca chegam a nenhuma rota pública, e o painel admin não
carrega credencial do Firebase de propósito — uma credencial poderosa a menos
num serviço exposto na internet.

---

## Não conformidades encontradas e corrigidas

### NC-1 — Cota por número de chamadas, não por tokens *(alta — custo)*

**O problema.** O `trip` e o histórico de mensagens vêm no corpo do pedido, sob
controle do cliente. A cota (`QUOTA_CHAT=50`) contava *chamadas*, não *tokens*.
Medido: um único `POST /api/ali` podia carregar **~1,67 milhão de tokens de
entrada (US$ 3,34)**, e as 50 chamadas da cota permitiriam **~US$ 167 numa
conta só** — um alvo óbvio para quem quer torrar a fatura.

**A correção.** Teto duro no contexto montado, em `_preparar_chat` e no prompt
da dica: o `_trip_context` e cada mensagem são cortados em `ALI_MAX_CONTEXT_CHARS`
(padrão 60 000 ≈ 15 k tokens), e o histórico é podado das mensagens mais antigas
até caber, preservando sempre a pergunta atual. Prova: `test_contexto_de_ia_e_limitado_por_tamanho`.

### NC-2 — Sem teto de tamanho, de viagens ou de membros *(alta — DoS/custo de armazenamento)*

**O problema.** Sem limite de corpo, gravei **19,7 MB numa única viagem**. Sem
limite de contagem, **criei 300 viagens** e **convidei 500 membros** numa, tudo
sem barreira — caminhos diretos para inchar ou derrubar o Postgres.

**A correção.**
- **Middleware de tamanho de corpo**: recusa com **413** qualquer requisição
  acima de `MAX_BODY_BYTES` (padrão ~1,5 MB), antes de ler na memória.
- **Teto de viagens por conta**: `MAX_TRIPS_POR_CONTA` (padrão 60) — **409** ao
  estourar.
- **Teto de membros por viagem**: `MAX_MEMBROS_POR_VIAGEM` (padrão 20), contando
  membros + convites pendentes — **409** ao estourar.

Provas: `test_corpo_gigante_e_recusado_na_porta`, `test_numero_de_viagens_por_conta_tem_teto`,
`test_membros_por_viagem_tem_teto`.

---

## Achados de risco baixo (revisados, aceitos por ora)

- **Enumeração de contas pelo convite.** Convidar um e-mail devolve `member`
  (se a conta já existe e entrou na hora) ou `pending` (se não). A diferença
  permite a um dono de viagem descobrir se um e-mail tem conta no VouAli.
  Exige estar autenticado e possuir uma viagem, e não expõe dado da pessoa —
  só a existência. Aceito por ora; se virar incômodo, uniformizar a resposta
  para sempre `pending` resolve, ao custo de o dono não saber na hora se o
  convidado já entrou.
- **`/api/health` mostra o erro de inicialização do Firebase.** É texto
  diagnóstico (nome da env var, campos ausentes do certificado) — nunca valor
  de segredo — e é público de propósito, para o monitoramento enxergar uma
  credencial mal configurada sem abrir o painel. Em produção hoje: `error: null`.
- **Corpo sem `Content-Length` (chunked).** O middleware barra pelo header. Um
  cliente que envie em chunks sem declarar o tamanho escaparia do 413 — mas o
  teto de contexto da IA (NC-1) limita o custo mesmo assim, e o teto de viagens
  limita o dano ao banco.

---

## Rate limit e fusível global (já existiam, confirmados)

- **Por conta**: `ALI_RATE_MAX_USER` chamadas de IA por janela (`ALI_RATE_WINDOW`s)
  — um script sozinho não ocupa a fila de todos.
- **Global**: `ALI_RATE_MAX` chamadas por janela, contra loops.
- **Fusível do mês**: `ALI_MONTHLY_CAP` — passando o teto, a IA pausa para todos
  (`error: ai_paused`). É a última linha de defesa da fatura.

Provas: `test_rate_limit_por_conta_corta_a_rajada`, `test_fusivel_global_pausa_a_ia_para_todos`.

---

## Variáveis de ambiente introduzidas

| Variável | Padrão | O que faz |
|---|---|---|
| `MAX_BODY_BYTES` | `1500000` | Teto de tamanho de qualquer requisição (413 acima) |
| `ALI_MAX_CONTEXT_CHARS` | `60000` | Teto do contexto enviado à IA por chamada |
| `MAX_TRIPS_POR_CONTA` | `60` | Máximo de viagens que uma conta cria |
| `MAX_MEMBROS_POR_VIAGEM` | `20` | Máximo de membros + convites por viagem |

Todas têm padrão seguro — o app funciona sem configurá-las. Ajuste no Railway
apenas se algum limite se mostrar apertado para o uso real.

---

## Como repetir a auditoria

```bash
cd backend
python -m pytest tests/test_seguranca.py -v
```

Cada teste é um ataque nomeado. Ao mexer em autenticação, cotas ou
compartilhamento, rode isto antes do deploy. **Nunca "conserte" um teste daqui
afrouxando a expectativa** — cada um guarda uma porta.
