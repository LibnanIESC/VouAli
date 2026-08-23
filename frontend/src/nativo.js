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
 * Botão "voltar" do Android.
 *
 * No Android o voltar é sagrado: se ele fechar o app quando havia algo aberto,
 * a pessoa perde o que estava fazendo. A ordem aqui é a esperada:
 * fecha o que está por cima → volta para o Roteiro → só então sai do app.
 *
 * `estado()` devolve { temOverlay, aba } e as ações fecham/navegam.
 */
export async function tratarBotaoVoltar(estado, acoes) {
  if (!estaNoApp()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const ouvinte = await App.addListener("backButton", () => {
      const { temOverlay, aba } = estado();
      if (temOverlay) return acoes.fecharOverlay();
      if (aba !== "roteiro") return acoes.irParaRoteiro();
      App.exitApp();
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
