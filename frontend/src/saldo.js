// Saldo do Ali: contas e textos. Tudo puro (sem tela, sem rede) de propósito —
// é aqui que mora o que a pessoa lê quando o Ali para, e errar esse texto é
// errar a venda. Fica testável fora de um celular.
//
// Os tipos são os do servidor: chat (conversa), gen (roteiro), tip (dica).

export const TIPOS = ["gen", "chat", "tip"];

const NOMES = {
  chat: ["conversa", "conversas"],
  gen: ["roteiro", "roteiros"],
  tip: ["dica", "dicas"],
};

/** "1 roteiro", "100 conversas". */
export function quantos(n, tipo) {
  const [um, varios] = NOMES[tipo] || ["", ""];
  const v = Math.max(0, Number(n) || 0);
  return `${v} ${v === 1 ? um : varios}`;
}

/** { gen: 3, chat: 100, tip: 50 } → "3 roteiros, 100 conversas e 50 dicas". */
export function resumoDoPacote(pacote) {
  const partes = TIPOS.filter((t) => Number((pacote || {})[t]) > 0).map((t) => quantos(pacote[t], t));
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** É um aviso de "sem saldo" do servidor? */
export const ehPaywall = (r) => !!r && r.error === "paywall";

/**
 * De onde vem o que a pessoa pode gastar nesta viagem:
 * "passe" (pago), "degustacao" (grátis, e vale aqui) ou "nada".
 */
export function origemDoSaldo(saldo) {
  if (!saldo) return "nada";
  if (saldo.passe) return "passe";
  const d = saldo.degustacao || {};
  if (d.vale_nesta_viagem && TIPOS.some((t) => Number(d[t]) > 0)) return "degustacao";
  return "nada";
}

/** Quanto resta de um tipo nesta viagem (0 quando não se sabe). */
export const resta = (saldo, tipo) => Math.max(0, Number(((saldo || {}).disponivel || {})[tipo]) || 0);

/**
 * Título e explicação da tela do passe, conforme o motivo do bloqueio.
 * `motivo` vem do servidor: "dias" (a degustação não cobre viagem deste
 * tamanho), "esgotado" (há passe, mas aquele tipo acabou) ou "sem_passe".
 * Sem motivo, a pessoa abriu a tela por conta própria.
 */
export function textoDoPaywall({ tipo, motivo, dias, max_dias } = {}) {
  if (motivo === "dias") {
    return {
      titulo: "Esta viagem pede o passe",
      texto: `A degustação do Ali vale para viagens de até ${max_dias} dias${dias > 0 ? `, e esta tem ${dias}` : ""}. Com o passe, ele planeja esta viagem inteira com você.`,
    };
  }
  if (motivo === "esgotado") {
    const o = { chat: "As conversas", gen: "Os roteiros", tip: "As dicas" }[tipo] || "Os usos";
    return {
      titulo: `${o} deste passe acabaram`,
      texto: "Um novo passe renova conversas, roteiros e dicas desta viagem. O que já está salvo continua aqui.",
    };
  }
  if (motivo === "sem_passe") {
    return {
      titulo: "Sua degustação do Ali acabou",
      texto: "Você já usou o que vinha de graça. Com o passe, o Ali segue com você nesta viagem inteira.",
    };
  }
  return {
    titulo: "Passe de viagem",
    texto: "Com o passe, o Ali planeja uma viagem inteira com você: roteiro, conversa e dicas.",
  };
}

/**
 * O que o Ali responde, no chat, quando o saldo de conversas acaba.
 * Primeira pessoa e sem drama: o roteiro continua lá, só o Ali para.
 */
export function falaDoAliSemSaldo({ motivo, dias, max_dias } = {}) {
  if (motivo === "dias") {
    return `Minha degustação vale para viagens de até ${max_dias} dias${dias > 0 ? `, e esta tem ${dias}` : ""} 😊 Com o passe de viagem eu sigo com você nela inteira — e tudo que já está no roteiro continua aqui.`;
  }
  if (motivo === "esgotado") {
    return "As conversas do passe desta viagem acabaram 😅 Um novo passe traz mais — e o roteiro, o orçamento e as dicas já salvos continuam todos aqui.";
  }
  return "Você já usou as conversas da degustação 😊 Com o passe de viagem eu sigo com você nesta viagem inteira — e o que já está salvo continua aqui.";
}
