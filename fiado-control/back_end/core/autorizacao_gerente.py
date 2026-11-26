"""Token curto emitido ao validar o código do gerente (cabeçalho X-Autorizacao-Gerente).

Não depende de outros módulos do app, para poder ser usado por `credito._acesso`
sem import circular. Usa uma chave derivada, de modo que este token nunca
seja aceito como Bearer de login (e vice-versa).
"""

import datetime

import jwt
from django.conf import settings

CABECALHO = 'X-Autorizacao-Gerente'
TIPO = 'autorizacao_gerente'
VALIDADE_SEGUNDOS = 120


def _chave():
    return f'{settings.SECRET_KEY}:{TIPO}'


def emitir(id_usuario):
    """Autorização válida por poucos minutos, presa ao usuário que digitou o código."""
    expira = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=VALIDADE_SEGUNDOS)
    return jwt.encode({'tipo': TIPO, 'id_usuario': id_usuario, 'exp': expira}, _chave(), algorithm='HS256')


def valido(request, id_usuario):
    """True se o cabeçalho traz uma autorização íntegra, não expirada e emitida para este usuário."""
    token = request.headers.get(CABECALHO, '')
    if not token:
        return False
    try:
        dados = jwt.decode(token, _chave(), algorithms=['HS256'], options={'require': ['exp']})
    except jwt.PyJWTError:
        return False
    return dados.get('tipo') == TIPO and dados.get('id_usuario') == id_usuario
