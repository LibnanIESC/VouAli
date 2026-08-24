// Comportamentos que só existem dentro do app Android/iOS (Capacitor).
// No site, todas estas funções são silenciosamente ignoradas.
import { noApp } from "./api";

export function estaNoApp() {
  return noApp();
}

/**
 * Barra de status: hora, bateria, sinal.
 *
 * Só dá para mandar na COR DOS ÍCONES. Pintar o fundo não funciona mais: o
 * Android desenha o conteúdo por baixo da barra (imposto a partir do Android
 * 15, sem opção de desligar no 16), então quem aparece atrás dos ícones é o
 * próprio topo do app. Quem reserva esse espaço é o CSS, via `safeTop()`.
 *
 * Por isso a cor tem de acompanhar a tela: o app tem telas creme (lista de
 * viagens, login, abertura) e telas escuras (a viagem, com foto e véu marinho).
 * Cor fixa deixa os ícones invisíveis em metade do app.
 *
 * Atenção ao nome no plugin, que engana: `Style.Dark` significa "texto CLARO,
 * para fundo escuro" — o oposto do que parece.
 */
export async function ajustarBarraDeStatus(fundoClaro) {
  if (!estaNoApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: fundoClaro ? Style.Light : Style.Dark });
  } catch (e) {}
}

/**
 * Decide o que o botão "voltar" do Android faz, dado o estado da tela.
 *
 * No Android o voltar é sagrado: se ele fechar o app quando havia algo aberto,
 * a pessoa perde o que estava fazendo. Desfaz-se um degrau por vez, e sair é
 * sempre o último — fecha o que está por cima → volta para o Roteiro → volta
 * para a lista de viagens → só então sai.
 *
 * Fica separado da instalação do ouvinte de propósito: é a regra mais fácil de
 * quebrar sem querer e a única testável fora de um celular.
 */
export function passoDoVoltar({ temOverlay, aba, vista }) {
  if (temOverlay) return "fecharOverlay";
  if (vista !== "lista") return aba !== "roteiro" ? "irParaRoteiro" : "irParaLista";
  return "sair";
}

/** Liga o botão voltar do Android. `estado()` devolve { temOverlay, aba, vista }. */
export async function tratarBotaoVoltar(estado, acoes) {
  if (!estaNoApp()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const ouvinte = await App.addListener("backButton", () => {
      const passo = passoDoVoltar(estado());
      if (passo === "sair") return App.exitApp();
      acoes[passo]();
    });
    return () => ouvinte.remove();
  } catch (e) {
    return () => {};
  }
}

// Vibração curta ao concluir algo (feedback tátil, como app nativo).
export async function vibrar() {
  if (!estaNoApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {}
}

// Esconde a splash nativa quando o app já tem o que mostrar.
export async function esconderSplashNativa() {
  if (!estaNoApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch (e) {}
}
