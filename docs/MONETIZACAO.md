# Fase 6 — Monetização

Como o VouAli se paga. O modelo está **decidido** (nov/2026), o **servidor e o
app (versão 1.1.0) estão prontos**, e tudo fica atrás de uma chave desligada.
Falta o que depende de contas externas e o teste com compra de verdade — ver
[COBRANCA-PASSO-A-PASSO.md](COBRANCA-PASSO-A-PASSO.md).

---

## 1. A restrição que define tudo

O VouAli tem **custo variável por uso**. Cada conversa com o Ali e cada roteiro
gerado consomem API da Anthropic, e a geração é a operação cara: ela escreve o
roteiro inteiro, com orçamento e notas.

- **Usuário gratuito generoso demais dá prejuízo**, não "menos lucro".
- **"Ilimitado" é perigoso**: um usuário pesado custa mais do que paga.

### Quanto custa cada operação

Levantado em set/2026, com um roteiro de 10 dias (~2 mil tokens de entrada,
~14 mil de saída, incluindo o *thinking*, que é cobrado como saída).

| Operação | Opus 5 | **Sonnet 5** *(em uso)* | com prompt caching |
|---|---|---|---|
| Roteiro gerado | R$ 2,00 | **R$ 0,80** | — |
| Mensagem no chat | R$ 0,17 | **R$ 0,07** | R$ 0,03 |
| Dica de parada | R$ 0,06 | **R$ 0,02** | R$ 0,01 |

O Google fica com **15%** de cada venda: R$ 29,90 chegam como R$ 25,42.

### O vazamento que o modelo fecha

A cota de IA sempre foi **mensal e renovável** (`QUOTA_*`): 3 roteiros, 50
conversas e 30 dicas *todo mês, para sempre, de graça*. Um usuário que nunca
paga podia custar **R$ 4,50/mês — R$ 54/ano**. O modelo abaixo troca isso por
saldo que **não renova**: a mesma pessoa passa a custar no máximo **R$ 1,21 na
vida toda**.

---

## 2. O modelo

| Camada | O que é | Custa a quem usa |
|---|---|---|
| **Planejar na mão** | Viagens, paradas, orçamento, listas, compartilhar, offline — sem limite | nada, para sempre |
| **Degustação** | A primeira experiência com o Ali: **1 roteiro + 5 conversas + 3 dicas**, só em viagem de **até 4 dias**. Uma vez por conta; **não renova** | nada |
| **Passe de viagem** | Destrava o Ali para **uma viagem**: **3 roteiros + 100 conversas + 50 dicas** | **R$ 29,90** (único) |
| **Recargas** *(fase 2)* | +3 roteiros · +100 conversas · +50 dicas, vendidas separadamente | ~R$ 14,90 · 12,90 · 6,90 |

**Por que passe e não assinatura.** App de viagem é usado em rajadas: planeja,
viaja, some por meses. Mensalidade pune esse uso e é cancelada entre uma viagem
e outra. O passe cobra quando há viagem.

**Por que o limite de dias na degustação.** Quatro dias bastam para ver o Ali
montar um roteiro de verdade — e a viagem que a pessoa realmente quer planejar
quase sempre é maior. O limite é o convite ao passe *e* o teto do custo: roteiro
curto custa menos para gerar.

**Por que planejar na mão é grátis sem limite.** É só leitura e escrita no
banco: custo perto de zero. Limitar viagem pune quem organiza, não quem custa.
*Vigiar:* se o volume de contas gratuitas crescer muito sem conversão, o que
pesa é a degustação (cadastros × R$ 1,21) e o banco — e a degustação encolhe
mudando uma variável.

**Nada de "ilimitado" na comunicação.** Números generosos que ninguém normal
alcança dão o mesmo efeito, sem o risco.

### A conta do preço

| | Conteúdo | Custo-teto | Custo realista |
|---|---|---|---|
| Degustação | 1 roteiro + 5 conversas + 3 dicas | R$ 1,21 | ~R$ 1,00 |
| Passe | 3 roteiros + 100 conversas + 50 dicas | R$ 10,40 | ~R$ 6,40 |

A cada **100 cadastros**, a degustação de todos custa R$ 121. Cada passe
vendido deixa R$ 25,42 − R$ 6,40 = **R$ 19,02**. Logo, **~6,4% de conversão**
já paga a degustação de quem nunca comprou; daí em diante cada passe é ~R$ 19
de margem, antes do custo fixo do servidor. A R$ 24,90 o equilíbrio subiria
para ~8%.

### Onde cada número se ajusta

| O que | Onde | Precisa atualizar o app? |
|---|---|---|
| **Preço** do passe | Play Console (o app mostra o que a loja informar) | não |
| **Tamanho** da degustação e do passe | variáveis de ambiente no Railway (tabela abaixo) | não |
| **Limite de dias** da degustação | `DEGUSTACAO_MAX_DIAS` | não |

Mudar o tamanho de um pacote vale para as **próximas** concessões: quem já
comprou um passe de 100 conversas continua com o que comprou.

---

## 3. Arquitetura

### A regra inegociável

> **O aplicativo NUNCA decide o que foi comprado.** Quem decide é o servidor.

O app só avisa "houve uma compra". O servidor pergunta ao RevenueCat, com a
chave secreta, o que aquela conta comprou — e credita. Um app modificado que
diga "paguei" não ganha nada.

### Quem faz o quê

| | RevenueCat | Servidor do VouAli |
|---|---|---|
| Papel | o **caixa**: confere o recibo com o Google | o **livro-caixa**: saldo e consumo |
| Sabe | "esta conta comprou o produto X, transação Y" | "restam 2 roteiros nesta viagem" |
| Onde | serviço externo | tabela `ai_grants` |

Como o saldo é todo nosso, trocar o RevenueCat por Play Billing direto mudaria
só o arquivo `backend/billing.py`.

### O saldo (`ai_grants`)

Cada linha é um pacote de saldo: degustação, passe ou recarga, com o que foi
concedido e o que já foi usado, **separado por tipo** (roteiro, conversa, dica).

- A **degustação** é da conta (uma por conta, garantida pela chave primária).
- O **passe** fica preso a uma **viagem**. Qualquer participante da viagem
  consome o passe dela — convidado não paga de novo.
- Um passe comprado **antes de a viagem existir** (o roteiro é gerado antes de
  a viagem ser criada) fica "solto" e se prende à viagem criada em seguida, ou
  à primeira em que for usado.
- Apagar a viagem **devolve o passe** (com o que sobrou) a quem comprou.
- Ordem de gasto: degustação primeiro (o grátis vai antes do pago), depois o
  passe da viagem, depois um passe solto.

Regras que protegem os dois lados:

- **Dias vêm do que está gravado**, nunca do que o app declara: o maior entre
  os dias do roteiro e o intervalo das datas da viagem.
- **Reserva antes, estorna se falhar.** A unidade sai do saldo antes de chamar
  a IA (dois pedidos simultâneos não passam com um crédito só) e volta se a IA
  falhar, recusar ou devolver um roteiro ilegível. Só se paga o que foi
  entregue.
- **Uma transação vira saldo uma única vez** (índice único), não importa
  quantas vezes o app ou o RevenueCat avisem.
- **Reembolso tira o saldo** daquela compra.

### Rotas

| Rota | Para quê |
|---|---|
| `GET /api/saldo?trip=<id>` | Quanto resta do Ali naquela viagem (a ativa, se omitido) |
| `POST /api/compras/sincronizar` | O app chama depois de comprar e no "restaurar compras". Corpo opcional `{trip_id}` |
| `POST /api/revenuecat/webhook` | Aviso do RevenueCat: credita mesmo se o app fechou; trata reembolso |
| `POST /api/ali*` | Aceitam `trip_id`. Sem saldo respondem `{"error":"paywall","tipo","motivo","dias","max_dias"}` |
| `POST /api/trips` | Aceita `passe` (id devolvido por `/api/ali/gerar`) para prender o passe à viagem criada |

`motivo` do paywall: `dias` (há degustação, mas a viagem passa do limite),
`esgotado` (há passe, mas acabou aquele tipo) ou `sem_passe`.

### Variáveis de ambiente

| Variável | Padrão | O que faz |
|---|---|---|
| `COBRANCA` | `off` | **A chave.** `off`: cota mensal de sempre. `on`: saldo que não renova |
| `COBRANCA_TESTE` | — | E-mails (separados por vírgula) para os quais a cobrança **já vale** com a chave desligada. Serve para testar a compra de verdade sem afetar ninguém |
| `DEGUSTACAO_MAX_DIAS` | `4` | Tamanho máximo da viagem que a degustação cobre |
| `DEGUSTACAO_ROTEIROS` / `_CHATS` / `_DICAS` | `1` / `5` / `3` | Tamanho da degustação |
| `PASSE_ROTEIROS` / `_CHATS` / `_DICAS` | `3` / `100` / `50` | Tamanho do passe |
| `RECARGA_ROTEIROS` / `_CHATS` / `_DICAS` | `3` / `100` / `50` | Tamanho de cada recarga (fase 2) |
| `PRODUTO_PASSE` | `passe_viagem` | Id do produto no Play Console |
| `REVENUECAT_API_KEY` | — | Chave **secreta** (`sk_…`). Só no Railway; nunca no app, no Git ou em conversa |
| `REVENUECAT_WEBHOOK_AUTH` | — | Segredo que o RevenueCat manda no aviso. Sem ele, o webhook fica fechado |
| `REVENUECAT_SANDBOX` | `0` | `1` faz compra de **teste** virar saldo. Ligar só enquanto testa |
| `COMPRA_RATE_MAX` | `10` | Conferências de compra por conta, por janela |

### No app (versão 1.1.0)

| Arquivo | Papel |
|---|---|
| `frontend/src/compras.js` | Fala com a loja (SDK do RevenueCat). Identifica a conta, busca o produto e o **preço**, abre o pagamento. Não decide saldo |
| `frontend/src/saldo.js` | Contas e **textos** do saldo e do aviso de "acabou" — puros, com testes |
| `frontend/src/components/PasseSheet.jsx` | A tela do passe: motivo do bloqueio, o que o passe traz, comprar, "Já comprei" |
| `frontend/src/api.js` | `apiSaldo`, `apiSincronizarCompras`; as chamadas de IA mandam `trip_id` |

Como as peças se encaixam:

- **A loja sabe de quem é a compra.** Ao entrar, o app identifica a conta no
  SDK com o `uid` do Firebase — o mesmo que o servidor usa para perguntar ao
  RevenueCat. Compra sem identificação ficaria num usuário anônimo e nunca
  viraria saldo; por isso `comprar` sempre identifica antes.
- **O produto é buscado pelo id** que o servidor informa (`produto_passe`), não
  por uma "oferta" do RevenueCat. Uma configuração a menos para dar errado.
- **Depois de pagar, o app chama `/api/compras/sincronizar`** e só mostra o
  passe como ativo quando o servidor devolve o saldo novo. Se a conferência
  atrasar, o webhook credita por conta própria e o botão "Já comprei" resolve.
- **A tela do passe abre por cima** do que estiver aberto (formulário de
  parada, de viagem nova), sem perder o que foi digitado. Ao comprar a partir
  da geração de um roteiro, o roteiro é gerado em seguida, sozinho.
- **No site não há compra** (quem cobra é a loja do app): a tela aponta para a
  Google Play. O saldo vale na conta, então quem comprou no celular usa no site.
- **Com `COBRANCA=off` nada disso aparece**: `/api/saldo` responde
  `{"cobranca": false}` e o app segue mostrando a cota mensal.

A chave pública do SDK (`goog_…`) fica em `compras.js`; ela vai dentro de todo
app e não é segredo. Para testar com a loja de testes do RevenueCat, gere o app
com `VITE_REVENUECAT_ANDROID=test_…`.

### Por que existe a chave `COBRANCA`

O servidor publica na hora; o app, não. O app que está nos celulares hoje não
conhece o aviso de "paywall" nem tem tela de compra. Ligar a cobrança antes de
a versão nova estar publicada deixaria as pessoas sem o Ali e sem como comprar.
Com a chave desligada, **nada muda** para ninguém — a suíte de testes antiga
passa inteira, sem alteração.

### Regras de produto que não podem ser esquecidas

- **Ficar sem saldo NUNCA apaga nem esconde dado.** A pessoa continua vendo e
  editando tudo que criou; só o Ali para.
- **Trocar de celular não perde o que foi pago.** O saldo fica na conta, no
  servidor — nunca no aparelho.
- **Excluir a conta apaga o saldo junto** (app e painel admin usam a mesma regra).

---

## 4. Etapas

| | Etapa | Situação |
|---|---|---|
| **6.1** | Painel de custo por usuário | ✅ feito (painel admin) |
| **6.2** | Modelo e preço decididos | ✅ nov/2026 |
| **6.3** | Servidor: saldo, degustação, passe, compras, webhook | ✅ feito, com `COBRANCA=off` |
| **6.4** | App: paywall, tela de compra (preço da loja), saldo da viagem, SDK do RevenueCat | ✅ feito na versão 1.1.0 |
| **6.5** | Contas externas: comerciante, RevenueCat, produto, contador | em andamento — RevenueCat, credenciais, segredos e webhook ✅; faltam contador, perfil de pagamentos e o produto ([passo a passo](COBRANCA-PASSO-A-PASSO.md)) |
| **6.6** | Privacidade e *Data safety* (compras passam pelo RevenueCat) | textos ✅ (`/privacidade`, `/termos`); falta declarar no Play Console |
| **6.7** | Teste de ponta a ponta com compra de teste; publicar; ligar `COBRANCA=on` | pendente |
| **6.8** | Recargas (fase 2): criar os 3 produtos e a tela | servidor já pronto |

---

## 5. Pontos em aberto

- **Recriar a conta para ganhar outra degustação.** Excluir a conta e entrar de
  novo cria um usuário novo, com degustação nova (R$ 1,21 por volta). Fechar
  isso exige guardar algum rastro do e-mail depois da exclusão — o que é uma
  decisão de privacidade, não só técnica. Hoje não é guardado.
- **Reembolso** é tratado pelo aviso do RevenueCat casando o id da transação.
  Vale confirmar num reembolso de teste que o id chega como esperado.
- **Cortesia para quem já usa o app.** Todos (novos e atuais) têm a sua
  degustação. Dar um passe de cortesia aos atuais é opcional e ainda não existe
  como ação no painel admin.
- **Nota fiscal.** O Google é quem vende ao consumidor; a nota é sobre o
  repasse. O enquadramento é do contador.
- **Compra real ainda não testada.** A tela foi conferida no navegador com uma
  compra simulada; o pagamento de verdade só dá para testar no celular, pelo
  **teste interno**, depois de o produto existir no Play Console.
- **Excluir a conta não apaga o cliente no RevenueCat.** O saldo no nosso banco
  é apagado; o registro da transação fica com o RevenueCat e o Google. A
  política de privacidade diz isso. Apagar também lá (a API deles permite) é
  uma melhoria possível.
- **Os Termos dizem que o saldo não some com o tempo** (não há prazo de
  validade no código). Se um dia houver validade, os Termos mudam antes.

---

## 6. O risco a vigiar

O fusível global `ALI_MONTHLY_CAP` continua valendo acima de tudo: se o consumo
do mês estourar o teto, a IA descansa para todo mundo — **inclusive para quem
pagou**. Com passes vendidos isso vira problema de reputação: o teto precisa
ser revisto para caber a base pagante com folga antes de ligar a cobrança, e
monitorado.
