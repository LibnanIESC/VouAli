// Toasts globais (substituem os alert() nativos): pub/sub minimalista.
const subs = new Set();
export function toast(msg) { subs.forEach((f) => f(msg)); }
export function onToast(f) { subs.add(f); return () => subs.delete(f); }
