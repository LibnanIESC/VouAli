# Painel administrativo do VouAli

Painel web para ver quem usa o app, quanto a IA está custando e agir em casos
de suporte. Segue o padrão dos painéis do **Refix** e do **Já Tomou**: FastAPI
servindo HTML, sem framework de frontend, login em dois estágios.

---

## 1. Onde roda, e por quê

**Serviço separado no Railway**, como o do Já Tomou — não embutido no backend,
como o do Refix.

A razão é a regra que vale até 13/10/2026: **produção não é laboratório**. Com
o painel dentro do backend, cada ajuste numa tabela reinicia o serviço que
atende os usuários — inclusive durante a viagem de Nova York. Separado, o
painel tem ciclo de deploy próprio e o app não sente.

Vêm junto duas vantagens: superfície de ataque isolada e um processo a menos
compartilhando memória com a API pública.

O acesso ao banco é direto: o backend já usa `DATABASE_URL`
([store.py](../backend/store.py)), e no Railway o segundo serviço referencia a
mesma variável do Postgres.

> **A alternativa que ficou de fora:** rodar o painel só na máquina do
> administrador (`uvicorn app.main:app --port 8000`), conectando ao Postgres
> pela URL pública. Custo zero e **nenhuma URL exposta na internet** — some a
> superfície inteira de ataque. O código é o mesmo; trocar de um para o outro
> é só decidir onde dar `uvicorn`. Ficou de fora porque acessar de qualquer
> lugar, inclusive do celular, tem valor no suporte.

**Custo:** o Railway cobra consumo (vCPU, RAM, rede), não por serviço. Um
painel aberto duas vezes por semana fica na casa de centavos a poucos dólares
por mês — o gasto é o processo ocioso, não o uso.

---

## 2. O que o painel mostra

Ancorado no schema real: `users`, `trips`, `trip_members`, `ai_usage`.

| Tela | Conteúdo |
|---|---|
| **Dashboard** | usuários (total, novos em 30 dias), viagens (total, compartilhadas), chamadas de IA no mês por tipo, custo estimado em R$, quanto do `ALI_MONTHLY_CAP` já foi consumido |
| **Usuários** | lista com busca por e-mail; detalhe com conta, viagens (nome, datas, papel), consumo do mês e custo |
| **Custo** | custo por usuário, média, p90 e projeção do mês |
| **Ações** | excluir conta (reusa `store.excluir_conta`), zerar o contador de cota de um usuário no mês |

A tela de **Custo** é a etapa 6.1 do [MONETIZACAO.md](MONETIZACAO.md). O
`ai_usage` já grava `tokens_in` e `tokens_out` por conta e por mês; falta
apenas ler. É ela que troca estimativa por número real na hora de decidir preço.

> ⚠️ **O custo por roteiro é um TETO, não o valor exato.** O `ai_usage` agrega
> os tokens por conta e período, sem separar geração de conversa e de dica — o
> painel divide o gasto das contas que geraram pelo número de roteiros, e isso
> carrega junto as conversas dessas contas. O roteiro custa aquilo ou menos.
>
> Para ter o número exato seria preciso separar os tokens por tipo no backend
> (colunas `tokens_gen_in/out`, `tokens_chat_in/out`, …). Vale fazer **antes**
> de escolher preço para valer; não vale mexer no backend agora, sem
> laboratório, só por causa disso.

### O que o painel NÃO mostra

**O conteúdo das viagens.** Nem roteiro, nem orçamento, nem notas — só
metadados: nome, datas, quantos dias.

A política de privacidade promete que *"tudo que guardamos aparece dentro do
app"*. Um painel que lê o roteiro de quem confiou o plano de viagem ao produto
contradiz isso, e ninguém precisa disso para dar suporte. No Já Tomou,
"mascaramento de PII" ficou na lista de pendências; aqui nasce pronto.

---

## 3. Segurança

Herdada dos dois painéis existentes, sem invenção:

| | |
|---|---|
| **Estágio 1** | senha, comparada em tempo constante com `ADMIN_PASSWORD` — cookie de ~10 min |
| **Estágio 2** | código TOTP (RFC 6238) de um app autenticador, tolerância ±1 período — cookie de ~8 h |
| **Cookie** | assinado com HMAC-SHA256 usando `ADMIN_SESSION_SECRET`, `HttpOnly`, `SameSite=Lax`; em produção `Secure` e prefixo `__Host-` |
| **Rate limit** | bloqueio por IP após N falhas na janela, com registro de cada tentativa |
| **Headers** | HSTS (produção), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` |
| **Fail-closed** | sem `ADMIN_PASSWORD` **ou** sem `ADMIN_SESSION_SECRET`, responde **503**. Nunca fica aberto por configuração incompleta |

**Só o estágio 2 abre o painel.** Nenhuma rota de dados aceita estágio 1.

O 2FA guarda o segredo e os hashes dos códigos de backup numa tabela
`admin_security` no Postgres — no Já Tomou isso vive no Firestore, no Refix em
SQL; aqui segue o Refix, que é a stack igual.

**Escape hatch:** apagar a linha de `admin_security` faz o próximo login
refazer o enrollment (novo QR, novos códigos). Não expõe nada — a tabela só
guarda o segredo TOTP e hashes.

---

## 4. Fases

| | Entrega |
|---|---|
| **A1** | Serviço `admin/`, login em dois estágios, `/health`, deploy no Railway |
| **A2** | Dashboard |
| **A3** | Usuários e detalhe |
| **A4** | Custo por usuário — a etapa 6.1 |
| **A5** | Ações: excluir conta, zerar cota |

A1 é a maior, e cerca de dois terços dela é adaptação do `admin/` do Já Tomou:
a paleta vira a do VouAli (navy `#223A5E` + laranja `#F28C28`) e a persistência
do 2FA troca de Firestore para Postgres.

---

## 5. Variáveis de ambiente

| Variável | Obrigatória | Papel |
|---|---|---|
| `ADMIN_PASSWORD` | **sim** | senha do estágio 1 |
| `ADMIN_SESSION_SECRET` | **sim** | segredo dedicado que assina o cookie. Sem ele o painel responde 503 |
| `DATABASE_URL` | **sim** | mesmo Postgres do backend (referência de variável no Railway) |
| `ADMIN_ENV` | — | `production` liga `Secure`/`__Host-`/HSTS. Fora disso o login funciona em `http://localhost` |
| `TOTP_ISSUER` | — | nome exibido no app autenticador (default `VouAli Admin`) |
| `RATE_LIMIT_MAX_FAILS` / `RATE_LIMIT_WINDOW_MIN` | — | bloqueio por IP (default 5 falhas / 15 min) |
| `ALI_MODEL` | — | usado só para estimar custo por token na tela de Custo |

Gerar o segredo:

```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

> A senha e o segredo são gerados e guardados pelo administrador. Não passam
> por chat, não entram no Git, não aparecem em log.

---

## 6. Rodar e publicar

Local:

```
cd admin
pip install -r requirements.txt
cp .env.example .env      # preencha ADMIN_PASSWORD, ADMIN_SESSION_SECRET, DATABASE_URL
uvicorn app.main:app --reload --port 8000
```

No Railway: novo serviço no mesmo projeto, root directory `admin/`, as
variáveis acima (com `DATABASE_URL` referenciando o Postgres existente). O
`railway.json` já traz o start.

Healthcheck em `/health`.
