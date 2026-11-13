# Cobrança — o que só você faz

O servidor já está pronto (ver [MONETIZACAO.md](MONETIZACAO.md)). Este guia é a
parte que depende de **contas, dados bancários e segredos** — coisas que ficam
com você. Siga na ordem: as etapas com ⏳ têm espera de dias, então comece por
elas.

> Os nomes dos menus do Play Console e do RevenueCat mudam de vez em quando. Se
> um não bater exatamente, procure pelo termo em **negrito**.

| | Etapa | Quando | Espera |
|---|---|---|---|
| 1 | Contador: modelo fiscal | **agora** | ⏳ depende dele |
| 2 | Perfil de pagamentos no Google Play | **agora** | ⏳ alguns dias |
| 3 | Conta e projeto no RevenueCat | **agora** | minutos |
| 4 | Ligar o RevenueCat ao Google Play | depois da 3 | ⏳ até ~36 h |
| 5 | Segredos no Railway | depois da 3 | minutos |
| 6 | Webhook do RevenueCat | depois da 5 | minutos |
| 7 | Produto `passe_viagem` no Play Console | **depois que eu entregar o app com compra** | minutos |
| 8 | Testadores de licença | junto com a 7 | minutos |
| 9 | Privacidade e *Data safety* | antes de publicar | minutos |
| 10 | Ligar a cobrança | por último | — |

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

## 7. Produto no Play Console

> ⚠️ Só dá para criar produto depois que existir no Play Console uma versão do
> app **com a biblioteca de compra**. Essa versão sou eu que preparo (etapa 6.4
> do plano); você sobe o AAB em **Teste interno** e então segue aqui.

1. Play Console → **Monetizar com o Google Play** → **Produtos** → **Produtos
   únicos** (*In-app products*) → **Criar produto**.
2. **ID do produto:** `passe_viagem` — exatamente assim. Não dá para mudar nem
   reaproveitar depois.
3. **Nome:** `Passe de viagem`. **Descrição:** `O Ali planeja uma viagem
   inteira com você: 3 roteiros, 100 conversas e 50 dicas.`
4. **Preço:** R$ 29,90. É **aqui** que o preço mora: para mudar no futuro,
   edite este campo — sem atualizar o app e sem me chamar.
5. **Ativar** o produto.
6. No RevenueCat: **Products** → importe `passe_viagem`; depois **Offerings** →
   na oferta `default`, crie um pacote apontando para ele.

**Pronto quando:** o produto estiver **ativo** no Play Console e aparecer na
oferta `default` do RevenueCat.

---

## 8. Testadores de licença

Permite comprar **sem ser cobrado** durante os testes.

1. Play Console → **Configuração** → **Teste de licença**.
2. Adicione o seu e-mail do Google (e o de quem mais for testar).

**Pronto quando:** ao tocar em comprar no app de teste, a tela do Google
mostrar que é uma **compra de teste**.

---

## 9. Privacidade e *Data safety*

A compra passa por um terceiro novo (RevenueCat), e isso precisa estar dito.

1. **Política de privacidade:** eu escrevo o trecho novo junto com a tela de
   compra; você revisa e publica.
2. Play Console → **Conteúdo do app** → **Segurança dos dados**: declare a
   coleta de **Informações financeiras → Histórico de compras**, usada para
   **funcionalidade do app**.

---

## 10. Ligar a cobrança

Só depois de: compra de teste funcionando de ponta a ponta, versão nova
**publicada** e a maioria das pessoas já atualizada.

1. Railway → `REVENUECAT_SANDBOX` = `0`.
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
