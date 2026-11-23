"""RF11: consulta do histórico de auditoria (somente gerente).

Reúne `auditoria_financeira` (cancelamentos, estornos, descontos, cobrança, usuários,
código do gerente) e `auditoria_credito` (limite e bloqueio de crédito) numa lista única,
do registro mais recente para o mais antigo.
"""

import json

from django.db import connection
from django.views.decorators.csrf import csrf_exempt

from .credito import _acesso
from .financeiro import identificador
from .validacoes import data_iso
from .views import _erro, _json

LIMITE_PADRAO = 200
LIMITE_MAXIMO = 500

CONSULTA = """
SELECT id_auditoria, data_hora, id_usuario, nome_usuario, operacao, id_recurso,
       valores_anteriores, valores_novos, motivo
FROM (
    SELECT 'f' || a.id_auditoria AS id_auditoria, a.data_hora, a.id_usuario, u.nome AS nome_usuario,
           a.operacao, a.id_recurso, a.valores_anteriores, a.valores_novos, a.motivo
    FROM auditoria_financeira a JOIN usuario u ON u.id_usuario = a.id_usuario
    UNION ALL
    SELECT 'c' || c.id_auditoria, c.data_hora, c.id_usuario, u.nome,
           c.operacao, c.id_cliente, c.valores_anteriores, c.valores_novos, c.motivo
    FROM auditoria_credito c JOIN usuario u ON u.id_usuario = c.id_usuario
) registros
WHERE {filtros}
ORDER BY data_hora DESC, id_auditoria DESC
LIMIT %s
"""
COLUNAS = ('id_auditoria', 'data_hora', 'id_usuario', 'nome_usuario', 'operacao', 'id_recurso',
           'valores_anteriores', 'valores_novos', 'motivo')


def _filtros(request):
    """Devolve (condições SQL, parâmetros, limite) ou (None, None, resposta de erro)."""
    condicoes, parametros = ['TRUE'], []
    operacao = request.GET.get('operacao', '').strip()
    if operacao:
        condicoes.append('operacao = %s')
        parametros.append(operacao)
    if request.GET.get('id_usuario', '').strip():
        id_usuario = identificador(request.GET['id_usuario'].strip())
        if id_usuario is None:
            return None, None, _erro('campo_invalido', 'id_usuario deve ser um inteiro positivo válido', 400)
        condicoes.append('id_usuario = %s')
        parametros.append(id_usuario)
    datas = {}
    for campo, comparador in (('data_inicio', '>='), ('data_fim', '<=')):
        valor = request.GET.get(campo, '').strip()
        if not valor:
            continue
        try:
            datas[campo] = data_iso(valor)
        except ValueError:
            return None, None, _erro('campo_invalido', f'{campo} deve estar no formato AAAA-MM-DD', 400)
        condicoes.append(f'data_hora::date {comparador} %s')
        parametros.append(datas[campo])
    if len(datas) == 2 and datas['data_inicio'] > datas['data_fim']:
        return None, None, _erro('campo_invalido', 'data_inicio não pode ser posterior a data_fim', 400)
    limite = LIMITE_PADRAO
    if request.GET.get('limite', '').strip():
        limite = identificador(request.GET['limite'].strip())
        if limite is None or limite > LIMITE_MAXIMO:
            return None, None, _erro('campo_invalido', f'limite deve ser inteiro de 1 a {LIMITE_MAXIMO}', 400)
    return ' AND '.join(condicoes), parametros + [limite], limite


@csrf_exempt
def listar(request):
    if request.method != 'GET':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    _, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro
    filtros, parametros, resposta = _filtros(request)
    if filtros is None:
        return resposta
    with connection.cursor() as cursor:
        cursor.execute(CONSULTA.format(filtros=filtros), parametros)
        registros = [dict(zip(COLUNAS, linha)) for linha in cursor.fetchall()]
    for registro in registros:
        registro['data_hora'] = registro['data_hora'].isoformat()
        for campo in ('valores_anteriores', 'valores_novos'):
            if isinstance(registro[campo], str):  # o cursor devolve jsonb como texto
                registro[campo] = json.loads(registro[campo])
    return _json(registros)
