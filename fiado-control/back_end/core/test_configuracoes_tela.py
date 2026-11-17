"""Contrato da tela original e regra de juros mensais/multa diária aprovada pelo usuário."""

import json
from datetime import date, timedelta

from django.db import connection
from django.test import override_settings

from .test_credito import CreditoBase


@override_settings(CREDITO_TESTE_USUARIO=2)
class ConfiguracoesTelaTests(CreditoBase):
    def dados(self, **alteracoes):
        return {
            'multa_diaria_percentual': 0.33, 'juros_mensais_percentual': 10,
            'desconto_maximo_percentual': 15, 'limite_padrao_cliente': 250,
            'bloquear_vendas_atraso': True, 'permitir_cliente_sem_cpf': False,
            'exigir_senha_venda': False, 'permitir_venda_parcial': True,
            'operador_cadastrar_cliente': True, 'operador_registrar_pagamento': True,
            'restringir_relatorios_admin': True, **alteracoes,
        }

    def salvar(self, **alteracoes):
        return self.client.put('/api/configuracoes/', json.dumps(self.dados(**alteracoes)), content_type='application/json')

    def parcela(self):
        return next(p for p in self.client.get('/api/clientes/2/parcelas').json() if p['id_parcela'] == 2)

    def preparar_parcela(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET valor_parcela=100,data_vencimento=%s WHERE id_pagamento=2', [date.today()-timedelta(days=30)])

    def test_get_devolve_os_campos_que_a_tela_usa(self):
        resposta = self.client.get('/api/configuracoes/')
        self.assertEqual(resposta.status_code, 200)
        for campo in self.dados():
            self.assertIn(campo, resposta.json())

    def test_salva_payload_da_tela_e_calcula_encargos_proporcionais(self):
        self.preparar_parcela()
        resposta = self.salvar()
        self.assertEqual(resposta.status_code, 200)
        atual = self.client.get('/api/configuracoes/').json()
        self.assertEqual(atual['multa_diaria_percentual'], 0.33)
        self.assertEqual(atual['juros_mensais_percentual'], 10)
        parcela = self.parcela()
        self.assertEqual(parcela['juros'], 10)
        self.assertEqual(parcela['multa'], 9.90)
        self.assertEqual(parcela['valor_atualizado'], 119.90)

    def test_pagamento_parcial_reduz_base_dos_dias_seguinte(self):
        self.preparar_parcela()
        self.assertEqual(self.salvar().status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute('INSERT INTO recebimento(id_pagamento,valor_recebido,valor_juros,valor_multa,data_pagamento,id_usuario) VALUES(2,50,0,0,%s,2)', [date.today()-timedelta(days=10)])
        parcela = self.parcela()
        self.assertEqual(parcela['juros'], 8.33)
        self.assertEqual(parcela['multa'], 8.25)
        self.assertEqual(parcela['valor_atualizado'], 66.58)

    def test_percentuais_invalidos_e_booleanos_invalidos_nao_salvam(self):
        for valor in (-1, 100.01, True, '10', 0.001):
            self.assertErro(self.salvar(juros_mensais_percentual=valor), 422, 'configuracao_invalida')
        self.assertErro(self.salvar(permitir_venda_parcial='false'), 422, 'configuracao_invalida')

    def test_politicas_obrigatorias_nao_sao_desativadas_por_configuracao(self):
        for campo, valor in (('bloquear_vendas_atraso', False), ('permitir_cliente_sem_cpf', True),
                             ('restringir_relatorios_admin', False), ('exigir_senha_venda', True)):
            self.assertErro(self.salvar(**{campo: valor}), 422, 'politica_nao_disponivel')

    def test_limite_padrao_aplicado_no_cadastro(self):
        self.assertEqual(self.salvar().status_code, 200)
        resposta = self.post('/api/clientes', {'nome': 'Cliente teste', 'cpf': '52998224725', 'telefone': ['88999990000']})
        self.assertEqual(resposta.status_code, 201)
        self.assertEqual(resposta.json()['limite_credito'], 250)

    def test_configuracao_impede_baixa_parcial_e_desconto_acima_teto(self):
        self.preparar_parcela()
        self.assertEqual(self.salvar(permitir_venda_parcial=False).status_code, 200)
        self.assertErro(self.post('/api/pagamentos', {'id_parcela': 2, 'valor_recebido': 10}), 422, 'pagamento_parcial_nao_permitido')
        self.assertErro(self.post('/api/pagamentos/2/desconto', {'valor_desconto': 30, 'motivo': 'Acordo'}), 422, 'desconto_invalido')

    def test_permissoes_de_operador_sao_aplicadas(self):
        self.assertEqual(self.salvar(operador_cadastrar_cliente=False, operador_registrar_pagamento=False).status_code, 200)
        with override_settings(CREDITO_TESTE_USUARIO=1):
            self.assertErro(self.post('/api/clientes', {'nome': 'Cliente teste', 'cpf': '52998224725', 'telefone': ['88999990000']}), 403, 'acesso_negado')
            self.assertErro(self.post('/api/pagamentos', {'id_parcela': 2, 'valor_recebido': 10}), 403, 'acesso_negado')

    def test_precisao_de_taxa_fracionaria_preserva_033_porcento(self):
        self.assertEqual(self.salvar().status_code, 200)
        resposta = self.client.put('/api/configuracoes/cobranca', json.dumps({'taxa_juros': 0.10, 'taxa_multa': 0.0033}), content_type='application/json')
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(self.client.get('/api/configuracoes/').json()['multa_diaria_percentual'], 0.33)

    def test_auditoria_com_payload_da_tela_preserva_ator_e_politicas(self):
        self.assertEqual(self.salvar().status_code, 200)
        self.assertEqual(self.salvar().status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id_usuario,valores_novos FROM auditoria_financeira WHERE operacao='configuracao_cobranca'")
            registros = cursor.fetchall()
        self.assertEqual(len(registros), 1)
        self.assertEqual(registros[0][0], 2)
        self.assertEqual(json.loads(registros[0][1])['modo_cobranca'], 'mensal_diaria')

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_salva_payload_da_tela(self):
        self.assertErro(self.salvar(), 403, 'acesso_negado')

    def test_descontos_repetidos_nao_ultrapassam_teto_da_parcela(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET valor_parcela=100,data_vencimento=%s WHERE id_pagamento=2', [date.today()+timedelta(days=5)])
        self.assertEqual(self.salvar().status_code, 200)
        self.assertEqual(self.post('/api/pagamentos/2/desconto', {'valor_desconto': 15, 'motivo': 'Acordo'}).status_code, 200)
        self.assertErro(self.post('/api/pagamentos/2/desconto', {'valor_desconto': 1, 'motivo': 'Outro acordo'}), 422, 'desconto_invalido')

    def test_objeto_de_get_pode_ser_alterado_e_enviado_de_volta(self):
        dados = self.client.get('/api/configuracoes/').json()
        dados['operador_registrar_pagamento'] = False
        resposta = self.client.put('/api/configuracoes/', json.dumps(dados), content_type='application/json')
        self.assertEqual(resposta.status_code, 200)
        atual = self.client.get('/api/configuracoes/').json()
        self.assertFalse(atual['operador_registrar_pagamento'])
        self.assertEqual(atual['modo_cobranca'], 'mensal_diaria')
        from openapi_schema_validator import OAS30Validator
        spec = self.client.get('/api/openapi.json').json()
        OAS30Validator({'components': spec['components'], '$ref': '#/components/schemas/SistemaEntrada'}).validate(dados)
