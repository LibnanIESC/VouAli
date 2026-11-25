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

/**
 * Uma linha com os três saldos: "2 roteiros · 99 conversas · 50 dicas".
 * Mostra também os zerados (esconder um tipo faria parecer que ele não existe)
 * e diz "esgotado" quando tudo acabou.
 */
export function linhaDoSaldo(r) {
  const v = TIPOS.map((t) => Math.max(0, Number((r || {})[t]) || 0));
  if (v.every((n) => n === 0)) return "esgotado";
  return TIPOS.map((t, i) => quantos(v[i], t)).join(" · ");
}

/**
 * De onde veio o saldo, para ele não parecer errado: "2 pacotes comprados ·
 * 1 reembolsado". Vazio se a conta nunca comprou.
 */
export function linhaDasCompras(c) {
  const n = Math.max(0, Number((c || {}).pacotes) || 0);
  const r = Math.min(n, Math.max(0, Number((c || {}).reembolsados) || 0));
  if (!n) return "";
  const comprados = n === 1 ? "1 pacote comprado" : `${n} pacotes comprados`;
  if (!r) return comprados;
  return `${comprados} · ${r === 1 ? "1 reembolsado" : `${r} reembolsados`}`;
}

/** É um aviso de "sem saldo" do servidor? */
export const ehPaywall = (r) => !!r && r.error === "paywall";

/**
 * De onde vem o que a pessoa pode gastar nesta viagem:
 * "pacote" (créditos pagos — os dela ou os do dono da viagem), "degustacao"
 * (grátis, e vale aqui) ou "nada".
 */
export function origemDoSaldo(saldo) {
  if (!saldo) return "nada";
  const dono = saldo.dono && saldo.dono.creditos;
  if (saldo.tem_pacote || (dono && TIPOS.some((t) => Number(dono[t]) > 0))) return "pacote";
  const d = saldo.degustacao || {};
  if (d.vale_nesta_viagem && TIPOS.some((t) => Number(d[t]) > 0)) return "degustacao";
  return "nada";
}

/** Quanto resta de um tipo nesta viagem (0 quando não se sabe). */
export const resta = (saldo, tipo) => Math.max(0, Number(((saldo || {}).disponivel || {})[tipo]) || 0);

/**
 * Título e explicação da tela do Pacote VouAli, conforme o motivo do bloqueio.
 * `motivo` vem do servidor: "dias" (a degustação não cobre viagem deste
 * tamanho), "esgotado" (há pacote, mas aquele tipo acabou), "reembolsado" ou
 * "sem_passe" (a degustação acabou e nunca houve pacote). Sem motivo, a pessoa
 * abriu a tela por conta própria.
 */
export function textoDoPaywall({ tipo, motivo, dias, max_dias } = {}) {
  if (motivo === "dias") {
    return {
      titulo: "Esta viagem pede o Pacote VouAli",
      texto: `A degustação do Ali vale para viagens de até ${max_dias} dias${dias > 0 ? `, e esta tem ${dias}` : ""}. Com o Pacote VouAli, ele planeja esta e as próximas viagens com você.`,
    };
  }
  if (motivo === "reembolsado") {
    return {
      titulo: "Seu Pacote VouAli foi reembolsado",
      texto: "Como a compra foi estornada, os créditos dela deixaram de valer. O que o Ali já fez continua nas suas viagens. Para seguir com ele, é preciso um novo pacote.",
    };
  }
  if (motivo === "esgotado") {
    const o = { chat: "As conversas", gen: "Os roteiros", tip: "As dicas" }[tipo] || "Os créditos";
    return {
      titulo: `${o} do pacote acabaram`,
      texto: "Um novo Pacote VouAli traz mais roteiros, conversas e dicas, para usar em qualquer viagem. O que já está salvo continua aqui.",
    };
  }
  if (motivo === "sem_passe") {
    return {
      titulo: "Sua degustação do Ali acabou",
      texto: "Você já usou o que vinha de graça. Com o Pacote VouAli, o Ali segue com você em qualquer viagem.",
    };
  }
  return {
    titulo: "Pacote VouAli",
    texto: "Créditos do Ali para usar em qualquer viagem: roteiros, conversas e dicas.",
  };
}

/**
 * O que o Ali responde, no chat, quando o saldo de conversas acaba.
 * Primeira pessoa e sem drama: o roteiro continua lá, só o Ali para.
 */
export function falaDoAliSemSaldo({ motivo, dias, max_dias } = {}) {
  if (motivo === "dias") {
    return `Minha degustação vale para viagens de até ${max_dias} dias${dias > 0 ? `, e esta tem ${dias}` : ""} 😊 Com o Pacote VouAli eu sigo com você nela inteira — e tudo que já está no roteiro continua aqui.`;
  }
  if (motivo === "reembolsado") {
    return "O seu Pacote VouAli foi reembolsado, então eu parei por aqui 😊 Tudo que já está no roteiro continua aqui — e com um novo pacote eu sigo com você.";
  }
  if (motivo === "esgotado") {
    return "As conversas do seu pacote acabaram 😅 Um novo Pacote VouAli traz mais — e o roteiro, o orçamento e as dicas já salvos continuam todos aqui.";
  }
  return "Você já usou as conversas da degustação 😊 Com o Pacote VouAli eu sigo com você em qualquer viagem — e o que já está salvo continua aqui.";
}
