"""RF09/RF10/RF12: persistência, filtros e relatórios com dados reais."""

import json
from datetime import date, timedelta
from decimal import Decimal

from django.db import connection, IntegrityError, connections
from django.test import override_settings
from django.test import Client
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from .test_credito import CreditoBase


@override_settings(CREDITO_TESTE_USUARIO=2)
class ConfiguracoesTests(CreditoBase):
    def alterar(self, dados, caminho='/api/configuracoes/cobranca'):
        return self.client.put(caminho, json.dumps(dados), content_type='application/json')

    def test_consulta_e_alteracao_persistem_e_afetam_encargos(self):
        self.assertEqual(self.client.get('/api/configuracoes/cobranca').status_code, 200)
        resposta = self.alterar({'taxa_juros': 0.10, 'taxa_multa': 0.05, 'definido_por': 1})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()['definido_por'], 2)
        self.assertEqual(self.client.get('/api/configuracoes/').json()['taxa_juros'], 0.10)
        parcelas = self.client.get('/api/clientes/3/parcelas').json()
        self.assertEqual(parcelas[0]['valor_atualizado'], 138)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id_usuario, valores_anteriores, valores_novos FROM auditoria_financeira WHERE operacao='configuracao_cobranca'")
            ator, anterior, novo = cursor.fetchone()
        self.assertEqual(ator, 2)
        anterior, novo = json.loads(anterior), json.loads(novo)
        self.assertEqual(anterior['taxa_juros'], 0.02)
        self.assertEqual(novo['taxa_juros'], 0.10)

    def test_taxas_invalidas_nao_alteram_configuracao(self):
        for valor in (-0.01, 1.01, '0.10', True, 0.00001, float('nan')):
            with self.subTest(valor=valor):
                self.assertErro(self.alterar({'taxa_juros': valor, 'taxa_multa': 0.05}), 422, 'taxa_invalida')
        self.assertEqual(self.client.get('/api/configuracoes/cobranca').json()['taxa_juros'], 0.02)
        self.assertErro(self.alterar({'taxa_juros': 0}), 400, 'campo_obrigatorio')
        self.assertEqual(self.alterar({'taxa_juros': 0, 'taxa_multa': 0}).status_code, 200)

    def test_repeticao_nao_duplica_auditoria(self):
        for _ in range(2):
            self.assertEqual(self.alterar({'taxa_juros': 0.10, 'taxa_multa': 0.05}).status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM auditoria_financeira WHERE operacao='configuracao_cobranca'")
            self.assertEqual(cursor.fetchone()[0], 1)

    def test_falha_da_auditoria_desfaz_configuracao(self):
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE auditoria_financeira ADD CONSTRAINT negar_config CHECK (operacao <> 'configuracao_cobranca')")
        with self.assertRaises(IntegrityError):
            self.alterar({'taxa_juros': 0.10, 'taxa_multa': 0.05})
        self.assertEqual(self.client.get('/api/configuracoes/cobranca').json()['taxa_juros'], 0.02)

    def test_alteracoes_concorrentes_preservam_historico(self):
        barreira = Barrier(2)
        def alterar(taxa):
            try:
                barreira.wait(timeout=10)
                return Client().put('/api/configuracoes/cobranca', json.dumps({'taxa_juros': taxa, 'taxa_multa': 0.05}), content_type='application/json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertEqual(list(executor.map(alterar, (0.10, 0.20))), [200, 200])
        with connection.cursor() as cursor:
            cursor.execute('SELECT valores_anteriores, valores_novos FROM auditoria_financeira ORDER BY id_auditoria')
            eventos = [(json.loads(a), json.loads(n)) for a, n in cursor.fetchall()]
        self.assertEqual(len(eventos), 2)
        self.assertEqual(eventos[0][0]['taxa_juros'], 0.02)
        self.assertEqual(eventos[0][1], eventos[1][0])

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_consulta_nem_altera(self):
        self.assertErro(self.client.get('/api/configuracoes/'), 403, 'acesso_negado')
        self.assertErro(self.alterar({'taxa_juros': 0, 'taxa_multa': 0}), 403, 'acesso_negado')

    @override_settings(CREDITO_TESTE_USUARIO=None)
    def test_anonimo_nao_acessa(self):
        self.assertErro(self.client.get('/api/configuracoes/cobranca'), 401, 'nao_autenticado')


@override_settings(CREDITO_TESTE_USUARIO=2)
class RelatoriosTests(CreditoBase):
    def setUp(self):
        super().setUp()
        hoje = date.today()
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM recebimento')
            cursor.execute('DELETE FROM pagamento')
            cursor.execute('DELETE FROM venda')
            cursor.execute("INSERT INTO venda (id_venda,id_cliente,id_usuario,valor_total,modalidade,status,data_venda) VALUES (100,1,2,1000,'a_prazo','aprovada',%s), (101,2,2,500,'fiado','rejeitada',%s), (102,1,2,300,'fiado','aprovada',%s)", [hoje, hoje, hoje-timedelta(days=40)])
            cursor.execute("INSERT INTO pagamento (id_pagamento,id_venda,valor_parcela,data_vencimento,status) VALUES (100,100,400,%s,'pendente'),(101,100,600,%s,'pendente')", [hoje-timedelta(days=2), hoje+timedelta(days=3)])
            cursor.execute('INSERT INTO recebimento (id_pagamento,valor_recebido,valor_juros,valor_multa,data_pagamento,id_usuario) VALUES (100,100,0,0,%s,2),(101,50,0,0,%s,1)', [hoje, hoje-timedelta(days=40)])

    def test_dashboard_exclui_rejeitadas_filtra_recebimentos_e_informa_percentual(self):
        resposta = self.client.get('/api/dashboard?periodo=dia')
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(dados['faturamento_total'], 1000)
        self.assertEqual(dados['total_recebido'], 100)
        self.assertEqual(dados['total_a_receber'], 878)
        self.assertEqual(dados['total_vencido'], 328)
        self.assertEqual(dados['taxa_atraso'], 37.36)
        self.assertEqual(dados['clientes_inadimplentes'], 1)
        self.assertEqual(sum(s['valor'] for s in dados['faturamento_semanal']), 1000)
        self.assertEqual(sum(s['recebido'] for s in dados['faturamento_semanal']), 100)

    def test_pagamentos_lista_recebimentos_reais_com_filtros(self):
        resposta = self.client.get('/api/pagamentos?periodo=dia')
        self.assertEqual(resposta.status_code, 200)
        registros = resposta.json()
        self.assertEqual(len(registros), 1)
        self.assertEqual(registros[0]['valor_recebido'], 100)
        self.assertEqual(registros[0]['id_parcela'], 100)
        self.assertEqual(registros[0]['nome_cliente'], 'João Silva')
        self.assertEqual(self.client.get('/api/pagamentos?id_cliente=999').json(), [])
        self.assertErro(self.client.get('/api/pagamentos?data_inicio=2026-02-30'), 400, 'campo_invalido')
        self.assertErro(self.client.get('/api/pagamentos?data_inicio=2026-12-31&data_fim=2026-01-01'), 400, 'campo_invalido')

    def test_relatorios_filtram_vendas_aprovadas_e_recebimentos(self):
        vendas = self.client.get('/api/relatorios/vendas?periodo=dia')
        self.assertEqual(vendas.status_code, 200)
        self.assertEqual([v['id_venda'] for v in vendas.json()], [100])
        self.assertEqual(len(self.client.get('/api/relatorios/pagamentos?periodo=dia').json()), 1)
        self.assertEqual(self.client.get('/api/relatorios/financeiro?periodo=dia').json()['total_recebido'], 100)
        self.assertEqual(self.client.get('/api/relatorios/inadimplencia').json()[0]['valor_parcela'], 328)

    def test_csv_preserva_acentos_e_impede_formulas(self):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE cliente SET nome = '=HYPERLINK(\"teste\")' WHERE id_cliente=1")
        resposta = self.client.get('/api/relatorios/clientes/exportar')
        self.assertEqual(resposta.status_code, 200)
        self.assertIn('text/csv', resposta['Content-Type'])
        self.assertIn('attachment;', resposta['Content-Disposition'])
        texto = resposta.content.decode('utf-8-sig')
        self.assertIn("'=HYPERLINK", texto)
        self.assertIn('João Lima', texto)
        self.assertErro(self.client.get('/api/relatorios/segredos/exportar'), 404, 'relatorio_nao_encontrado')

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_acessa_consolidado(self):
        for caminho in ('/api/dashboard', '/api/pagamentos', '/api/relatorios/clientes/exportar'):
            self.assertErro(self.client.get(caminho), 403, 'acesso_negado')

    @override_settings(CREDITO_TESTE_USUARIO=None)
    def test_anonimo_nao_acessa_consolidado(self):
        for caminho in ('/api/pagamentos', '/api/relatorios/financeiro'):
            self.assertErro(self.client.get(caminho), 401, 'nao_autenticado')


@override_settings(CREDITO_TESTE_USUARIO=2)
class CatalogoTests(CreditoBase):
    def test_cadastro_e_lista_compartilhados_no_banco(self):
        resposta = self.post('/api/produtos', {'nome': 'Arroz 1kg', 'preco': 7.50})
        self.assertEqual(resposta.status_code, 201)
        produto = resposta.json()
        self.assertEqual(produto['preco'], 7.50)
        self.assertIn(produto, self.client.get('/api/produtos').json())
        self.assertErro(self.post('/api/produtos', {'nome': 'Arroz 1kg', 'preco': 8}), 409, 'produto_duplicado')
        self.assertErro(self.post('/api/produtos', {'nome': 'Novo', 'preco': -2}), 422, 'valor_invalido')

    def test_gerente_atualiza_preco_sem_duplicar(self):
        produto = self.post('/api/produtos', {'nome': 'Arroz', 'preco': 7}).json()
        resposta = self.client.put(f"/api/produtos/{produto['id']}", json.dumps({'nome': 'Arroz', 'preco': 8}), content_type='application/json')
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(self.client.get('/api/produtos').json()[0]['preco'], 8)

    @override_settings(CREDITO_TESTE_USUARIO=None)
    def test_catalogo_exige_login(self):
        self.assertErro(self.client.get('/api/produtos'), 401, 'nao_autenticado')


@override_settings(CREDITO_TESTE_USUARIO=2)
class DescontosTests(CreditoBase):
    def descontar(self, dados, parcela=2):
        return self.post(f'/api/pagamentos/{parcela}/desconto', dados)

    def test_desconto_reduz_divida_sem_contar_como_recebimento(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET data_vencimento=%s WHERE id_pagamento=2', [date.today()+timedelta(days=3)])
        antes = self.client.get('/api/clientes/2/saldo').json()['saldo_devedor']
        resposta = self.descontar({'valor_desconto': 20, 'motivo': 'Acordo com o cliente'})
        self.assertEqual(resposta.status_code, 200)
        depois = self.client.get('/api/clientes/2/saldo').json()['saldo_devedor']
        self.assertEqual(Decimal(str(antes))-Decimal(str(depois)), Decimal('20'))
        self.assertEqual(self.client.get('/api/pagamentos').json(), [])
        with connection.cursor() as cursor:
            cursor.execute("SELECT id_usuario, motivo FROM auditoria_financeira WHERE operacao='desconto_pagamento'")
            self.assertEqual(cursor.fetchone(), (2, 'Acordo com o cliente'))

    def test_desconto_valida_valor_motivo_e_parcela(self):
        self.assertErro(self.descontar({'valor_desconto': 99999, 'motivo': 'Acordo'}), 422, 'desconto_invalido')
        self.assertErro(self.descontar({'valor_desconto': 10}), 400, 'campo_obrigatorio')
        self.assertErro(self.descontar({'valor_desconto': -1, 'motivo': 'Acordo'}), 422, 'desconto_invalido')
        self.assertErro(self.descontar({'valor_desconto': 10, 'motivo': 'Acordo'}, 999), 404, 'parcela_nao_encontrada')

    def test_desconto_total_quita_parcela_sem_fabricar_recebimento(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET data_vencimento=%s WHERE id_pagamento=2', [date.today()+timedelta(days=3)])
        self.assertEqual(self.descontar({'valor_desconto': 150, 'motivo': 'Acordo'}).status_code, 200)
        parcela = next(p for p in self.client.get('/api/clientes/2/parcelas').json() if p['id_parcela'] == 2)
        self.assertEqual(parcela['valor_atualizado'], 0)
        self.assertEqual(parcela['valor_pago'], 0)
        self.assertEqual(parcela['valor_desconto'], 150)
        self.assertErro(self.post('/api/pagamentos', {'id_parcela': 2, 'valor_recebido': 1}), 422, 'parcela_ja_paga')

    def test_falha_da_auditoria_desfaz_desconto(self):
        antes = self.client.get('/api/clientes/2/saldo').json()['saldo_devedor']
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE auditoria_financeira ADD CONSTRAINT negar_desconto CHECK (operacao <> 'desconto_pagamento')")
        with self.assertRaises(IntegrityError):
            self.descontar({'valor_desconto': 10, 'motivo': 'Acordo'})
        self.assertEqual(self.client.get('/api/clientes/2/saldo').json()['saldo_devedor'], antes)
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM desconto_parcela')
            self.assertEqual(cursor.fetchone()[0], 0)

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_concede_desconto(self):
        self.assertErro(self.descontar({'valor_desconto': 10, 'motivo': 'Acordo'}), 403, 'acesso_negado')
