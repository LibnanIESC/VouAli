"""
As únicas escritas do painel nas tabelas do app.

Tudo aqui é destrutivo ou altera cota, então tudo aqui deixa rastro em
`admin_acoes`. No painel do Já Tomou a auditoria de ações destrutivas ficou na
lista de pendências; aqui ela nasce junto — ação sem registro é ação que
ninguém consegue explicar depois.
"""

import time
import uuid

from .db import conectar


def registrar(ip: str, acao: str, alvo: str, detalhe: str = "") -> None:
    with conectar() as con:
        con.execute(
            "INSERT INTO admin_acoes(id, quando, ip, acao, alvo, detalhe) VALUES(?,?,?,?,?,?)",
            (uuid.uuid4().hex, int(time.time()), ip, acao, alvo, detalhe[:500]),
        )


def historico(limite: int = 50) -> list[dict]:
    with conectar() as con:
        linhas = con.todos(
            "SELECT quando, ip, acao, alvo, detalhe FROM admin_acoes"
            " ORDER BY quando DESC LIMIT ?",
            (limite,),
        )
    return [
        {"quando": int(l[0] or 0), "ip": l[1] or "", "acao": l[2] or "",
         "alvo": l[3] or "", "detalhe": l[4] or ""}
        for l in linhas
    ]


def _norm_email(email) -> str:
    return str(email or "").strip().lower()


def apagar_dados(uid: str) -> dict:
    """Apaga os dados da conta, com a MESMA regra do app.

    As viagens que a pessoa criou somem de verdade, inclusive para quem ela
    convidou — o dado é dela, e viagem sem dono vira órfã que ninguém
    administra. Das viagens de outros ela apenas sai; apagá-las seria destruir
    dado alheio.

    O que NÃO acontece aqui: a conta do Firebase continua existindo. O painel
    não tem credencial do Firebase, de propósito — uma a menos para vazar. Se o
    pedido é de exclusão definitiva, apague também o usuário no Firebase
    Console, senão o próximo login recria uma conta (vazia) com o mesmo e-mail.
    """
    with conectar() as con:
        conta = con.um("SELECT email FROM users WHERE uid=?", (uid,))
        if not conta:
            return {"ok": False, "motivo": "conta não encontrada"}
        email = _norm_email(conta[0])

        proprias = [l[0] for l in con.todos("SELECT id FROM trips WHERE owner_uid=?", (uid,))]
        convidadas = con.um(
            "SELECT COUNT(*) FROM trip_members WHERE uid=? AND trip_id NOT IN"
            " (SELECT id FROM trips WHERE owner_uid=?)",
            (uid, uid),
        )
        uso = con.um("SELECT COUNT(*) FROM ai_usage WHERE uid=?", (uid,))

        for tid in proprias:
            con.execute("DELETE FROM trip_members WHERE trip_id=?", (tid,))
            con.execute("DELETE FROM trip_invites WHERE trip_id=?", (tid,))
            con.execute("DELETE FROM trips WHERE id=?", (tid,))
        con.execute("DELETE FROM trip_members WHERE uid=?", (uid,))
        if email:
            con.execute("DELETE FROM trip_invites WHERE email=?", (email,))
        con.execute("DELETE FROM trip_invites WHERE invited_by=?", (uid,))
        con.execute("DELETE FROM ai_usage WHERE uid=?", (uid,))
        con.execute("DELETE FROM users WHERE uid=?", (uid,))

    return {
        "ok": True,
        "email": email,
        "viagens_apagadas": len(proprias),
        "viagens_deixadas": int(convidadas[0] if convidadas else 0),
        "periodos_de_uso": int(uso[0] if uso else 0),
    }


def zerar_cotas(uid: str, periodo: str) -> dict:
    """Devolve a cota do mês a uma conta, sem apagar o custo.

    Zera só os contadores de chamadas (chat/gen/tip), que são o que a cota
    mede. Os tokens ficam: eles são o gasto real, e apagá-los faria o painel
    mentir sobre quanto o mês custou. A conta fica com 0 chamadas e os tokens
    de antes — estranho de olhar, honesto de contabilizar.
    """
    with conectar() as con:
        linha = con.um(
            "SELECT chat, gen, tip FROM ai_usage WHERE uid=? AND period=?",
            (uid, periodo),
        )
        if not linha:
            return {"ok": False, "motivo": "nenhum uso neste período"}
        con.execute(
            "UPDATE ai_usage SET chat=0, gen=0, tip=0 WHERE uid=? AND period=?",
            (uid, periodo),
        )
    return {
        "ok": True,
        "chat": int(linha[0] or 0),
        "gen": int(linha[1] or 0),
        "tip": int(linha[2] or 0),
    }
