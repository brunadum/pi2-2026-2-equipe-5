"""RF06: crédito com identidade fornecida pelo middleware de autenticação."""

import json
from decimal import Decimal, InvalidOperation

from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .financeiro import CENTAVO, MAX_VALOR, ZERO, consultar_parcelas, identificador
from .models import Usuario
from .views import (
    APIJSONEncoder, _buscar_cliente, _cliente_nao_encontrado, _erro,
    _json, _json_invalido, _ler_json,
)


def _usuario_atual(request):
    # Atributo interno, nunca preenchido a partir do JSON ou de headers aqui.
    usuario = getattr(request, 'usuario', None)
    if not isinstance(usuario, Usuario) or identificador(usuario.pk) is None:
        return None
    with connection.cursor() as cursor:
        cursor.execute('SELECT id_usuario, perfil FROM usuario WHERE id_usuario = %s AND ativo = TRUE', [usuario.pk])
        return cursor.fetchone()


def _resumo(cliente):
    saldo = sum((p['valor_atualizado'] for p in consultar_parcelas(cliente['id_cliente'])), ZERO)
    return {
        'id_cliente': cliente['id_cliente'],
        'limite_credito': cliente['limite_credito'],
        'saldo_devedor': saldo,
        'limite_disponivel': max(ZERO, cliente['limite_credito'] - saldo),
        'credito_bloqueado': cliente['credito_bloqueado'],
    }


def _acesso(request, escrita=False):
    usuario = _usuario_atual(request)
    if usuario is None:
        resposta = _erro('nao_autenticado', 'Autenticação necessária', 401)
        resposta['WWW-Authenticate'] = 'Bearer'
        return None, resposta
    if usuario[1] not in ('gerente', 'funcionario') or escrita and usuario[1] != 'gerente':
        return None, _erro('acesso_negado', 'Seu perfil não tem permissão para esta operação', 403)
    return usuario[0], None


def _validar_limite(valor):
    if isinstance(valor, bool) or not isinstance(valor, (int, float, Decimal)):
        return None
    try:
        numero = Decimal(str(valor))
        if numero.is_finite() and ZERO <= numero <= MAX_VALOR and numero == numero.quantize(CENTAVO):
            return numero.quantize(CENTAVO)
    except InvalidOperation:
        pass
    return None


def _auditar(cursor, id_cliente, id_usuario, operacao, anterior, novo, motivo):
    cursor.execute('''
        INSERT INTO auditoria_credito
            (id_cliente, id_usuario, operacao, valores_anteriores, valores_novos, motivo)
        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s)
    ''', [id_cliente, id_usuario, operacao,
          json.dumps(anterior, cls=APIJSONEncoder), json.dumps(novo, cls=APIJSONEncoder), motivo])


def _alterar(request, id_cliente, id_usuario, campo, campo_entrada, operacao):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    valor = dados.get(campo_entrada)
    if valor is None or isinstance(valor, str) and not valor.strip():
        return _erro('campo_obrigatorio', 'Campo obrigatório ausente', 400, campos=[campo_entrada])
    if campo == 'limite_credito':
        valor = _validar_limite(valor)
        if valor is None:
            return _erro('limite_invalido', 'Limite deve ser número entre 0 e 99999999.99 com até dois decimais', 422)
    elif type(valor) is not bool:
        return _erro('campo_invalido', 'bloqueado deve ser booleano', 400)
    motivo = dados.get('motivo', '')
    if not isinstance(motivo, str) or len(motivo.strip()) > 200:
        return _erro('campo_invalido', 'Motivo deve ser texto com até 200 caracteres', 400)
    with transaction.atomic(), connection.cursor() as cursor:
        cliente = _buscar_cliente(id_cliente, bloquear=True)
        if cliente is None:
            return _cliente_nao_encontrado()
        anterior = cliente[campo]
        if anterior != valor:
            # campo é uma constante interna; entradas externas são parâmetros SQL.
            cursor.execute(f'UPDATE cliente SET {campo} = %s WHERE id_cliente = %s', [valor, id_cliente])
            _auditar(cursor, id_cliente, id_usuario, operacao, {campo: anterior}, {campo: valor}, motivo.strip())
            cliente[campo] = valor
        if campo == 'credito_bloqueado':
            return _json({'id_cliente': id_cliente, 'credito_bloqueado': valor})
        return _json(_resumo(cliente))


@csrf_exempt
def bloqueio(request, id_cliente):
    if request.method != 'PUT':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario_id, resposta = _acesso(request, escrita=True)
    if resposta is not None:
        return resposta
    id_cliente = identificador(id_cliente)
    if id_cliente is None:
        return _erro('campo_invalido', 'Identificador do cliente deve ser um inteiro positivo válido', 400)
    return _alterar(request, id_cliente, usuario_id, 'credito_bloqueado', 'bloqueado', 'bloqueio_credito')


@csrf_exempt
def limite(request, id_cliente):
    if request.method not in ('GET', 'PUT'):
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario_id, resposta = _acesso(request, escrita=request.method == 'PUT')
    if resposta is not None:
        return resposta
    id_cliente = identificador(id_cliente)
    if id_cliente is None:
        return _erro('campo_invalido', 'Identificador do cliente deve ser um inteiro positivo válido', 400)
    if request.method == 'PUT':
        return _alterar(request, id_cliente, usuario_id, 'limite_credito', 'limite_credito', 'alteracao_limite')
    with transaction.atomic():
        cliente = _buscar_cliente(id_cliente, bloquear=True)
        if cliente is None:
            return _cliente_nao_encontrado()
        return _json(_resumo(cliente))
