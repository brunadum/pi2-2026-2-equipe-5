import calendar
import itertools
import json
from datetime import date, timedelta

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .dados_fixos import (
    CLIENTES,
    ID_USUARIO_FIXO,
    PARCELAS_A_VENCER,
    PARCELAS_PENDENTES,
    PARCELAS_VENCIDAS,
    TOTAIS_POR_PERIODO,
)


def _json(dados, status=200):
    return JsonResponse(
        dados,
        status=status,
        safe=False,
        json_dumps_params={"ensure_ascii": False},
    )


def _erro(codigo, mensagem, status, **extra):
    return _json({"erro": codigo, "mensagem": mensagem, **extra}, status=status)


def _ler_json(request):
    """Devolve o corpo como dict, ou None se não for um JSON de objeto."""
    try:
        dados = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return None
    return dados if isinstance(dados, dict) else None


def _json_invalido():
    return _erro("json_invalido", "O corpo da requisição não é um JSON válido", 400)


def _apenas_digitos(texto):
    return "".join(c for c in texto if c.isdigit())


def _numero(valor):
    """True se for int ou float (bool não conta)."""
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


# ---------------------------------------------------------------- clientes

CAMPOS_OBRIGATORIOS = ("nome", "cpf", "telefone")


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
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    faltando = [c for c in CAMPOS_OBRIGATORIOS if dados.get(c) in (None, "", [])]
    if faltando:
        return _erro(
            "campo_obrigatorio",
            "Campos obrigatórios ausentes",
            400,
            campos=faltando,
        )

    cpf = _apenas_digitos(str(dados["cpf"]))
    if any(c["cpf"] == cpf for c in CLIENTES):
        return _erro("cpf_invalido", "CPF já cadastrado para outro cliente", 422)

    # Dados fixos: o cliente não é gravado, só devolvemos o que seria criado.
    # O limite começa em 0.00 e só o gerente define (PUT /clientes/{id}/limite).
    novo = {
        "id_cliente": max(c["id_cliente"] for c in CLIENTES) + 1,
        "nome": dados["nome"],
        "cpf": cpf,
        "telefone": dados["telefone"],
        "limite_credito": 0.00,
        "credito_bloqueado": False,
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


# ------------------------------------------------------------------ vendas

CAMPOS_OBRIGATORIOS_VENDA = (
    "id_cliente",
    "modalidade",
    "valor_total",
    "data_primeiro_vencimento",
)
MODALIDADES = ("fiado", "a_prazo")

_contador_vendas = itertools.count(5)
_contador_parcelas = itertools.count(12)


def _somar_meses(data, meses):
    indice = data.month - 1 + meses
    ano = data.year + indice // 12
    mes = indice % 12 + 1
    dia = min(data.day, calendar.monthrange(ano, mes)[1])
    return date(ano, mes, dia)


def _gerar_parcelas(valor_total, quantidade, primeiro_vencimento):
    """Divide o total em parcelas mensais; a última absorve os centavos."""
    total_centavos = round(valor_total * 100)
    base = total_centavos // quantidade
    parcelas = []
    for i in range(quantidade):
        centavos = base if i < quantidade - 1 else total_centavos - base * (quantidade - 1)
        parcelas.append(
            {
                "id_parcela": next(_contador_parcelas),
                "numero": i + 1,
                "valor_parcela": centavos / 100,
                "data_vencimento": _somar_meses(primeiro_vencimento, i).isoformat(),
            }
        )
    return parcelas


def _registrar_venda(request):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    for campo in CAMPOS_OBRIGATORIOS_VENDA:
        if dados.get(campo) in (None, "", []):
            return _erro("campo_obrigatorio", f"Campo obrigatório ausente: {campo}", 400)

    if dados["modalidade"] not in MODALIDADES:
        return _erro("campo_invalido", "Modalidade deve ser fiado ou a_prazo", 400)

    if dados["modalidade"] == "fiado":
        quantidade = 1
    else:
        quantidade = dados.get("quantidade_parcelas")
        if quantidade in (None, "", []):
            return _erro(
                "campo_obrigatorio", "Campo obrigatório ausente: quantidade_parcelas", 400
            )
        if not isinstance(quantidade, int) or isinstance(quantidade, bool) or quantidade < 1:
            return _erro(
                "campo_invalido", "quantidade_parcelas deve ser um inteiro maior que zero", 400
            )

    if not _numero(dados["valor_total"]) or dados["valor_total"] <= 0:
        return _erro("campo_invalido", "valor_total deve ser maior que zero", 400)

    try:
        primeiro_vencimento = date.fromisoformat(str(dados["data_primeiro_vencimento"]))
    except ValueError:
        return _erro(
            "campo_invalido", "data_primeiro_vencimento deve estar no formato AAAA-MM-DD", 400
        )

    cliente = next((c for c in CLIENTES if c["id_cliente"] == dados["id_cliente"]), None)
    if cliente is None:
        return _erro("cliente_nao_encontrado", "Cliente não encontrado", 404)

    id_venda = next(_contador_vendas)

    motivo = None
    if cliente["credito_bloqueado"]:
        motivo = "credito_bloqueado"
    elif dados["valor_total"] > cliente["limite_credito"]:
        motivo = "limite_credito_excedido"

    if motivo:
        return _json(
            {"id_venda": id_venda, "status": "rejeitada", "motivo": motivo},
            status=422,
        )

    venda = {
        "id_venda": id_venda,
        "id_cliente": dados["id_cliente"],
        "id_usuario": ID_USUARIO_FIXO,
        "modalidade": dados["modalidade"],
        "data_venda": date.today().isoformat(),
        "valor_total": dados["valor_total"],
        "status": "aprovada",
        "parcelas": _gerar_parcelas(dados["valor_total"], quantidade, primeiro_vencimento),
    }
    return _json(venda, status=201)


@csrf_exempt
def vendas(request):
    if request.method == "POST":
        return _registrar_venda(request)

    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)


# -------------------------------------------------------------- pagamentos

CAMPOS_OBRIGATORIOS_PAGAMENTO = ("id_parcela", "valor_recebido")
_contador_pagamentos = itertools.count(21)


def _registrar_pagamento(request):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    for campo in CAMPOS_OBRIGATORIOS_PAGAMENTO:
        if dados.get(campo) in (None, "", []):
            return _erro("campo_obrigatorio", f"Campo obrigatório ausente: {campo}", 400)

    if not _numero(dados["valor_recebido"]) or dados["valor_recebido"] <= 0:
        return _erro("campo_invalido", "valor_recebido deve ser maior que zero", 400)

    parcela = next(
        (p for p in PARCELAS_PENDENTES if p["id_parcela"] == dados["id_parcela"]), None
    )
    if parcela is None:
        return _erro("parcela_nao_encontrada", "Parcela não encontrada", 404)

    recebido = round(dados["valor_recebido"], 2)
    if recebido > parcela["valor_parcela"]:
        return _erro(
            "valor_excede_devido",
            "O valor do pagamento excede o valor devido da parcela",
            422,
        )

    saldo_parcela = round(parcela["valor_parcela"] - recebido, 2)
    resposta = {
        "id_pagamento": next(_contador_pagamentos),
        "id_parcela": parcela["id_parcela"],
        "valor_recebido": recebido,
        "data_pagamento": date.today().isoformat(),
        "status_parcela": "pago" if saldo_parcela == 0 else "parcial",
        "saldo_parcela": saldo_parcela,
        "saldo_devedor_cliente": round(parcela["saldo_devedor_cliente"] - recebido, 2),
    }
    return _json(resposta, status=201)


@csrf_exempt
def pagamentos(request):
    if request.method == "POST":
        return _registrar_pagamento(request)

    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)


# --------------------------------------------------------------- dashboard

DIAS_PADRAO_VENCIMENTO = 7


@csrf_exempt
def dashboard(request):
    if request.method != "GET":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)

    periodo = request.GET.get("periodo", "mes")
    if periodo not in TOTAIS_POR_PERIODO:
        return _erro("periodo_invalido", "Período deve ser dia, semana ou mes", 400)

    try:
        dias = int(request.GET.get("dias", DIAS_PADRAO_VENCIMENTO))
    except ValueError:
        dias = 0
    if dias < 1:
        return _erro("campo_invalido", "dias deve ser um inteiro maior que zero", 400)

    hoje = date.today()

    parcelas_vencidas = [
        {
            **{k: v for k, v in p.items() if k != "dias_atraso"},
            "data_vencimento": (hoje - timedelta(days=p["dias_atraso"])).isoformat(),
            "dias_atraso": p["dias_atraso"],
        }
        for p in PARCELAS_VENCIDAS
    ]

    parcelas_a_vencer = [
        {
            **{k: v for k, v in p.items() if k != "dias_para_vencer"},
            "data_vencimento": (hoje + timedelta(days=p["dias_para_vencer"])).isoformat(),
        }
        for p in PARCELAS_A_VENCER
        if p["dias_para_vencer"] <= dias
    ]

    resposta = {
        "periodo": periodo,
        **TOTAIS_POR_PERIODO[periodo],
        "parcelas_vencidas": parcelas_vencidas,
        "parcelas_a_vencer": parcelas_a_vencer,
    }
    return _json(resposta, status=200)