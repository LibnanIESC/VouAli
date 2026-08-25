# Publicar o VouAli na Play Store

Guia da Fase 4. O que dá para preparar no código já está pronto; o que exige
conta, senha ou cartão é você quem faz, e está descrito passo a passo.

---

## 0. Quem publica

O app é da **Libnan Inteligência Empresarial e Soluções Contábeis Ltda**, que
já tem conta no Play Console. Contato público: **libnaniesc@gmail.com** — já
está nas três páginas legais e é o endereço que recebe os pedidos de exclusão
de conta de quem não tem mais o app instalado.

| Item | Situação |
|---|---|
| Conta no Play Console | ✅ já existe (organização) |
| E-mail de contato | ✅ definido |
| Teste fechado com 12 testadores | ✅ **dispensado** — a exigência é só para contas pessoais |
| Chave de assinatura | ⛔ falta criar (passo 1) |
| Gráfico de destaque e capturas | ⛔ faltam |

> Ser conta de **organização** economiza duas semanas de calendário: a regra
> dos 12 testadores por 14 dias vale para contas pessoais criadas a partir de
> nov/2023. Ainda assim, confirme no próprio console antes de enviar — o
> Google já mudou essa regra mais de uma vez.

---

## 1. A chave de assinatura

O Android só aceita atualizações do app assinadas com a **mesma chave** da
primeira publicação.

> ⚠️ **Perder essa chave significa nunca mais atualizar o VouAli na loja.**
> Não existe recuperação. Guarde uma cópia fora do computador.

### Criar

Na pasta `frontend/android/`:

```bash
keytool -genkeypair -v -keystore vouali-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias vouali
```

Ele pede uma senha e alguns dados (nome, organização, cidade, país). Anote a
senha num gerenciador de senhas — você vai precisar dela em toda publicação.

### Apontar o projeto para ela

Crie `frontend/android/key.properties` com:

```
storeFile=vouali-release.jks
storePassword=SUA_SENHA
keyAlias=vouali
keyPassword=SUA_SENHA
```

Esse arquivo e o `.jks` **já estão no `.gitignore`** — não entram no Git, e é
assim que tem de ser. O `build.gradle` só usa a assinatura se o arquivo
existir, então quem clonar o projeto sem ele continua conseguindo compilar.

### Guardar

Copie `vouali-release.jks` e a senha para dois lugares fora deste computador
(um cofre de senhas e um drive, por exemplo).

---

## 2. Gerar o arquivo para a loja

A Play Store recebe **AAB**, não APK.

```bash
npm run build && npx cap sync android
```

Depois, em `frontend/android/`:

```bash
./gradlew bundleRelease
```

O arquivo sai em `app/build/outputs/bundle/release/app-release.aab`.

> Confira que o app aponta para **produção** e não para o staging: o valor de
> `VITE_API_BASE` em `frontend/.env.production.local` é o que vai embutido.

A cada nova versão, suba `versionCode` (1 → 2 → 3…) e `versionName` em
`frontend/android/app/build.gradle`. O Play recusa dois envios com o mesmo
`versionCode`. Mantenha o `versionName` igual ao `version` do `package.json`,
que é o número mostrado nos Ajustes.

---

## 3. Formulário *Data safety*

O Google pergunta o que o app coleta. As respostas abaixo correspondem ao que
o código realmente faz — confira sempre que o app mudar.

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha dados? | **Sim** |
| Os dados são criptografados em trânsito? | **Sim** (HTTPS) |
| Dá para pedir exclusão dos dados? | **Sim** — no app e em `/excluir-conta` |

**Dados coletados:**

| Tipo | Coletado | Compartilhado | Obrigatório | Para quê |
|---|---|---|---|---|
| Nome | Sim | Não | Sim | Funcionalidade do app, gerenciamento de conta |
| Endereço de e-mail | Sim | Não | Sim | Funcionalidade do app, gerenciamento de conta |
| Outro conteúdo gerado pelo usuário *(roteiro, orçamento, notas)* | Sim | **Sim** | Sim | Funcionalidade do app |

O conteúdo da viagem conta como **compartilhado** porque é enviado à Anthropic
quando a pessoa usa o Ali. Isso está declarado na política de privacidade —
declarar aqui também é o que evita reprovação.

**Não** marque: localização, contatos, fotos, arquivos, atividade de
navegação, identificadores de publicidade, informações financeiras, saúde.
Nada disso é coletado.

---

## 4. Ficha da loja

**Nome:** `VouAli`

**Descrição curta** (até 80 caracteres):

```
Monte o roteiro da sua viagem dia a dia, controle o orçamento e tire dúvidas com o Ali.
```

*(85 caracteres — encurte para, por exemplo: "Roteiro dia a dia, orçamento no controle e um guia de IA para sua viagem.")*

**Descrição completa** (até 4000):

```
O VouAli é o seu companheiro de viagem, do planejamento ao último dia.

ROTEIRO DIA A DIA
Monte o cronograma parada por parada, com horário, como chegar e o que fazer.
Marque cada parada conforme o dia acontece e veja o progresso da viagem.

ORÇAMENTO NO CONTROLE
Defina um teto, registre o que planejou e o que já gastou, e veja quanto sobra
por categoria e por pessoa.

O ALI, SEU GUIA
O Ali é um assistente de inteligência artificial especializado em viagem. Ele
monta um roteiro completo a partir do destino, das datas e dos seus interesses,
e responde dúvidas sobre o lugar com o contexto da sua viagem em mãos.

JUNTOS NA MESMA VIAGEM
Convide quem vai com você. Todo mundo vê e edita o mesmo roteiro, sincronizado
entre os aparelhos.

FUNCIONA SEM INTERNET
No metrô, no avião ou com sinal ruim, o roteiro continua na tela.

As sugestões do Ali são estimativas e não substituem a consulta às fontes
oficiais de preços, horários e exigências de documentação.
```

**Categoria:** Viagens e local · **Classificação:** Livre

**Recursos gráficos necessários:**

| Item | Tamanho | Onde está |
|---|---|---|
| Ícone | 512×512 PNG | `frontend/public/icon-512.png` |
| Gráfico de destaque | 1024×500 | ⛔ falta criar |
| Capturas de tela do telefone | mín. 2, entre 320px e 3840px | ⛔ falta tirar |

Para as capturas: a lista de viagens, o roteiro de um dia, o orçamento e a
conversa com o Ali são as quatro telas que melhor explicam o app.

---

## 5. Links obrigatórios

Servidos pelo próprio backend, junto do app:

- Política de privacidade — `https://SEU-DOMINIO/privacidade`
- Termos de uso — `https://SEU-DOMINIO/termos`
- Exclusão de conta — `https://SEU-DOMINIO/excluir-conta`

O Google **abre e confere** o link de exclusão. Ele precisa responder sem
login e sem instalar o app.

---

## 6. Teste antes de publicar

A conta é de **organização**, então o teste fechado obrigatório com 12
testadores por 14 dias **não se aplica** — ele vale para contas pessoais
criadas a partir de nov/2023. Confirme no console assim mesmo: a regra já
mudou algumas vezes.

Mesmo dispensado, vale usar a faixa de **teste interno** (até 100 pessoas,
liberação em minutos) para instalar pela própria loja antes de abrir ao
público. É a única forma de ver o app exatamente como o usuário vai receber —
inclusive a assinatura de release, que é onde o login com Google costuma
falhar por SHA-1 faltando.

---

## 7. Antes de apertar publicar

- [ ] `VITE_API_BASE` apontando para produção, não staging
- [ ] SHA-1 da chave de **release** cadastrado no Firebase — senão o login com
      Google funciona no seu aparelho e falha para quem baixar da loja
- [ ] SHA-1 da **Play App Signing** também cadastrado (o Google gera esse
      depois do primeiro envio)
- [ ] `versionCode` maior que o do envio anterior
- [ ] Excluir conta testado de ponta a ponta num aparelho de verdade
- [ ] Chave de assinatura copiada para dois lugares seguros

---

## Depois de publicar

Fica pendente do roteiro: **notificações (FCM)** para os lembretes da viagem, e
a **Fase 5 (iOS)**, que exige Mac e conta Apple. Detalhes no [ROADMAP](ROADMAP.md).
