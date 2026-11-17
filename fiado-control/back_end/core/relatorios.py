"""RF09/RF12: posição financeira, recebimentos e exportações do gerente."""

import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .credito import _acesso
from .financeiro import ZERO, consultar_parcelas, identificador
from .validacoes import data_iso
from .views import _consultar_clientes, _consultar_vendas, _erro, _json


def filtros_financeiros(request, padrao=None):
    filtros = {}
    periodo = request.GET.get('periodo', padrao)
    if periodo is not None:
        if periodo not in ('dia', 'semana', 'mes'):
            return None, _erro('periodo_invalido', 'Período deve ser dia, semana ou mes', 400)
        hoje = date.today()
        filtros.update(data_inicio=hoje if periodo == 'dia' else hoje-timedelta(days=6) if periodo == 'semana' else hoje.replace(day=1), data_fim=hoje)
    for campo in ('data_inicio', 'data_fim'):
        if campo in request.GET:
            try:
                filtros[campo] = data_iso(request.GET[campo])
            except ValueError:
                return None, _erro('campo_invalido', 'Datas devem estar no formato AAAA-MM-DD', 400)
    if filtros.get('data_inicio', date.min) > filtros.get('data_fim', date.max):
        return None, _erro('campo_invalido', 'data_inicio não pode ser posterior a data_fim', 400)
    if 'id_cliente' in request.GET:
        filtros['id_cliente'] = identificador(request.GET['id_cliente'])
        if filtros['id_cliente'] is None:
            return None, _erro('campo_invalido', 'id_cliente deve ser inteiro positivo', 400)
    return filtros, None


def consultar_recebimentos(filtros):
    condicoes, valores = [], []
    for campo, expressao in (('data_inicio', 'r.data_pagamento >= %s'),
                             ('data_fim', 'r.data_pagamento <= %s'), ('id_cliente', 'v.id_cliente = %s')):
        if campo in filtros:
            condicoes.append(expressao)
            valores.append(filtros[campo])
    where = ' WHERE ' + ' AND '.join(condicoes) if condicoes else ''
    with connection.cursor() as cursor:
        cursor.execute('''
            SELECT r.id_recebimento AS id_pagamento, r.id_pagamento AS id_parcela,
                   p.id_venda, v.id_cliente, c.nome AS nome_cliente, r.valor_recebido,
                   r.valor_juros, r.valor_multa, r.data_pagamento, r.id_usuario, r.forma_pagamento
            FROM recebimento r JOIN pagamento p ON p.id_pagamento=r.id_pagamento
            JOIN venda v ON v.id_venda=p.id_venda JOIN cliente c ON c.id_cliente=v.id_cliente
        ''' + where + ' ORDER BY r.data_pagamento, r.id_recebimento', valores)
        colunas = [coluna[0] for coluna in cursor.description]
        return [dict(zip(colunas, linha)) for linha in cursor.fetchall()]


def indicadores(filtros, dias=7):
    hoje = date.today()
    limite = hoje + timedelta(days=dias)
    vendas = _consultar_vendas({**filtros, 'status': 'aprovada'})
    recebimentos = consultar_recebimentos(filtros)
    vencidas, a_vencer = [], []
    total = vencido = ZERO
    for parcela in consultar_parcelas(filtros.get('id_cliente')):
        saldo = parcela['valor_atualizado']
        if saldo == ZERO:
            continue
        total += saldo
        item = {campo: parcela[campo] for campo in ('id_cliente', 'nome', 'id_parcela', 'data_vencimento', 'dias_atraso')}
        item['valor_parcela'] = saldo
        if parcela['status'] == 'atrasado':
            vencido += saldo
            vencidas.append(item)
        elif hoje <= date.fromisoformat(parcela['data_vencimento']) <= limite:
            a_vencer.append(item)
    inicio_grafico = hoje-timedelta(days=27)
    filtros_grafico = {**filtros, 'data_inicio': inicio_grafico, 'data_fim': hoje}
    semanas = [{'rotulo': f'Semana {i+1}', 'valor': ZERO, 'recebido': ZERO} for i in range(4)]
    for venda in _consultar_vendas({**filtros_grafico, 'status': 'aprovada'}):
        indice = (date.fromisoformat(venda['data_venda'][:10])-inicio_grafico).days // 7
        semanas[indice]['valor'] += Decimal(str(venda['valor_total']))
    for recebimento in consultar_recebimentos(filtros_grafico):
        indice = (recebimento['data_pagamento']-inicio_grafico).days // 7
        semanas[indice]['recebido'] += recebimento['valor_recebido']
    return {
        'periodo': 'mes', 'faturamento_total': sum((Decimal(str(v['valor_total'])) for v in vendas), ZERO),
        'total_recebido': sum((r['valor_recebido'] for r in recebimentos), ZERO),
        'total_a_receber': total, 'total_vencido': vencido,
        'taxa_inadimplencia': round(vencido/total, 2) if total else ZERO,
        'taxa_atraso': round(vencido/total*100, 2) if total else ZERO,
        'clientes_inadimplentes': len({p['id_cliente'] for p in vencidas}),
        'parcelas_vencidas': vencidas, 'parcelas_a_vencer': a_vencer, 'faturamento_semanal': semanas,
    }


def _acesso_leitura(request):
    if request.method != 'GET':
        return _erro('metodo_nao_permitido', 'Método não permitido nesta rota', 405)
    return _acesso(request, escrita=True)[1]


@csrf_exempt
def dashboard(request):
    erro = _acesso_leitura(request)
    if erro is not None:
        return erro
    filtros, erro = filtros_financeiros(request, 'mes')
    if erro is not None:
        return erro
    try:
        dias = int(request.GET.get('dias', '7'))
        if dias < 1:
            raise ValueError
        date.today()+timedelta(days=dias)
    except (ValueError, OverflowError):
        return _erro('campo_invalido', 'dias deve ser inteiro positivo dentro do intervalo suportado', 400)
    dados = indicadores(filtros, dias)
    dados['periodo'] = request.GET.get('periodo', 'mes')
    return _json(dados)


def pagamentos(request):
    erro = _acesso_leitura(request)
    if erro is not None:
        return erro
    filtros, erro = filtros_financeiros(request)
    return erro if erro is not None else _json(consultar_recebimentos(filtros))


def _celula(valor):
    if isinstance(valor, (list, dict)):
        valor = ', '.join(map(str, valor))
    if isinstance(valor, str) and valor.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
        return "'" + valor
    return valor


@csrf_exempt
def relatorio(request, tipo, exportar=False):
    erro = _acesso_leitura(request)
    if erro is not None:
        return erro
    if tipo not in ('vendas', 'pagamentos', 'clientes', 'financeiro', 'inadimplencia'):
        return _erro('relatorio_nao_encontrado', 'Tipo de relatório não encontrado', 404)
    filtros, erro = filtros_financeiros(request, 'mes' if tipo == 'financeiro' else None)
    if erro is not None:
        return erro
    if tipo == 'vendas':
        dados = _consultar_vendas({**filtros, 'status': 'aprovada'})
    elif tipo == 'pagamentos':
        dados = consultar_recebimentos(filtros)
    elif tipo == 'clientes':
        dados = _consultar_clientes()
        if 'id_cliente' in filtros:
            dados = [c for c in dados if c['id_cliente'] == filtros['id_cliente']]
    else:
        dados = indicadores(filtros)
        dados['periodo'] = request.GET.get('periodo', 'mes')
        if tipo == 'inadimplencia':
            dados = dados['parcelas_vencidas']
    if not exportar:
        return _json(dados)
    if isinstance(dados, dict):
        dados = [{'indicador': campo, 'valor': valor} for campo, valor in dados.items() if not isinstance(valor, list)]
    colunas = list(dados[0]) if dados else ['sem_registros']
    arquivo = io.StringIO(newline='')
    escritor = csv.writer(arquivo, delimiter=';')
    escritor.writerow(colunas)
    escritor.writerows([_celula(linha.get(campo, '')) for campo in colunas] for linha in dados)
    resposta = HttpResponse('\ufeff'+arquivo.getvalue(), content_type='text/csv; charset=utf-8')
    resposta['Content-Disposition'] = f'attachment; filename="relatorio-{tipo}.csv"'
    resposta['Cache-Control'] = 'no-store'
    return resposta
