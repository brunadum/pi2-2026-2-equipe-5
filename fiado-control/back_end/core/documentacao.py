from django.shortcuts import render

from .openapi import SCHEMA
from .views import _erro, _json


def openapi(request):
    if request.method != 'GET':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    return _json(SCHEMA)


def swagger(request):
    if request.method != 'GET':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    return render(request, 'core/swagger.html')
