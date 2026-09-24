from django.http import JsonResponse

from .dados_fixos import CLIENTES


def _json(dados, status=200):
    return JsonResponse(
        dados,
        status=status,
        safe=False,
        json_dumps_params={"ensure_ascii": False},
    )


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


def clientes(request):
    if request.method == "GET":
        lista = _filtrar_clientes(
            request.GET.get("nome", "").strip(),
            request.GET.get("cpf", "").strip(),
            request.GET.get("telefone", "").strip(),
        )
        return _json(lista)

    return _json(
        {"erro": "metodo_nao_permitido", "mensagem": "Método não permitido nesta rota"},
        status=405,
    )