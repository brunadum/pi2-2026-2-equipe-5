"""Código de 6 dígitos do gerente, que libera operações restritas (cadastro de usuário e,
para funcionários, cancelar venda, estornar pagamento e alterar limite).

O código só existe como hash. Erros repetidos bloqueiam novas tentativas no servidor,
independentemente da trava que a tela também aplica.
"""

import re
from math import ceil

from django.contrib.auth.hashers import check_password, make_password
from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from . import autorizacao_gerente
from .configuracoes import auditar
from .credito import _acesso
from .views import _erro, _json, _json_invalido, _ler_json

FORMATO = re.compile(r'^\d{6}$')
MAX_FALHAS = 5
BLOQUEIO_SEGUNDOS = 60
TRAVA_ALTERACAO = 2026112301  # serializa a primeira definição, quando ainda não há linha para bloquear


def _estado(cursor, bloquear=False):
    cursor.execute(
        'SELECT codigo_hash, tentativas_falhas, '
        'GREATEST(0, CEIL(EXTRACT(EPOCH FROM (bloqueado_ate - NOW())))) '
        'FROM codigo_gerente WHERE id = 1' + (' FOR UPDATE' if bloquear else ''))
    linha = cursor.fetchone()
    if linha is None:
        return None
    return {'hash': linha[0], 'falhas': linha[1], 'espera': int(linha[2] or 0)}


def _bloqueado(espera):
    resposta = _erro('codigo_gerente_bloqueado',
                     f'Muitas tentativas. Aguarde {espera} segundo{"s" if espera > 1 else ""} para tentar de novo.', 429)
    resposta['Retry-After'] = str(espera)
    return resposta


def _registrar_falha(cursor, estado):
    """Conta o erro; ao atingir o limite, bloqueia por um tempo e zera o contador."""
    if estado['falhas'] + 1 >= MAX_FALHAS:
        cursor.execute("UPDATE codigo_gerente SET tentativas_falhas = 0, "
                       "bloqueado_ate = NOW() + make_interval(secs => %s) WHERE id = 1", [BLOQUEIO_SEGUNDOS])
    else:
        cursor.execute('UPDATE codigo_gerente SET tentativas_falhas = tentativas_falhas + 1 WHERE id = 1')


def _zerar_falhas(cursor):
    cursor.execute('UPDATE codigo_gerente SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = 1')


def _texto_codigo(valor):
    return valor if isinstance(valor, str) and FORMATO.match(valor) else None


@csrf_exempt
def codigo(request):
    """GET: informa se há código definido. PUT: define ou troca (somente gerente)."""
    if request.method not in ('GET', 'PUT'):
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario, erro = _acesso(request, escrita=request.method == 'PUT')
    if erro is not None:
        return erro

    if request.method == 'GET':
        with connection.cursor() as cursor:
            return _json({'definido': _estado(cursor) is not None})

    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    if 'codigo_novo' not in dados:
        return _erro('campo_obrigatorio', 'Informe o novo código', 400, campos=['codigo_novo'])
    novo = _texto_codigo(dados['codigo_novo'])
    if novo is None:
        return _erro('codigo_invalido', 'O código deve ter exatamente 6 números', 400, campos=['codigo_novo'])
    atual_informado = dados.get('codigo_atual')

    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [TRAVA_ALTERACAO])
        estado = _estado(cursor, bloquear=True)
        if estado is not None:
            if estado['espera'] > 0:
                return _bloqueado(estado['espera'])
            if atual_informado in (None, ''):
                return _erro('codigo_atual_obrigatorio', 'Informe o código atual para trocá-lo', 422, campos=['codigo_atual'])
            if _texto_codigo(atual_informado) is None or not check_password(atual_informado, estado['hash']):
                _registrar_falha(cursor, estado)  # a falha é gravada: não há exceção, o commit acontece
                return _erro('codigo_atual_invalido', 'O código atual não confere', 422, campos=['codigo_atual'])
        cursor.execute(
            'INSERT INTO codigo_gerente (id, codigo_hash, definido_por) VALUES (1, %s, %s) '
            'ON CONFLICT (id) DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash, '
            'definido_por = EXCLUDED.definido_por, atualizado_em = NOW(), tentativas_falhas = 0, bloqueado_ate = NULL',
            [make_password(novo), usuario])
        # O código nunca entra na auditoria, nem em hash.
        auditar(cursor, usuario, 'codigo_gerente', 1, {'definido': estado is not None}, {'definido': True},
                'Código do gerente alterado' if estado is not None else 'Código do gerente definido')
    return _json({'definido': True})


@csrf_exempt
def autorizar(request):
    """Valida o código e devolve uma autorização de curta duração. Gerente e funcionário podem usar."""
    if request.method != 'POST':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    usuario, erro = _acesso(request)
    if erro is not None:
        return erro
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    if 'codigo' not in dados:
        return _erro('campo_obrigatorio', 'Informe o código do gerente', 400, campos=['codigo'])
    informado = dados['codigo']

    with transaction.atomic(), connection.cursor() as cursor:
        estado = _estado(cursor, bloquear=True)
        if estado is None:
            return _erro('codigo_gerente_nao_definido', 'Nenhum código de gerente foi definido ainda', 409)
        if estado['espera'] > 0:
            return _bloqueado(estado['espera'])
        if _texto_codigo(informado) is None or not check_password(informado, estado['hash']):
            _registrar_falha(cursor, estado)
            return _erro('codigo_gerente_invalido', 'Código inválido. Verifique o código e tente novamente.', 422)
        _zerar_falhas(cursor)
        auditar(cursor, usuario, 'autorizacao_gerente', 1, {}, {'validade_segundos': autorizacao_gerente.VALIDADE_SEGUNDOS},
                'Código do gerente usado para autorizar operação')
    return _json({'autorizado': True, 'token_autorizacao': autorizacao_gerente.emitir(usuario),
                  'expira_em_segundos': autorizacao_gerente.VALIDADE_SEGUNDOS})
