// id curto e único o bastante para itens locais (paradas, orçamento, notas)
export const uid = () => Math.random().toString(36).slice(2, 9);
