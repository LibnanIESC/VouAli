# Cobrança — o que só você faz

O servidor já está pronto (ver [MONETIZACAO.md](MONETIZACAO.md)). Este guia é a
parte que depende de **contas, dados bancários e segredos** — coisas que ficam
com você. Siga na ordem: as etapas com ⏳ têm espera de dias, então comece por
elas.

> Os nomes dos menus do Play Console e do RevenueCat mudam de vez em quando. Se
> um não bater exatamente, procure pelo termo em **negrito**.

| | Etapa | Situação | Espera |
|---|---|---|---|
| 1 | Contador: modelo fiscal | **a fazer** | ⏳ depende dele |
| 2 | Perfil de pagamentos no Google Play | **a fazer** | ⏳ alguns dias |
| 3 | Conta e projeto no RevenueCat | ✅ feito (13/11/2026) | — |
| 4 | Ligar o RevenueCat ao Google Play | ✅ feito — credenciais válidas | — |
| 5 | Segredos no Railway | ✅ feito | — |
| 6 | Webhook do RevenueCat | ✅ feito — teste devolveu 200 | — |
| 6b | Aviso de reembolso do Google | **a fazer** — sem ele o reembolso não chega | minutos |
| 7 | Subir a versão 1.1.0 e criar o produto `passe_viagem` | **a fazer** (o app já está pronto) | minutos |
| 8 | Testadores de licença | junto com a 7 | minutos |
| 9 | Privacidade, *Data safety* e status de comerciante | antes de publicar | minutos |
| 10 | Ligar a cobrança | por último | — |

> Para conferir de fora se os segredos chegaram ao servidor, abra
> `https://vouali-app.up.railway.app/api/health` e veja o bloco `cobranca`:
> `revenuecat` e `webhook` têm de estar `true`. Ele mostra só sim/não, nunca o
> valor.

---

## 1. Contador ⏳ — comece hoje

Ninguém na parte técnica emite nota por você. O Google é quem vende ao
consumidor; você recebe um **repasse mensal**. Leve estas perguntas:

1. O repasse do Google Play vem de uma empresa do Google no exterior. Isso é
   **exportação de serviço**? Como fica o ISS no meu município?
2. Emito **uma NFS-e por repasse** (mensal), tendo o Google como tomador? Com
   quais dados?
3. Qual **CNAE** cobre venda de conteúdo digital dentro de aplicativo?
4. A empresa (Libnan) no regime atual comporta essa receita?
5. A taxa de 15% do Google entra como despesa ou a receita é só o líquido?

**Pronto quando:** você souber que nota emitir a cada repasse.

---

## 2. Perfil de pagamentos no Google Play ⏳

Sem isso o Google não deixa criar produto pago nem tem para onde repassar.

1. Abra o **Play Console** → menu lateral → **Configuração** → **Perfil para
   pagamentos** (*Payments profile*).
2. Crie o perfil como **Empresa**, com os dados da Libnan (razão social, CNPJ,
   endereço).
3. Adicione a **conta bancária** da empresa. O Google faz um **depósito de
   teste** de centavos; quando cair (2 a 5 dias úteis), volte e informe o valor.
4. Preencha os **dados fiscais** que o Google pedir.

**Pronto quando:** o perfil aparecer como verificado e a conta bancária como
confirmada.

> Dados bancários e fiscais são digitados por você, direto no Google. Eles não
> passam por mim.

---

## 3. Conta e projeto no RevenueCat

1. Crie a conta em **app.revenuecat.com** (o plano gratuito basta: não há custo
   até ~US$ 2.500/mês de receita).
2. Crie um **projeto** chamado `VouAli`.
3. Dentro dele, adicione um app do tipo **Google Play Store** com o nome do
   pacote **`app.vouali`** (tem que ser idêntico ao do app).

**Pronto quando:** o projeto existir com o app Android cadastrado.

---

## 4. Ligar o RevenueCat ao Google Play ⏳

O RevenueCat precisa de permissão para conferir as compras no Google. Isso é
feito com uma **conta de serviço** (um "usuário robô" do Google Cloud). A
própria tela do RevenueCat tem um guia com capturas; o roteiro é este:

1. No **Google Cloud Console**, no projeto ligado ao Play Console, ative a
   **Google Play Android Developer API**.
2. Crie uma **conta de serviço** e baixe a **chave em JSON**.
3. No **Play Console** → **Usuários e permissões** → **Convidar novo usuário**:
   use o e-mail da conta de serviço e dê as permissões **Ver informações do
   app**, **Ver dados financeiros** e **Gerenciar pedidos e assinaturas**.
4. No RevenueCat, no app Android, envie esse **JSON** no campo de credenciais
   da conta de serviço.

**Pronto quando:** o RevenueCat mostrar as credenciais como **válidas**. O
Google pode levar até ~36 horas para propagar — é normal aparecer erro antes.

> Esse JSON é uma credencial. Ele sai do Google Cloud e entra no RevenueCat, só
> isso: não vai para o Git nem para conversa.

---

## 5. Segredos no Railway

São **três** variáveis no serviço `vouali-app` (Railway → serviço → **Variables**).

**a) `REVENUECAT_API_KEY`** — no RevenueCat: **API keys** → crie uma chave
**secreta** (começa com `sk_`). Copie e cole direto no Railway.

**b) `REVENUECAT_WEBHOOK_AUTH`** — um segredo inventado por você. Gere um no
terminal:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Cole o resultado no Railway e **guarde-o**: você vai usar o mesmo valor na
etapa 6.

**c) `REVENUECAT_SANDBOX`** = `1` — só durante os testes (faz compra de teste
virar saldo). Volta para `0` na etapa 10.

**Não mexa em `COBRANCA` ainda.** Ela continua desligada até o fim.

**Pronto quando:** as três aparecerem no Railway e o serviço reiniciar sozinho.

> A chave **pública** do RevenueCat (começa com `goog_`) é outra coisa: ela vai
> dentro do app e não é segredo. Essa você **pode** me passar — vou precisar
> dela para a tela de compra.

---

## 6. Webhook do RevenueCat

É o aviso que garante o saldo mesmo se o app fechar logo depois do pagamento.

1. RevenueCat → **Integrations** → **Webhooks** → **Add new**.
2. **URL:** `https://vouali-app.up.railway.app/api/revenuecat/webhook`
3. **Authorization header:** cole **exatamente** o valor de
   `REVENUECAT_WEBHOOK_AUTH` (etapa 5b), sem "Bearer" na frente.
4. Ambiente: produção **e** sandbox.
5. Salve e use o botão de **enviar evento de teste**.

**Pronto quando:** o teste voltar com **200**. Se voltar **401**, o valor do
cabeçalho não é idêntico ao do Railway.

---

## 6b. Aviso de reembolso do Google (*Google developer notifications*)

Sem isto, o Google **não avisa** o RevenueCat quando um pedido é reembolsado
pelo Play Console — e o passe continua valendo. (Foi o que o teste de
22/11/2026 mostrou: o histórico do cliente no RevenueCat tinha só a compra.)

1. RevenueCat → **Apps** → **VouAli** (Play Store) → seção **Google developer
   notifications** → no campo do tópico, escolha **criar um tópico novo** →
   **Save changes**. Copie o nome completo do tópico
   (`projects/vouali-9a7b3/topics/...`).
2. Play Console → app **VouAli** → **Monetizar com o Google Play** →
   **Configuração de monetização** → **Notificações do desenvolvedor em tempo
   real**: ative, cole o nome do tópico e, em **conteúdo da notificação**,
   escolha a opção que inclui **compras anuladas e todos os produtos únicos**.
   Salve.
3. Ainda no Play Console, clique em **Enviar notificação de teste**. No
   RevenueCat, a seção deve passar a mostrar a data da última notificação.

**Pronto quando:** um reembolso de teste fizer aparecer um evento de
reembolso no histórico do cliente no RevenueCat, e o passe sumir do app.

> Para conferir de fora: `/api/health` → `cobranca.cancelamentos_sem_passe`
> conta os reembolsos que chegaram ao servidor mas **não** acharam o passe.
> Tem de ficar em `0`.

## 7. Produto no Play Console

> ⚠️ Só dá para criar produto depois que existir no Play Console uma versão do
> app **com a biblioteca de compra**. Essa versão é a **1.1.0** (código 7), já
> pronta. Comece por subir o AAB.

### 7a. Subir a versão 1.1.0 em teste interno

1. O arquivo é `frontend/android/app/build/outputs/bundle/release/app-release.aab`.
2. Play Console → app **VouAli** → **Testar e lançar** → **Teste interno** →
   **Criar nova versão**.
3. Envie o AAB, escreva uma nota curta (ex.: "Passe de viagem") e avance até
   **Salvar e publicar** no teste interno.
4. Se o Play Console avisar sobre a permissão de **faturamento**
   (`com.android.vending.BILLING`), é o esperado: é ela que permite a compra.

### 7b. Criar o produto

1. Play Console → **Monetizar com o Google Play** → **Produtos** → **Produtos
   únicos** (*In-app products*) → **Criar produto**.
2. **ID do produto:** `passe_viagem` — exatamente assim. Não dá para mudar nem
   reaproveitar depois.
3. **Nome:** `Passe de viagem`. **Descrição:** `O Ali planeja uma viagem
   inteira com você: 3 roteiros, 100 conversas e 50 dicas.`
4. **Preço:** R$ 29,90. É **aqui** que o preço mora: para mudar no futuro,
   edite este campo — sem atualizar o app e sem me chamar.
5. **Ativar** o produto.
6. No RevenueCat: **Product catalog** → **Products** → importe `passe_viagem`
   do app VouAli. Não é preciso montar *Offering*: o app busca o produto direto
   pelo id.

**Pronto quando:** o produto estiver **ativo** no Play Console e aparecer na
lista de produtos do RevenueCat.

### 7c. Testar a compra no celular

1. Faça a etapa 8 (testadores de licença) antes.
2. Instale a versão 1.1.0 pelo link do **teste interno**.
3. Ligue a cobrança **só para a sua conta**: no Railway, crie a variável
   `COBRANCA_TESTE` com o e-mail da conta que você usa no app (mais de um?
   separe por vírgula) e clique em **Deploy**. Para todos os outros nada muda:
   `COBRANCA` continua `off`.
4. Crie uma viagem de mais de 4 dias com o Ali → aparece a tela do passe →
   **Comprar passe** → pague com a conta de teste → o roteiro é gerado.
5. Em **Ajustes**, confira o saldo da viagem.
6. Peça o reembolso da compra de teste no Play Console (**Pedidos**) e me
   avise: é o teste que confirma que o saldo é retirado.

---

## 8. Testadores de licença

Permite comprar **sem ser cobrado** durante os testes.

1. Play Console → **Configuração** → **Teste de licença**.
2. Adicione o seu e-mail do Google (e o de quem mais for testar).

**Pronto quando:** ao tocar em comprar no app de teste, a tela do Google
mostrar que é uma **compra de teste**.

---

## 9. Privacidade, *Data safety* e status de comerciante

A compra passa por um terceiro novo (RevenueCat), e isso precisa estar dito.

1. **Política de privacidade e Termos de Uso:** já atualizados e no ar em
   `https://vouali-app.up.railway.app/privacidade` e `/termos`. **Leia os
   dois** — são compromissos da empresa — e me diga se quer mudar algo.
2. Play Console → **Conteúdo do app** → **Segurança dos dados**: declare a
   coleta de **Informações financeiras → Histórico de compras**, usada para
   **funcionalidade do app**, compartilhada com um provedor de serviço.
3. **Status de comerciante** (prazo do Google: fevereiro de 2027): Play Console
   → aviso "Declare seu status de comerciante" → **Esta é uma conta de
   comerciante**. O telefone informado fica **público** na página do app; use
   um número da empresa. Depois, em **Conteúdo do app**, confirme o status do
   VouAli e informe o link dos Termos:
   `https://vouali-app.up.railway.app/termos`.

---

## 10. Ligar a cobrança

Só depois de: compra de teste funcionando de ponta a ponta, versão nova
**publicada** e a maioria das pessoas já atualizada.

1. Railway → `REVENUECAT_SANDBOX` = `0` e **apague** `COBRANCA_TESTE`.
2. Reveja `ALI_MONTHLY_CAP` para caber quem pagou, com folga.
3. Railway → `COBRANCA` = `on`.

Para voltar atrás a qualquer momento: `COBRANCA` = `off`. O saldo de quem
comprou fica guardado e volta a valer quando religar.

---

## O que me passar e o que nunca passar

| Pode me passar | Nunca passe (nem no chat, nem no Git) |
|---|---|
| Chave **pública** do RevenueCat (`goog_…`) | Chave **secreta** do RevenueCat (`sk_…`) |
| "Etapa X concluída" / prints sem segredo | O valor de `REVENUECAT_WEBHOOK_AUTH` |
| Mensagens de erro | O JSON da conta de serviço |
| | Dados bancários e fiscais |
