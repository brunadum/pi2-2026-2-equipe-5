"""Cálculo único de principal e encargos para parcelas, saldo e dashboard."""

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import connection

CENTAVO = Decimal('0.01')
ZERO = Decimal('0.00')
MAX_VALOR = Decimal('99999999.99')


def dinheiro(valor):
    return Decimal(valor).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def validar_valor(valor):
    """O contrato aceita número JSON positivo, finito, com até dois decimais."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float, Decimal)):
        return None
    try:
        numero = Decimal(str(valor))
        if not numero.is_finite() or not ZERO < numero <= MAX_VALOR:
            return None
        return dinheiro(numero) if numero == dinheiro(numero) else None
    except (InvalidOperation, ValueError):
        return None


def identificador(valor):
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int) and 0 < valor <= 2147483647:
        return valor
    if isinstance(valor, str) and valor.isascii() and valor.isdigit() and len(valor) <= 10:
        numero = int(valor)
        if 0 < numero <= 2147483647:
            return numero
    return None


def consultar_parcelas(id_cliente=None):
    hoje = date.today()
    with connection.cursor() as cursor:
        cursor.execute('SELECT taxa_juros, taxa_multa, modo_cobranca FROM configuracao ORDER BY id_configuracao DESC LIMIT 1')
        juros, multa, modo = cursor.fetchone() or (ZERO, ZERO, 'unica')
        cursor.execute("""
            SELECT p.id_pagamento, p.id_venda, v.id_cliente, c.nome,
                   p.valor_parcela, p.data_vencimento, p.status,
                   ROW_NUMBER() OVER (PARTITION BY p.id_venda ORDER BY p.data_vencimento, p.id_pagamento),
                   COALESCE(r.recebido, 0), COALESCE(r.principal, 0),
                   COALESCE(r.principal_ate_vencimento, 0),
                   COALESCE(r.juros, 0), COALESCE(r.multa, 0), COALESCE(r.liquidado, 0),
                   COALESCE(r.desconto, 0), COALESCE(r.principal_dias, 0)
            FROM pagamento p
            JOIN venda v ON v.id_venda = p.id_venda
            JOIN cliente c ON c.id_cliente = v.id_cliente
            LEFT JOIN (
                SELECT r.id_pagamento, COALESCE(SUM(r.valor_recebido) FILTER (WHERE NOT r.e_desconto), 0) AS recebido,
                       SUM(r.valor_recebido) AS liquidado,
                       COALESCE(SUM(r.valor_recebido) FILTER (WHERE r.e_desconto), 0) AS desconto,
                       SUM(r.valor_recebido - r.valor_juros - r.valor_multa) AS principal,
                       SUM(r.valor_recebido - r.valor_juros - r.valor_multa)
                           FILTER (WHERE r.data_pagamento <= p.data_vencimento) AS principal_ate_vencimento,
                       SUM(r.valor_juros) AS juros, SUM(r.valor_multa) AS multa,
                       SUM((r.valor_recebido-r.valor_juros-r.valor_multa) *
                           GREATEST(%s::date-GREATEST(p.data_vencimento,r.data_pagamento),0)) AS principal_dias
                FROM (
                    SELECT id_pagamento, valor_recebido, valor_juros, valor_multa, data_pagamento, FALSE AS e_desconto FROM recebimento
                    UNION ALL
                    SELECT id_pagamento, valor_desconto, valor_juros, valor_multa, data_desconto, TRUE FROM desconto_parcela
                ) r JOIN pagamento p ON p.id_pagamento = r.id_pagamento
                GROUP BY r.id_pagamento
            ) r ON r.id_pagamento = p.id_pagamento
            WHERE v.status = 'aprovada' AND (%s::integer IS NULL OR v.id_cliente = %s)
            ORDER BY p.data_vencimento, p.id_pagamento
        """, [hoje, id_cliente, id_cliente])
        registros = cursor.fetchall()

    parcelas = []
    for pid, vid, cid, nome, valor, vencimento, estado, numero, recebido, principal, antecipado, juros_pagos, multa_paga, liquidado, desconto, principal_dias in registros:
        saldo = max(ZERO, valor - principal)
        atrasada = vencimento < hoje
        base_encargos = max(ZERO, valor - antecipado)
        if modo == 'mensal_diaria':
            # Juros simples: mês de 30 dias. Principal amortizado deixa de gerar
            # encargos a partir da data de cada pagamento/desconto.
            exposicao = max(ZERO, valor * max(0, (hoje-vencimento).days) - principal_dias)
            juros_totais = dinheiro(exposicao * juros / 30)
            multa_total = dinheiro(exposicao * multa)
        else:
            juros_totais = dinheiro(base_encargos * juros)
            multa_total = dinheiro(base_encargos * multa)
        juros_abertos = max(ZERO, juros_totais - juros_pagos) if atrasada else ZERO
        multa_aberta = max(ZERO, multa_total - multa_paga) if atrasada else ZERO
        if estado == 'pago':
            # O seed possui parcelas quitadas anteriores à tabela de recebimentos.
            saldo = juros_abertos = multa_aberta = ZERO
            recebido = recebido or (valor if not liquidado else ZERO)
        atualizado = saldo + juros_abertos + multa_aberta
        status = ('pago' if atualizado == ZERO else 'atrasado' if atrasada
                  else 'parcial' if liquidado > ZERO else 'pendente')
        parcelas.append({
            'id_parcela': pid, 'id_venda': vid, 'id_cliente': cid, 'nome': nome,
            'numero': numero, 'valor_parcela': valor, 'valor_pago': recebido, 'valor_desconto': desconto,
            'saldo_parcela': saldo, 'data_vencimento': vencimento.isoformat(),
            'status': status, 'dias_atraso': (hoje - vencimento).days if atrasada and status != 'pago' else 0,
            'juros': juros_abertos, 'multa': multa_aberta, 'valor_atualizado': atualizado,
        })
    return parcelas
