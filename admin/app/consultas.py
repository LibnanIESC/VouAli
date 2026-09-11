"""
Leitura das tabelas do app e cálculo de custo.

Tudo aqui é SELECT. As tabelas do app (`users`, `trips`, `trip_members`,
`ai_usage`) são criadas e escritas pelo backend; o painel só olha.

O que NÃO se lê aqui, de propósito: a coluna `state` das viagens, que guarda
roteiro, orçamento e notas. Nome e datas ficam em `meta` e bastam para dar
suporte — o conteúdo é de quem escreveu.
"""

import json
import os
from datetime import datetime, timezone

from .config import settings
from .db import conectar

# Preço da API por milhão de tokens (USD), por modelo. Só entrada e saída — o
# painel estima custo, não fatura.
PRECOS = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-fable-5-1": (10.0, 50.0),
}
PRECO_PADRAO = (5.0, 25.0)   # na dúvida, assume o mais caro da família Opus

# Câmbio para exibir em real. É estimativa de painel, não contabilidade —
# ajuste por variável quando a diferença incomodar.
USD_BRL = float(os.getenv("USD_BRL", "5.50"))

# O teto global vive no backend; aqui é só para mostrar o quanto já foi.
ALI_MONTHLY_CAP = int(os.getenv("ALI_MONTHLY_CAP", "0"))


def periodo_atual() -> str:
    """Mesmo formato do backend: 'AAAA-MM' em UTC."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


def custo_reais(tokens_in: int, tokens_out: int, modelo: str = "") -> float:
    entrada, saida = PRECOS.get(modelo or settings.ALI_MODEL, PRECO_PADRAO)
    usd = (tokens_in / 1_000_000) * entrada + (tokens_out / 1_000_000) * saida
    return usd * USD_BRL


def _int(valor) -> int:
    return int(valor or 0)


def resumo(periodo: str = "") -> dict:
    """Números do dashboard, numa conexão só."""
    periodo = periodo or periodo_atual()
    agora = int(datetime.now(timezone.utc).timestamp())
    ha_30_dias = agora - 30 * 86400

    with conectar() as con:
        usuarios = _int(con.um("SELECT COUNT(*) FROM users")[0])
        usuarios_30d = _int(con.um("SELECT COUNT(*) FROM users WHERE created_at >= ?", (ha_30_dias,))[0])
        viagens = _int(con.um("SELECT COUNT(*) FROM trips")[0])

        # Compartilhada = mais de um membro. O dono já conta como membro.
        compartilhadas = _int(con.um(
            "SELECT COUNT(*) FROM (SELECT trip_id FROM trip_members"
            " GROUP BY trip_id HAVING COUNT(*) > 1) AS t"
        )[0])

        linha = con.um(
            "SELECT COALESCE(SUM(chat),0), COALESCE(SUM(gen),0), COALESCE(SUM(tip),0),"
            " COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0)"
            " FROM ai_usage WHERE period=?",
            (periodo,),
        ) or (0, 0, 0, 0, 0)
        chat, gen, tip, tin, tout = (_int(x) for x in linha)

        # Top consumidores do mês. LEFT JOIN porque uma conta excluída pode
        # deixar uso registrado para trás.
        top_linhas = con.todos(
            "SELECT a.uid, u.email, a.chat + a.gen + a.tip AS chamadas,"
            " a.tokens_in, a.tokens_out"
            " FROM ai_usage a LEFT JOIN users u ON u.uid = a.uid"
            " WHERE a.period=? ORDER BY (a.tokens_in + a.tokens_out) DESC LIMIT 10",
            (periodo,),
        )

    chamadas = chat + gen + tip
    top = [
        {
            "uid": l[0],
            "email": l[1] or "",
            "chamadas": _int(l[2]),
            "tokens": _int(l[3]) + _int(l[4]),
            "custo": custo_reais(_int(l[3]), _int(l[4])),
        }
        for l in top_linhas
    ]

    return {
        "periodo": periodo,
        "usuarios": usuarios,
        "usuarios_30d": usuarios_30d,
        "viagens": viagens,
        "viagens_compartilhadas": compartilhadas,
        "chat": chat,
        "gen": gen,
        "tip": tip,
        "chamadas": chamadas,
        "tokens": tin + tout,
        "custo": custo_reais(tin, tout),
        "cap": {
            "limite": ALI_MONTHLY_CAP,
            "pct": round(chamadas * 100 / ALI_MONTHLY_CAP) if ALI_MONTHLY_CAP > 0 else 0,
        },
        "top": top,
    }


# Só estes campos saem de `meta`. A coluna `state` — roteiro, orçamento, notas —
# nunca é lida por este módulo.
CAMPOS_VISIVEIS = ("name", "destination", "dateLabel", "startDate", "endDate")


def resumo_da_viagem(meta_json) -> dict:
    """Identidade da viagem, e só. Nada do que a pessoa escreveu dentro dela."""
    try:
        meta = json.loads(meta_json) if isinstance(meta_json, str) else (meta_json or {})
    except Exception:
        meta = {}
    saida = {k: str(meta.get(k) or "").strip() for k in CAMPOS_VISIVEIS}
    saida["name"] = saida["name"] or "(sem nome)"
    return saida


def listar_usuarios(busca: str = "", limite: int = 100) -> list[dict]:
    """Lista com o consumo do mês embutido, para não fazer N+1 consultas."""
    periodo = periodo_atual()
    termo = f"%{(busca or '').strip().lower()}%"
    with conectar() as con:
        if busca.strip():
            linhas = con.todos(
                "SELECT u.uid, u.email, u.name, u.created_at,"
                " (SELECT COUNT(*) FROM trip_members m WHERE m.uid = u.uid),"
                " COALESCE(a.chat,0) + COALESCE(a.gen,0) + COALESCE(a.tip,0),"
                " COALESCE(a.tokens_in,0), COALESCE(a.tokens_out,0)"
                " FROM users u LEFT JOIN ai_usage a ON a.uid = u.uid AND a.period = ?"
                " WHERE LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?"
                " ORDER BY u.created_at DESC LIMIT ?",
                (periodo, termo, termo, limite),
            )
        else:
            linhas = con.todos(
                "SELECT u.uid, u.email, u.name, u.created_at,"
                " (SELECT COUNT(*) FROM trip_members m WHERE m.uid = u.uid),"
                " COALESCE(a.chat,0) + COALESCE(a.gen,0) + COALESCE(a.tip,0),"
                " COALESCE(a.tokens_in,0), COALESCE(a.tokens_out,0)"
                " FROM users u LEFT JOIN ai_usage a ON a.uid = u.uid AND a.period = ?"
                " ORDER BY u.created_at DESC LIMIT ?",
                (periodo, limite),
            )
    return [
        {
            "uid": l[0],
            "email": l[1] or "",
            "nome": l[2] or "",
            "criado_em": _int(l[3]),
            "viagens": _int(l[4]),
            "chamadas": _int(l[5]),
            "tokens": _int(l[6]) + _int(l[7]),
            "custo": custo_reais(_int(l[6]), _int(l[7])),
        }
        for l in linhas
    ]


def detalhe_usuario(uid: str) -> dict | None:
    """Conta, viagens (só identidade) e histórico de uso mês a mês."""
    with conectar() as con:
        conta = con.um("SELECT uid, email, name, created_at FROM users WHERE uid=?", (uid,))
        if not conta:
            return None

        viagens = con.todos(
            "SELECT t.id, t.meta, m.role, t.created_at, t.updated_at"
            " FROM trips t JOIN trip_members m ON m.trip_id = t.id"
            " WHERE m.uid = ? ORDER BY t.created_at DESC",
            (uid,),
        )
        uso = con.todos(
            "SELECT period, chat, gen, tip, tokens_in, tokens_out"
            " FROM ai_usage WHERE uid=? ORDER BY period DESC LIMIT 12",
            (uid,),
        )

    return {
        "uid": conta[0],
        "email": conta[1] or "",
        "nome": conta[2] or "",
        "criado_em": _int(conta[3]),
        "viagens": [
            {
                "id": v[0],
                **resumo_da_viagem(v[1]),
                "papel": v[2] or "editor",
                "criada_em": _int(v[3]),
                "atualizada_em": _int(v[4]),
            }
            for v in viagens
        ],
        "uso": [
            {
                "periodo": u[0],
                "chat": _int(u[1]), "gen": _int(u[2]), "tip": _int(u[3]),
                "chamadas": _int(u[1]) + _int(u[2]) + _int(u[3]),
                "tokens": _int(u[4]) + _int(u[5]),
                "custo": custo_reais(_int(u[4]), _int(u[5])),
            }
            for u in uso
        ],
    }


def _percentil(valores: list[float], p: float) -> float:
    """Percentil simples, sem numpy. Lista curta não justifica dependência."""
    if not valores:
        return 0.0
    ordenados = sorted(valores)
    pos = min(len(ordenados) - 1, max(0, round((len(ordenados) - 1) * p)))
    return ordenados[pos]


def custos(periodo: str = "") -> dict:
    """Custo por usuário no período, com média, p90 e projeção do mês."""
    periodo = periodo or periodo_atual()
    with conectar() as con:
        linhas = con.todos(
            "SELECT a.uid, u.email, a.chat, a.gen, a.tip, a.tokens_in, a.tokens_out"
            " FROM ai_usage a LEFT JOIN users u ON u.uid = a.uid"
            " WHERE a.period=? ORDER BY (a.tokens_in + a.tokens_out) DESC",
            (periodo,),
        )
        total_usuarios = _int(con.um("SELECT COUNT(*) FROM users")[0])
        periodos = [p[0] for p in con.todos(
            "SELECT DISTINCT period FROM ai_usage ORDER BY period DESC LIMIT 12"
        )]

    usuarios = [
        {
            "uid": l[0],
            "email": l[1] or "",
            "chat": _int(l[2]), "gen": _int(l[3]), "tip": _int(l[4]),
            "chamadas": _int(l[2]) + _int(l[3]) + _int(l[4]),
            "tokens": _int(l[5]) + _int(l[6]),
            "custo": custo_reais(_int(l[5]), _int(l[6])),
        }
        for l in linhas
    ]

    valores = [u["custo"] for u in usuarios]
    total = sum(valores)
    gen_total = sum(u["gen"] for u in usuarios)

    # Projeção: o que o mês custaria mantendo o ritmo até aqui. Só faz sentido
    # para o mês corrente — em mês fechado, o gasto já é o que é.
    agora = datetime.now(timezone.utc)
    if periodo == periodo_atual():
        dias_no_mes = _dias_no_mes(agora.year, agora.month)
        projecao = total / agora.day * dias_no_mes if agora.day else total
    else:
        projecao = total

    return {
        "periodo": periodo,
        "periodos": periodos,
        "usuarios": usuarios,
        "total": total,
        "total_usuarios": total_usuarios,
        "ativos": len(usuarios),
        "media_por_ativo": (total / len(usuarios)) if usuarios else 0.0,
        "media_por_usuario": (total / total_usuarios) if total_usuarios else 0.0,
        "p90": _percentil(valores, 0.9),
        "projecao": projecao,
        "gen": gen_total,
        # TETO do custo de um roteiro, não o valor exato: `ai_usage` agrega os
        # tokens por conta sem separar gen/chat/tip, então o gasto das contas
        # que geraram carrega junto as conversas delas. Separar exigiria
        # colunas novas no backend — ver docs/ADMIN.md.
        "custo_por_roteiro": (
            sum(custo_reais(_int(l[5]), _int(l[6])) for l in linhas if _int(l[3]) > 0) / gen_total
            if gen_total else 0.0
        ),
    }


def _dias_no_mes(ano: int, mes: int) -> int:
    import calendar
    return calendar.monthrange(ano, mes)[1]
