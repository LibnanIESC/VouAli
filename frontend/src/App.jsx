import React, { useState, useEffect, useRef } from "react";
import { uid } from "./utils";
import { HELV, DISPLAY, MONO, CREAM, NAVY, ORANGE, BROWN, STEEL, SAND, SAND_L, INK2, INK3, btn, field, onColor, readable, safeTop } from "./theme";
import { apiGet, apiPut, onStatus, setRemoteHandler, isDirty, flushPending, flushNow, apiTrips, apiCreateTrip, apiSetActive, apiTripMeta, apiDeleteTrip, onAuthNeeded, setToken, apiConfig, setTokenGetter, noApp } from "./api";
import { onToast, toast as toastMsg } from "./toast";
import { ajustarBarraDeStatus, tratarBotaoVoltar, esconderSplashNativa, vibrar } from "./nativo";
// Teto herdado da época em que o app era só da viagem de NY (antes de o teto
// virar um campo da viagem). Usado apenas se a meta da NY não tiver o valor.
const NY_TETO_LEGADO = 3000;
import { MapIcon, MoneyIcon, PinIcon, ChevronIcon, DotsIcon, DragIcon, GearIcon, PlusIcon, PencilIcon } from "./components/Icons";
import ActionSheet from "./components/ActionSheet";
import AjustesSheet from "./components/AjustesSheet";
import Login from "./components/Login";
import Sheet from "./components/Sheet";
import Skyline from "./components/Skyline";
import SyncPill from "./components/SyncPill";
import AliTip from "./components/AliTip";
import AliAvatar from "./components/AliAvatar";
import AliChat from "./components/AliChat";
import StopDetail from "./components/StopDetail";
import StopForm from "./components/StopForm";
import DayForm from "./components/DayForm";
import BudgetForm from "./components/BudgetForm";
import TextForm from "./components/TextForm";
import TripsHome from "./components/TripsHome";
import TripForm from "./components/TripForm";
import TetoForm from "./components/TetoForm";
import ShareSheet from "./components/ShareSheet";

const EMPTY_STATE = { days: [], budget: [], prebuy: [], notes: [] };

// Skeleton do carregamento inicial (evita o "flash" de dados trocando).
const Ghost = ({ h, w = "100%", r = 12, mb = 10 }) => (
  <div aria-hidden="true" style={{ height: h, width: w, background: "#e9e2d4", borderRadius: r, marginBottom: mb, animation: "pulse 1.4s ease-in-out infinite" }} />
);
function SkeletonList() {
  return (
    <div>
      <Ghost h={14} w={150} r={7} mb={8} />
      <Ghost h={26} w={230} r={8} mb={18} />
      <Ghost h={68} /><Ghost h={68} /><Ghost h={68} /><Ghost h={68} /><Ghost h={68} />
    </div>
  );
}

// Anel de progresso compacto do header (substitui o bloco "PROGRESSO XX%").
const RING_C = 2 * Math.PI * 18;
function ProgressRing({ pct }) {
  return (
    <div style={{ position: "relative", width: 44, height: 44, flex: "0 0 auto" }} role="img" aria-label={`Progresso da viagem: ${pct}%`}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.28)" strokeWidth="4" fill="none" />
        <circle cx="22" cy="22" r="18" stroke={ORANGE} strokeWidth="4" fill="none" strokeLinecap="round"
          strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - pct / 100)} transform="rotate(-90 22 22)" style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}>{pct}%</span>
    </div>
  );
}

export default function App() {
  // Começa vazio: o conteúdo vem sempre do servidor. Nada de dados de exemplo,
  // para um usuário novo nunca ver a viagem de outra pessoa.
  const [days, setDays] = useState([]);
  const [budget, setBudget] = useState([]);
  const [prebuy, setPrebuy] = useState([]);
  const [notes, setNotes] = useState([]);
  const [active, setActive] = useState("");
  const [tab, setTab] = useState("roteiro");
  // O app começa pela lista de viagens; só entra numa delas quando escolhida.
  const [vista, setVista] = useState("lista");   // lista | viagem
  const [abrindo, setAbrindo] = useState(null);  // id da viagem sendo carregada
  const [ov, setOv] = useState(null);
  const [reorder, setReorder] = useState(false);
  const [sync, setSync] = useState("synced");
  const [trips, setTrips] = useState({ active: null, list: [] });
  const [booted, setBooted] = useState(false);   // 1ª resposta do servidor chegou?
  const [toasts, setToasts] = useState([]);
  const [needKey, setNeedKey] = useState(false); // servidor pediu a senha (401)
  const [keyInput, setKeyInput] = useState("");
  const [authMode, setAuthMode] = useState(null);  // null = ainda perguntando ao servidor
  const [user, setUser] = useState(undefined);     // undefined = carregando · null = deslogado
  const fbRef = useRef(null);                      // módulo do Firebase (carregado sob demanda)

  // aplica um estado do servidor mesclando (só o que veio) — usado no polling/remoto
  const applyState = (s) => {
    if (!s) return;
    if (s.days) setDays(s.days);
    if (s.budget) setBudget(s.budget);
    if (s.prebuy) setPrebuy(s.prebuy);
    if (s.notes) setNotes(s.notes);
  };
  // substitui o estado inteiro (usado ao trocar/criar viagem)
  const replaceState = (s) => {
    s = s || {};
    setDays(s.days || []);
    setBudget(s.budget || []);
    setPrebuy(s.prebuy || []);
    setNotes(s.notes || []);
    setActive((s.days && s.days[0] && s.days[0].id) || "");
  };

  useEffect(() => onStatus(setSync), []);
  useEffect(() => onAuthNeeded(() => setNeedKey(true)), []);
  useEffect(() => onToast((msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }), []);

  // 1) Descobre com o servidor como é o login neste ambiente.
  useEffect(() => {
    (async () => {
      const cfg = await apiConfig();
      if (cfg.authMode === "firebase" && cfg.firebase && cfg.firebase.apiKey) {
        const fb = await import("./firebase");     // SDK só carrega quando usado
        fbRef.current = fb;
        setTokenGetter(fb.getToken);
        await fb.initAuth(cfg.firebase);
        fb.onUser((u) => setUser(u));
        setAuthMode("firebase");
      } else {
        setAuthMode("token");
        setUser(null);
      }
    })();
  }, []);

  const autenticado = authMode === "token" || (authMode === "firebase" && !!user);
  // Enquanto não sabemos quem está logado, nada da interface aparece — a splash
  // do index.html continua na frente.
  const conferindoAcesso = authMode === null || (authMode === "firebase" && user === undefined);
  const precisaLogin = authMode === "firebase" && user === null;

  // Tira a splash assim que já dá para mostrar login ou app.
  useEffect(() => {
    if (conferindoAcesso) return;
    esconderSplashNativa();
    const s = document.getElementById("splash");
    if (!s) return;
    s.style.opacity = "0";
    const t = setTimeout(() => s.remove(), 300);
    return () => clearTimeout(t);
  }, [conferindoAcesso]);

  // Ajustes que só valem dentro do app instalado (no site não fazem nada).
  useEffect(() => { ajustarBarraDeStatus(); }, []);

  // Botão voltar do Android: fecha o que está aberto antes de sair do app.
  const estadoRef = useRef({ ov: null, tab: "roteiro", reorder: false, vista: "lista" });
  estadoRef.current = { ov, tab, reorder, vista };
  useEffect(() => {
    let remover = () => {};
    tratarBotaoVoltar(
      () => ({ temOverlay: !!estadoRef.current.ov || estadoRef.current.reorder, aba: estadoRef.current.tab, vista: estadoRef.current.vista }),
      {
        fecharOverlay: () => { if (estadoRef.current.ov) setOv(null); else setReorder(false); },
        irParaRoteiro: () => setTab("roteiro"),
        irParaLista: () => setVista("lista"),
      },
    ).then((f) => { remover = f; });
    return () => remover();
  }, []);

  // 2) Só busca os dados depois de saber quem é o usuário.
  useEffect(() => {
    if (!autenticado) return;
    setRemoteHandler(applyState);
    let vivo = true;
    (async () => {
      const t = await apiTrips();
      if (vivo && t) setTrips(t);
      const r = await apiGet();
      if (vivo && r && r.state) {
        applyState(r.state);
        setActive((r.state.days && r.state.days[0] && r.state.days[0].id) || "");
      }
      if (vivo) setBooted(true); // com ou sem resposta, sai do skeleton
    })();
    return () => { vivo = false; };
  }, [autenticado]);

  const sair = async () => {
    if (!fbRef.current) return;
    await flushNow();
    await fbRef.current.logout();
    setTrips({ active: null, list: [] });
    replaceState(null);
    setBooted(false);
    setOv(null);
    setVista("lista");
  };

  // Polling: o outro aparelho passa a aparecer. Só adota o remoto quando não há
  // edição local pendente, para não descartar algo que você acabou de digitar.
  useEffect(() => {
    if (!autenticado) return;
    let alive = true;
    const poll = async () => {
      if (document.hidden || isDirty()) return;
      const r = await apiGet();
      if (alive && r && r.state) applyState(r.state);
    };
    const iv = setInterval(poll, 12000);
    const onVis = () => { if (!document.hidden) { flushPending(); poll(); } };
    const onOnline = () => flushPending();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("online", onOnline);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.removeEventListener("online", onOnline); };
  }, [autenticado]);

  const persist = (next) => {
    const snap = { days, budget, prebuy, notes, ...next };
    apiPut(snap);
  };

  const activeMeta = (trips.list || []).find((t) => t.id === trips.active) || {};
  const day = days.find((d) => d.id === active) || days[0];
  const dc = readable((day && day.color) || NAVY); // acento legível do dia
  const totalStops = days.reduce((a, d) => a + d.stops.length, 0);
  const totalDone = days.reduce((a, d) => a + d.stops.filter((s) => s.done).length, 0);
  const overallPct = totalStops ? Math.round((totalDone / totalStops) * 100) : 0;
  const planned = budget.reduce((a, b) => a + Number(b.v || 0), 0);
  const spent = budget.reduce((a, b) => a + Number(b.spent || 0), 0);
  // Moeda e teto vêm da viagem (fallback só para bases antigas sem esses campos).
  const cur = activeMeta.currency || "US$";
  // Viajantes (só leitura no orçamento — nada é recalculado retroativamente)
  const nAdults = Number(activeMeta.adults) > 0 ? Number(activeMeta.adults) : 0;
  const nChildren = Number(activeMeta.children) > 0 ? Number(activeMeta.children) : 0;
  const nTravelers = nAdults + nChildren;
  const budgetTotal = Number(activeMeta.budget) > 0 ? Number(activeMeta.budget) : (trips.active === "ny" ? NY_TETO_LEGADO : 0);
  const hasTeto = budgetTotal > 0;
  const remaining = budgetTotal - planned;

  // Dica do Ali para o dia: a primeira parada com insight vira o "briefing".
  const aliDayTip = (((day && day.stops) || []).find((s) => s.insight && s.insight.trim()) || {}).insight;
  // Observação proativa do Ali sobre o orçamento (calculada, não armazenada).
  const aliBudgetTip = !hasTeto
    ? `Defina um teto para esta viagem e eu te aviso quando o planejado começar a apertar. Por enquanto, você já planejou ${cur} ${planned.toLocaleString()}.`
    : remaining < 0
      ? `Você passou ${cur} ${Math.abs(remaining).toLocaleString()} do teto planejado. Quer rever onde dá pra cortar?`
      : remaining >= 100
        ? `Sobram ${cur} ${remaining.toLocaleString()} dentro do teto — folga boa pra compras e imprevistos.`
        : `Sobram ${cur} ${remaining.toLocaleString()} dentro do teto. Tá justo, vale ficar de olho nos gastos.`;

  // Orçamento por categoria (donut + grupos)
  const tagOf = (b) => ((b.tag || "outros").trim().toLowerCase() || "outros");
  const tagTotals = {};
  budget.forEach((b) => { const t = tagOf(b); tagTotals[t] = (tagTotals[t] || 0) + Number(b.v || 0); });
  const tags = Object.keys(tagTotals);
  const TAGC = [STEEL, ORANGE, BROWN, "#00933c", "#b933ad", "#0039a6"];
  const tagColor = (t) => TAGC[tags.indexOf(t) % TAGC.length];
  let _acc = 0;
  const donutBg = planned > 0
    ? `conic-gradient(${tags.map((t) => { const from = (_acc / planned) * 100; _acc += tagTotals[t]; const to = (_acc / planned) * 100; return `${tagColor(t)} ${from}% ${to}%`; }).join(", ")})`
    : SAND_L;

  const setDaysP = (nd) => { setDays(nd); persist({ days: nd }); };
  const setBudgetP = (nb) => { setBudget(nb); persist({ budget: nb }); };
  const setPrebuyP = (np) => { setPrebuy(np); persist({ prebuy: np }); };
  const setNotesP = (nn) => { setNotes(nn); persist({ notes: nn }); };

  // ---------- Backup (export / import JSON — acionado pelo sheet Ajustes) ----------
  const exportBackup = () => {
    const data = { days, budget, prebuy, notes, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vouali-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { toastMsg("Não consegui ler o arquivo: JSON inválido."); return; }
      if (!obj || (!obj.days && !obj.budget && !obj.prebuy && !obj.notes)) {
        toastMsg("Arquivo inválido: não parece um backup do VouAli."); return;
      }
      setOv({ kind: "confirmImport", data: obj });
    };
    reader.readAsText(file);
  };
  const doImport = (obj) => {
    applyState(obj);
    apiPut({ days: obj.days || days, budget: obj.budget || budget, prebuy: obj.prebuy || prebuy, notes: obj.notes || notes });
    setOv(null);
    toastMsg("Backup importado. ✅");
  };

  const toggleStop = (sid) => {
    vibrar();   // no app, um toque curto confirma a ação (no site, nada)
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.map((s) => s.id === sid ? { ...s, done: !s.done } : s) } : d));
  };

  // Próxima parada em aberto do dia (ganha destaque na timeline).
  const nextStopId = (((day && day.stops) || []).find((s) => !s.done) || {}).id;

  // Reordenação por arrasto (modo reordenar): puxador com pointer events.
  const rowRefs = useRef([]);
  const [drag, setDrag] = useState(null); // { idx, y0, dy }
  const onDragStart = (i) => (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    setDrag({ idx: i, y0: e.clientY, dy: 0 });
  };
  const onDragMove = (e) => {
    if (!drag) return;
    const y = e.clientY;
    setDrag((d) => (d ? { ...d, dy: y - d.y0 } : d));
  };
  const onDragEnd = () => {
    if (!drag) return;
    const rects = rowRefs.current.slice(0, day.stops.length).map((r) => (r ? r.getBoundingClientRect() : null));
    const cur = rects[drag.idx];
    if (cur) {
      const center = cur.top + cur.height / 2; // já com o translateY aplicado
      let target = drag.idx, best = Infinity;
      rects.forEach((r, j) => {
        if (!r) return;
        const mid = j === drag.idx ? cur.top - drag.dy + cur.height / 2 : r.top + r.height / 2;
        const dist = Math.abs(center - mid);
        if (dist < best) { best = dist; target = j; }
      });
      if (target !== drag.idx) {
        const stops = [...day.stops];
        const [sp] = stops.splice(drag.idx, 1);
        stops.splice(target, 0, sp);
        setDaysP(days.map((d) => (d.id === day.id ? { ...d, stops } : d)));
      }
    }
    setDrag(null);
  };
  const saveStop = (data) => {
    const exists = day.stops.some((s) => s.id === data.id);
    const stops = exists ? day.stops.map((s) => s.id === data.id ? data : s) : [...day.stops, { ...data, id: uid(), done: false }];
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops } : d));
    setOv(null);
  };
  const deleteStop = (sid) => {
    setDaysP(days.map((d) => d.id === day.id ? { ...d, stops: d.stops.filter((s) => s.id !== sid) } : d));
    setOv(null);
  };

  const addDay = (data) => {
    const nd = { ...data, id: uid(), stops: [] };
    setDaysP([...days, nd]);
    setActive(nd.id);
    setOv(null);
  };
  const saveDay = (data) => {
    setDaysP(days.map((d) => d.id === data.id ? { ...d, ...data } : d));
    setOv(null);
  };
  const deleteDay = (id) => {
    if (days.length <= 1) return; // sempre manter ao menos um dia
    const next = days.filter((d) => d.id !== id);
    setDaysP(next);
    if (active === id) setActive(next[0].id);
    setOv(null);
  };
  const moveDay = (id, where) => {
    const i = days.findIndex((d) => d.id === id);
    if (i < 0) return;
    const arr = [...days];
    const [d] = arr.splice(i, 1);
    const j = where === "start" ? 0
      : where === "end" ? arr.length
      : where === "left" ? Math.max(0, i - 1)
      : Math.min(arr.length, i + 1);
    arr.splice(j, 0, d);
    setDaysP(arr);
  };

  // ---------- Viagens (multi-viagem) ----------
  // Abre uma viagem a partir da lista. Se já é a ativa, o estado dela veio no
  // carregamento inicial — entra na hora, sem ida ao servidor.
  const abrirViagem = async (id) => {
    if (abrindo) return;
    setOv(null);
    if (id !== trips.active) {
      setAbrindo(id);
      await flushNow();               // grava pendências na viagem atual antes de trocar
      await apiSetActive(id);
      setTrips((t) => ({ ...t, active: id }));
      const r = await apiGet();
      replaceState(r && r.state);
      setAbrindo(null);
    }
    setTab("roteiro"); setReorder(false); setVista("viagem");
  };
  const createTrip = async (meta) => {
    setOv(null);
    await flushNow();
    const r = await apiCreateTrip(meta); // já vira a ativa no servidor
    if (!r) { toastMsg("Não consegui criar a viagem agora. Tenta de novo."); return; }
    if (r.trips) setTrips(r.trips);
    const s = await apiGet();
    replaceState(s && s.state);
    setTab("roteiro"); setReorder(false); setVista("viagem");  // já entra na viagem nova
  };
  const saveTripMeta = async (meta) => {
    setOv(null);
    const r = await apiTripMeta(meta.id, meta);
    if (r && r.trips) setTrips(r.trips);
  };
  // Excluir só acontece a partir da lista — e é lá que a pessoa continua.
  const deleteTrip = async (id) => {
    setOv(null);
    await flushNow();
    const r = await apiDeleteTrip(id);
    if (r && r.trips) {
      setTrips(r.trips);
      const s = await apiGet();       // backend já ajustou a ativa; carrega a nova
      replaceState(s && s.state);
      setTab("roteiro"); setReorder(false); setVista("lista");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, display: "flex", justifyContent: "center", fontFamily: HELV }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.18)}100%{transform:scale(1)}}@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} .bub{position:relative} .bub-in::after{content:"";position:absolute;left:-6px;bottom:0;width:13px;height:13px;background:inherit;clip-path:polygon(100% 0,100% 100%,0 100%)} .bub-out::after{content:"";position:absolute;right:-6px;bottom:0;width:13px;height:13px;background:inherit;clip-path:polygon(0 0,0 100%,100% 100%)} button{transition:transform .08s ease} button:active{transform:scale(.96)} button:focus-visible,a:focus-visible{outline:3px solid #F28C28;outline-offset:2px} @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`}</style>
      <div style={{ width: "100%", maxWidth: 440, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", background: CREAM, boxShadow: "0 0 40px rgba(20,32,56,0.18)", visibility: (vista === "lista" || conferindoAcesso || precisaLogin) ? "hidden" : "visible" }}>

        {/* Hero: foto da viagem contida no topo + header compacto */}
        <div style={{ position: "relative", overflow: "hidden", background: NAVY, flex: "0 0 auto" }}>
          <div style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            {activeMeta.bg
              ? <img src={activeMeta.bg} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <Skyline />}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(18,30,52,0.52) 0%, rgba(18,30,52,0.62) 55%, rgba(18,30,52,0.85) 100%)" }} />
          </div>

          <div style={{ position: "relative", padding: `${safeTop(10)} 16px 12px`, color: "#fff" }}>
            {/* Barra do app: a marca no centro, âncoras de 44px nas pontas. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setVista("lista")} aria-label="Voltar para minhas viagens" style={{ width: 44, height: 44, flex: "0 0 auto", borderRadius: 22, border: "none", background: "rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronIcon color="rgba(255,255,255,0.92)" size={20} dir="left" />
              </button>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, lineHeight: 0.9, color: CREAM }}>Vou</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, lineHeight: 0.9, color: ORANGE }}>Ali</span>
                <span style={{ width: 11, height: 11, marginBottom: 4, background: ORANGE, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%, 22% 50%)", display: "block" }} />
              </div>
              <button onClick={() => setOv({ kind: "ajustes" })} aria-label="Ajustes" style={{ width: 44, height: 44, flex: "0 0 auto", borderRadius: 22, border: "none", background: "rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GearIcon color="rgba(255,255,255,0.92)" size={19} />
              </button>
            </div>

            {/* Identidade da viagem. O anel de progresso vive aqui, e não junto
                da engrenagem: o progresso é da viagem, não do aplicativo. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.15, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeMeta.name || "Minha viagem"}</h1>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", fontWeight: 700, marginTop: 4, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>{activeMeta.dateLabel || "sem datas definidas"}</div>
              </div>
              <ProgressRing pct={overallPct} />
            </div>
            {sync !== "synced" && <SyncPill status={sync} />}
          </div>

        {/* Day selector */}
        {tab === "roteiro" && (
          <div style={{ position: "relative", display: "flex", gap: 10, overflowX: "auto", padding: "6px 16px 14px" }}>
            {days.map((d) => {
              const sel = d.id === active;
              const complete = d.stops.length > 0 && d.stops.every((s) => s.done);
              return (
                <button key={d.id} onClick={() => setActive(d.id)} aria-label={`Dia ${d.label} ${d.date} — ${d.title}`} aria-current={sel ? "true" : undefined} style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: sel ? 1 : 0.55 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: d.color, color: onColor(d.color), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, border: sel ? "3px solid #fff" : "3px solid transparent", position: "relative" }}>
                    {d.line}
                    {complete && <div style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: ORANGE, border: "2px solid #223A5E", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                  </div>
                  <div style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{d.label}</div>
                </button>
              );
            })}
            <button onClick={() => setOv({ kind: "dayForm", day: null })} style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24, lineHeight: 1, border: "2px dashed rgba(255,255,255,0.55)" }}>+</div>
              <div style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>Dia</div>
            </button>
          </div>
        )}
        </div>

        {/* Body (superfície sólida areia-clara) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: tab === "ali" ? "hidden" : "auto", padding: tab === "ali" ? 0 : "18px 16px 110px", display: tab === "ali" ? "flex" : "block", flexDirection: "column", background: CREAM }}>
          {tab === "ali" && <AliChat trip={{ days, budget, prebuy, notes, budgetTotal, currency: cur, adults: nAdults, children: nChildren, groupTypes: activeMeta.groupTypes }} destino={activeMeta.destination || activeMeta.name} currency={cur} status={sync} />}
          {!booted && tab !== "ali" && <SkeletonList />}
          {booted && tab === "roteiro" && !day && (
            <div style={{ textAlign: "center", marginTop: 50 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Esta viagem ainda não tem dias.</div>
              <div style={{ fontSize: 14, color: INK2, fontWeight: 500, marginBottom: 18 }}>Adicione o primeiro dia para começar o roteiro.</div>
              <button onClick={() => setOv({ kind: "dayForm", day: null })} style={btn(ORANGE, { color: NAVY })}>+ Adicionar dia</button>
            </div>
          )}
          {booted && tab === "roteiro" && day && (
            <>
              <div style={{ fontSize: 12, letterSpacing: 1.2, color: BROWN, fontWeight: 700, marginBottom: 4, fontFamily: MONO, textTransform: "uppercase" }}>{day.date} · {day.sub}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: NAVY, letterSpacing: -0.3, fontFamily: DISPLAY }}>{day.title}</h2>
                {reorder ? (
                  <button onClick={() => setReorder(false)} style={btn(dc, { padding: "8px 18px", minHeight: 40, flex: "0 0 auto", fontSize: 14 })}>Concluir</button>
                ) : (
                  <button onClick={() => setOv({ kind: "dayMenu" })} aria-label="Opções do dia" style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(34,58,94,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <DotsIcon color={NAVY} size={20} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: INK2, marginBottom: 16, fontWeight: 600 }}>{reorder ? "Arraste pelo puxador para mudar a ordem" : `${day.stops.filter((s) => s.done).length} de ${day.stops.length} paradas · toque para detalhes`}</div>

              {!reorder && aliDayTip && (
                <div style={{ marginBottom: 18 }}><AliTip>{aliDayTip}</AliTip></div>
              )}

              <div style={{ position: "relative" }}>
                {day.stops.map((s, i) => {
                  const last = i === day.stops.length - 1;
                  const isNext = !reorder && !s.done && s.id === nextStopId;
                  const dragging = drag && drag.idx === i;
                  return (
                    <div key={s.id} ref={(el) => { rowRefs.current[i] = el; }}
                      style={{ display: "flex", gap: 12, position: "relative", paddingBottom: last ? 0 : 20, transform: dragging ? `translateY(${drag.dy}px)` : "none", zIndex: dragging ? 6 : "auto", transition: dragging ? "none" : "transform .15s ease" }}>
                      {!last && !reorder && <div style={{ position: "absolute", left: 15, top: 32, bottom: 0, width: 3, background: s.done ? dc : "#ded8ca", borderRadius: 2 }} />}
                      {reorder ? (
                        <button
                          onPointerDown={onDragStart(i)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
                          aria-label={`Arrastar ${s.n} para reordenar`}
                          style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 12, border: "1.5px solid #d8d3c8", background: "#fff", cursor: dragging ? "grabbing" : "grab", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", zIndex: 1, boxShadow: dragging ? "0 8px 20px rgba(20,32,56,0.25)" : "none" }}>
                          <DragIcon size={20} />
                        </button>
                      ) : (
                        <button onClick={() => toggleStop(s.id)} aria-pressed={!!s.done} aria-label={s.done ? `Desmarcar ${s.n}` : `Concluir ${s.n}`}
                          style={{ flex: "0 0 auto", width: 44, height: 44, margin: "-6px 0 0 -7px", padding: 0, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                          <span style={{ width: 30, height: 30, borderRadius: "50%", background: s.done ? dc : "#fff", border: `3px solid ${s.done ? dc : "#c9c7c0"}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(20,32,56,0.12)" }}>
                            {s.done && <span style={{ color: "#fff", fontSize: 14, fontWeight: 900, animation: "pop .25s ease" }}>✓</span>}
                          </span>
                        </button>
                      )}
                      <button onClick={reorder ? undefined : () => setOv({ kind: "detail", stop: s })} disabled={reorder}
                        style={{ flex: 1, minWidth: 0, textAlign: "left", fontFamily: HELV, background: "#fff", borderRadius: 14, padding: "13px 14px", boxShadow: isNext ? "0 8px 22px rgba(20,32,56,0.16)" : "0 4px 12px rgba(20,32,56,0.08)", opacity: (s.done && !reorder) ? 0.55 : 1, cursor: reorder ? "default" : "pointer", borderTop: isNext ? `2px solid ${dc}` : "2px solid transparent", borderRight: isNext ? `2px solid ${dc}` : "2px solid transparent", borderBottom: isNext ? `2px solid ${dc}` : "2px solid transparent", borderLeft: `4px solid ${dc}`, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: NAVY, textDecoration: (s.done && !reorder) ? "line-through" : "none" }}>{s.n}</span>
                            <span style={{ flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: dc }}>{s.t}</span>
                          </span>
                          <span style={{ display: "block", fontSize: 13, color: INK3, marginTop: 2, fontWeight: 500 }}>{s.d}</span>
                        </span>
                        {!reorder && <ChevronIcon color="#b6bfcc" size={16} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {booted && tab === "orcamento" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Orçamento</h2>
                <button onClick={() => setOv({ kind: "budgetForm", item: null })} style={btn(NAVY, { padding: "8px 16px", minHeight: 40 })}>+ Item</button>
              </div>

              {budget.length === 0 ? (
                <>
                  <AliTip>Bora planejar os gastos? Adicione o primeiro item — ingressos, comida, transporte — e eu te ajudo a ficar de olho no teto.</AliTip>
                  <button onClick={() => setOv({ kind: "budgetForm", item: null })} style={{ ...btn("#fff", { color: NAVY, border: `1.5px dashed ${STEEL}` }), width: "100%", marginTop: 14 }}>+ Adicionar item</button>
                </>
              ) : (
                <>
                  <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: "0 6px 18px rgba(20,32,56,0.08)", display: "flex", alignItems: "center", gap: 16 }}>
                    <div aria-hidden="true" style={{ width: 108, height: 108, borderRadius: "50%", background: donutBg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                      <div style={{ width: 74, height: 74, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: 4, boxSizing: "border-box" }}>
                        {hasTeto ? (
                          <>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: remaining < 0 ? "#C62828" : NAVY }}>{remaining < 0 ? "−" : ""}{cur} {Math.abs(remaining).toLocaleString()}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: INK3, letterSpacing: 1 }}>{remaining < 0 ? "ACIMA" : "SOBRA"}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: INK3, textAlign: "center", lineHeight: 1.3 }}>sem teto</span>
                        )}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button onClick={() => setOv({ kind: "tetoForm" })} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: HELV, minHeight: 28 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: INK3, display: "inline-flex", alignItems: "center", gap: 5 }}>Teto <PencilIcon color={INK3} size={13} /></span>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: hasTeto ? NAVY : STEEL }}>{hasTeto ? `${cur} ${budgetTotal.toLocaleString()}` : "definir"}</span>
                      </button>
                      {[["Planejado", planned], ["Já gasto", spent]].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: INK3 }}>{l}</span>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: NAVY }}>{cur} {v.toLocaleString()}</span>
                        </div>
                      ))}
                      {nTravelers > 1 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #efe9dc", paddingTop: 7 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: INK3 }}>Por pessoa ({nTravelers})</span>
                          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: STEEL }}>{cur} {Math.round(planned / nTravelers).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}><AliTip>{aliBudgetTip}</AliTip></div>
                  {tags.map((t) => (
                    <div key={t} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 8px" }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: tagColor(t), display: "block", flex: "0 0 auto" }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: INK3, letterSpacing: 0.8, textTransform: "uppercase" }}>{t}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: INK3 }}>{cur} {tagTotals[t].toLocaleString()}</span>
                      </div>
                      {budget.filter((b) => tagOf(b) === t).map((b) => {
                        const v = Number(b.v || 0), sp = Number(b.spent || 0);
                        return (
                          <button key={b.id} onClick={() => setOv({ kind: "budgetForm", item: b })} style={{ width: "100%", textAlign: "left", fontFamily: HELV, background: "#fff", border: "none", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", cursor: "pointer" }}>
                            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{b.k}</span>
                              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: NAVY, flex: "0 0 auto" }}>{cur} {v.toLocaleString()}</span>
                            </span>
                            {v > 0 && (
                              <>
                                <span style={{ display: "block", height: 6, background: SAND_L, borderRadius: 3, marginTop: 9, overflow: "hidden" }}>
                                  <span style={{ display: "block", height: "100%", width: `${Math.min(100, (sp / v) * 100)}%`, background: sp > v ? "#C62828" : STEEL, borderRadius: 3, transition: "width .3s ease" }} />
                                </span>
                                <span style={{ display: "block", fontSize: 12, color: INK3, marginTop: 5, fontWeight: 600 }}>{sp > 0 ? `gasto ${cur} ${sp.toLocaleString()}` : "nada gasto ainda"}</span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {booted && tab === "info" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Comprar antes</h2>
                <button onClick={() => setOv({ kind: "prebuyForm", item: null })} style={btn(NAVY, { padding: "8px 16px", minHeight: 40 })}>+ Item</button>
              </div>
              {prebuy.length === 0 && (
                <div style={{ fontSize: 14, color: INK2, fontWeight: 500, marginBottom: 8 }}>Nada por aqui ainda — adicione o que precisa reservar ou comprar antes de viajar.</div>
              )}
              {prebuy.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 4, alignItems: "center", background: "#fff", borderRadius: 12, padding: "3px 6px 3px 3px", marginBottom: 8, boxShadow: "0 4px 12px rgba(20,32,56,0.07)" }}>
                  <button onClick={() => setPrebuyP(prebuy.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} aria-pressed={!!p.done} aria-label={p.done ? `Desmarcar ${p.text}` : `Marcar ${p.text}`}
                    style={{ width: 44, height: 44, flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: p.done ? ORANGE : "#fff", border: `2px solid ${p.done ? ORANGE : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>{p.done && <span style={{ animation: "pop .25s ease" }}>✓</span>}</span>
                  </button>
                  <button onClick={() => setOv({ kind: "prebuyForm", item: p })} style={{ flex: 1, minWidth: 0, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: HELV, textAlign: "left" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: NAVY, textDecoration: p.done ? "line-through" : "none", opacity: p.done ? 0.5 : 1 }}>{p.text}</span>
                    <ChevronIcon color="#b6bfcc" size={15} />
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 14px" }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: NAVY, fontFamily: DISPLAY }}>Notas</h2>
                <button onClick={() => setOv({ kind: "noteForm", item: null })} style={btn(NAVY, { padding: "8px 16px", minHeight: 40 })}>+ Nota</button>
              </div>
              {notes.length === 0 && (
                <div style={{ fontSize: 14, color: INK2, fontWeight: 500 }}>Nenhuma nota ainda — guarde aqui lembretes, regras do metrô, clima…</div>
              )}
              {notes.map((nt) => (
                <button key={nt.id} onClick={() => setOv({ kind: "noteForm", item: nt })} style={{ width: "100%", textAlign: "left", fontFamily: HELV, background: "#fff", border: "none", borderRadius: 14, padding: "14px 16px", marginBottom: 10, boxShadow: "0 4px 12px rgba(20,32,56,0.07)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 14, color: NAVY, marginBottom: 5 }}>{nt.title}</span>
                    <span style={{ display: "block", fontSize: 13, color: INK2, lineHeight: 1.5, fontWeight: 500 }}>{nt.body}</span>
                  </span>
                  <ChevronIcon color="#b6bfcc" size={15} />
                </button>
              ))}
            </>
          )}
        </div>

        {/* Bottom tabs (fixas no rodapé da tela) */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, margin: "0 auto", width: "100%", maxWidth: 440, zIndex: 20, display: "flex", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.5)", padding: "8px 0 calc(10px + env(safe-area-inset-bottom))", boxShadow: "0 -3px 16px rgba(10,20,50,0.16)" }}>
          {[
            { id: "roteiro", label: "Roteiro", Icon: MapIcon },
            { id: "orcamento", label: "Orçamento", Icon: MoneyIcon },
            { id: "ali", label: "Ali", Icon: ({ on }) => <AliAvatar size={28} ring={on ? "#223A5E" : undefined} /> },
            { id: "info", label: "Info", Icon: PinIcon },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} aria-current={on ? "page" : undefined} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 48, opacity: t.id === "ali" && !on ? 0.6 : 1 }}>
                <t.Icon color={on ? "#223A5E" : "#b5b3ac"} on={on} />
                <span style={{ fontSize: 11, fontWeight: 800, color: on ? "#223A5E" : "#b5b3ac" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tela de entrada (modo com contas), antes de qualquer dado */}
      {precisaLogin && (
        <Login
          onGoogle={() => fbRef.current.loginGoogle()}
          onLink={(email) => fbRef.current.enviarLink(email)}
          permiteEmail={!noApp()} />
      )}

      {/* Tela inicial: a lista de viagens (e as boas-vindas, quando não há nenhuma) */}
      {autenticado && vista === "lista" && (
        <TripsHome trips={trips} booted={booted} abrindo={abrindo}
          onOpen={abrirViagem}
          onNew={() => setOv({ kind: "tripForm", trip: null })}
          onEdit={(t) => setOv({ kind: "tripForm", trip: t })}
          onShare={(t) => setOv({ kind: "share", trip: t })}
          onAjustes={() => setOv({ kind: "ajustes" })}
          podeCompartilhar={authMode === "firebase"}
          user={user} onLogout={sair} />
      )}

      {/* FAB: adicionar parada (roteiro) */}
      {vista === "viagem" && booted && tab === "roteiro" && day && !reorder && !ov && (
        <button onClick={() => setOv({ kind: "stopForm", stop: null })} aria-label="Adicionar parada"
          style={{ position: "fixed", right: "max(16px, calc(50% - 204px))", bottom: "calc(84px + env(safe-area-inset-bottom))", width: 56, height: 56, borderRadius: 28, border: "none", background: ORANGE, boxShadow: "0 8px 20px rgba(221,125,28,0.45)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 15 }}>
          <PlusIcon color={NAVY} size={24} />
        </button>
      )}

      {/* Overlays */}
      {ov?.kind === "ajustes" && (
        <AjustesSheet onClose={() => setOv(null)} onExport={exportBackup}
          onImportFile={(f) => { setOv(null); importBackup(f); }}
          user={user} onLogout={sair} />
      )}
      {ov?.kind === "dayMenu" && day && (
        <ActionSheet title={day.title} onClose={() => setOv(null)} actions={[
          { icon: <PencilIcon color={NAVY} size={18} />, label: "Editar dia", onClick: () => setOv({ kind: "dayForm", day }) },
          { icon: <DragIcon color={NAVY} size={18} />, label: "Reordenar paradas", onClick: () => { setReorder(true); setOv(null); } },
          { icon: <PlusIcon color={NAVY} size={18} />, label: "Adicionar parada", onClick: () => setOv({ kind: "stopForm", stop: null }) },
        ]} />
      )}
      {ov?.kind === "share" && (
        <ShareSheet trip={ov.trip} onClose={() => setOv(null)} />
      )}
      {ov?.kind === "tripForm" && (
        <TripForm trip={ov.trip} canDelete={!!ov.trip} onClose={() => setOv(null)}
          onSave={(data) => ov.trip ? saveTripMeta(data) : createTrip(data)}
          onDelete={() => setOv({ kind: "confirmDeleteTrip", id: ov.trip.id, name: ov.trip.name })} />
      )}
      {ov?.kind === "confirmDeleteTrip" && (
        <ActionSheet message={`Excluir a viagem "${ov.name}" e todo o seu roteiro? Isso não pode ser desfeito.`}
          onClose={() => setOv(null)}
          actions={[
            { label: "Excluir viagem", danger: true, onClick: () => deleteTrip(ov.id) },
            { label: "Cancelar", onClick: () => setOv(null) },
          ]} />
      )}
      {ov?.kind === "confirmImport" && (
        <ActionSheet message="Substituir todos os dados atuais pela cópia do arquivo?"
          onClose={() => setOv(null)}
          actions={[
            { label: "Substituir dados", danger: true, onClick: () => doImport(ov.data) },
            { label: "Cancelar", onClick: () => setOv(null) },
          ]} />
      )}
      {ov?.kind === "detail" && (
        <StopDetail stop={ov.stop} color={dc} onClose={() => setOv(null)}
          onEdit={() => setOv({ kind: "stopForm", stop: ov.stop })}
          onDelete={() => deleteStop(ov.stop.id)} />
      )}
      {ov?.kind === "stopForm" && (
        <StopForm stop={ov.stop} color={dc} trip={{ days, budget, prebuy, notes }} onClose={() => setOv(null)} onSave={saveStop} />
      )}
      {ov?.kind === "dayForm" && (
        <DayForm day={ov.day} canDelete={!!ov.day && days.length > 1}
          index={ov.day ? days.findIndex((d) => d.id === ov.day.id) : -1} total={days.length}
          onMove={(where) => moveDay(ov.day.id, where)}
          onClose={() => setOv(null)}
          onSave={(data) => ov.day ? saveDay(data) : addDay(data)}
          onDelete={() => deleteDay(ov.day.id)} />
      )}
      {ov?.kind === "tetoForm" && (
        <TetoForm value={budgetTotal} currency={cur} onClose={() => setOv(null)}
          onSave={(v) => { saveTripMeta({ id: trips.active, budget: v }); toastMsg("Teto atualizado. ✅"); }} />
      )}
      {ov?.kind === "budgetForm" && (
        <BudgetForm item={ov.item} currency={cur} onClose={() => setOv(null)}
          onSave={(data) => { const nb = ov.item ? budget.map((b) => b.id === data.id ? data : b) : [...budget, { ...data, id: uid() }]; setBudgetP(nb); setOv(null); }}
          onDelete={() => { setBudgetP(budget.filter((b) => b.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "prebuyForm" && (
        <TextForm title={ov.item ? "Editar item" : "Novo item"} canDelete={!!ov.item}
          initial={ov.item || { text: "" }} fields={[{ k: "text", label: "Texto" }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.text?.trim()) return; const np = ov.item ? prebuy.map((p) => p.id === data.id ? data : p) : [...prebuy, { id: uid(), text: data.text, done: false }]; setPrebuyP(np); setOv(null); }}
          onDelete={() => { setPrebuyP(prebuy.filter((p) => p.id !== ov.item.id)); setOv(null); }} />
      )}
      {ov?.kind === "noteForm" && (
        <TextForm title={ov.item ? "Editar nota" : "Nova nota"} canDelete={!!ov.item}
          initial={ov.item || { title: "", body: "" }}
          fields={[{ k: "title", label: "Título", ph: "Ex: 🚕 Táxi do aeroporto" }, { k: "body", label: "Texto", area: true }]}
          onClose={() => setOv(null)}
          onSave={(data) => { if (!data.title?.trim()) return; const nn = ov.item ? notes.map((n) => n.id === data.id ? data : n) : [...notes, { ...data, id: uid() }]; setNotesP(nn); setOv(null); }}
          onDelete={() => { setNotesP(notes.filter((n) => n.id !== ov.item.id)); setOv(null); }} />
      )}

      {/* Tela de desbloqueio (senha do app) — substitui o window.prompt */}
      {needKey && (
        <Sheet onClose={() => setNeedKey(false)}>
          <div style={{ padding: "26px 22px 36px", textAlign: "center" }}>
            <AliAvatar size={72} portrait ring={ORANGE} />
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginTop: 14 }}>Senha do app</div>
            <div style={{ fontSize: 14, color: INK2, fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>Digite a senha da viagem para sincronizar os dados.</div>
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && keyInput.trim()) setToken(keyInput.trim()); }}
              placeholder="Senha" aria-label="Senha do app"
              style={{ ...field, marginTop: 16, textAlign: "center" }} />
            <button onClick={() => keyInput.trim() && setToken(keyInput.trim())} disabled={!keyInput.trim()}
              style={{ ...btn(ORANGE, { color: NAVY }), width: "100%", marginTop: 14, opacity: keyInput.trim() ? 1 : 0.6 }}>Entrar</button>
          </div>
        </Sheet>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div aria-live="polite" style={{ position: "fixed", top: "calc(14px + env(safe-area-inset-top))", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 90, pointerEvents: "none", padding: "0 16px" }}>
          {toasts.map((t) => (
            <div key={t.id} style={{ background: "rgba(23,37,63,0.95)", color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600, maxWidth: 380, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", animation: "fadeUp .25s ease" }}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
