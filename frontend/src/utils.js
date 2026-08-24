// id curto e único o bastante para itens locais (paradas, orçamento, notas)
export const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Campos de valor (orçamento, teto) ----------
//
// `<input type="number">` guarda uma armadilha: o React decide se precisa
// corrigir a tela comparando com `!=`, e "0130" != 130 é FALSO — então ele
// deixa o "0130" na tela enquanto o estado já vale 130. O valor salvo estava
// certo; só o que aparecia é que não. Por isso estes campos são de texto, com
// teclado numérico, e o conteúdo é normalizado a cada tecla.

/** Deixa passar só dígitos e um separador decimal, sem zeros à esquerda. */
export function digitarNumero(texto) {
  let t = String(texto ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  const partes = t.split(".");
  t = partes.length > 1 ? `${partes[0]}.${partes.slice(1).join("")}` : partes[0];
  return t.replace(/^0+(?=\d)/, "");   // "0130" -> "130", mas "0.5" fica "0.5"
}

/** Texto do campo -> número guardado. Campo vazio ou incompleto vale zero. */
export const numeroDoCampo = (texto) => Number(digitarNumero(texto)) || 0;

/**
 * Número guardado -> texto do campo. Zero vira campo VAZIO: com "0" escrito,
 * a pessoa digita ao lado dele e o valor sai errado.
 */
export const campoDeNumero = (n) => (Number(n) > 0 ? String(Number(n)) : "");
