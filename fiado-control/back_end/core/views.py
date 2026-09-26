import _json
from django.http import response
from django.contrib.auth import decorators
from django.contrib.auth import decorators
import json
import itertools
from datetime import date

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .dados_fixos import CLIENTES

CAMPOS_OBRIGATORIOS = ("nome", "cpf", "telefone", "limite_credito")


def _json(dados, status=200):
    return JsonResponse(
        dados,
        status=status,
        safe=False,
        json_dumps_params={"ensure_ascii": False},
    )


def _erro(codigo, mensagem, status):
    return _json({"erro": codigo, "mensagem": mensagem}, status=status)


def _apenas_digitos(texto):
    return "".join(c for c in texto if c.isdigit())


def _filtrar_clientes(nome, cpf, telefone):
    resultado = CLIENTES

    if nome:
        resultado = [c for c in resultado if nome.lower() in c["nome"].lower()]

    if cpf:
        cpf = _apenas_digitos(cpf)
        resultado = [c for c in resultado if cpf in c["cpf"]]

    if telefone:
        telefone = _apenas_digitos(telefone)
        resultado = [
            c for c in resultado if any(telefone in t for t in c["telefone"])
        ]

    return resultado


def _cadastrar_cliente(request):
    try:
        dados = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        dados = None

    if not isinstance(dados, dict):
        return _erro("json_invalido", "O corpo da requisição não é um JSON válido", 400)

    for campo in CAMPOS_OBRIGATORIOS:
        if dados.get(campo) in (None, "", []):
            return _erro("campo_obrigatorio", f"Campo obrigatório ausente: {campo}", 400)

    cpf = _apenas_digitos(str(dados["cpf"]))
    if any(c["cpf"] == cpf for c in CLIENTES):
        return _erro("cpf_invalido", "CPF já cadastrado para outro cliente", 422)

    # Dados fixos: o cliente não é gravado, só devolvemos o que seria criado.
    novo = {
        "id_cliente": max(c["id_cliente"] for c in CLIENTES) + 1,
        "nome": dados["nome"],
        "cpf": cpf,
        "telefone": dados["telefone"],
        "limite_credito": dados["limite_credito"],
        "ativo": True,
    }
    return _json(novo, status=201)


@csrf_exempt
def clientes(request):
    if request.method == "GET":
        lista = _filtrar_clientes(
            request.GET.get("nome", "").strip(),
            request.GET.get("cpf", "").strip(),
            request.GET.get("telefone", "").strip(),
        )
        return _json(lista)

    if request.method == "POST":
        return _cadastrar_cliente(request)

    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)


CAMPOS_OBRIGATORIOS_VENDA = ("id_cliente", "modalidade", "valor_total", "parcelas")
_contador_vendas = itertools.count(5)

def _registrar_venda(request):
    try:
        dados = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        dados = None
    
    if not isinstance(dados, dict):
        return _erro("json_invalido", "O corpo da requisição não é um JSON válido", 400)
    
    for campo in CAMPOS_OBRIGATORIOS_VENDA:
        if dados.get(campo) in (None, "", []):
            return _erro("campo_obrigatorio", f"Campo obrigatório ausente: {campo}", 400)

    if not isinstance(dados["parcelas"], list):
        return _erro("campo_obrigatorio", "Campo parcelas deve ser uma lista", 400)

    for parcela in dados["parcelas"]:
        if not isinstance(parcela, dict) or parcela.get("valor_parcela") in (None, 0,"") or not parcela.get("data_vencimento"):
            return _erro("campo_obrigatorio", "Cada parcela deve ter um valor", 400)    

    vendas = {
        "id_venda": next(_contador_vendas),
        "id_cliente": dados["id_cliente"],
        "modalidade": dados["modalidade"],
        "data_venda": date.today().isoformat(),
        "valor_total": dados["valor_total"],
        "status": "aprovada"
    }
    return _json(vendas, status=201)

@csrf_exempt
def vendas(request):
    if request.method == "POST":
        return _registrar_venda(request)
    
    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)