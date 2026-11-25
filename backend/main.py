import json, os, sqlite3, mimetypes, time, uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

import auth
import billing
import store

mimetypes.add_type("application/manifest+json", ".webmanifest")

DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "trip.db"
TOKEN = os.getenv("TRIP_TOKEN", "")            # empty = no auth (dev)
STATIC = Path(__file__).parent / "static"

# Metadados da viagem de NY (usados na migração do dado antigo para o modelo
# multi-viagem). Espelham o que hoje está fixo no frontend, para nada mudar.
NY_BG = "https://images.unsplash.com/photo-1557780486-7347b5578a23?fm=jpg&q=70&w=1600&auto=format&fit=crop"
NY_META = {"id": "ny", "name": "New York", "dateLabel": "6 – 13 Outubro", "destination": "New York", "bg": NY_BG,
           "currency": "US$", "budget": 3000, "startDate": "2026-10-06", "endDate": "2026-10-13", "interests": "",
           "adults": 2, "children": 0, "groupTypes": "Casal"}
# Campos de metadados aceitos ao criar/editar uma viagem.
META_FIELDS = ("name", "dateLabel", "destination", "origin", "transport", "bg", "currency",
               "startDate", "endDate", "interests", "groupTypes")
META_NUMS = {"budget": 0, "adults": 1, "children": 0}   # campo -> padrão
EMPTY_STATE = {"days": [], "budget": [], "prebuy": [], "notes": []}

# --- Ali (assistente com IA) ---
ALI_MODEL = os.getenv("ALI_MODEL", "claude-opus-5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
# effort só é aceito pelos modelos recentes; num modelo sem suporte (ex.: Haiku) daria 400
_ALI_EFFORT_OK = any(k in ALI_MODEL for k in ("opus-5", "opus-4-8", "opus-4-7", "opus-4-6", "sonnet-5", "sonnet-4-6", "fable-5", "mythos-5"))
try:
    import anthropic
    _ali_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
except Exception:
    _ali_client = None

# Busca de foto de capa (Pixabay). A chave fica só no servidor — o app nunca a
# vê, nem precisa: ele pede /api/fotos e recebe uma lista de URLs prontas.
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")
# Protege a nossa cota do provedor contra um loop no cliente (janela global).
FOTO_RATE_MAX = int(os.getenv("FOTO_RATE_MAX", "40"))
FOTO_RATE_WINDOW = int(os.getenv("FOTO_RATE_WINDOW", "60"))
_foto_calls = deque()

# Roteamento de modelo: conversa e dicas podem usar um modelo mais barato que
# a geração de roteiro. Sem configurar, tudo segue no ALI_MODEL de sempre.
ALI_MODEL_CHAT = os.getenv("ALI_MODEL_CHAT", "") or ALI_MODEL
ALI_MODEL_GEN = os.getenv("ALI_MODEL_GEN", "") or ALI_MODEL

def _efeito_ok(modelo: str) -> bool:
    return any(k in modelo for k in ("opus-5", "opus-4-8", "opus-4-7", "opus-4-6", "sonnet-5", "sonnet-4-6", "fable-5", "mythos-5"))

# Cotas mensais por usuário (modo com contas). Generosas de propósito.
# Moeda padrão da base (brasileira). Só vale como fallback: o app sugere a
# moeda pelo destino (Paris → €) e a pessoa pode trocar. Um lugar só para o
# valor evita que front e back discordem.
MOEDA_PADRAO = os.getenv("MOEDA_PADRAO", "R$")

QUOTAS = {
    "chat": int(os.getenv("QUOTA_CHAT", "50")),
    "gen": int(os.getenv("QUOTA_GEN", "3")),
    "tip": int(os.getenv("QUOTA_TIP", "30")),
}
# Fusível global do mês: se o app inteiro passar disso, a IA descansa.
# 0 = sem teto global.
AI_MONTHLY_CAP = int(os.getenv("ALI_MONTHLY_CAP", "0"))

# --- Cobrança: degustação única + passe de viagem (docs/MONETIZACAO.md) ---
# Desligada, vale a cota mensal acima, como sempre. Ligada, a IA passa a gastar
# SALDO que não renova (`ai_grants`). A chave existe porque o servidor publica
# na hora e o app não: só se liga depois que a versão com a tela de compra
# estiver na mão das pessoas.
COBRANCA = os.getenv("COBRANCA", "off").strip().lower() in ("on", "1", "true", "sim")
# Contas (e-mails, separados por vírgula) para as quais a cobrança JÁ vale, com
# a chave geral ainda desligada. É como se testa a compra de verdade — tela do
# passe, pagamento, saldo, reembolso — sem mudar nada para os outros usuários.
COBRANCA_TESTE = {e.strip().lower() for e in os.getenv("COBRANCA_TESTE", "").split(",") if e.strip()}

def _cobra(usuario):
    """A cobrança vale para esta conta?"""
    if not usuario:
        return False
    return COBRANCA or str(usuario.get("email") or "").strip().lower() in COBRANCA_TESTE

def _saldo_env(prefixo, roteiros, chats, dicas):
    """Tamanho de um pacote, ajustável por variável de ambiente."""
    return {"gen": int(os.getenv(f"{prefixo}_ROTEIROS", str(roteiros))),
            "chat": int(os.getenv(f"{prefixo}_CHATS", str(chats))),
            "tip": int(os.getenv(f"{prefixo}_DICAS", str(dicas)))}

# Degustação: uma vez por conta, e só em viagem curta.
DEGUSTACAO_MAX_DIAS = int(os.getenv("DEGUSTACAO_MAX_DIAS", "4"))
DEGUSTACAO = _saldo_env("DEGUSTACAO", 1, 5, 3)
PASSE = _saldo_env("PASSE", 3, 100, 50)

# Produto na loja -> o que ele credita. O PREÇO não está aqui de propósito:
# ele mora no Play Console e o app mostra o que a loja informar.
# As recargas já têm lugar no catálogo; só passam a existir quando o produto
# for criado na loja (fase 2).
PRODUTO_PASSE = os.getenv("PRODUTO_PASSE", "passe_viagem")
PRODUTOS = {
    PRODUTO_PASSE: {"origin": "passe", **PASSE},
    "recarga_roteiros": {"origin": "recarga", "gen": int(os.getenv("RECARGA_ROTEIROS", "3")), "chat": 0, "tip": 0},
    "recarga_conversas": {"origin": "recarga", "gen": 0, "chat": int(os.getenv("RECARGA_CHATS", "100")), "tip": 0},
    "recarga_dicas": {"origin": "recarga", "gen": 0, "chat": 0, "tip": int(os.getenv("RECARGA_DICAS", "50"))},
}

def _pacote(produto):
    """O pacote de um produto da loja, ou None.

    No modelo novo de produtos do Google, uma compra pode vir identificada pelo
    produto E pela opção de compra (`passe_viagem:comprar`). O que define o
    pacote é só o produto.
    """
    produto = str(produto or "").strip()
    return PRODUTOS.get(produto) or PRODUTOS.get(produto.split(":", 1)[0])

# RevenueCat confere o recibo com o Google. A chave secreta fica só no servidor.
# `.strip()`: um espaço ou quebra de linha colado junto no painel do Railway
# não pode invalidar o segredo.
REVENUECAT_API_KEY = os.getenv("REVENUECAT_API_KEY", "").strip()
REVENUECAT_WEBHOOK_AUTH = os.getenv("REVENUECAT_WEBHOOK_AUTH", "").strip()
# Compra de teste (sandbox) só vira saldo se isto estiver ligado.
REVENUECAT_SANDBOX = os.getenv("REVENUECAT_SANDBOX", "0").strip().lower() in ("on", "1", "true", "sim")
COMPRA_RATE_MAX = int(os.getenv("COMPRA_RATE_MAX", "10"))     # conferências por conta, por janela
_compra_calls = {}

# Tetos contra abuso. O cliente controla o corpo do pedido; sem estes limites
# uma conta sozinha derruba o banco (viagem gigante), enche a base (viagens em
# massa) ou queima a fatura da IA (contexto imenso num único chat).
MAX_BODY = int(os.getenv("MAX_BODY_BYTES", str(1_500_000)))     # ~1,5 MB por requisição
MAX_AI_CHARS = int(os.getenv("ALI_MAX_CONTEXT_CHARS", str(60_000)))  # ~15k tokens de entrada
MAX_TRIPS = int(os.getenv("MAX_TRIPS_POR_CONTA", "60"))
MAX_MEMBERS = int(os.getenv("MAX_MEMBROS_POR_VIAGEM", "20"))

# Rate limit (janela deslizante, em memória): um global, contra loop/abuso, e
# um POR CONTA, para um usuário sozinho não consumir a fila de todo mundo.
AI_RATE_MAX = int(os.getenv("ALI_RATE_MAX", "20"))       # nº de chamadas
AI_RATE_WINDOW = int(os.getenv("ALI_RATE_WINDOW", "60"))  # por janela de segundos
AI_RATE_MAX_USER = int(os.getenv("ALI_RATE_MAX_USER", "8"))
_ai_calls = deque()
_ai_calls_user = {}

def _janela_ok(fila, maximo):
    agora = time.time()
    while fila and agora - fila[0] > AI_RATE_WINDOW:
        fila.popleft()
    if len(fila) >= maximo:
        return False
    fila.append(agora)
    return True

def _rate_ok(uid=None) -> bool:
    if not _janela_ok(_ai_calls, AI_RATE_MAX):
        return False
    if uid:
        fila = _ai_calls_user.setdefault(uid, deque())
        if not _janela_ok(fila, AI_RATE_MAX_USER):
            return False
    return True

# A persona do Ali + o contexto da viagem são reenviados a CADA mensagem.
# Marcando esse trecho para cache, as mensagens seguintes da mesma conversa
# pagam uma fração pelo mesmo conteúdo. Abaixo do mínimo de tokens o cache
# não vale, então só marcamos quando o texto é grande o bastante.
CACHE_MIN_CHARS = int(os.getenv("ALI_CACHE_MIN_CHARS", "4000"))

def _system(texto):
    """Monta o system prompt, pedindo cache quando compensa."""
    if len(texto) < CACHE_MIN_CHARS:
        return texto
    return [{"type": "text", "text": texto, "cache_control": {"type": "ephemeral"}}]

def _tokens(resp):
    """Lê o consumo da resposta da IA (para custo por usuário).
    Tokens lidos do cache contam como entrada, mas custam bem menos."""
    uso = getattr(resp, "usage", None)
    entrada = int(getattr(uso, "input_tokens", 0) or 0)
    entrada += int(getattr(uso, "cache_read_input_tokens", 0) or 0)
    entrada += int(getattr(uso, "cache_creation_input_tokens", 0) or 0)
    return (entrada, int(getattr(uso, "output_tokens", 0) or 0))

def _cota(usuario, tipo):
    """Devolve (pode_usar, detalhe). Sem contas (modo antigo), não há cota."""
    if not usuario:
        return True, None
    limite = QUOTAS.get(tipo, 0)
    with user_con(usuario) as con:
        if AI_MONTHLY_CAP > 0 and store.uso_total(con)["chamadas"] >= AI_MONTHLY_CAP:
            return False, {"error": "ai_paused"}
        usado = store.uso_do_usuario(con, usuario["uid"])[tipo]
    if limite and usado >= limite:
        return False, {"error": "quota", "tipo": tipo, "usado": usado, "limite": limite}
    return True, None

def _contar(usuario, tipo, resp):
    if not usuario:
        return
    entrada, saida = _tokens(resp)
    with user_con(usuario) as con:
        store.registrar_uso(con, usuario["uid"], tipo, entrada, saida)
        con.commit()

# Saldo (cobrança ligada): a unidade é RESERVADA antes de chamar a IA e
# devolvida se o pedido não der em nada. Conferir antes e descontar depois
# deixaria dois pedidos simultâneos passarem com um crédito só.
def _estornar(usuario, tipo, fonte):
    """O pedido falhou do nosso lado: a unidade reservada volta para o saldo."""
    if not usuario or not fonte:
        return
    with user_con(usuario) as con:
        store.devolver(con, fonte["id"], tipo)

def _confirmar(usuario, fonte):
    """O pedido foi entregue. A unidade já saiu do saldo ao autorizar; não há
    mais nada a fazer. (Existe para cada pedido ter um desfecho explícito:
    `_confirmar` ou `_estornar`.)"""
    return None

def _viagem_do_pedido(con, uid, body, tipo):
    """De qual viagem é este pedido de IA. Devolve (trip_id, erro).

    O app novo manda `trip_id`. Sem ele: gerar roteiro é sempre de uma viagem
    que ainda não existe; conversa e dica são da viagem ativa.
    """
    tid = str((body or {}).get("trip_id") or "").strip()
    if tid:
        if not store.role_of(con, tid, uid):       # inexistente OU de outra pessoa
            return None, {"error": "trip_not_found"}
        return tid, None
    if tipo == "gen":
        return None, None
    return store.list_trips(con, uid)["active"], None

def _pagantes(con, uid, trip_id):
    """De quem são os créditos que pagam um pedido nesta viagem, em ordem.

    Os créditos do Pacote VouAli são da CONTA, não da viagem. Numa viagem
    compartilhada, o convidado usa os créditos de quem o convidou (o dono) —
    convidado não paga para usar o Ali na viagem de outra pessoa — e, se os do
    dono acabarem, os próprios.
    """
    dono = store.dono_da_viagem(con, trip_id) if trip_id else None
    if dono and dono != uid:
        return [dono, uid]
    return [uid]

def _fontes(con, uid, trip_id, dias):
    """Os saldos que podem pagar um pedido, na ordem em que são gastos:
    degustação (grátis vai primeiro), depois os créditos de quem paga."""
    fontes = []
    deg = store.degustacao(con, uid)
    if deg and dias <= DEGUSTACAO_MAX_DIAS:
        fontes.append(deg)
    for p in _pagantes(con, uid, trip_id):
        fontes.extend(store.creditos(con, p))
    return fontes, deg

def _autorizar(usuario, tipo, body, dias_pedidos=None):
    """Pode usar a IA? Devolve (pode, detalhe, fonte).

    Com a cobrança desligada é a cota mensal de sempre. Ligada, o pedido só
    passa se houver saldo — e `fonte` é o saldo de onde a unidade JÁ SAIU: quem
    chama precisa de `_confirmar` (deu certo) ou `_estornar` (falhou).
    `dias_pedidos` vale para a geração de roteiro (o tamanho é o que foi
    pedido); nos outros casos conta o que está gravado na viagem.
    """
    if not _cobra(usuario):
        pode, detalhe = _cota(usuario, tipo)
        return pode, detalhe, None
    uid = usuario["uid"]
    with user_con(usuario) as con:
        if AI_MONTHLY_CAP > 0 and store.uso_total(con)["chamadas"] >= AI_MONTHLY_CAP:
            return False, {"error": "ai_paused"}, None
        store.garantir_degustacao(con, uid, **DEGUSTACAO)
        trip_id, erro = _viagem_do_pedido(con, uid, body, tipo)
        if erro:
            return False, erro, None
        if dias_pedidos is not None:
            dias = dias_pedidos
        else:
            dias = store.dias_da_viagem(con, trip_id) if trip_id else 0
        fontes, deg = _fontes(con, uid, trip_id, dias)
        for g in fontes:
            # `consumir` só desconta se ainda houver: é ele, e não a leitura
            # acima, que decide quando dois pedidos chegam juntos.
            if store.resto(g, tipo) > 0 and store.consumir(con, g["id"], tipo):
                return True, None, {"id": g["id"]}
        ultimo = store.ultimo_pacote(con, _pagantes(con, uid, trip_id))
        if ultimo and ultimo["revoked"] and not any(g["origin"] != store.ORIGEM_DEGUSTACAO for g in fontes):
            motivo = "reembolsado"             # o pacote foi estornado e não há outro
        elif ultimo:
            motivo = "esgotado"                # comprou, mas acabou esse tipo
        elif deg and store.resto(deg, tipo) > 0:
            motivo = "dias"                    # tem degustação, mas a viagem é longa
        else:
            motivo = "sem_passe"
    return False, {"error": "paywall", "tipo": tipo, "motivo": motivo,
                   "dias": dias, "max_dias": DEGUSTACAO_MAX_DIAS}, None

ALI_SYSTEM = (
    "Você é o Ali, o assistente de viagens do app VouAli. "
    "Personalidade: amigável, experiente, confiável e curioso — fala como um amigo que já esteve lá. "
    "Seja sempre positivo, prestativo e proativo; quando a resposta for 'não', ofereça uma alternativa. "
    "Responda SEMPRE em português do Brasil. "
    "SEJA BREVE — esta é uma regra forte: por padrão responda em ATÉ 3 FRASES CURTAS. "
    "Quando precisar listar, use no máximo 4 tópicos de uma linha cada (com '•'), sem parágrafos antes ou depois. "
    "Vá direto ao ponto: nada de introdução, de repetir a pergunta, de resumir o que você vai dizer, nem de fechar com perguntas de cortesia. "
    "Se o assunto for grande, entregue só o essencial e ofereça detalhar em uma frase curta. "
    "Não invente reservas, preços exatos, horários ou paradas que não estejam nos dados; quando não souber, diga e sugira como descobrir. "
    "VOCÊ NÃO ALTERA O APP: você não edita, adiciona, remove, reordena, salva nem reserva nada — não tem esse poder, apenas conversa e orienta. "
    "NUNCA se ofereça para fazer mudanças (nada de 'quer que eu ajuste?', 'quer que eu troque a ordem?', 'quer que eu adicione/reserve pra você?'). "
    "Quando uma mudança fizer sentido, apenas SUGIRA e explique que quem faz é o próprio usuário, direto no app — tocando na parada para editar, ou no botão '+ Adicionar parada'. "
    "A viagem é a Nova York, de 6 a 13 de outubro de 2026. Use a DATA DE HOJE (informada no fim deste prompt) para situar a viagem no tempo. "
    "Se hoje ainda for antes de 06/10/2026, a viagem está no FUTURO: trate como planejamento (ex.: 'faltam X dias', 'quando você chegar') "
    "e NUNCA fale em 'hoje' ou 'amanhã' como se fossem dias do roteiro. Só chame um dia de 'hoje'/'amanhã' se a data de hoje realmente "
    "cair entre 06 e 13/10/2026. Ao se referir a um dia do roteiro, use sempre o rótulo e a data dele (ex.: 'o dia do Central Park', "
    "'a quinta, 8/10'), nunca 'amanhã'. "
    "QUEM VIAJA: adapte tudo ao número de viajantes e ao perfil do grupo informados no contexto. "
    "Ao citar valores, deixe SEMPRE claro se é por pessoa ou o total do grupo. "
    "Casal: experiências a dois, jantares e pores do sol bons pra dois, evitar filas longas. "
    "Família: ritmo mais calmo com pausas, atrações que funcionam com crianças, ingresso infantil, restaurantes acolhedores, evitar programas que varem a noite. "
    "Amigos: pratos pra compartilhar, vida noturna, atividades em grupo, lembrar que táxi/transporte fica barato dividido. "
    "Sozinho(a): segurança, passeios em grupo pra conhecer gente, balcões e mesas pra um, liberdade pra mudar o plano. "
    "Se houver mais de um perfil, combine os dois com bom senso. "
    "FOCO EM VIAGEM: você só ajuda com assuntos de viagem — roteiro, transporte, comida, orçamento, clima, o que fazer, "
    "compras, cultura local e dicas —, com prioridade para esta viagem a Nova York. "
    "Se perguntarem algo fora desse tema (programação, política, contas de matemática, tarefas aleatórias, conselhos gerais etc.), "
    "NÃO responda o conteúdo pedido. Recuse com leveza e bom humor em NO MÁXIMO 1 ou 2 frases CURTAS: uma brincadeira rápida "
    "e um empurrãozinho de volta para a viagem. NÃO se alongue, não explique o que você faz, não liste opções e não ofereça "
    "cálculos nem tarefas. A pessoa tem que sair sorrindo, nunca sem graça nem entediada."
)

ALI_GERAR_SYSTEM = (
    "Você é o Ali, guia de viagens experiente. Monte um roteiro de viagem completo e realista. "
    "Responda APENAS com um objeto JSON válido (sem markdown, sem cercas ```, sem comentários, sem texto fora do JSON), nesta forma EXATA:\n"
    '{"days":[{"label":"<sigla do dia da semana, ex: SEG>","date":"<ex: 14 SET>","title":"<tema do dia>",'
    '"sub":"<subtítulo curto>","stops":[{"t":"<horário, ex: 10h>","n":"<nome do lugar>","d":"<resumo de 1 linha>",'
    '"getting":"<como chegar>","todo":"<o que fazer>","insight":"<dica do Ali, específica e útil>"}]}],'
    '"budget":[{"k":"<descrição>","v":<número na moeda informada>,"tag":"<ingressos|comida|transporte|hospedagem|outros>"}],'
    '"prebuy":["<item para reservar/comprar antes>"],'
    '"notes":[{"title":"<título curto com emoji>","body":"<texto útil>"}]}\n'
    "Regras: gere EXATAMENTE o número de dias pedido; 3 a 5 paradas por dia, em ordem cronológica; "
    "valores de orçamento realistas para o destino e o estilo; dicas específicas (não genéricas); tudo em português do Brasil. "
    "Adapte o roteiro ao número de viajantes e ao perfil do grupo (casal, família com crianças, amigos ou sozinho): "
    "ritmo, tipo de atração, restaurantes e vida noturna mudam conforme isso. "
    "Os valores do orçamento devem ser o TOTAL DO GRUPO (não por pessoa), e a descrição deve deixar isso claro quando ajudar. "
    "SE houver origem e meio de transporte: comece o primeiro dia pela ida (saída, tempo de viagem, "
    "chegada e deslocamento até a hospedagem) e termine o último dia pela volta, com horários plausíveis; "
    "inclua no orçamento o custo de chegar e voltar (passagens, ou combustível e pedágio para carro) com a tag 'transporte', "
    "e escreva ESTIMATIVA na descrição desse item, porque você não consulta preços reais; "
    "acrescente em 'prebuy' o que aquele meio exige (check-in e seguro para avião, revisão e pedágio para carro, por exemplo). "
    "Não inclua campos de id nem 'done' — o app cuida disso."
)

ALI_DICA_SYSTEM = (
    "Você é o Ali, guia de viagens experiente e simpático. "
    # O destino vem no contexto da viagem, nunca fixo aqui: já esteve escrito
    # "na viagem a Nova York" e o Ali dava dica de Nova York em viagem à Itália.
    "Gere UMA dica curta e prática (1 a 2 frases, no máximo ~220 caracteres) para a parada indicada, "
    "na viagem descrita no contexto. "
    "Foque num truque útil, algo a evitar, o melhor horário, ou o que priorizar no local. "
    "Escreva em português do Brasil, com tom leve de amigo que já esteve lá. "
    "Responda APENAS com o texto da dica — sem introdução, sem aspas, sem prefixos como 'Dica:'. "
    "Não invente preços ou horários exatos; se não souber um detalhe, seja geral."
)

# Paleta de cores de dia (todas escuras o bastante para texto branco na bolinha).
GEN_PALETTE = ["#365D7A", "#ee352e", "#0039a6", "#b933ad", "#00933c", "#ff6319", "#996633", "#6d6e71", "#F28C28", "#7A5A3A", "#2f6f62", "#8a3b8f"]

def _uid():
    return uuid.uuid4().hex[:7]

def _extract_json(text: str) -> str:
    """Isola o objeto JSON de uma resposta (remove cercas markdown e texto ao redor)."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t[:4].lower() == "json":
            t = t[4:]
    i, j = t.find("{"), t.rfind("}")
    return t[i:j + 1] if (i >= 0 and j > i) else t

def _normalize_state(raw: dict) -> dict:
    """Converte o JSON gerado pelo modelo no schema exato do app (ids, done, cores)."""
    days = []
    for i, d in enumerate(raw.get("days") or []):
        stops = []
        for s in (d.get("stops") or []):
            if not isinstance(s, dict):
                continue
            stops.append({
                "id": _uid(),
                "t": str(s.get("t", "")).strip(),
                "n": str(s.get("n", "")).strip(),
                "d": str(s.get("d", "")).strip(),
                "getting": str(s.get("getting", "")).strip(),
                "todo": str(s.get("todo", "")).strip(),
                "insight": str(s.get("insight", "")).strip(),
                "link": str(s.get("link", "")).strip(),
                "done": False,
            })
        days.append({
            "id": _uid(),
            "label": (str(d.get("label", "")).strip()[:4] or f"D{i + 1}"),
            "date": str(d.get("date", "")).strip(),
            "title": (str(d.get("title", "")).strip() or f"Dia {i + 1}"),
            "sub": str(d.get("sub", "")).strip(),
            "color": GEN_PALETTE[i % len(GEN_PALETTE)],
            "line": str(i + 1),
            "stops": stops,
        })
    budget = []
    for b in (raw.get("budget") or []):
        if not isinstance(b, dict):
            continue
        try:
            v = float(b.get("v", 0) or 0)
        except (TypeError, ValueError):
            v = 0
        budget.append({"id": _uid(), "k": str(b.get("k", "")).strip(), "v": v, "spent": 0, "tag": (str(b.get("tag", "outros")).strip() or "outros")})
    prebuy = []
    for p in (raw.get("prebuy") or []):
        txt = p if isinstance(p, str) else (p.get("text", "") if isinstance(p, dict) else "")
        txt = str(txt).strip()
        if txt:
            prebuy.append({"id": _uid(), "text": txt, "done": False})
    notes = []
    for n in (raw.get("notes") or []):
        if not isinstance(n, dict):
            continue
        notes.append({"id": _uid(), "title": str(n.get("title", "")).strip(), "body": str(n.get("body", "")).strip()})
    return {"days": days, "budget": budget, "prebuy": prebuy, "notes": notes}

def _travelers_line(trip: dict) -> str:
    """Linha 'VIAJANTES' do contexto: composição + tipo de grupo."""
    try:
        ad = int(float(trip.get("adults") or 0))
        ch = int(float(trip.get("children") or 0))
    except (TypeError, ValueError):
        ad, ch = 0, 0
    if ad + ch <= 0:
        return ""
    quem = f"{ad} adulto{'s' if ad != 1 else ''}" if ad else ""
    if ch:
        quem += (" e " if quem else "") + f"{ch} criança{'s' if ch != 1 else ''}"
    grupo = str(trip.get("groupTypes") or "").strip()
    return f"VIAJANTES: {quem} (total {ad + ch})" + (f" — perfil: {grupo}" if grupo else "")

def _route_line(trip: dict) -> str:
    """Linha 'DESLOCAMENTO': de onde a pessoa sai e como vai.

    Sem isso o Ali só conhece o destino, e o roteiro começa com a pessoa já no
    lugar — sem embarque, sem tempo de viagem e sem o custo de chegar lá.
    """
    origem = str(trip.get("origin") or "").strip()
    meio = str(trip.get("transport") or "").strip()
    if not origem and not meio:
        return ""
    if origem and meio:
        return f"DESLOCAMENTO: saindo de {origem}, de {meio.lower()}"
    return f"DESLOCAMENTO: saindo de {origem}" if origem else f"DESLOCAMENTO: de {meio.lower()}"

def _trip_context(trip: dict) -> str:
    parts = []
    destino = str(trip.get("destination") or "").strip()
    if destino:
        parts.append(f"DESTINO: {destino}")
    rl = _route_line(trip)
    if rl:
        parts.append(rl)
    tl = _travelers_line(trip)
    if tl:
        parts.append(tl)
    days = trip.get("days") or []
    if days:
        parts.append("ROTEIRO:")
        for d in days:
            parts.append(f"- {d.get('label','')} {d.get('date','')} — {d.get('title','')}:")
            for s in (d.get("stops") or []):
                line = f"   • {s.get('t','')} {s.get('n','')}".rstrip()
                ins = (s.get("insight") or "").strip()
                if ins:
                    line += f" — dica: {ins}"
                parts.append(line)
    cur = str(trip.get("currency") or MOEDA_PADRAO).strip() or MOEDA_PADRAO
    budget = trip.get("budget") or []
    if budget:
        b = "; ".join(
            f"{x.get('k','')} {cur}{x.get('v',0)}" + (f" (gasto {cur}{x.get('spent',0)})" if x.get('spent') else "")
            for x in budget
        )
        try:
            teto = float(trip.get("budgetTotal") or 0)
        except (TypeError, ValueError):
            teto = 0
        head = f"ORÇAMENTO (teto {cur}{teto:g}): " if teto > 0 else "ORÇAMENTO (sem teto definido): "
        parts.append(head + b)
    prebuy = trip.get("prebuy") or []
    pend = [str(p.get("text", "")).strip() for p in prebuy if not p.get("done") and str(p.get("text", "")).strip()]
    if pend:
        parts.append("COMPRAR ANTES (ainda pendente): " + "; ".join(pend))
    notes = trip.get("notes") or []
    if notes:
        parts.append("NOTAS: " + " | ".join(f"{n.get('title','')}: {n.get('body','')}" for n in notes))
    return "\n".join(parts)

# ---------- Camada de armazenamento (kv: chave -> {valor json, versão}) ----------
# 'trips'      -> índice {active, list:[metas...]}
# 'trip:<id>'  -> estado da viagem {days, budget, prebuy, notes}
# 'trip'       -> dado ANTIGO (viagem única). Mantido como backup, nunca apagado.
def _read(con, key):
    row = con.execute("SELECT v, ver FROM kv WHERE k=?", (key,)).fetchone()
    if not row:
        return None, 0
    return json.loads(row[0]), row[1]

def _write(con, key, value, ver):
    con.execute(
        "INSERT INTO kv(k,v,ver) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ver=excluded.ver",
        (key, json.dumps(value, ensure_ascii=False), ver),
    )

def _ensure_migrated(con):
    # já migrado?
    if con.execute("SELECT 1 FROM kv WHERE k='trips'").fetchone():
        return
    old = con.execute("SELECT v, ver FROM kv WHERE k='trip'").fetchone()
    if old:
        # a viagem única antiga vira a viagem 'ny' (preserva o dado E a versão);
        # 'trip' permanece intacto como backup
        _write(con, "trip:ny", json.loads(old[0]), old[1])
        trips = {"active": "ny", "list": [dict(NY_META)]}
    else:
        trips = {"active": None, "list": []}
    _write(con, "trips", trips, 0)
    con.commit()

def db():
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, ver INTEGER DEFAULT 0)")
    # migra bancos antigos criados sem a coluna de versão
    cols = [r[1] for r in con.execute("PRAGMA table_info(kv)").fetchall()]
    if "ver" not in cols:
        con.execute("ALTER TABLE kv ADD COLUMN ver INTEGER DEFAULT 0")
    _ensure_migrated(con)
    return con

def _active_key(con):
    trips, _ = _read(con, "trips")
    active = (trips or {}).get("active")
    return f"trip:{active}" if active else None

app = FastAPI(title="VouAli")

@app.middleware("http")
async def limitar_tamanho(request: Request, call_next):
    """Recusa corpos absurdos ANTES de lê-los na memória. Um PUT de dezenas de
    MB não pode nem chegar ao banco nem virar contexto de IA."""
    tam = request.headers.get("content-length")
    if tam and tam.isdigit() and int(tam) > MAX_BODY:
        return JSONResponse({"error": "too_large", "max": MAX_BODY}, status_code=413)
    return await call_next(request)

# O app Android roda a interface embarcada no aparelho, então as chamadas à
# API vêm de outra origem. Sem isto, o navegador do app bloqueia tudo.
# ORIGENS_EXTRA permite acrescentar domínios (ex.: um site próprio).
ORIGENS_APP = ["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"]
ORIGENS_EXTRA = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_APP + ORIGENS_EXTRA,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Trip-Token", "X-Base-Version", "If-None-Match"],
    # Sem expor o ETag, o app não consegue lê-lo e perderíamos o 304.
    expose_headers=["ETag"],
)

def check(request: Request):
    """Modo legado (produção): senha compartilhada."""
    if auth.AUTH_MODE != "firebase" and TOKEN and request.headers.get("X-Trip-Token") != TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

def me(request: Request):
    """No modo firebase, exige usuário autenticado e devolve {uid,email,name}.
    No modo legado devolve None (e apenas confere a senha compartilhada)."""
    if auth.AUTH_MODE != "firebase":
        check(request)
        return None
    usuario = auth.current_user(request)
    if not usuario:
        raise HTTPException(status_code=401, detail="unauthorized")
    return usuario

def user_con(usuario):
    """Conexão pronta com o usuário já registrado (primeiro login cria a conta)
    e com eventuais convites pendentes já transformados em acesso."""
    store.ensure_schema()
    con = store.connect()
    store.upsert_user(con, usuario["uid"], usuario["email"], usuario["name"])
    store.claim_invites(con, usuario["uid"], usuario["email"])
    con.commit()
    return con

def _put_state_key(con, key, body, base):
    """Grava um estado com concorrência otimista. Retorna a nova versão."""
    _, current = _read(con, key)
    if base is not None and base != "" and int(base) != current:
        raise HTTPException(status_code=409, detail={"version": current})
    new_ver = current + 1
    _write(con, key, json.loads(body), new_ver)
    con.commit()
    return new_ver

# --- /api/state opera na viagem ATIVA (do usuário, no modo firebase) ---
def _etag(chave, versao):
    return f'W/"{chave}-{versao}"'

def _sem_mudanca(request, chave, versao):
    """O app pergunta 'mudou?' a cada poucos segundos. Quando nada mudou,
    responde 304 sem corpo — economiza banda e processamento."""
    if request.headers.get("If-None-Match") == _etag(chave, versao):
        return Response(status_code=304, headers={"ETag": _etag(chave, versao), "Cache-Control": "no-cache"})
    return None

@app.get("/api/state")
def get_state(request: Request):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            viagens = store.list_trips(con, usuario["uid"])
            ativa = viagens["active"]
            if not ativa:
                return {"state": None, "version": 0}
            got = store.get_trip(con, ativa, usuario["uid"])
            if not got:
                return {"state": None, "version": 0}
            igual = _sem_mudanca(request, ativa, got[1])
            if igual:
                return igual
            return JSONResponse({"state": got[0], "version": got[1]},
                                headers={"ETag": _etag(ativa, got[1]), "Cache-Control": "no-cache"})
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); return {"state": None, "version": 0}
    data, ver = _read(con, key); con.close()
    igual = _sem_mudanca(request, key, ver)
    if igual:
        return igual
    return JSONResponse({"state": data, "version": ver},
                        headers={"ETag": _etag(key, ver), "Cache-Control": "no-cache"})

@app.put("/api/state")
async def put_state(request: Request):
    usuario = me(request)
    body = await request.body()
    try:
        novo = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    base = request.headers.get("X-Base-Version")
    if usuario:
        with user_con(usuario) as con:
            ativa = store.list_trips(con, usuario["uid"])["active"]
            if not ativa:
                raise HTTPException(status_code=409, detail="no active trip")
            try:
                nova = store.put_trip(con, ativa, usuario["uid"], novo, base)
            except store.Conflict as c:
                raise HTTPException(status_code=409, detail={"version": c.version})
            return {"ok": True, "version": nova}
    con = db()
    key = _active_key(con)
    if not key:
        con.close(); raise HTTPException(status_code=409, detail="no active trip")
    try:
        new_ver = _put_state_key(con, key, body, base)
    finally:
        con.close()
    return {"ok": True, "version": new_ver}

# --- Multi-viagem ---
def _with_meta_defaults(trips):
    """Preenche campos novos em viagens criadas antes deles existirem."""
    for m in (trips or {}).get("list", []):
        for k in META_FIELDS:
            m.setdefault(k, "")
        for k, default in META_NUMS.items():
            m.setdefault(k, default)
        if not m.get("currency"):
            m["currency"] = MOEDA_PADRAO
    return trips

def _build_meta(body):
    """Normaliza os metadados enviados pelo app (texto e números)."""
    meta = {}
    for k in META_FIELDS:
        meta[k] = str(body.get(k) or "").strip()
    meta["name"] = meta["name"] or "Nova viagem"
    meta["currency"] = meta["currency"] or MOEDA_PADRAO
    for k, default in META_NUMS.items():
        try:
            meta[k] = float(body[k]) if body.get(k) not in (None, "") else default
        except (TypeError, ValueError, KeyError):
            meta[k] = default
    return meta

@app.get("/api/trips")
def list_trips(request: Request):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"])), "version": 0}
    con = db(); trips, ver = _read(con, "trips"); con.close()
    return {"trips": _with_meta_defaults(trips or {"active": None, "list": []}), "version": ver}

@app.post("/api/trips")
async def create_trip(request: Request):
    usuario = me(request)
    body = await request.json()
    if usuario:
        with user_con(usuario) as con:
            propria = sum(1 for t in store.list_trips(con, usuario["uid"])["list"]
                          if t.get("role") == "owner")
            if propria >= MAX_TRIPS:
                raise HTTPException(status_code=409, detail="trip limit reached")
            meta = _build_meta(body)
            dados = body.get("data") if isinstance(body.get("data"), dict) else None
            tid = store.create_trip(con, usuario["uid"], meta, dados)
            meta["id"] = tid
            con.commit()
            return {"meta": meta, "trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    tid = uuid.uuid4().hex[:8]
    meta = {"id": tid}
    for k in META_FIELDS:
        meta[k] = str(body.get(k) or "").strip()
    meta["name"] = meta["name"] or "Nova viagem"
    meta["currency"] = meta["currency"] or MOEDA_PADRAO
    for k, default in META_NUMS.items():
        try:
            meta[k] = float(body[k]) if body.get(k) not in (None, "") else default
        except (TypeError, ValueError, KeyError):
            meta[k] = default
    data = body.get("data") if isinstance(body.get("data"), dict) else None
    _write(con, f"trip:{tid}", data or dict(EMPTY_STATE), 0)
    trips["list"].append(meta)
    if body.get("makeActive", True):
        trips["active"] = tid
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"meta": meta, "trips": trips}

@app.put("/api/active")
async def set_active(request: Request):
    usuario = me(request)
    body = await request.json()
    tid = body.get("id")
    if usuario:
        with user_con(usuario) as con:
            if not store.set_active(con, usuario["uid"], tid):
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    if not any(m.get("id") == tid for m in trips["list"]):
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    trips["active"] = tid
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

@app.get("/api/trips/{tid}")
def get_trip(request: Request, tid: str):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            got = store.get_trip(con, tid, usuario["uid"])
            if not got:      # inexistente OU de outro usuário: mesma resposta
                raise HTTPException(status_code=404, detail="trip not found")
            return {"state": got[0], "version": got[1]}
    con = db(); data, ver = _read(con, f"trip:{tid}"); con.close()
    if data is None:
        raise HTTPException(status_code=404, detail="trip not found")
    return {"state": data, "version": ver}

@app.put("/api/trips/{tid}")
async def put_trip(request: Request, tid: str):
    usuario = me(request)
    body = await request.body()
    try:
        novo = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    if usuario:
        with user_con(usuario) as con:
            try:
                nova = store.put_trip(con, tid, usuario["uid"], novo, request.headers.get("X-Base-Version"))
            except store.Conflict as c:
                raise HTTPException(status_code=409, detail={"version": c.version})
            if nova is None:
                raise HTTPException(status_code=404, detail="trip not found")
            return {"ok": True, "version": nova}
    con = db()
    if not con.execute("SELECT 1 FROM kv WHERE k=?", (f"trip:{tid}",)).fetchone():
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    try:
        new_ver = _put_state_key(con, f"trip:{tid}", body, request.headers.get("X-Base-Version"))
    finally:
        con.close()
    return {"ok": True, "version": new_ver}

@app.put("/api/trips/{tid}/meta")
async def put_trip_meta(request: Request, tid: str):
    usuario = me(request)
    body = await request.json()
    if usuario:
        patch = {}
        for k in META_FIELDS:
            if k in body:
                patch[k] = str(body[k] or "").strip()
        for k, default in META_NUMS.items():
            if k in body:
                try:
                    patch[k] = float(body[k]) if body[k] not in (None, "") else default
                except (TypeError, ValueError):
                    patch[k] = default
        with user_con(usuario) as con:
            if store.update_meta(con, tid, usuario["uid"], patch) is None:
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    meta = next((m for m in trips["list"] if m.get("id") == tid), None)
    if meta is None:
        con.close(); raise HTTPException(status_code=404, detail="trip not found")
    for k in META_FIELDS:
        if k in body:
            meta[k] = str(body[k] or "").strip()
    for k, default in META_NUMS.items():
        if k in body:
            try:
                meta[k] = float(body[k]) if body[k] not in (None, "") else default
            except (TypeError, ValueError):
                meta[k] = default
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

# --- Compartilhamento de viagem ---
@app.get("/api/trips/{tid}/members")
def list_members(request: Request, tid: str):
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    with user_con(usuario) as con:
        papel = store.role_of(con, tid, usuario["uid"])
        if not papel:
            raise HTTPException(status_code=404, detail="trip not found")
        return {"role": papel, "members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.post("/api/trips/{tid}/members")
async def add_member_route(request: Request, tid: str):
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    body = await request.json()
    email = store.norm_email(body.get("email"))
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="invalid email")
    with user_con(usuario) as con:
        if store.role_of(con, tid, usuario["uid"]) != "owner":
            raise HTTPException(status_code=403, detail="only the owner can invite")
        if email == store.norm_email(usuario["email"]):
            raise HTTPException(status_code=400, detail="already a member")
        if len(store.members_of(con, tid)) + len(store.pending_invites(con, tid)) >= MAX_MEMBERS:
            raise HTTPException(status_code=409, detail="member limit reached")
        situacao = store.invite(con, tid, email, "editor", usuario["uid"])
        con.commit()
        return {"status": situacao, "members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.delete("/api/trips/{tid}/members/{quem}")
def remove_member_route(request: Request, tid: str, quem: str):
    """`quem` pode ser o uid de um membro ou o e-mail de um convite pendente."""
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=404, detail="not available")
    with user_con(usuario) as con:
        if store.role_of(con, tid, usuario["uid"]) != "owner":
            raise HTTPException(status_code=403, detail="only the owner can remove")
        if "@" in quem:
            store.cancel_invite(con, tid, quem)
        elif not store.remove_member(con, tid, quem):
            raise HTTPException(status_code=400, detail="cannot remove the owner")
        con.commit()
        return {"members": store.members_of(con, tid), "invites": store.pending_invites(con, tid)}

@app.delete("/api/trips/{tid}")
def delete_trip(request: Request, tid: str):
    usuario = me(request)
    if usuario:
        with user_con(usuario) as con:
            if not store.delete_trip(con, tid, usuario["uid"]):
                raise HTTPException(status_code=404, detail="trip not found")
            con.commit()
            return {"trips": _with_meta_defaults(store.list_trips(con, usuario["uid"]))}
    con = db()
    trips, tver = _read(con, "trips")
    trips = trips or {"active": None, "list": []}
    trips["list"] = [m for m in trips["list"] if m.get("id") != tid]
    con.execute("DELETE FROM kv WHERE k=?", (f"trip:{tid}",))
    if trips["active"] == tid:
        trips["active"] = trips["list"][0]["id"] if trips["list"] else None
    _write(con, "trips", trips, tver + 1)
    con.commit(); con.close()
    return {"trips": trips}

def _preparar_chat(body):
    """Monta (histórico, system) a partir do corpo do pedido. None se vazio."""
    msgs = body.get("messages") or []
    trip = body.get("trip") or {}
    conv = [
        {"role": m.get("role"), "content": str(m.get("content", ""))}
        for m in msgs
        if m.get("role") in ("user", "assistant") and str(m.get("content", "")).strip()
    ][-24:]
    while conv and conv[0]["role"] != "user":
        conv.pop(0)
    if not conv:
        return None
    hoje = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    contexto = _trip_context(trip)[:MAX_AI_CHARS]     # o `trip` vem do cliente: teto duro
    system = ALI_SYSTEM + f"\n\nDATA DE HOJE: {hoje}.\n\nDados atuais da viagem:\n" + contexto
    # O histórico também é do cliente. Cortamos as mensagens mais antigas até
    # caber, preservando sempre a última (a pergunta atual).
    orcamento = MAX_AI_CHARS
    cortada = []
    for m in reversed(conv):
        c = m["content"][:MAX_AI_CHARS]
        if cortada and orcamento - len(c) < 0:
            break
        cortada.append({"role": m["role"], "content": c})
        orcamento -= len(c)
    cortada.reverse()
    while cortada and cortada[0]["role"] != "user":
        cortada.pop(0)
    return (cortada or conv[-1:]), system

def _sse(dado):
    return f"data: {json.dumps(dado, ensure_ascii=False)}\n\n"

@app.post("/api/ali/stream")
async def ali_stream(request: Request):
    """Mesma conversa do /api/ali, mas devolvendo o texto conforme ele sai.
    A pessoa começa a ler na hora, em vez de encarar um 'digitando…' longo."""
    usuario = me(request)
    body = await request.json()

    async def eventos():
        if not _ali_client:
            yield _sse({"error": "not_configured"}); return
        if not _rate_ok(usuario and usuario["uid"]):
            yield _sse({"error": "rate_limited"}); return
        pode, motivo, fonte = _autorizar(usuario, "chat", body)
        if not pode:
            yield _sse(motivo); return
        preparo = _preparar_chat(body)
        if not preparo:
            _estornar(usuario, "chat", fonte)
            yield _sse({"error": "empty"}); return
        conv, system = preparo
        kwargs = {"model": ALI_MODEL_CHAT, "max_tokens": 700, "system": _system(system), "messages": conv}
        if _efeito_ok(ALI_MODEL_CHAT):
            kwargs["output_config"] = {"effort": "low"}
        try:
            async with _ali_client.messages.stream(**kwargs) as fluxo:
                async for pedaco in fluxo.text_stream:
                    if pedaco:
                        yield _sse({"delta": pedaco})
                final = await fluxo.get_final_message()
            _contar(usuario, "chat", final)
            _confirmar(usuario, fonte)
            if getattr(final, "stop_reason", None) == "refusal":
                yield _sse({"error": "refusal"})
            yield _sse({"done": True})
        except Exception as e:
            _estornar(usuario, "chat", fonte)
            yield _sse({"error": "api_error", "detail": str(e)[:200]})

    return StreamingResponse(eventos(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",     # impede o proxy de segurar os pedaços
    })

@app.post("/api/ali")
async def ali_chat(request: Request):
    usuario = me(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok(usuario and usuario["uid"]):
        return {"error": "rate_limited"}
    body = await request.json()
    pode, motivo, fonte = _autorizar(usuario, "chat", body)
    if not pode:
        return motivo
    preparo = _preparar_chat(body)
    if not preparo:
        _estornar(usuario, "chat", fonte)
        return {"error": "empty"}
    conv, system = preparo
    kwargs = {"model": ALI_MODEL_CHAT, "max_tokens": 700, "system": _system(system), "messages": conv}
    if _efeito_ok(ALI_MODEL_CHAT):
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        _contar(usuario, "chat", resp)
        _confirmar(usuario, fonte)
        if getattr(resp, "stop_reason", None) == "refusal":
            return {"reply": "Sobre isso eu prefiro não opinar — mas posso ajudar com qualquer coisa do roteiro, orçamento ou dicas da viagem. 🙂"}
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        return {"reply": text or "…"}
    except Exception as e:
        _estornar(usuario, "chat", fonte)
        return {"error": "api_error", "detail": str(e)[:200]}

@app.post("/api/ali/dica")
async def ali_dica(request: Request):
    usuario = me(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok(usuario and usuario["uid"]):
        return {"error": "rate_limited"}
    body = await request.json()
    stop = body.get("stop") or {}
    trip = body.get("trip") or {}
    name = str(stop.get("n", "")).strip()
    if not name:
        return {"error": "empty"}
    pode, motivo, fonte = _autorizar(usuario, "tip", body)
    if not pode:
        return motivo
    prompt = f"Parada: {name}"
    for k, label in (("t", "Horário"), ("d", "Resumo"), ("getting", "Como chegar"), ("todo", "O que fazer")):
        v = str(stop.get(k, "")).strip()
        if v:
            prompt += f"\n{label}: {v}"
    prompt = prompt[:MAX_AI_CHARS]
    prompt += "\n\nContexto geral da viagem:\n" + _trip_context(trip)[:MAX_AI_CHARS] + "\n\nGere a dica do Ali para essa parada."
    kwargs = {"model": ALI_MODEL_CHAT, "max_tokens": 600, "system": ALI_DICA_SYSTEM, "messages": [{"role": "user", "content": prompt}]}
    if _efeito_ok(ALI_MODEL_CHAT):
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        _contar(usuario, "tip", resp)
        if getattr(resp, "stop_reason", None) == "refusal":
            _estornar(usuario, "tip", fonte)
            return {"error": "refusal"}
        _confirmar(usuario, fonte)
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip().strip('"').strip()
        return {"dica": text}
    except Exception as e:
        _estornar(usuario, "tip", fonte)
        return {"error": "api_error", "detail": str(e)[:200]}

@app.post("/api/ali/gerar")
async def ali_gerar(request: Request):
    usuario = me(request)
    if not _ali_client:
        return {"error": "not_configured"}
    if not _rate_ok(usuario and usuario["uid"]):
        return {"error": "rate_limited"}
    body = await request.json()
    destination = str(body.get("destination", "")).strip()
    try:
        days = int(body.get("days") or 0)
    except (TypeError, ValueError):
        days = 0
    if not destination or days < 1:
        return {"error": "invalid"}
    days = min(days, 12)
    pode, motivo, fonte = _autorizar(usuario, "gen", body, dias_pedidos=days)
    if not pode:
        return motivo
    style = str(body.get("style", "")).strip()
    date_label = str(body.get("dateLabel", "")).strip()
    budget = body.get("budget")
    cur = str(body.get("currency") or MOEDA_PADRAO).strip() or MOEDA_PADRAO
    prompt = f"Destino: {destination}\nNúmero de dias: {days}\nMoeda: {cur} (use SEMPRE esta moeda nos valores)"
    rl = _route_line(body)
    if rl:
        prompt += "\n" + rl
    tl = _travelers_line(body)
    if tl:
        prompt += "\n" + tl
    if date_label:
        prompt += f"\nPeríodo: {date_label}"
    if budget:
        prompt += f"\nOrçamento total aproximado: {cur} {budget}"
    if style:
        prompt += f"\nEstilo/interesses: {style}"
    # destination/style/dateLabel vêm do cliente sem teto: cortamos o prompt
    # montado antes de enviar, senão um campo gigante queima a chamada mais cara.
    prompt = prompt[:MAX_AI_CHARS]
    prompt += f"\n\nGere o roteiro completo em JSON com EXATAMENTE {days} dias, seguindo o schema."
    kwargs = {"model": ALI_MODEL_GEN, "max_tokens": 16000, "system": ALI_GERAR_SYSTEM, "messages": [{"role": "user", "content": prompt}]}
    if _efeito_ok(ALI_MODEL_GEN):
        kwargs["output_config"] = {"effort": "low"}
    try:
        resp = await _ali_client.messages.create(**kwargs)
        _contar(usuario, "gen", resp)
        # Só fica descontado o roteiro que chega inteiro: resposta recusada,
        # vazia ou ilegível custa a nós, não a quem pagou.
        parada = getattr(resp, "stop_reason", None)
        if parada == "refusal":
            _estornar(usuario, "gen", fonte)
            _log_gerar("refusal", days, parada)
            return {"error": "refusal"}
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        raw = json.loads(_extract_json(text))
        state = _normalize_state(raw if isinstance(raw, dict) else {})
        if not state["days"]:
            _estornar(usuario, "gen", fonte)
            _log_gerar("empty", days, parada)
            return {"error": "empty"}
        _confirmar(usuario, fonte)
        return {"state": state}
    except json.JSONDecodeError:
        _estornar(usuario, "gen", fonte)
        # `max_tokens` aqui quer dizer roteiro cortado no meio: grande demais.
        _log_gerar("parse", days, locals().get("parada"))
        return {"error": "parse"}
    except Exception as e:
        _estornar(usuario, "gen", fonte)
        _log_gerar("api_error", days, f"{type(e).__name__}: {str(e)[:200]}")
        return {"error": "api_error", "detail": str(e)[:200]}

def _log_gerar(erro, dias, detalhe):
    """Uma linha no log do Railway quando a geração de roteiro falha. Sem nada
    da pessoa nem da viagem: só o tipo de falha, o tamanho pedido e o motivo
    técnico — o suficiente para descobrir por que um roteiro não saiu."""
    print(f"[ali/gerar] falhou: erro={erro} dias={dias} detalhe={detalhe}", flush=True)

@app.get("/api/health")
def health():
    """Sem senha, de propósito: usado por monitoramento e pelo deploy."""
    # `authMode.error` é texto diagnóstico (nome da env var, campos ausentes do
    # certificado) — nunca valor de segredo. Fica público de propósito, para
    # monitoramento enxergar uma credencial mal configurada sem o painel.
    return {
        "ok": True,
        "environment": os.getenv("ENVIRONMENT", "dev"),
        "ai": bool(_ali_client),
        "auth": bool(TOKEN),
        "authMode": auth.status(),
        "db": "postgres" if store.DATABASE_URL else "sqlite",
        # Só "está configurado ou não" — nunca o valor. Deixa conferir de fora
        # se os segredos da cobrança chegaram ao servidor.
        "cobranca": {
            "ligada": COBRANCA,
            "contas_de_teste": len(COBRANCA_TESTE),
            "cancelamentos_sem_passe": _cancelamentos_sem_passe(),
            "revenuecat": bool(REVENUECAT_API_KEY),
            "webhook": bool(REVENUECAT_WEBHOOK_AUTH),
            "sandbox": REVENUECAT_SANDBOX,
        },
    }

def _cancelamentos_sem_passe():
    """Só um número, para conferir de fora — nunca quem nem o quê."""
    try:
        store.ensure_schema()
        with store.connect() as con:
            return store.cancelamentos_sem_passe(con)
    except Exception:
        return None

@app.get("/api/config")
def config():
    """Configuração pública que o app busca ao abrir — evita reconstruir o
    frontend a cada ambiente. Não expõe segredo algum."""
    return {"authMode": auth.AUTH_MODE, "firebase": auth.web_config() if auth.AUTH_MODE == "firebase" else None}

@app.get("/api/fotos")
async def fotos(request: Request, q: str = ""):
    """Busca fotos de capa no Pixabay pelo destino. Só para quem está logado —
    e a chave do Pixabay nunca sai do servidor. Devolve uma lista enxuta de
    URLs; o app guarda a que a pessoa escolher como link da capa."""
    me(request)                                  # exige sessão válida
    if not PIXABAY_API_KEY:
        return {"error": "not_configured"}
    termo = (q or "").strip()[:80]
    if not termo:
        return {"fotos": []}

    agora = time.time()
    while _foto_calls and agora - _foto_calls[0] > FOTO_RATE_WINDOW:
        _foto_calls.popleft()
    if len(_foto_calls) >= FOTO_RATE_MAX:
        return {"error": "rate_limited"}
    _foto_calls.append(agora)

    import httpx
    try:
        async with httpx.AsyncClient(timeout=8) as cli:
            r = await cli.get(
                "https://pixabay.com/api/",
                params={"key": PIXABAY_API_KEY, "q": termo, "image_type": "photo",
                        "orientation": "horizontal", "per_page": 24, "safesearch": "true"},
            )
        if r.status_code != 200:
            return {"error": "upstream"}
        dados = r.json()
    except Exception:
        return {"error": "upstream"}

    fotos = []
    for p in dados.get("hits", []):
        # webformatURL (640px) é a imagem que o Pixabay disponibiliza para exibir;
        # previewURL é a miniatura leve para a grade.
        url_foto = p.get("webformatURL")
        if not url_foto:
            continue
        fotos.append({
            "thumb": p.get("previewURL") or url_foto,
            "url": url_foto,
            "autor": str(p.get("user") or "").strip(),
        })
    return {"fotos": fotos, "fonte": "Pixabay"}

@app.get("/api/usage")
def usage(request: Request):
    """Quanto o usuário já usou da IA neste mês, e os limites."""
    usuario = me(request)
    if not usuario:
        return {"quotas": None}      # modo antigo: sem cota
    with user_con(usuario) as con:
        uso = store.uso_do_usuario(con, usuario["uid"])
    # Com a cobrança ligada não existe mais cota do mês: quem responde quanto
    # resta é /api/saldo. `quotas` nulo faz o app antigo esconder o painel.
    return {"period": uso["period"], "quotas": None if _cobra(usuario) else QUOTAS,
            "used": {k: uso[k] for k in store.TIPOS_USO},
            "tokens": {"in": uso["tokens_in"], "out": uso["tokens_out"]}}

# --- Saldo e compras (cobrança) ---
def _resumo_saldo(con, uid, trip_id):
    """O que a pessoa ainda pode usar do Ali.

    `creditos` é o saldo da CONTA (Pacote VouAli): vale em qualquer viagem.
    `disponivel` é o que dá para gastar AGORA na viagem informada — os
    créditos de quem paga ali, mais a degustação se a viagem for curta.
    """
    store.garantir_degustacao(con, uid, **DEGUSTACAO)
    dias = store.dias_da_viagem(con, trip_id) if trip_id else 0
    fontes, deg = _fontes(con, uid, trip_id, dias)
    meus = store.creditos(con, uid)
    pagantes = _pagantes(con, uid, trip_id)
    dono = pagantes[0] if len(pagantes) > 1 else None
    ultimo = store.ultimo_pacote(con, pagantes)
    pagos = [g for g in fontes if g["origin"] != store.ORIGEM_DEGUSTACAO]

    def soma(grants):
        return {t: sum(store.resto(g, t) for g in grants) for t in store.TIPOS_USO}

    return {
        "cobranca": True,
        "viagem": trip_id,
        "dias": dias,
        "max_dias": DEGUSTACAO_MAX_DIAS,
        "disponivel": soma(fontes),
        "degustacao": {**soma([deg]), "vale_nesta_viagem": dias <= DEGUSTACAO_MAX_DIAS},
        "creditos": soma(meus),                     # da conta, para qualquer viagem
        "tem_pacote": bool(meus),
        # Viagem de outra pessoa: o Ali usa primeiro os créditos dela.
        "dono": {"nome": store.nome_de(con, dono), "creditos": soma(store.creditos(con, dono))} if dono else None,
        # Pacote estornado e nenhum outro valendo: o app explica, em vez de o
        # saldo simplesmente sumir.
        "reembolsado": bool(ultimo and ultimo["revoked"] and not pagos),
        "pacotes": {"degustacao": DEGUSTACAO, "pacote": PASSE},
        "produto": PRODUTO_PASSE,
    }

@app.get("/api/saldo")
def saldo(request: Request, trip: str = ""):
    """Quanto resta do Ali para uma viagem (a ativa, se nenhuma for informada)."""
    usuario = me(request)
    if not _cobra(usuario):
        return {"cobranca": False}
    with user_con(usuario) as con:
        tid = trip.strip()
        if tid and not store.role_of(con, tid, usuario["uid"]):
            raise HTTPException(status_code=404, detail="trip not found")
        return _resumo_saldo(con, usuario["uid"], tid or store.list_trips(con, usuario["uid"])["active"])

async def _sincronizar_compras(uid):
    """Pergunta ao RevenueCat o que a conta comprou e credita o que faltar.

    Devolve os ids dos saldos NOVOS, ou None se não deu para conferir. Rodar de
    novo não credita em dobro: cada transação vira saldo uma única vez.
    """
    store.ensure_schema()
    with store.connect() as con:
        conhecido = con.execute("SELECT 1 FROM users WHERE uid=?", (uid,)).fetchone()
    if not conhecido:           # evento de teste, ou conta que já foi excluída
        return []
    compras = await billing.compras_de(uid, REVENUECAT_API_KEY)
    if compras is None:
        return None
    novos = []
    with store.connect() as con:
        for c in compras:
            pacote = _pacote(c["produto"])
            if not pacote or (c["sandbox"] and not REVENUECAT_SANDBOX):
                continue
            gid = store.conceder(con, uid, pacote["origin"], chat=pacote["chat"], gen=pacote["gen"],
                                 tip=pacote["tip"], txn_id=c["txn"], store_txn=c["store_txn"])
            if gid:
                novos.append(gid)
    return novos

@app.post("/api/compras/sincronizar")
async def sincronizar_compras(request: Request):
    """O app chama isto depois de uma compra (e no "restaurar compras").

    O app só AVISA; ele não diz o que comprou. Quem lista as compras é o
    RevenueCat, perguntado daqui com a chave secreta. O crédito comprado é da
    CONTA; `trip_id` (opcional) só escolhe de qual viagem é o saldo devolvido.
    """
    usuario = me(request)
    if not usuario:
        return {"error": "sem_conta"}
    if not REVENUECAT_API_KEY:
        return {"error": "not_configured"}
    uid = usuario["uid"]
    if not _janela_ok(_compra_calls.setdefault(uid, deque()), COMPRA_RATE_MAX):
        return {"error": "rate_limited"}
    try:
        body = await request.json()
    except Exception:
        body = {}
    tid = str((body or {}).get("trip_id") or "").strip() or None
    with user_con(usuario) as con:
        if tid and not store.role_of(con, tid, uid):
            raise HTTPException(status_code=404, detail="trip not found")
    novos = await _sincronizar_compras(uid)
    if novos is None:
        return {"error": "upstream"}
    with user_con(usuario) as con:
        return {"ok": True, "novos": len(novos),
                "saldo": _resumo_saldo(con, uid, tid or store.list_trips(con, uid)["active"])}

@app.post("/api/revenuecat/webhook")
async def revenuecat_webhook(request: Request):
    """Aviso do RevenueCat (compra, reembolso). Rede de segurança para quando o
    app fecha antes de avisar: o saldo é creditado mesmo assim.

    O conteúdo do aviso não é usado como verdade — ele só diz DE QUEM conferir.
    """
    if not billing.webhook_ok(request.headers.get("Authorization"), REVENUECAT_WEBHOOK_AUTH):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        evento = (await request.json()).get("event")
    except Exception:
        evento = None
    if not isinstance(evento, dict):
        raise HTTPException(status_code=400, detail="invalid event")
    uid = str(evento.get("app_user_id") or "")
    if not uid or uid.startswith("$RCAnonymousID"):
        return {"ok": True, "ignorado": True}
    novos = await _sincronizar_compras(uid)
    if novos is None:
        # Resposta diferente de 200 faz o RevenueCat tentar de novo mais tarde.
        raise HTTPException(status_code=503, detail="upstream")
    tipo = str(evento.get("type") or "")
    produto = str(evento.get("product_id") or "")
    txn = str(evento.get("transaction_id") or "")
    revogados = 0
    resultado = f"creditados:{len(novos)}" if novos else "ok"
    if tipo == "CANCELLATION" and _pacote(produto):
        with store.connect() as con:
            for t in {evento.get("transaction_id"), evento.get("original_transaction_id"), evento.get("store_transaction_id")}:
                revogados += store.revogar(con, t)
        if not revogados:
            # O id do aviso não bateu com nenhum saldo. Segunda tentativa: o
            # que a loja deixou de listar como compra desta conta foi estornado.
            compras = await billing.compras_de(uid, REVENUECAT_API_KEY)
            if compras is not None:
                validos = {c["txn"] for c in compras} | {c["store_txn"] for c in compras if c["store_txn"]}
                with store.connect() as con:
                    revogados = store.revogar_ausentes(con, uid, validos)
        resultado = f"revogados:{revogados}" if revogados else "sem_passe"
    if tipo != "TEST" and (novos or tipo == "CANCELLATION"):
        with store.connect() as con:
            store.registrar_evento(con, uid, tipo, produto, txn, resultado)
    return {"ok": True, "revogados": revogados}

@app.get("/api/me")
def whoami(request: Request):
    """Quem está logado (e cria a conta no primeiro acesso)."""
    usuario = me(request)
    if not usuario:
        return {"mode": "token", "user": None}
    with user_con(usuario) as con:
        return {"mode": "firebase", "user": usuario}

@app.get("/api/me/exclusao")
def previa_da_exclusao(request: Request):
    """O que a exclusão vai levar. Serve para avisar ANTES de apagar."""
    usuario = me(request)
    if not usuario:
        return {"error": "sem_conta"}
    with user_con(usuario) as con:
        return store.resumo_da_conta(con, usuario["uid"], usuario["email"])

@app.delete("/api/me")
def excluir_conta(request: Request):
    """Apaga a conta e tudo que é dela. Exigência do Google para publicar.

    Os dados vão primeiro e a conta do Firebase depois, nessa ordem: se a
    ordem fosse inversa e o segundo passo falhasse, sobrariam dados sem dono e
    ninguém mais conseguiria chegar neles para apagar.
    """
    usuario = me(request)
    if not usuario:
        raise HTTPException(status_code=400, detail="sem_conta")
    with user_con(usuario) as con:
        resumo = store.excluir_conta(con, usuario["uid"], usuario["email"])
        con.commit()
    # Se isto falhar, os dados já foram: a conta fica sem nada, e uma nova
    # tentativa (ou o suporte) resolve o login. O contrário não teria volta.
    saiu = auth.delete_user(usuario["uid"])
    return {"ok": True, "apagado": resumo, "loginRemovido": saiu}

# --- SPA + static assets (defined last so /api routes win) ---
# Arquivos de /assets/ levam hash no nome: mudou o conteúdo, mudou o nome.
# Por isso podem ser guardados "para sempre" pelo navegador (e por uma CDN).
# O index.html e o service worker precisam ser sempre conferidos, senão o
# app fica preso numa versão antiga.
UM_ANO = "public, max-age=31536000, immutable"
SEM_CACHE = "no-cache"
UM_DIA = "public, max-age=86400"

def _cache_de(caminho: str) -> str:
    if caminho.startswith("assets/"):
        return UM_ANO
    if caminho in ("sw.js", "index.html", "") or caminho.endswith(".webmanifest"):
        return SEM_CACHE
    return UM_DIA          # ícones e imagens da marca

# Páginas públicas exigidas pela Play Store. Precisam existir FORA do app: o
# Google confere que dá para ler a política e PEDIR A EXCLUSÃO da conta sem
# instalar nada. São HTML solto, servido sem a SPA, com URL limpa.
PAGINAS_PUBLICAS = ("privacidade", "termos", "excluir-conta")

@app.get("/{full_path:path}")
def spa(full_path: str):
    nome = full_path.strip("/")
    if nome in PAGINAS_PUBLICAS:
        pagina = STATIC / f"{nome}.html"
        if pagina.is_file():
            return FileResponse(pagina, headers={"Cache-Control": UM_DIA})
    candidate = (STATIC / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC.resolve())):
        return FileResponse(candidate, headers={"Cache-Control": _cache_de(full_path)})
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": SEM_CACHE})
