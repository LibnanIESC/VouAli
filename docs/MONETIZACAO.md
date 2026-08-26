# Fase 6 — Monetização

Plano para o VouAli se pagar. Nada aqui bloqueia a publicação: o app vai ao ar
gratuito, e a assinatura entra depois — com dados de uso real na mão.

---

## 1. A restrição que define tudo

O VouAli tem **custo variável por uso**. Cada conversa com o Ali e cada roteiro
gerado consomem API da Anthropic, e a geração é a operação cara: ela escreve o
roteiro inteiro, com orçamento e notas.

Isso o separa de um app como o "Já Tomou?", onde o 3º remédio custa zero e o
limite é puro produto. Aqui:

- **Usuário gratuito generoso demais dá prejuízo**, não "menos lucro".
- **"Ilimitado" é perigoso**: um usuário pesado custa mais do que paga.

Todo o desenho abaixo sai daí.

---

## 2. Onde fica a parede

O momento em que alguém decide que o VouAli vale dinheiro é **ver o Ali montar
um roteiro completo em quinze segundos**. Isso precisa ser sentido de graça —
uma vez.

> **"O primeiro roteiro é por nossa conta."**

Um roteiro grátis por CONTA, não por mês. Por mês, cada usuário que nunca vai
pagar custaria doze gerações por ano; uma vez na vida é a degustação que
converte sem sangrar.

### Os planos

| | Grátis | Premium |
|---|---|---|
| Viagens | **ilimitadas** | ilimitadas |
| Roteiro gerado pelo Ali | **1, uma vez** | **10 por mês** |
| Conversas com o Ali | 10 por mês | 300 por mês |
| Dicas de parada | 5 por mês | 100 por mês |
| Orçamento, offline, compartilhar, exportar | tudo | tudo |

**Viagens ilimitadas no grátis** é deliberado: limitar viagem pune quem
organiza, não quem custa. E quanto mais viagens a pessoa cadastra, mais o app
vira parte da rotina dela — e mais provável que pague quando quiser o Ali.

**Nada de "ilimitado" na comunicação.** Com custo por uso, prometer ilimitado é
convite a prejuízo. Números generosos que ninguém normal alcança dão o mesmo
efeito comercial, sem o risco, e são honestos.

---

## 3. A sazonalidade, que é o risco do modelo

App de viagem é usado **em rajadas**: planeja, viaja, some por seis meses. O
"Já Tomou?" é usado todo dia, para sempre — mensalidade encaixa nele.

Não quebra o modelo, mas muda a estratégia:

- O **anual** precisa custar bem menos que doze mensais (algo como cinco ou
  seis meses). Ele é para quem viaja duas ou mais vezes por ano.
- Vale um terceiro produto: o **passe de viagem** — pagamento único que libera
  o Ali sem limites para UMA viagem. Casa com como as pessoas realmente usam e
  converte quem nunca assinaria nada.

---

## 4. O preço sai de conta, não de palpite

O app **já registra `tokens_in` e `tokens_out` por usuário e por mês**. Depois
de algumas semanas no ar, dá para saber:

- Custo médio por usuário gratuito
- Custo médio de quem usa muito
- Onde as pessoas realmente batem na parede

**Só então o preço é decidido.** Antes disso, qualquer número é chute — e chute
errado aqui custa: barato demais dá prejuízo, caro demais não converte.

Primeira entrega da fase: um painel que mostre esses números.

---

## 5. Arquitetura

### A regra inegociável

> **O aplicativo NUNCA decide se o usuário é premium.** Quem decide é o
> servidor.

Se o app disser "sou premium" e o servidor acreditar, qualquer pessoa
desbloqueia tudo com o app modificado. O cliente só informa que houve uma
compra; o servidor confirma com o Google antes de liberar.

### Peças

| Peça | O que faz |
|---|---|
| Produtos no Play Console | assinatura mensal, anual e (se houver) o passe |
| Plugin de compra no app | abre a tela de pagamento do Google |
| Validação no servidor | confirma a compra direto com o Google |
| Plano na conta | qual plano, até quando, de onde veio |
| Cotas por plano | o sistema de cotas já existe; hoje é igual para todos |

### Validar a compra: dois caminhos

**A — Google Play Billing direto.** Sem terceiros, sem taxa extra, os dados de
compra não saem do Google e da Libnan. Mais trabalho: renovação, cancelamento,
reembolso, período de carência e as notificações do Google ficam por nossa
conta.

**B — RevenueCat.** Cuida da validação, do estado da assinatura e dos avisos de
renovação. Reduz muito o trabalho e o risco de errar num fluxo que é chato de
testar. Em troca: mais um terceiro recebendo dado de compra — o que obriga a
**atualizar a política de privacidade e o formulário Data safety** — e uma taxa
sobre a receita depois de um certo faturamento.

**Recomendação:** começar pelo **B**, porque o risco de errar validação de
assinatura na mão é alto e o prejuízo é silencioso (gente usando premium sem
pagar, ou pagando sem receber). Migrar para o A depois, se o volume justificar.

### Regras de produto que não podem ser esquecidas

- **Perder a assinatura NUNCA apaga dado.** Vencido, o usuário volta às cotas
  do plano gratuito e continua vendo todas as suas viagens, roteiros e
  orçamentos. Bloquear o que a pessoa já criou seria sequestro do dado dela.
- **Trocar de celular não perde o que foi pago.** Como o plano fica na conta do
  servidor e não no aparelho, isso sai de graça — desde que ninguém tenha a
  ideia de guardar o plano localmente.
- **Cancelar não é banir.** A pessoa mantém acesso pago até o fim do período
  que já pagou.

---

## 6. Etapas

| | Etapa | Depende de |
|---|---|---|
| **6.1** | Painel de custo por usuário (tokens já gravados) | nada — pode começar hoje |
| **6.2** | Semanas de uso real → decidir preço e ajustar as cotas | app publicado |
| **6.3** | Produtos criados no Play Console (mensal e anual) | conta de comerciante |
| **6.4** | Plano na conta + cotas por plano no servidor | 6.3 |
| **6.5** | Compra no app + validação no servidor | 6.4 |
| **6.6** | Tela de upgrade, onde a parede convida em vez de irritar | 6.5 |
| **6.7** | Restaurar compras, expiração, cancelamento | 6.5 |
| **6.8** | *(opcional)* Passe de viagem | depois de ver o comportamento real |

A **6.1** é a única que dá para fazer antes de publicar, e é a que evita
escolher o preço no escuro.

---

## 7. O que ainda não está decidido

- **Preço** — sai da 6.2, com dados
- **RevenueCat ou billing direto** — recomendação acima, mas é decisão da Libnan
- **Passe de viagem** — só faz sentido se a sazonalidade se confirmar nos dados
- **Conta de comerciante** — precisa dos dados bancários da Libnan aprovados
  pelo Google antes de qualquer venda

---

## 8. O risco a vigiar

O fusível global `ALI_MONTHLY_CAP` existe e continua valendo depois da
monetização. Ele é a última linha de defesa: se o consumo do mês estourar o
teto, a IA descansa para todo mundo. Com usuários pagantes isso vira um
problema de reputação, então o teto precisa ser revisto para caber a base
pagante com folga — e monitorado, não esquecido.
