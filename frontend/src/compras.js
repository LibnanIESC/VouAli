// Compras dentro do app (Google Play, via RevenueCat).
//
// Divisão de papéis — a mesma do servidor:
//  - A LOJA cobra. O RevenueCat confere o recibo com o Google.
//  - O SERVIDOR do VouAli é quem credita o saldo, perguntando ao RevenueCat o
//    que a conta comprou. Nada aqui decide saldo: o app só abre a tela de
//    pagamento da loja e depois avisa "pode ter compra nova".
//
// Por isso este arquivo é pequeno e nada nele é segredo. A chave abaixo é a
// chave PÚBLICA do SDK (prefixo `goog_`): ela vai dentro de todo app e só
// serve para identificar o projeto. A chave secreta fica no servidor.
import { noApp } from "./api";

export const CHAVE_ANDROID = import.meta.env.VITE_REVENUECAT_ANDROID || "goog_AVYdhHhSGjgfQsMqepuMvewJgvN";

/** Página do app na loja — para quem está no site e quer comprar. */
export const LOJA_URL = "https://play.google.com/store/apps/details?id=app.vouali";

/**
 * Só dá para comprar dentro do app Android: é a loja dele que cobra. No site,
 * a tela do pacote aponta para a loja em vez de mostrar um botão que não anda.
 */
export const podeComprarAqui = () => noApp();

let _sdk = null;                    // plugin, carregado sob demanda (fora do site)
let _uid = null;                    // conta com que o SDK está identificado
let _fila = Promise.resolve();      // identificar/esquecer nunca correm juntos

async function sdk() {
  if (!_sdk) _sdk = await import("@revenuecat/purchases-capacitor");
  return _sdk;
}

const naFila = (fn) => {
  const proximo = _fila.then(fn, fn);
  _fila = proximo.catch(() => {});
  return proximo;
};

/**
 * Diz à loja de QUEM é a compra: a conta do VouAli (uid do Firebase).
 *
 * É o que amarra o pagamento à conta. O servidor pergunta ao RevenueCat pelas
 * compras DESTE uid — uma compra feita sem identificar ficaria num usuário
 * anônimo e nunca viraria saldo. Por isso `comprar` sempre passa por aqui.
 */
export function identificar(uid) {
  return naFila(async () => {
    if (!podeComprarAqui() || !uid) return false;
    if (_uid === uid) return true;
    try {
      const { Purchases } = await sdk();
      const { isConfigured } = await Purchases.isConfigured();
      if (isConfigured) await Purchases.logIn({ appUserID: uid });
      else await Purchases.configure({ apiKey: CHAVE_ANDROID, appUserID: uid });
      _uid = uid;
      return true;
    } catch (e) {
      return false;
    }
  });
}

/** Saiu da conta: a próxima pessoa neste aparelho não herda a identidade. */
export function esquecer() {
  return naFila(async () => {
    if (!podeComprarAqui() || !_uid) { _uid = null; return; }
    _uid = null;
    try {
      const { Purchases } = await sdk();
      await Purchases.logOut();
    } catch (e) {}
  });
}

/**
 * Busca o produto na loja. É de lá que vem o PREÇO mostrado — o app não tem
 * preço escrito em lugar nenhum, então mudar o valor no Play Console basta.
 * Devolve { produto, preco } ou null se a loja não respondeu / não tem o item.
 */
// O produto já buscado nesta sessão: a tela do pacote abre com o preço pronto,
// sem "Consultando a loja…". O preço só muda no Play Console, raramente.
const _ofertas = new Map();
export const ofertaGuardada = (produtoId) => _ofertas.get(produtoId);

export async function buscarProduto(uid, produtoId) {
  if (!produtoId) return null;
  if (_ofertas.has(produtoId)) return _ofertas.get(produtoId);
  if (!(await identificar(uid))) return null;
  try {
    const { Purchases, PRODUCT_CATEGORY } = await sdk();
    const { products } = await Purchases.getProducts({
      productIdentifiers: [produtoId],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    const produto = (products || []).find((p) => p && p.identifier === produtoId) || (products || [])[0];
    if (!produto) return null;
    const oferta = { produto, preco: produto.priceString || "" };
    _ofertas.set(produtoId, oferta);
    return oferta;
  } catch (e) {
    return null;
  }
}

/**
 * Como terminou uma tentativa de compra, a partir do erro do SDK.
 * Separado para ser testável: cancelar NÃO é falha, e mostrar "erro" a quem
 * só fechou a tela do Google é o tipo de detalhe que assusta.
 */
export function desfechoDoErro(e) {
  const codigo = String((e && e.code) != null ? e.code : "");
  const dados = (e && e.data) || {};
  const msg = String((e && e.message) || "").toLowerCase();
  if ((e && e.userCancelled) || dados.userCancelled || codigo === "1" || msg.includes("cancel")) return { cancelado: true };
  if (codigo === "20" || msg.includes("pending")) return { pendente: true };      // boleto/aprovação em análise
  if (codigo === "10" || msg.includes("network")) return { erro: "rede" };
  if (codigo === "5") return { erro: "indisponivel" };
  if (codigo === "3") return { erro: "nao_permitida" };
  return { erro: "loja" };
}

/**
 * Abre a tela de pagamento do Google para o produto.
 * Devolve { ok } | { cancelado } | { pendente } | { erro }.
 * `ok` quer dizer só "a loja cobrou": o saldo aparece depois que o servidor
 * conferir (ver `apiSincronizarCompras`).
 */
export async function comprar(uid, produto) {
  if (!produto || !(await identificar(uid))) return { erro: "loja" };
  try {
    const { Purchases } = await sdk();
    await Purchases.purchaseStoreProduct({ product: produto });
    return { ok: true };
  } catch (e) {
    return desfechoDoErro(e);
  }
}

/**
 * Reenvia ao RevenueCat recibos que o aparelho ainda tenha (compra feita com
 * o app fechando no meio, por exemplo). Silencioso: é só uma garantia a mais
 * antes de pedir ao servidor para conferir.
 */
export async function reenviarRecibos(uid) {
  if (!(await identificar(uid))) return;
  try {
    const { Purchases } = await sdk();
    await Purchases.syncPurchases();
  } catch (e) {}
}
