"""RF10/RN03/RN04: desconto de parcela com saldo e auditoria atômicos."""

from datetime import date

from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .configuracoes import auditar, politicas
from decimal import Decimal
from .credito import _acesso
from .financeiro import ZERO, consultar_parcelas, identificador, validar_valor
from .views import _buscar_cliente, _erro, _json, _json_invalido, _ler_json


@csrf_exempt
def desconto(request, id_parcela):
    if request.method != 'POST':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro
    id_parcela = identificador(id_parcela)
    if id_parcela is None:
        return _erro('campo_invalido', 'Identificador de parcela inválido', 400)
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    if 'valor_desconto' not in dados or not dados.get('motivo'):
        return _erro('campo_obrigatorio', 'Informe valor_desconto e motivo', 400)
    valor = validar_valor(dados['valor_desconto'])
    if valor is None:
        return _erro('desconto_invalido', 'Desconto deve ser positivo com até duas casas decimais', 422)
    motivo = dados['motivo']
    if not isinstance(motivo, str) or not 1 <= len(motivo.strip()) <= 200:
        return _erro('campo_invalido', 'Motivo deve conter de 1 a 200 caracteres', 400)
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute('SELECT v.id_cliente FROM pagamento p JOIN venda v ON v.id_venda=p.id_venda WHERE p.id_pagamento=%s AND v.status=\'aprovada\'', [id_parcela])
        linha = cursor.fetchone()
        if linha is None:
            return _erro('parcela_nao_encontrada', 'Parcela não encontrada', 404)
        id_cliente = linha[0]
        _buscar_cliente(id_cliente, bloquear=True)
        cursor.execute('SELECT id_pagamento FROM pagamento WHERE id_pagamento=%s FOR UPDATE', [id_parcela])
        parcela = next(p for p in consultar_parcelas(id_cliente) if p['id_parcela'] == id_parcela)
        devido = parcela['valor_atualizado']
        if valor > devido:
            return _erro('desconto_invalido', 'Desconto excede o valor devido da parcela', 422)
        concedido = parcela['valor_desconto']
        teto = (devido + concedido) * Decimal(str(politicas()['desconto_maximo_percentual'])) / 100
        if valor + concedido > teto:
            return _erro('desconto_invalido', 'Desconto excede o percentual máximo configurado', 422)
        juros = min(valor, parcela['juros'])
        multa = min(valor-juros, parcela['multa'])
        cursor.execute('INSERT INTO desconto_parcela(id_pagamento,valor_desconto,valor_juros,valor_multa,id_usuario,motivo) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id_desconto', [id_parcela, valor, juros, multa, usuario, motivo.strip()])
        id_desconto = cursor.fetchone()[0]
        restante = devido-valor
        if restante == ZERO:
            cursor.execute("UPDATE pagamento SET status='pago',data_pagamento=%s WHERE id_pagamento=%s", [date.today(), id_parcela])
        resposta = {'id_desconto': id_desconto, 'id_parcela': id_parcela, 'valor_desconto': valor,
                    'valor_devido_atualizado': restante,
                    'saldo_devedor_cliente': sum((p['valor_atualizado'] for p in consultar_parcelas(id_cliente)), ZERO)}
        auditar(cursor, usuario, 'desconto_pagamento', id_parcela, {'valor_devido': devido}, resposta, motivo.strip())
    return _json(resposta)
