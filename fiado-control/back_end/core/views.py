import calendar
import json
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.core.serializers.json import DjangoJSONEncoder

from django.http import JsonResponse
from django.db import connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .financeiro import CENTAVO, ZERO, consultar_parcelas, identificador, validar_valor
from .validacoes import (
    campos_ausentes, cpf_valido, data_iso, filtro_cpf, filtro_telefone,
    normalizar_cpf, normalizar_telefone,
)


class APIJSONEncoder(DjangoJSONEncoder):
    def default(self, objeto):
        if isinstance(objeto, Decimal):
            return float(objeto)
        return super().default(objeto)


def _json(dados, status=200):
    return JsonResponse(
        dados,
        status=status,
        safe=False,
        encoder=APIJSONEncoder,
        json_dumps_params={"ensure_ascii": False},
    )


def _erro(codigo, mensagem, status, **extra):
    return _json({"erro": codigo, "mensagem": mensagem, **extra}, status=status)


def _ler_json(request):
    """Devolve o corpo como dict, ou None se não for um JSON de objeto."""
    try:
        dados = json.loads(request.body, parse_float=Decimal)
    except (ValueError, UnicodeDecodeError, InvalidOperation):
        return None
    return dados if isinstance(dados, dict) else None


def _json_invalido():
    return _erro("json_invalido", "O corpo da requisição não é um JSON válido", 400)


def _apenas_digitos(texto):
    if texto is None:
        return ""
    return "".join(c for c in str(texto) if c.isdigit())


def _obter_usuario_padrao():
    with connection.cursor() as cursor:
        cursor.execute("SELECT id_usuario FROM usuario WHERE ativo = TRUE ORDER BY id_usuario LIMIT 1")
        row = cursor.fetchone()
        return row[0] if row else 1


# ---------------------------------------------------------------- clientes

CAMPOS_OBRIGATORIOS_CLIENTE = ("nome", "cpf", "telefone")


def _consultar_clientes(nome="", cpf="", telefone=""):
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT
                c.id_cliente,
                c.nome,
                c.cpf,
                c.limite_credito,
                c.ativo,
                c.credito_bloqueado,
                ct.numero
            FROM cliente c
            LEFT JOIN cliente_telefone ct
                ON c.id_cliente = ct.id_cliente
            ORDER BY c.id_cliente, ct.id_telefone
        """)

        registros = cursor.fetchall()

    clientes = {}

    for id_cliente, nome_cliente, cpf_cliente, limite_credito, ativo, bloqueado, numero in registros:
        if id_cliente not in clientes:
            clientes[id_cliente] = {
                "id_cliente": id_cliente,
                "nome": nome_cliente,
                "cpf": _apenas_digitos(cpf_cliente),
                "telefone": [],
                "limite_credito": limite_credito,
                "credito_bloqueado": bloqueado,
                "ativo": ativo,
            }

        if numero and numero not in clientes[id_cliente]["telefone"]:
            clientes[id_cliente]["telefone"].append(numero)

    resultado = list(clientes.values())

    if nome:
        resultado = [
            c for c in resultado
            if nome.lower() in c["nome"].lower()
        ]

    if cpf:
        cpf_limpo = _apenas_digitos(cpf)
        resultado = [
            c for c in resultado
            if cpf_limpo in _apenas_digitos(c["cpf"])
        ]

    if telefone:
        tel_limpo = _apenas_digitos(telefone)
        resultado = [
            c for c in resultado
            if any(tel_limpo in _apenas_digitos(t) for t in c["telefone"])
        ]

    return resultado


def _buscar_cliente(id_cliente, bloquear=False):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id_cliente, nome, cpf, limite_credito, ativo, credito_bloqueado "
            "FROM cliente WHERE id_cliente = %s" + (" FOR UPDATE" if bloquear else ""),
            [id_cliente],
        )
        linha = cursor.fetchone()
        if linha is None:
            return None
        cursor.execute(
            "SELECT numero FROM cliente_telefone WHERE id_cliente = %s ORDER BY id_telefone",
            [id_cliente],
        )
        telefones = [r[0] for r in cursor.fetchall()]

    return {
        "id_cliente": linha[0],
        "nome": linha[1],
        "cpf": _apenas_digitos(linha[2]),
        "telefone": telefones,
        "limite_credito": linha[3],
        "credito_bloqueado": linha[5],
        "ativo": linha[4],
    }


def _cliente_nao_encontrado():
    return _erro("cliente_nao_encontrado", "Cliente não encontrado", 404)


def _cadastrar_cliente(request):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    faltando = campos_ausentes(dados, CAMPOS_OBRIGATORIOS_CLIENTE)
    if faltando:
        return _erro('campo_obrigatorio', 'Campos obrigatórios ausentes', 400, campos=faltando)
    nome = dados['nome']
    cpf = normalizar_cpf(dados['cpf'])
    telefones = dados['telefone']
    if not isinstance(nome, str) or not 1 <= len(nome.strip()) <= 100:
        return _erro('campo_invalido', 'Nome deve ser texto com até 100 caracteres', 400)
    if cpf is None:
        return _erro('cpf_invalido', 'CPF deve conter 11 dígitos, com ou sem a máscara XXX.XXX.XXX-XX', 422)
    if not isinstance(telefones, list):
        return _erro('telefone_invalido', 'Telefone deve ser uma lista de números brasileiros com DDD', 400)
    telefones = [normalizar_telefone(t) for t in telefones]
    if not telefones or any(t is None for t in telefones):
        return _erro('telefone_invalido', 'Informe telefone fixo ou celular com DDD e DDI 55 opcional', 400)
    telefones = list(dict.fromkeys(telefones))
    with transaction.atomic(), connection.cursor() as cursor:
        # Serializa apenas cadastros com o mesmo CPF, incluindo o seed formatado.
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [int(cpf)])
        cursor.execute("SELECT 1 FROM cliente WHERE REGEXP_REPLACE(cpf, '[^0-9]', '', 'g') = %s", [cpf])
        if cursor.fetchone():
            return _erro('cpf_duplicado', 'CPF já cadastrado para outro cliente', 409)
        # O seed contém CPFs ilustrativos: duplicidade existente tem precedência.
        if not cpf_valido(cpf):
            return _erro('cpf_invalido', 'CPF inválido: confira os dígitos verificadores', 422)
        cursor.execute('INSERT INTO cliente (nome, cpf, limite_credito, ativo) VALUES (%s, %s, 0, TRUE) RETURNING id_cliente', [nome.strip(), cpf])
        id_cliente = cursor.fetchone()[0]
        for telefone in telefones:
            cursor.execute('INSERT INTO cliente_telefone (id_cliente, numero) VALUES (%s, %s)', [id_cliente, telefone])
        novo = _buscar_cliente(id_cliente)
    return _json(novo, status=201)


@csrf_exempt
def clientes(request):
    if request.method == "GET":
        nome = request.GET.get('nome', '').strip()
        cpf = request.GET.get('cpf', '').strip()
        telefone = request.GET.get('telefone', '').strip()
        if len(nome) > 100 or cpf and filtro_cpf(cpf) is None or telefone and filtro_telefone(telefone) is None:
            return _erro('campo_invalido', 'Confira os filtros: nome até 100 caracteres, CPF até 11 dígitos e telefone até 11 dígitos com DDI 55 opcional', 400)
        lista = _consultar_clientes(nome, filtro_cpf(cpf) if cpf else '', filtro_telefone(telefone) if telefone else '')
        return _json(lista)

    if request.method == "POST":
        return _cadastrar_cliente(request)

    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)


@csrf_exempt
def cliente_detalhe(request, id_cliente):
    if request.method != "GET":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)
    id_cliente = identificador(id_cliente)
    if id_cliente is None:
        return _erro('campo_invalido', 'Identificador do cliente deve ser um inteiro positivo válido', 400)
    cliente = _buscar_cliente(id_cliente)
    if cliente is None:
        return _cliente_nao_encontrado()
    return _json(cliente)


def _parcelas_do_cliente(id_cliente, status=None):
    parcelas = consultar_parcelas(id_cliente)
    for parcela in parcelas:
        parcela.pop('id_cliente')
        parcela.pop('nome')
    return [p for p in parcelas if p['status'] == status] if status else parcelas


@csrf_exempt
def cliente_parcelas(request, id_cliente):
    if request.method != "GET":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)
    id_cliente = identificador(id_cliente)
    if id_cliente is None:
        return _erro('campo_invalido', 'Identificador do cliente deve ser um inteiro positivo válido', 400)
    if _buscar_cliente(id_cliente) is None:
        return _cliente_nao_encontrado()

    status = request.GET.get("status", "").strip()
    if status and status not in ("pendente", "parcial", "pago", "atrasado"):
        return _erro("campo_invalido", "status deve ser pendente, parcial, pago ou atrasado", 400)
    return _json(_parcelas_do_cliente(id_cliente, status or None))


@csrf_exempt
def cliente_saldo(request, id_cliente):
    if request.method != "GET":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)
    id_cliente = identificador(id_cliente)
    if id_cliente is None:
        return _erro('campo_invalido', 'Identificador do cliente deve ser um inteiro positivo válido', 400)
    cliente = _buscar_cliente(id_cliente)
    if cliente is None:
        return _cliente_nao_encontrado()

    parcelas = _parcelas_do_cliente(id_cliente)
    saldo = round(sum((p["valor_atualizado"] for p in parcelas), ZERO), 2)
    return _json({
        "id_cliente": id_cliente,
        "saldo_devedor": saldo,
        "limite_credito": cliente["limite_credito"],
        "limite_disponivel": max(ZERO, cliente["limite_credito"] - saldo),
        "possui_parcelas_atrasadas": any(p["status"] == "atrasado" for p in parcelas),
        "credito_bloqueado": cliente["credito_bloqueado"],
    })


# ------------------------------------------------------------------ vendas

CAMPOS_OBRIGATORIOS_VENDA = (
    "id_cliente",
    "modalidade",
    "valor_total",
    "data_primeiro_vencimento",
)
MODALIDADES = ("fiado", "a_prazo")


def _somar_meses(data, meses):
    indice = data.month - 1 + meses
    ano = data.year + indice // 12
    mes = indice % 12 + 1
    dia = min(data.day, calendar.monthrange(ano, mes)[1])
    return date(ano, mes, dia)


def _consultar_vendas(filtros=None):
    filtros = filtros or {}
    condicoes = []
    parametros = []
    for campo in ('id_cliente', 'status', 'modalidade'):
        if campo in filtros:
            condicoes.append(f'v.{campo} = %s')
            parametros.append(filtros[campo])
    for campo, operador in (('data_inicio', '>='), ('data_fim', '<=')):
        if campo in filtros:
            condicoes.append(f'v.data_venda::date {operador} %s')
            parametros.append(filtros[campo])
    where = ' WHERE ' + ' AND '.join(condicoes) if condicoes else ''
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT
                v.id_venda,
                v.id_cliente,
                c.nome,
                v.id_usuario,
                v.data_venda,
                v.valor_total,
                v.modalidade,
                v.status,
                v.motivo_rejeicao,
                v.autorizado_por
            FROM venda v
            INNER JOIN cliente c
                ON v.id_cliente = c.id_cliente
        """ + where + ' ORDER BY v.id_venda', parametros)

        registros = cursor.fetchall()

    vendas = []

    for (
        id_venda,
        id_cliente,
        nome_cliente,
        id_usuario,
        data_venda,
        valor_total,
        modalidade,
        status,
        motivo_rejeicao,
        autorizado_por,
    ) in registros:

        vendas.append({
            "id_venda": id_venda,
            "id_cliente": id_cliente,
            "nome_cliente": nome_cliente,
            "id_usuario": id_usuario,
            "data_venda": data_venda.isoformat() if data_venda else None,
            "valor_total": float(valor_total),
            "modalidade": modalidade,
            "status": status,
            "motivo_rejeicao": motivo_rejeicao,
            "autorizado_por": autorizado_por,
        })

    return vendas


def _registrar_venda(request):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    faltando = campos_ausentes(dados, CAMPOS_OBRIGATORIOS_VENDA)
    if faltando:
        return _erro('campo_obrigatorio', 'Campos obrigatórios ausentes', 400, campos=faltando)

    if dados["modalidade"] not in MODALIDADES:
        return _erro("campo_invalido", "Modalidade deve ser fiado ou a_prazo", 400)

    if dados["modalidade"] == "fiado":
        quantidade_informada = dados.get('quantidade_parcelas', 1)
        if type(quantidade_informada) is not int or quantidade_informada != 1:
            return _erro('campo_invalido', 'Venda fiado deve ter exatamente uma parcela', 400)
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

    valor_total = validar_valor(dados['valor_total'])
    id_cliente = identificador(dados['id_cliente'])
    if valor_total is None or id_cliente is None:
        return _erro('campo_invalido', 'Informe id_cliente inteiro positivo e valor_total positivo com até duas casas decimais', 400)
    total_centavos = int(valor_total * 100)
    if quantidade > total_centavos:
        return _erro('campo_invalido', 'Cada parcela deve ter pelo menos um centavo', 400)

    try:
        primeiro_vencimento = data_iso(dados['data_primeiro_vencimento'])
        _somar_meses(primeiro_vencimento, quantidade - 1)
    except (ValueError, TypeError, OverflowError):
        return _erro(
            "campo_invalido", "data_primeiro_vencimento deve estar no formato AAAA-MM-DD", 400
        )

    if primeiro_vencimento < date.today():
        return _erro('vencimento_invalido', 'O primeiro vencimento não pode ser anterior à data de hoje', 422)

    with transaction.atomic():
        cliente = _buscar_cliente(id_cliente, bloquear=True)
        if cliente is None:
            return _erro("cliente_nao_encontrado", "Cliente não encontrado", 404)

        parcelas = _parcelas_do_cliente(id_cliente)
        saldo_devedor = round(sum((p["valor_atualizado"] for p in parcelas), ZERO), 2)
        limite_disponivel = max(ZERO, cliente["limite_credito"] - saldo_devedor)
        possui_atrasadas = any(p["status"] == "atrasado" for p in parcelas)

        motivo = None
        if cliente["credito_bloqueado"]:
            motivo = "credito_bloqueado"
        elif possui_atrasadas:
            motivo = "parcelas_em_atraso"
        elif valor_total > limite_disponivel:
            motivo = "limite_credito_excedido"

        id_usuario = _obter_usuario_padrao()

        with connection.cursor() as cursor:
            if motivo:
                cursor.execute("""
                    INSERT INTO venda (id_cliente, id_usuario, data_venda, valor_total, modalidade, status, motivo_rejeicao)
                    VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s, 'rejeitada', %s)
                    RETURNING id_venda
                """, [cliente["id_cliente"], id_usuario, valor_total, dados["modalidade"], motivo])
                id_venda = cursor.fetchone()[0]

                return _json(
                    {"id_venda": id_venda, "status": "rejeitada", "motivo": motivo},
                    status=422,
                )

            cursor.execute("""
                INSERT INTO venda (id_cliente, id_usuario, data_venda, valor_total, modalidade, status)
                VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s, 'aprovada')
                RETURNING id_venda
            """, [cliente["id_cliente"], id_usuario, valor_total, dados["modalidade"]])
            id_venda = cursor.fetchone()[0]

            base = total_centavos // quantidade
            parcelas_resposta = []

            for i in range(quantidade):
                centavos = base if i < quantidade - 1 else total_centavos - base * (quantidade - 1)
                valor_parcela = Decimal(centavos) * CENTAVO
                vencimento = _somar_meses(primeiro_vencimento, i).isoformat()

                cursor.execute("""
                    INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, status)
                    VALUES (%s, %s, %s, 'pendente')
                    RETURNING id_pagamento
                """, [id_venda, valor_parcela, vencimento])
                id_pagamento = cursor.fetchone()[0]

                parcelas_resposta.append({
                    "id_parcela": id_pagamento,
                    "numero": i + 1,
                    "valor_parcela": valor_parcela,
                    "data_vencimento": vencimento,
                })

        venda = {
            "id_venda": id_venda,
            "id_cliente": cliente["id_cliente"],
            "id_usuario": id_usuario,
            "modalidade": dados["modalidade"],
            "data_venda": date.today().isoformat(),
            "valor_total": float(valor_total),
            "status": "aprovada",
            "parcelas": parcelas_resposta,
        }
        return _json(venda, status=201)


@csrf_exempt
def vendas(request):
    if request.method == "GET":
        filtros = {}
        for campo in ('id_cliente', 'status', 'modalidade', 'data_inicio', 'data_fim'):
            valor = request.GET.get(campo, '').strip()
            if not valor:
                continue
            if campo == 'id_cliente':
                valor = identificador(valor)
                if valor is None:
                    return _erro('campo_invalido', 'id_cliente deve ser um inteiro positivo válido', 400)
            elif campo == 'status':
                if valor not in ('aprovada', 'rejeitada', 'pendente_autorizacao', 'cancelada'):
                    return _erro('campo_invalido', 'Status de venda inválido', 400)
            elif campo == 'modalidade':
                if valor not in MODALIDADES:
                    return _erro('campo_invalido', 'Modalidade deve ser fiado ou a_prazo', 400)
            else:
                try:
                    valor = data_iso(valor)
                except ValueError:
                    return _erro('campo_invalido', 'Datas de filtro devem estar no formato AAAA-MM-DD', 400)
            filtros[campo] = valor
        if 'data_inicio' in filtros and 'data_fim' in filtros and filtros['data_inicio'] > filtros['data_fim']:
            return _erro('campo_invalido', 'data_inicio não pode ser posterior a data_fim', 400)
        lista = _consultar_vendas(filtros)
        return _json(lista)

    if request.method == "POST":
        return _registrar_venda(request)

    return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)


# -------------------------------------------------------------- pagamentos

CAMPOS_OBRIGATORIOS_PAGAMENTO = ("id_parcela", "valor_recebido")


def _registrar_pagamento(request):
    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()
    faltando = campos_ausentes(dados, CAMPOS_OBRIGATORIOS_PAGAMENTO)
    if faltando:
        return _erro('campo_obrigatorio', 'Campos obrigatórios ausentes', 400, campos=faltando)
    id_parcela = identificador(dados['id_parcela'])
    recebido = validar_valor(dados['valor_recebido'])
    if id_parcela is None or recebido is None:
        return _erro('campo_invalido', 'Informe id_parcela inteiro positivo e valor_recebido positivo com até duas casas decimais', 400)

    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("""
            SELECT v.id_cliente FROM pagamento p JOIN venda v ON v.id_venda = p.id_venda
            WHERE p.id_pagamento = %s AND v.status = 'aprovada'
        """, [id_parcela])
        linha = cursor.fetchone()
        if linha is None:
            return _erro('parcela_nao_encontrada', 'Parcela não encontrada', 404)
        id_cliente = linha[0]
        # Mesma ordem de bloqueio das vendas: cliente, depois parcela.
        _buscar_cliente(id_cliente, bloquear=True)
        cursor.execute("""
            SELECT p.id_pagamento FROM pagamento p JOIN venda v ON v.id_venda = p.id_venda
            WHERE p.id_pagamento = %s AND v.status = 'aprovada' FOR UPDATE OF p
        """, [id_parcela])
        if cursor.fetchone() is None:
            return _erro('parcela_nao_encontrada', 'Parcela não encontrada', 404)
        parcela = next(p for p in consultar_parcelas(id_cliente) if p['id_parcela'] == id_parcela)
        devido = parcela['valor_atualizado']
        if devido == ZERO:
            return _erro('parcela_ja_paga', 'Esta parcela já foi paga', 422)
        if recebido > devido:
            return _erro('valor_excede_devido', 'O valor do pagamento excede o valor devido da parcela', 422)
        juros_pagos = min(recebido, parcela['juros'])
        multa_paga = min(recebido - juros_pagos, parcela['multa'])
        id_usuario = _obter_usuario_padrao()
        hoje = date.today()
        cursor.execute("""
            INSERT INTO recebimento (id_pagamento, valor_recebido, valor_juros, valor_multa, data_pagamento, id_usuario)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_recebimento
        """, [id_parcela, recebido, juros_pagos, multa_paga, hoje, id_usuario])
        id_recebimento = cursor.fetchone()[0]
        restante = devido - recebido
        estado_banco = 'pago' if restante == ZERO else 'atrasado' if parcela['status'] == 'atrasado' else 'pendente'
        cursor.execute('UPDATE pagamento SET status = %s, data_pagamento = %s WHERE id_pagamento = %s',
                       [estado_banco, hoje if restante == ZERO else None, id_parcela])
        saldo_cliente = sum((p['valor_atualizado'] for p in consultar_parcelas(id_cliente)), ZERO)
        resposta = {
            'id_pagamento': id_recebimento, 'id_parcela': id_parcela,
            'valor_recebido': recebido, 'data_pagamento': hoje.isoformat(),
            'status_parcela': 'pago' if restante == ZERO else 'parcial',
            'saldo_parcela': restante, 'saldo_devedor_cliente': saldo_cliente,
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
        return _erro("metodo_nao_permitido", 
                     "Método não permitido nesta rota", 
                     405
                     )
    
    from .credito import _acesso
    usuario_id, erro=_acesso(request)

    if erro is not None:
        return erro
    if request.usuario.perfil != "gerente":
        return  _erro(
            "Acesso negando",
            "Apenas o gerente pode acessar",
            403
        )


    

    periodo = request.GET.get("periodo", "mes").strip()
    if periodo not in ("dia", "semana", "mes"):
        return _erro("periodo_invalido", "Período deve ser dia, semana ou mes", 400)

    dias_param = request.GET.get("dias", str(DIAS_PADRAO_VENCIMENTO)).strip()
    try:
        dias = int(dias_param)
    except (ValueError, TypeError):
        dias = 0
    if dias < 1:
        return _erro("campo_invalido", "dias deve ser um inteiro maior que zero", 400)

    hoje = date.today()
    if periodo == "dia":
        data_inicio = hoje
    elif periodo == "semana":
        data_inicio = hoje - timedelta(days=6)
    else:  # mes
        data_inicio = hoje.replace(day=1)

    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT COALESCE(SUM(valor_total), 0) FROM venda
            WHERE status = 'aprovada' AND data_venda::date BETWEEN %s AND %s
        """, [data_inicio, hoje])
        faturamento_total = cursor.fetchone()[0]
    try:
        limite_a_vencer = hoje + timedelta(days=dias)
    except OverflowError:
        return _erro('campo_invalido', 'Janela de dias fora do intervalo suportado', 400)
    vencidas, a_vencer = [], []
    total = vencido = ZERO
    for p in consultar_parcelas():
        saldo = p['valor_atualizado']
        if saldo == ZERO:
            continue
        total += saldo
        item = {'id_cliente': p['id_cliente'], 'nome': p['nome'], 'id_parcela': p['id_parcela'],
                'valor_parcela': saldo, 'data_vencimento': p['data_vencimento']}
        if p['status'] == 'atrasado':
            vencido += saldo
            item['dias_atraso'] = p['dias_atraso']
            vencidas.append(item)
        elif hoje <= date.fromisoformat(p['data_vencimento']) <= limite_a_vencer:
            a_vencer.append(item)
    return _json({'periodo': periodo, 'faturamento_total': faturamento_total,
                  'total_a_receber': total, 'taxa_inadimplencia': round(vencido / total, 2) if total else ZERO,
                  'parcelas_vencidas': vencidas, 'parcelas_a_vencer': a_vencer})
