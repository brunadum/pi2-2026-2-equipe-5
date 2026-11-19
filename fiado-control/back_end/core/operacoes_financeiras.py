"""RF13/RF14: cancelamento de venda e estorno de pagamento com auditoria atômica."""

from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .configuracoes import auditar
from .credito import _acesso
from .financeiro import ZERO, consultar_parcelas, identificador
from .views import _buscar_cliente, _erro, _json, _json_invalido, _ler_json


def _validar_motivo(dados):
    if "motivo" not in dados or dados["motivo"] is None:
        return None, _erro("campo_obrigatorio", "Informe o motivo da operação", 400, campos=["motivo"])
    motivo = dados["motivo"]
    if not isinstance(motivo, str) or not 1 <= len(motivo.strip()) <= 200:
        return None, _erro("campo_invalido", "Motivo deve conter entre 1 e 200 caracteres", 400)
    return motivo.strip(), None


@csrf_exempt
def cancelar_venda(request, id_venda):
    if request.method != "POST":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)

    usuario, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro

    id_venda = identificador(id_venda)
    if id_venda is None:
        return _erro("campo_invalido", "Identificador de venda inválido", 400)

    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    motivo, erro_motivo = _validar_motivo(dados)
    if erro_motivo is not None:
        return erro_motivo

    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "SELECT id_cliente, valor_total, status FROM venda WHERE id_venda = %s",
            [id_venda],
        )
        linha = cursor.fetchone()
        if linha is None:
            return _erro("venda_nao_encontrada", "Venda não encontrada", 404)

        id_cliente = linha[0]
        # mesma ordem de bloqueio do sistema: cliente, depois venda/parcelas
        _buscar_cliente(id_cliente, bloquear=True)

        cursor.execute(
            "SELECT valor_total, status FROM venda WHERE id_venda = %s FOR UPDATE",
            [id_venda],
        )
        valor_total, status_atual = cursor.fetchone()

        if status_atual == "cancelada":
            return _erro("venda_ja_cancelada", "Esta venda já foi cancelada", 422)
        if status_atual != "aprovada":
            return _erro("venda_nao_cancelavel", "Apenas vendas aprovadas podem ser canceladas", 422)

        cursor.execute(
            """
            SELECT COALESCE(SUM(r.valor_recebido), 0)
            FROM recebimento r
            INNER JOIN pagamento p ON p.id_pagamento = r.id_pagamento
            WHERE p.id_venda = %s
            """,
            [id_venda],
        )
        total_recebido = cursor.fetchone()[0]
        if total_recebido > ZERO:
            return _erro(
                "venda_possui_pagamentos",
                "Não é possível cancelar venda com pagamentos registrados; estorne os pagamentos antes",
                422,
            )

        cursor.execute(
            "UPDATE venda SET status = 'cancelada', motivo_rejeicao = %s WHERE id_venda = %s",
            [motivo[:100], id_venda],
        )

        saldo_cliente = round(sum((p["valor_atualizado"] for p in consultar_parcelas(id_cliente)), ZERO), 2)
        resposta = {
            "id_venda": id_venda,
            "id_cliente": id_cliente,
            "status": "cancelada",
            "valor_estornado": valor_total,
            "saldo_devedor_cliente": saldo_cliente,
            "motivo": motivo,
        }
        auditar(
            cursor,
            usuario,
            "cancelamento_venda",
            id_venda,
            {"status": status_atual, "valor_total": valor_total},
            resposta,
            motivo,
        )

    return _json(resposta, status=200)


@csrf_exempt
def estornar_pagamento(request, id_pagamento):
    if request.method != "POST":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)

    usuario, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro

    id_pagamento = identificador(id_pagamento)
    if id_pagamento is None:
        return _erro("campo_invalido", "Identificador de pagamento inválido", 400)

    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    motivo, erro_motivo = _validar_motivo(dados)
    if erro_motivo is not None:
        return erro_motivo

    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT v.id_cliente, r.id_pagamento
            FROM recebimento r
            INNER JOIN pagamento p ON p.id_pagamento = r.id_pagamento
            INNER JOIN venda v ON v.id_venda = p.id_venda
            WHERE r.id_recebimento = %s
            """,
            [id_pagamento],
        )
        linha = cursor.fetchone()
        if linha is None:
            return _erro("pagamento_nao_encontrado", "Pagamento não encontrado", 404)

        id_cliente, id_parcela = linha
        _buscar_cliente(id_cliente, bloquear=True)

        cursor.execute(
            """
            SELECT r.valor_recebido, r.data_pagamento, p.status
            FROM recebimento r
            INNER JOIN pagamento p ON p.id_pagamento = r.id_pagamento
            WHERE r.id_recebimento = %s
            FOR UPDATE OF r, p
            """,
            [id_pagamento],
        )
        registro = cursor.fetchone()
        if registro is None:
            return _erro("pagamento_nao_encontrado", "Pagamento não encontrado", 404)

        valor_recebido, data_pag, status_parcela_anterior = registro

        cursor.execute("DELETE FROM recebimento WHERE id_recebimento = %s", [id_pagamento])

        # Reabre a parcela se ela havia sido marcada como paga
        cursor.execute(
            """
            UPDATE pagamento
            SET status = CASE WHEN data_vencimento < CURRENT_DATE THEN 'atrasado' ELSE 'pendente' END,
                data_pagamento = NULL
            WHERE id_pagamento = %s
            RETURNING status
            """,
            [id_parcela],
        )
        novo_status_parcela = cursor.fetchone()[0]

        parcela_atualizada = next(
            p for p in consultar_parcelas(id_cliente) if p["id_parcela"] == id_parcela
        )
        saldo_cliente = round(sum((p["valor_atualizado"] for p in consultar_parcelas(id_cliente)), ZERO), 2)

        resposta = {
            "id_pagamento": id_pagamento,
            "id_parcela": id_parcela,
            "valor_estornado": valor_recebido,
            "status_parcela": novo_status_parcela,
            "saldo_parcela": parcela_atualizada["valor_atualizado"],
            "saldo_devedor_cliente": saldo_cliente,
            "motivo": motivo,
        }
        auditar(
            cursor,
            usuario,
            "estorno_pagamento",
            id_pagamento,
            {
                "id_parcela": id_parcela,
                "valor_recebido": valor_recebido,
                "data_pagamento": data_pag.isoformat() if data_pag else None,
                "status_parcela": status_parcela_anterior,
            },
            resposta,
            motivo,
        )

    return _json(resposta, status=200)