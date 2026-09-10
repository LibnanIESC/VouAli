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


def nome_da_viagem(meta_json) -> str:
    """Só o nome sai de `meta`. O resto da viagem não é assunto do painel."""
    try:
        meta = json.loads(meta_json) if isinstance(meta_json, str) else (meta_json or {})
        return str(meta.get("name") or "").strip() or "(sem nome)"
    except Exception:
        return "(ilegível)"
