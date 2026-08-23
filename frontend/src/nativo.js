// Comportamentos que só existem dentro do app Android/iOS (Capacitor).
// No site, todas estas funções são silenciosamente ignoradas.
import { noApp } from "./api";

export function estaNoApp() {
  return noApp();
}

/**
 * Barra de status.
 *
 * Só dá para mandar na COR DOS ÍCONES. Pintar o fundo da barra não funciona
 * mais: o Android desenha o conteúdo por baixo dela (comportamento imposto a
 * partir do Android 15, sem opção de desligar no 16), então quem aparece atrás
 * dos ícones é o próprio topo do app. Quem reserva esse espaço é o CSS, via
 * `safeTop()` — ver theme.js.
 *
 * Ícones claros porque o topo do app é escuro (foto da viagem + véu marinho).
 */
export async function ajustarBarraDeStatus() {
  if (!estaNoApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });      // ícones claros
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
