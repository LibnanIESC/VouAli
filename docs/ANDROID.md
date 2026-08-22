# Gerar o app Android

O VouAli usa **Capacitor**: a mesma interface React que roda no site é
empacotada dentro de um app nativo. Você não escreve Kotlin — o Capacitor
gera e mantém o projeto Android.

---

## 1. O que instalar na máquina (uma vez)

| Programa | Para quê |
|---|---|
| **Android Studio** | Traz o SDK do Android, o emulador e o compilador |
| **JDK 21** | Normalmente já vem junto com o Android Studio |

No Android Studio, abra **More Actions → SDK Manager** e confirme que estão
marcados: *Android SDK Platform* (API 35 ou superior), *Android SDK
Build-Tools* e *Android SDK Platform-Tools*.

---

## 2. Criar o projeto Android (uma vez)

Na pasta `frontend/`:

```bash
npm run build
npx cap add android
```

Isso cria a pasta `frontend/android/` — é o projeto nativo. **Comite essa
pasta**: é lá que ficam ícone, permissões e configurações do app.

---

## 3. Apontar o app para o servidor

No site, a interface e a API moram no mesmo endereço. No app, a interface
roda **dentro do aparelho** — então ela precisa saber onde fica o servidor.

Crie o arquivo `frontend/.env.production.local`:

```
VITE_API_BASE=https://vouali.up.railway.app
```

> Para testar contra o staging, use `https://vouali-stg.up.railway.app`.
> Sem essa variável, o app tentaria falar consigo mesmo e não acharia a API.

---

## 4. Gerar e instalar no seu celular

```bash
npm run build
npx cap sync android
npx cap open android      # abre o Android Studio
```

No Android Studio: conecte o celular por USB (com *Depuração USB* ligada) e
clique em **Run ▶**. O app é instalado direto.

Para gerar um arquivo instalável:
**Build → Build Bundle(s) / APK(s) → Build APK(s)**

> Sempre que mudar o código da interface, rode `npm run build && npx cap sync android`.
> Sem o `sync`, o app continua com a versão antiga embarcada.

---

## 5. Antes de publicar na Play Store

- [ ] **Keystore de assinatura** (guarde com cuidado: perdido = não dá mais para atualizar o app)
- [ ] **Login com Google nativo** — dentro do app, a janelinha de login do
      navegador não funciona bem; é preciso o plugin nativo
- [ ] **Push (FCM)** para os lembretes da viagem
- [ ] **Ícone adaptativo** e telas de apresentação da loja
- [ ] Política de privacidade, exclusão de conta e formulário *Data safety*

Detalhes de cada item no [ROADMAP](ROADMAP.md) (fases 3 e 4).

---

## O que já está pronto no código

- Endereço da API configurável (`VITE_API_BASE`) e **CORS liberado** no
  servidor para a origem do app
- **Botão voltar** do Android tratado: fecha o que está aberto → volta ao
  Roteiro → só então sai do app
- **Barra de status** na cor da marca e splash nativa controlada pelo app
- **Vibração curta** ao concluir uma parada
- Tudo isso é ignorado no site — o mesmo código serve aos dois.
