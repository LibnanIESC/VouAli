// ---------- Cópia local do roteiro (para o app abrir sem internet) ----------
//
// O conteúdo sempre veio do servidor: sem rede, o app abria em branco. Só que
// é justamente sem rede que ele mais serve — no metrô, dentro do avião, com
// roaming ruim. Aqui fica a última cópia do que o servidor mandou, para a
// interface ter o que mostrar na hora, antes de qualquer requisição.
//
// É um espelho, não a fonte da verdade: quem manda continua sendo o servidor.

const PREFIXO = "vouali:cache:";

// Duas contas podem usar o mesmo aparelho. Sem separar por dono, a viagem de
// uma apareceria para a outra no instante entre abrir o app e o login resolver.
let _dono = "local";
export function definirDono(uid) {
  _dono = String(uid || "local");
}

const chaveViagens = () => `${PREFIXO}${_dono}:trips`;
const chaveEstado = (id) => `${PREFIXO}${_dono}:trip:${id}`;

function ler(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    return null;   // JSON corrompido ou storage bloqueado: age como se não houvesse cópia
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (e) {
    // Espaço esgotado ou navegação privada. Descarta as cópias antigas e tenta
    // uma vez; se ainda assim não couber, o app segue só com o servidor.
    try {
      limparCache();
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e2) {}
  }
}

export const lerViagens = () => ler(chaveViagens());
export const guardarViagens = (trips) => { if (trips) gravar(chaveViagens(), trips); };

export const lerEstado = (tripId) => (tripId ? ler(chaveEstado(tripId)) : null);
export const guardarEstado = (tripId, state) => { if (tripId && state) gravar(chaveEstado(tripId), state); };

/** Apaga tudo o que este aparelho guardou — usado ao trocar de conta. */
export function limparCache() {
  try {
    const alvo = `${PREFIXO}${_dono}:`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(alvo))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}
