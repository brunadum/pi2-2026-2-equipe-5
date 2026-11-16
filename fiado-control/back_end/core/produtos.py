"""Catálogo compartilhado utilizado pela seleção de itens da venda."""

from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .credito import _acesso
from .financeiro import identificador, validar_valor
from .views import _erro, _json, _json_invalido, _ler_json


def _consultar(cursor, id_produto=None):
    sql = 'SELECT id, nome, preco_venda AS preco, quantidade_estoque FROM produto WHERE ativo=TRUE'
    cursor.execute(sql + (' AND id=%s' if id_produto else '') + ' ORDER BY nome, id', [id_produto] if id_produto else [])
    return [dict(zip(('id', 'nome', 'preco', 'quantidade_estoque'), linha)) for linha in cursor.fetchall()]


@csrf_exempt
def produtos(request, id_produto=None):
    metodos = ('PUT',) if id_produto is not None else ('GET', 'POST')
    if request.method not in metodos:
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    _, erro = _acesso(request, escrita=request.method == 'PUT')
    if erro is not None:
        return erro
    if request.method == 'GET':
        with connection.cursor() as cursor:
            return _json(_consultar(cursor))
    if id_produto is not None:
        id_produto = identificador(id_produto)
        if id_produto is None:
            return _erro('campo_invalido', 'Identificador de produto inválido', 400)
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    nome = dados.get('nome')
    if not isinstance(nome, str) or not 1 <= len(nome.strip()) <= 150:
        return _erro('campo_invalido', 'Nome deve conter de 1 a 150 caracteres', 400)
    preco = validar_valor(dados.get('preco'))
    if preco is None:
        return _erro('valor_invalido', 'Preço deve ser positivo com até duas casas decimais', 422)
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(2026111602)')
        cursor.execute('SELECT id FROM produto WHERE ativo=TRUE AND LOWER(BTRIM(nome))=LOWER(%s) AND (%s::integer IS NULL OR id<>%s)', [nome.strip(), id_produto, id_produto])
        if cursor.fetchone():
            return _erro('produto_duplicado', 'Já existe um produto com esse nome', 409)
        if id_produto is None:
            cursor.execute('INSERT INTO produto(nome,preco_venda) VALUES (%s,%s) RETURNING id', [nome.strip(), preco])
            id_produto = cursor.fetchone()[0]
            status = 201
        else:
            cursor.execute('UPDATE produto SET nome=%s, preco_venda=%s WHERE id=%s AND ativo=TRUE RETURNING id', [nome.strip(), preco, id_produto])
            if cursor.fetchone() is None:
                return _erro('produto_nao_encontrado', 'Produto não encontrado', 404)
            status = 200
        return _json(_consultar(cursor, id_produto)[0], status=status)
