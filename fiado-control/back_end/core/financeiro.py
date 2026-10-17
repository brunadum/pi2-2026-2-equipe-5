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
    with connection.cursor() as cursor:
        cursor.execute('SELECT taxa_juros, taxa_multa FROM configuracao ORDER BY id_configuracao DESC LIMIT 1')
        juros, multa = cursor.fetchone() or (ZERO, ZERO)
        cursor.execute("""
            SELECT p.id_pagamento, p.id_venda, v.id_cliente, c.nome,
                   p.valor_parcela, p.data_vencimento, p.status,
                   ROW_NUMBER() OVER (PARTITION BY p.id_venda ORDER BY p.data_vencimento, p.id_pagamento),
                   COALESCE(r.recebido, 0), COALESCE(r.principal, 0),
                   COALESCE(r.principal_ate_vencimento, 0),
                   COALESCE(r.juros, 0), COALESCE(r.multa, 0)
            FROM pagamento p
            JOIN venda v ON v.id_venda = p.id_venda
            JOIN cliente c ON c.id_cliente = v.id_cliente
            LEFT JOIN (
                SELECT r.id_pagamento, SUM(r.valor_recebido) AS recebido,
                       SUM(r.valor_recebido - r.valor_juros - r.valor_multa) AS principal,
                       SUM(r.valor_recebido - r.valor_juros - r.valor_multa)
                           FILTER (WHERE r.data_pagamento <= p.data_vencimento) AS principal_ate_vencimento,
                       SUM(r.valor_juros) AS juros, SUM(r.valor_multa) AS multa
                FROM recebimento r JOIN pagamento p ON p.id_pagamento = r.id_pagamento
                GROUP BY r.id_pagamento
            ) r ON r.id_pagamento = p.id_pagamento
            WHERE v.status = 'aprovada' AND (%s::integer IS NULL OR v.id_cliente = %s)
            ORDER BY p.data_vencimento, p.id_pagamento
        """, [id_cliente, id_cliente])
        registros = cursor.fetchall()

    hoje = date.today()
    parcelas = []
    for pid, vid, cid, nome, valor, vencimento, estado, numero, recebido, principal, antecipado, juros_pagos, multa_paga in registros:
        saldo = max(ZERO, valor - principal)
        atrasada = vencimento < hoje
        base_encargos = max(ZERO, valor - antecipado)
        juros_abertos = max(ZERO, dinheiro(base_encargos * juros) - juros_pagos) if atrasada else ZERO
        multa_aberta = max(ZERO, dinheiro(base_encargos * multa) - multa_paga) if atrasada else ZERO
        if estado == 'pago':
            # O seed possui parcelas quitadas anteriores à tabela de recebimentos.
            saldo = juros_abertos = multa_aberta = ZERO
            recebido = recebido or valor
        atualizado = saldo + juros_abertos + multa_aberta
        status = ('pago' if atualizado == ZERO else 'atrasado' if atrasada
                  else 'parcial' if recebido > ZERO else 'pendente')
        parcelas.append({
            'id_parcela': pid, 'id_venda': vid, 'id_cliente': cid, 'nome': nome,
            'numero': numero, 'valor_parcela': valor, 'valor_pago': recebido,
            'saldo_parcela': saldo, 'data_vencimento': vencimento.isoformat(),
            'status': status, 'dias_atraso': (hoje - vencimento).days if atrasada and status != 'pago' else 0,
            'juros': juros_abertos, 'multa': multa_aberta, 'valor_atualizado': atualizado,
        })
    return parcelas
