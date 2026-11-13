"""Compras — conversa com o RevenueCat.

Divisão de papéis:

- O RevenueCat é o CAIXA: ele confere o recibo com o Google e diz o que cada
  conta comprou.
- O SALDO (quantos roteiros, conversas e dicas restam) mora no nosso banco, em
  `ai_grants`. Nada daqui decide consumo.

O app NUNCA é a fonte da verdade: ele só avisa "houve uma compra". Quem lista
as compras é o servidor, perguntando direto ao RevenueCat com a chave secreta.
"""
import hmac
from urllib.parse import quote

URL_ASSINANTE = "https://api.revenuecat.com/v1/subscribers/"


async def compras_de(uid, api_key):
    """Compras avulsas (não-assinatura) da conta, da mais antiga à mais nova.

    Devolve [{produto, txn, store_txn, sandbox, quando}] ou None quando não deu
    para conferir (sem chave, rede, resposta estranha). None NUNCA vira saldo.
    """
    if not api_key or not uid:
        return None
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.get(URL_ASSINANTE + quote(str(uid), safe=""),
                              headers={"Authorization": f"Bearer {api_key}"})
        if r.status_code not in (200, 201):
            return None
        avulsas = (r.json().get("subscriber") or {}).get("non_subscriptions") or {}
    except Exception:
        return None

    compras = []
    for produto, itens in avulsas.items():
        for item in itens or []:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            compras.append({
                "produto": str(produto),
                "txn": str(item["id"]),
                "store_txn": str(item.get("store_transaction_id") or "") or None,
                "sandbox": bool(item.get("is_sandbox")),
                "quando": str(item.get("purchase_date") or ""),
            })
    compras.sort(key=lambda c: c["quando"])
    return compras


def webhook_ok(cabecalho, segredo):
    """O RevenueCat manda no Authorization o valor que configuramos no painel
    dele. Sem segredo configurado, nenhum aviso é aceito.

    Tolera espaço nas pontas e o prefixo "Bearer " — enganos comuns ao colar o
    valor no painel — sem afrouxar a comparação do segredo em si."""
    segredo = _sem_bearer(segredo)
    if not segredo:
        return False
    return hmac.compare_digest(_sem_bearer(cabecalho).encode(), segredo.encode())


def _sem_bearer(valor):
    valor = str(valor or "").strip()
    if valor[:7].lower() == "bearer ":
        valor = valor[7:].strip()
    return valor
