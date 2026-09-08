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
| Chave de assinatura | ✅ criada e guardada |
| Gráfico de destaque e capturas | ✅ prontos em `loja/` |
| AAB versão 1.0 | ✅ publicado no teste interno |
| SHA-1 no Firebase | ✅ os três (debug, upload e Play App Signing) |
| Ficha da loja e Data safety | ⛔ faltam preencher |

> Ser conta de **organização** economiza duas semanas de calendário: a regra
> dos 12 testadores por 14 dias vale para contas pessoais criadas a partir de
> nov/2023. Ainda assim, confirme no próprio console antes de enviar — o
> Google já mudou essa regra mais de uma vez.

---

## 0.1 Os ambientes

Decidido em 26/08/2026. Há três papéis e, até a viagem de Nova York terminar,
apenas dois servidores para eles.

| Endereço | Papel até 13/10/2026 | Depois |
|---|---|---|
| `vouali.up.railway.app` | Viagem de Nova York — **não se toca** | vira o laboratório |
| `vouali-app.up.railway.app` | **Produção do app público** | continua produção |

O que o staging tinha já é o que a produção precisa: contas Firebase,
Postgres, cotas. Por isso ele foi promovido em vez de recriado — e renomeado
de `vouali-stg` para `vouali-app`, porque "stg" numa política de privacidade
publicada por uma empresa não passa boa impressão.

> O serviço promovido continua publicando a partir do branch **`staging`**, e
> isso é de propósito. Apontá-lo para `main` levaria todo o código novo ao
> serviço da viagem de NY, que é o que não pode acontecer. Os nomes se
> arrumam em outubro, sem risco.

> ⚠️ **Até 13/10 não existe laboratório.** Toda alteração no BACKEND que for
> ao ar cai direto nos usuários. Alteração no APP não corre esse risco: dá
> para instalar por USB, testar no celular e só publicar na loja depois de
> aprovada. Nessa janela, mudança de backend só com os testes verdes e sem
> pressa.

Depois de 13/10: exportar o roteiro da viagem de NY, esvaziar o serviço
`vouali` e passar a usá-lo como laboratório. Aí a regra normal volta —
nada vai para produção sem passar por lá.

**Domínio próprio:** ainda não há. Os links legais usam o endereço do Railway.
Quando a Libnan registrar um domínio, apontá-lo no Railway resolve de uma vez
o endereço da API e os três links da Play Store.

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

### 1.1 As impressões digitais

São **duas chaves diferentes** e é aí que quase todo mundo tropeça: você assina
o envio, o Google **reassina** o app antes de entregar. Quem chega no celular
de quem baixa da loja é a chave do Google — então o Firebase precisa conhecer
as duas, mais a de depuração.

| SHA-1 | Chave | Vem de |
|---|---|---|
| `40:c7:0e:41:…:14:51` | debug | `gradlew signingReport` |
| `7a:1a:c0:5a:…:1c:c5` | upload | o `vouali-release.jks` deste guia |
| `70:b6:f0:f1:…:13:e8` | **a que chega no celular** | extraída do APK instalado (abaixo) |
| `48:5b:d1:cf:…:0e:c2` | pós-quântica (Beta) | cadastrada por engano; inofensiva, fica para o futuro |

Todas em Firebase → projeto `vouali` → ⚙ Configurações do projeto → app
`app.vouali` → **Adicionar impressão digital**. São valores **públicos**.

> Adicionar uma impressão digital **não exige** gerar um AAB novo: ela vale no
> servidor do Google, não dentro do app.

#### ⚠️ Não confie na tela do Play Console

A tela *Assinatura de apps* mostra a chave em duas colunas lado a lado —
**Chave clássica** e **Chave de criptografia pós-quântica (Beta)** — com botões
de copiar idênticos. Copiar da coluna errada dá um SHA-1 plausível que **não
funciona**, e o sintoma é mudo: o login simplesmente falha, sem dizer por quê.
No `adb logcat` aparece só um aviso genérico:

```
W/Auth [GetTokenResponseHandler] Server returned error:
This android application is not registered to use OAuth2.0
```

Esse erro parece propagação lenta e **não é**. O jeito confiável é ler a
assinatura do APK que está de fato no aparelho:

```bash
adb pull $(adb shell pm path app.vouali | sed 's/package://') instalado.apk
apksigner verify --print-certs --min-sdk-version 24 --max-sdk-version 36 instalado.apk
```

O `--max-sdk-version 36` não é firula: o Google já assina com um bloco híbrido
pós-quântico (ML-DSA) que o `apksigner` local não valida, e sem esse limite o
comando aborta antes de imprimir o certificado clássico. O `keytool` não serve
aqui — o APK não tem assinatura no esquema antigo de JAR.

A linha `V3.0 Signer: certificate SHA-1 digest` é a resposta. Se ela não bater
com o que está no Firebase, o login vai falhar por mais que se espere.

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

> ⚠️ **Java 21, e o do sistema é o 17.** O `JAVA_HOME` desta máquina aponta
> para `C:\Program Files\Java\jdk-17`, e o Gradle para com *"Cannot find a Java
> installation matching languageVersion=21"*. O Android Studio traz o 21
> embutido; no Prompt de Comando, antes do build:
>
> ```
> set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
> ```
>
> E é `gradlew`, não `./gradlew` — o `./` é sintaxe de Linux e o Prompt de
> Comando responde *"'.' não é reconhecido"*.

### 2.1 Instalar uma build de teste no celular

```bash
gradlew installDebug
```

**Desinstale antes o app vindo da Play Store.** A build de debug é assinada com
outra chave, e o Android recusa a troca com `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
O login com Google continua funcionando: a chave de debug está no Firebase
desde o início. Terminado o teste, reinstale pela loja para voltar à versão de
produção.

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

| Seção | Tipo | Coletado | Compartilhado | Para quê |
|---|---|---|---|---|
| Informações pessoais | Nome | Sim | Não | Funcionalidade, conta |
| Informações pessoais | Endereço de e-mail | Sim | Não | Funcionalidade, conta |
| Informações pessoais | IDs do usuário *(uid na tabela `users`)* | Sim | Não | Funcionalidade, conta |
| Mensagens | Outras mensagens no app *(conversa com o Ali)* | Sim | **Sim** | Funcionalidade |
| Atividade no app | Outro conteúdo do usuário *(roteiro, orçamento, notas)* | Sim | **Sim** | Funcionalidade |

O conteúdo da viagem conta como **compartilhado** porque é enviado à Anthropic
quando a pessoa usa o Ali. Isso está declarado na política de privacidade —
declarar aqui também é o que evita reprovação.

As conversas com o Ali são **processadas de forma efêmera**: não existe tabela
de mensagens no banco; elas são reenviadas pelo cliente a cada pergunta e
descartadas depois da resposta. Marque essa opção quando o formulário
oferecer — é verdade e melhora a ficha.

**Não** marque: localização, contatos, fotos, arquivos, agenda, áudio,
navegação na Web, informações financeiras, saúde. Também não marque
*Informações e desempenho do app* nem *Identificadores do dispositivo*: o
projeto não tem Analytics nem Crashlytics, e o que o Google Play coleta por
conta própria é isento.

**Não** marque: localização, contatos, fotos, arquivos, atividade de
navegação, identificadores de publicidade, informações financeiras, saúde.
Nada disso é coletado.

### 3.1 Os outros oito formulários de "Conteúdo do app"

| Formulário | Resposta |
|---|---|
| Política de Privacidade | `https://vouali-app.up.railway.app/privacidade` |
| Detalhes do login | restrito — instruções abaixo, sem credenciais |
| Anúncios | não contém |
| Classificação de conteúdo | Utilitário/produtividade · tudo "não", exceto interação entre usuários |
| Público-alvo | **somente 18+** |
| Apps governamentais · Recursos financeiros · Saúde | não |

**Detalhes do login.** Os campos de usuário e senha são opcionais: o VouAli
não precisa de conta de teste, porque entrar está aberto a qualquer pessoa.
As instruções precisam estar **em inglês** e caber em 500 caracteres.

> ⚠️ No app há **só o Google**. O link mágico por e-mail existe apenas na web
> — `App.jsx` passa `permiteEmail={!noApp()}`, porque no Android o fluxo sai
> para o navegador e depende de deep link verificado para voltar. Prometer o
> login por e-mail nas instruções faria o revisor procurar uma opção que não
> existe, e reprovar por não conseguir acessar o app.

**Interação entre usuários: sim.** O compartilhamento de viagem faz duas
pessoas editarem o mesmo roteiro. Responder "não" seria falso, e declaração
incorreta custa mais tempo do que os requisitos extras que o "sim" traz.

**Público-alvo 18+ é escolha deliberada.** Incluir faixas menores põe o app na
Política Famílias, que exige tratamento próprio para conteúdo de IA dirigido a
menores. O Ali gera texto livre; a faixa adulta evita isso sem custo real de
alcance.

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

**Tipo:** App · **Categoria:** Turismo e guia local · **Classificação:** Livre

> A categoria se chamava "Viagens e local" (*Travel & Local*) e o Google a
> renomeou. É a mesma.

**Declaração de recursos de IA:** rotular **todos** os recursos gráficos. O
logotipo e a ilustração do Ali vêm das imagens geradas por IA em
`identidade-visual-vouali/project/assets/`, e aparecem no ícone, no gráfico de
destaque e em todas as capturas. Rotular não penaliza o app; declarar de menos
é violação de política.

**Recursos gráficos necessários:**

| Item | Tamanho | Onde está |
|---|---|---|
| Ícone | 512×512 | `frontend/public/icon-512.png` |
| Gráfico de destaque | 1024×500 | `loja/destaque-1024x500.png` |
| Capturas do telefone | 1220×2440, cinco | `loja/capturas/` |

As capturas saem do celular em 1220×2712 e são recortadas para **1220×2440**
por `identidade-visual-vouali/preparar-capturas.py`. O recorte não é enfeite:
2712/1220 = 2,22 e a Play Store recusa acima de **2:1**. Tirar as barras de
status e de navegação resolve a proporção e ainda limpa a imagem — bateria e
relógio de outra pessoa não ajudam ninguém a decidir baixar.

Sobem na ordem numérica; a primeira é a que aparece em destaque. As telas
escolhidas — lista de viagens, roteiro do dia, orçamento, Ali e "comprar
antes" — são as que explicam o app sem precisar de legenda.

---

## 5. Links obrigatórios

Servidos pelo próprio backend, junto do app — copie e cole no Play Console:

- Política de privacidade — `https://vouali-app.up.railway.app/privacidade`
- Termos de uso — `https://vouali-app.up.railway.app/termos`
- Exclusão de conta — `https://vouali-app.up.railway.app/excluir-conta`

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

- [x] `VITE_API_BASE` apontando para produção, não staging
- [x] SHA-1 da chave de **release** cadastrado no Firebase — senão o login com
      Google funciona no seu aparelho e falha para quem baixar da loja
- [x] SHA-1 da **Play App Signing** também cadastrado (o Google gera esse
      depois do primeiro envio)
- [x] `versionCode` maior que o do envio anterior
- [x] Excluir conta testado de ponta a ponta num aparelho de verdade
- [x] Chave de assinatura copiada para dois lugares seguros
- [x] **Login com Google testado com o app instalado pela loja** — é o único
      item que o cabo USB não prova, porque pelo cabo a assinatura é outra
- [ ] `ENVIRONMENT=production` nas variáveis do Railway (hoje ainda `staging`)

---

## Depois de publicar

Fica pendente do roteiro: **notificações (FCM)** para os lembretes da viagem, e
a **Fase 5 (iOS)**, que exige Mac e conta Apple. Detalhes no [ROADMAP](ROADMAP.md).
