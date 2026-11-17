"""RF10: configuração de cobrança persistida e auditada pelo gerente."""

import json
from decimal import Decimal, InvalidOperation

from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .credito import _acesso
from .views import APIJSONEncoder, _erro, _json, _json_invalido, _ler_json


# Valores que correspondem às regras já implementadas, sem controles fictícios.
PADROES = {
    'desconto_maximo_percentual': 100, 'limite_padrao_cliente': 0,
    'bloquear_vendas_atraso': True, 'permitir_cliente_sem_cpf': False,
    'exigir_senha_venda': False, 'permitir_venda_parcial': True,
    'operador_cadastrar_cliente': True, 'operador_registrar_pagamento': True,
    'restringir_relatorios_admin': True,
}
POLITICAS_FIXAS = {
    'bloquear_vendas_atraso': (True, 'Vendas com parcelas vencidas continuam bloqueadas conforme RN02.'),
    'permitir_cliente_sem_cpf': (False, 'CPF permanece obrigatório no cadastro conforme RF03.'),
    'exigir_senha_venda': (False, 'A aprovação por senha em vendas ainda não está disponível.'),
    'restringir_relatorios_admin': (True, 'Relatórios financeiros são exclusivos do gerente conforme RNF02.'),
}


def auditar(cursor, usuario, operacao, recurso, anterior, novo, motivo=''):
    cursor.execute('''
        INSERT INTO auditoria_financeira
            (id_usuario, operacao, id_recurso, valores_anteriores, valores_novos, motivo)
        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s)
    ''', [usuario, operacao, recurso, json.dumps(anterior, cls=APIJSONEncoder),
          json.dumps(novo, cls=APIJSONEncoder), motivo])


def _atual(cursor):
    cursor.execute('SELECT id_configuracao, taxa_juros, taxa_multa, definido_por, modo_cobranca, preferencias '
                   'FROM configuracao ORDER BY id_configuracao DESC LIMIT 1')
    linha = cursor.fetchone()
    if linha is None:
        return None
    atual = dict(zip(('id_configuracao', 'taxa_juros', 'taxa_multa', 'definido_por', 'modo_cobranca', 'preferencias'), linha))
    if isinstance(atual['preferencias'], str):
        atual['preferencias'] = json.loads(atual['preferencias'])
    return atual


def _dto(atual):
    if atual is None:
        return None
    return {**{k: v for k, v in atual.items() if k != 'preferencias'}, **PADROES, **atual['preferencias'],
            'juros_mensais_percentual': atual['taxa_juros'] * 100,
            'multa_diaria_percentual': atual['taxa_multa'] * 100}


def politicas():
    with connection.cursor() as cursor:
        atual = _atual(cursor)
    return {**PADROES, **(atual['preferencias'] if atual else {})}


def _persistir(cursor, usuario, anterior, taxas, preferencias, modo):
    if anterior and all(anterior[campo] == valor for campo, valor in taxas.items()) and anterior['preferencias'] == preferencias and anterior['modo_cobranca'] == modo:
        return _dto(anterior)
    cursor.execute('INSERT INTO configuracao (taxa_juros, taxa_multa, definido_por, modo_cobranca, preferencias) '
                   'VALUES (%s, %s, %s, %s, %s::jsonb) RETURNING id_configuracao',
                   [taxas['taxa_juros'], taxas['taxa_multa'], usuario, modo, json.dumps(preferencias, cls=APIJSONEncoder)])
    atual = {'id_configuracao': cursor.fetchone()[0], **taxas, 'definido_por': usuario,
             'modo_cobranca': modo, 'preferencias': preferencias}
    resposta = _dto(atual)
    auditar(cursor, usuario, 'configuracao_cobranca', atual['id_configuracao'], _dto(anterior) or {}, resposta)
    return resposta


def _taxa(valor):
    if isinstance(valor, bool) or not isinstance(valor, (int, float, Decimal)):
        return None
    try:
        numero = Decimal(str(valor))
        if numero.is_finite() and 0 <= numero <= 1 and numero == numero.quantize(Decimal('0.0001')):
            return numero
    except InvalidOperation:
        pass
    return None


@csrf_exempt
def cobranca(request):
    if request.method not in ('GET', 'PUT'):
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro
    if request.method == 'GET':
        with connection.cursor() as cursor:
            atual = _atual(cursor)
        return _json(_dto(atual)) if atual else _erro('configuracao_nao_encontrada', 'Configuração de cobrança ainda não cadastrada', 404)
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    faltando = [campo for campo in ('taxa_juros', 'taxa_multa') if campo not in dados]
    if faltando:
        return _erro('campo_obrigatorio', 'Informe as duas taxas de cobrança', 400, campos=faltando)
    taxas = {campo: _taxa(dados[campo]) for campo in ('taxa_juros', 'taxa_multa')}
    if any(valor is None for valor in taxas.values()):
        return _erro('taxa_invalida', 'Taxas devem ser números de 0 a 1, com até quatro casas decimais', 422)
    with transaction.atomic(), connection.cursor() as cursor:
        # Serializa inclusive a primeira configuração, quando ainda não há linha para bloquear.
        cursor.execute('SELECT pg_advisory_xact_lock(2026111601)')
        anterior = _atual(cursor)
        atual = _persistir(cursor, usuario, anterior, taxas, anterior['preferencias'] if anterior else {},
                           anterior['modo_cobranca'] if anterior else 'unica')
    return _json(atual)


def _numero(valor, maximo):
    if isinstance(valor, bool) or not isinstance(valor, (int, float, Decimal)):
        return None
    try:
        numero = Decimal(str(valor))
        if numero.is_finite() and 0 <= numero <= maximo and numero == numero.quantize(Decimal('0.01')):
            return numero
    except InvalidOperation:
        pass
    return None


@csrf_exempt
def sistema(request):
    if request.method == 'GET':
        return cobranca(request)
    if request.method != 'PUT':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    campos = ('juros_mensais_percentual', 'multa_diaria_percentual', *PADROES)
    # Um GET devolve os dois formatos. Havendo campos da tela, eles prevalecem;
    # caso contrário um GET -> edição -> PUT perderia as políticas em silêncio.
    if ('taxa_juros' in dados or 'taxa_multa' in dados) and not any(campo in dados for campo in campos):
        return cobranca(request)
    faltando = [campo for campo in campos if campo not in dados]
    if faltando:
        return _erro('campo_obrigatorio', 'Campos de configuração ausentes', 400, campos=faltando)
    numeros = {}
    for campo in ('juros_mensais_percentual', 'multa_diaria_percentual', 'desconto_maximo_percentual', 'limite_padrao_cliente'):
        valor = _numero(dados[campo], Decimal('99999999.99') if campo == 'limite_padrao_cliente' else 100)
        if valor is None:
            return _erro('configuracao_invalida', f'Confira {campo}: número não negativo com até duas casas decimais', 422, campos=[campo])
        numeros[campo] = valor
    preferencias = {campo: dados[campo] for campo in PADROES}
    preferencias.update({campo: numeros[campo] for campo in ('desconto_maximo_percentual', 'limite_padrao_cliente')})
    for campo, padrao in PADROES.items():
        if isinstance(padrao, bool) and type(dados[campo]) is not bool:
            return _erro('configuracao_invalida', f'{campo} deve ser booleano', 422, campos=[campo])
    for campo, (valor, mensagem) in POLITICAS_FIXAS.items():
        if dados[campo] != valor:
            return _erro('politica_nao_disponivel', mensagem, 422, campos=[campo])
    taxas = {'taxa_juros': numeros['juros_mensais_percentual']/100, 'taxa_multa': numeros['multa_diaria_percentual']/100}
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(2026111601)')
        atual = _persistir(cursor, usuario, _atual(cursor), taxas, preferencias, 'mensal_diaria')
    return _json(atual)
