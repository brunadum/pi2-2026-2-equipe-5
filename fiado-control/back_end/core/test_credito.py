"""Integração RF06; identidade de middleware simulada somente nos testes."""

import json
from datetime import date, timedelta
from importlib import import_module
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.conf import settings
from django.db import IntegrityError, connection, connections
from django.test import Client, override_settings
from openapi_schema_validator import OAS30Validator

from .models import Usuario
from .tests import RotasBase


class IdentidadeTesteMiddleware:
    """Representa o ponto de integração de Backend 1/3, sem emitir tokens."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        usuario_id = getattr(settings, 'CREDITO_TESTE_USUARIO', None)
        if usuario_id:
            request.usuario = Usuario.objects.get(pk=usuario_id)
        return self.get_response(request)


@override_settings(MIDDLEWARE=[*settings.MIDDLEWARE, 'core.test_credito.IdentidadeTesteMiddleware'])
class ConsultaCreditoTests(RotasBase):
    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_consulta_coerente_com_saldo_para_funcionario(self):
        resposta = self.client.get('/api/clientes/2/limite')
        self.assertEqual(resposta.status_code, 200)
        credito = resposta.json()
        saldo = self.client.get('/api/clientes/2/saldo').json()
        self.assertEqual(set(credito), {
            'id_cliente', 'limite_credito', 'saldo_devedor',
            'limite_disponivel', 'credito_bloqueado',
        })
        for campo in credito:
            self.assertEqual(credito[campo], saldo[campo])

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_cliente_sem_divida_e_limite_zero(self):
        self.assertEqual(self.client.get('/api/clientes/4/limite/').json(), {
            'id_cliente': 4, 'limite_credito': 0, 'saldo_devedor': 0,
            'limite_disponivel': 0, 'credito_bloqueado': False,
        })

    def test_sem_identidade_nem_header_inventado_nao_acessa(self):
        for headers in ({}, {'HTTP_AUTHORIZATION': 'Bearer inventado'},
                        {'HTTP_X_USUARIO_ID': '2', 'HTTP_X_PERFIL': 'gerente'}):
            self.assertErro(self.client.get('/api/clientes/2/limite', **headers), 401, 'nao_autenticado')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_identificador_e_cliente_inexistente(self):
        for cliente in ('abc', '0', '-1', '2147483648'):
            with self.subTest(cliente=cliente):
                self.assertErro(self.client.get(f'/api/clientes/{cliente}/limite'), 400, 'campo_invalido')
        self.assertErro(self.client.get('/api/clientes/2147483647/limite'), 404, 'cliente_nao_encontrado')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.post('/api/clientes/2/limite'), 405, 'metodo_nao_permitido')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_consulta_bloqueada_preserva_disponivel_financeiro(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE cliente SET credito_bloqueado = TRUE, limite_credito = 100 WHERE id_cliente = 2')
        resposta = self.client.get('/api/clientes/2/limite')
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.json()['credito_bloqueado'])
        self.assertGreater(resposta.json()['saldo_devedor'], 100)
        self.assertEqual(resposta.json()['limite_disponivel'], 0)


@override_settings(MIDDLEWARE=[*settings.MIDDLEWARE, 'core.test_credito.IdentidadeTesteMiddleware'])
class CreditoBase(RotasBase):
    @classmethod
    def _reset_banco(cls):
        super()._reset_banco()
        with connection.cursor() as cursor:
            cursor.execute(import_module('core.migrations.0002_auditoria_credito').AUDITORIA_SQL)

    def put(self, corpo, url='/api/clientes/5/limite'):
        return self.client.put(url, json.dumps(corpo), content_type='application/json')


class AlteracaoCreditoTests(CreditoBase):
    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_gerente_define_limite_que_afeta_novas_vendas(self):
        resposta = self.put({'limite_credito': 200.50})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()['limite_disponivel'], 200.50)
        venda = self.post('/api/vendas', {
            'id_cliente': 5, 'modalidade': 'fiado', 'valor_total': 200.51,
            'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat(),
        })
        self.assertEqual(venda.status_code, 422)
        self.assertEqual(venda.json()['motivo'], 'limite_credito_excedido')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_limite_zero_permitido(self):
        resposta = self.put({'limite_credito': 0})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()['limite_credito'], 0)

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_valores_invalidos_nao_alteram_limite(self):
        for valor in (-1, True, '100', 0.001, 100000000, [], {}, float('inf'), float('nan')):
            with self.subTest(valor=valor):
                self.assertErro(self.put({'limite_credito': valor}), 422, 'limite_invalido')
        self.assertEqual(self.client.get('/api/clientes/5/limite').json()['limite_credito'], 1000)

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_altera_mesmo_forjando_autor(self):
        self.assertErro(self.put({'limite_credito': 200, 'id_usuario': 2, 'perfil': 'gerente'}), 403, 'acesso_negado')

    def test_anonimo_nao_altera(self):
        self.assertErro(self.put({'limite_credito': 200, 'id_usuario': 2}), 401, 'nao_autenticado')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_validacoes_de_corpo(self):
        for corpo in ('{', '[]', 'null', '1e999999999'):
            with self.subTest(corpo=corpo):
                resposta = self.client.put('/api/clientes/5/limite', corpo, content_type='application/json')
                self.assertErro(resposta, 400, 'json_invalido')
        for corpo in ({}, {'limite_credito': None}, {'limite_credito': ''}):
            self.assertErro(self.put(corpo), 400, 'campo_obrigatorio')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_auditoria_persiste_ator_valores_motivo_e_horario(self):
        self.assertEqual(self.put({'limite_credito': 1250.45, 'motivo': ' Revisão ', 'id_usuario': 1}).status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute('''SELECT id_cliente, id_usuario, operacao, valores_anteriores,
                              valores_novos, motivo, data_hora FROM auditoria_credito''')
            cliente, ator, operacao, anterior, novo, motivo, horario = cursor.fetchone()
        self.assertEqual((cliente, ator, operacao, motivo), (5, 2, 'alteracao_limite', 'Revisão'))
        self.assertEqual(json.loads(anterior), {'limite_credito': 1000})
        self.assertEqual(json.loads(novo), {'limite_credito': 1250.45})
        self.assertIsNotNone(horario.tzinfo)

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_falha_de_auditoria_desfaz_limite(self):
        with connection.cursor() as cursor:
            cursor.execute('ALTER TABLE auditoria_credito ADD CONSTRAINT falha_teste CHECK (FALSE)')
        with self.assertRaises(IntegrityError):
            self.put({'limite_credito': 200})
        self.assertEqual(self.client.get('/api/clientes/5/limite').json()['limite_credito'], 1000)

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_idempotencia_e_limite_abaixo_da_divida(self):
        for _ in range(2):
            resposta = self.put({'limite_credito': 0}, '/api/clientes/2/limite')
            self.assertEqual(resposta.status_code, 200)
            self.assertGreater(resposta.json()['saldo_devedor'], 0)
            self.assertEqual(resposta.json()['limite_disponivel'], 0)
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM auditoria_credito')
            self.assertEqual(cursor.fetchone()[0], 1)

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_usuario_inativado_ou_perfil_alterado_nao_mantem_permissao(self):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE usuario SET perfil = 'funcionario' WHERE id_usuario = 2")
        self.assertErro(self.put({'limite_credito': 200}), 403, 'acesso_negado')
        with connection.cursor() as cursor:
            cursor.execute('UPDATE usuario SET ativo = FALSE WHERE id_usuario = 2')
        self.assertErro(self.put({'limite_credito': 200}), 401, 'nao_autenticado')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_motivo_invalido_nao_atualiza(self):
        for motivo in (None, [], 123, 'x' * 201):
            self.assertErro(self.put({'limite_credito': 200, 'motivo': motivo}), 400, 'campo_invalido')
        self.assertEqual(self.put({'limite_credito': 99999999.99, 'motivo': 'x' * 200}).status_code, 200)

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_put_identificador_invalido_e_cliente_ausente(self):
        self.assertErro(self.put({'limite_credito': 100}, '/api/clientes/abc/limite'), 400, 'campo_invalido')
        self.assertErro(self.put({'limite_credito': 100}, '/api/clientes/2147483647/limite'), 404, 'cliente_nao_encontrado')

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_duas_alteracoes_concorrentes_preservam_cadeia_de_auditoria(self):
        barreira = Barrier(2)

        def alterar(valor):
            try:
                barreira.wait(timeout=5)
                return Client().put('/api/clientes/5/limite', json.dumps({'limite_credito': valor}),
                                    content_type='application/json').status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(alterar, (1100, 1200))), [200, 200])
        with connection.cursor() as cursor:
            cursor.execute('SELECT valores_anteriores, valores_novos FROM auditoria_credito ORDER BY id_auditoria')
            eventos = [(json.loads(a), json.loads(n)) for a, n in cursor.fetchall()]
        self.assertEqual(len(eventos), 2)
        self.assertEqual(eventos[0][0]['limite_credito'], 1000)
        self.assertEqual(eventos[0][1], eventos[1][0])
        self.assertEqual(self.client.get('/api/clientes/5/limite').json()['limite_credito'], eventos[1][1]['limite_credito'])


@override_settings(CREDITO_TESTE_USUARIO=2)
class BloqueioCreditoTests(CreditoBase):
    URL = '/api/clientes/5/credito/bloqueio'

    def test_bloqueio_impede_venda_e_desbloqueio_permite(self):
        venda = {'id_cliente': 5, 'modalidade': 'fiado', 'valor_total': 100,
                 'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat()}
        resposta = self.put({'bloqueado': True}, self.URL)
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json(), {'id_cliente': 5, 'credito_bloqueado': True})
        rejeitada = self.post('/api/vendas', venda)
        self.assertEqual(rejeitada.status_code, 422)
        self.assertEqual(rejeitada.json()['motivo'], 'credito_bloqueado')
        self.assertEqual(self.put({'bloqueado': False}, self.URL + '/').status_code, 200)
        self.assertEqual(self.post('/api/vendas', venda).status_code, 201)

    def test_bloqueio_preserva_divida_e_permite_baixa(self):
        antes = self.client.get('/api/clientes/2/saldo').json()['saldo_devedor']
        self.assertEqual(self.put({'bloqueado': True}, '/api/clientes/2/credito/bloqueio').status_code, 200)
        self.assertEqual(self.client.get('/api/clientes/2/saldo').json()['saldo_devedor'], antes)
        self.assertEqual(self.post('/api/pagamentos', {'id_parcela': 2, 'valor_recebido': 10}).status_code, 201)
        self.assertEqual(self.client.get('/api/clientes/2/saldo').json()['saldo_devedor'], antes - 10)

    def test_bloqueio_exige_booleano_estrito(self):
        for valor in ('true', 1, 0, [], {}):
            self.assertErro(self.put({'bloqueado': valor}, self.URL), 400, 'campo_invalido')
        self.assertErro(self.put({}, self.URL), 400, 'campo_obrigatorio')

    @override_settings(CREDITO_TESTE_USUARIO=None)
    def test_bloqueio_anonimo_recebe_401(self):
        self.assertErro(self.put({'bloqueado': True, 'id_usuario': 2}, self.URL), 401, 'nao_autenticado')

    def test_bloqueio_erros_de_requisicao(self):
        self.assertErro(self.client.get(self.URL), 405, 'metodo_nao_permitido')
        self.assertErro(self.put({'bloqueado': True}, '/api/clientes/abc/credito/bloqueio'), 400, 'campo_invalido')
        self.assertErro(self.put({'bloqueado': True}, '/api/clientes/2147483647/credito/bloqueio'), 404, 'cliente_nao_encontrado')
        resposta = self.client.put(self.URL, '{', content_type='application/json')
        self.assertErro(resposta, 400, 'json_invalido')

    def test_desbloqueio_nao_ignora_atraso(self):
        url = '/api/clientes/3/credito/bloqueio'
        self.assertEqual(self.put({'bloqueado': True}, url).status_code, 200)
        self.assertEqual(self.put({'bloqueado': False}, url).status_code, 200)
        venda = self.post('/api/vendas', {
            'id_cliente': 3, 'modalidade': 'fiado', 'valor_total': 10,
            'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat(),
        })
        self.assertEqual(venda.status_code, 422)
        self.assertEqual(venda.json()['motivo'], 'parcelas_em_atraso')

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_bloqueio_funcionario_recebe_403(self):
        self.assertErro(self.put({'bloqueado': True}, self.URL), 403, 'acesso_negado')

    def test_bloqueio_idempotente_e_auditado(self):
        for _ in range(2):
            self.assertEqual(self.put({'bloqueado': True}, self.URL).status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute('SELECT id_usuario, operacao, valores_anteriores, valores_novos FROM auditoria_credito')
            eventos = cursor.fetchall()
        self.assertEqual(len(eventos), 1)
        self.assertEqual(eventos[0][:2], (2, 'bloqueio_credito'))
        self.assertEqual(json.loads(eventos[0][2]), {'credito_bloqueado': False})
        self.assertEqual(json.loads(eventos[0][3]), {'credito_bloqueado': True})

    def test_falha_auditoria_desfaz_bloqueio(self):
        with connection.cursor() as cursor:
            cursor.execute('ALTER TABLE auditoria_credito ADD CONSTRAINT falha_teste CHECK (FALSE)')
        with self.assertRaises(IntegrityError):
            self.put({'bloqueado': True}, self.URL)
        self.assertFalse(self.client.get('/api/clientes/5/limite').json()['credito_bloqueado'])


@override_settings(CREDITO_TESTE_USUARIO=2)
class ContratoRespostasTests(CreditoBase):
    def test_respostas_reais_das_13_operacoes_correspondem_ao_openapi(self):
        schema = self.client.get('/api/openapi.json').json()
        casos = [
            ('get', '/clientes', None, 200),
            ('get', '/clientes/{id_cliente}', None, 200),
            ('get', '/clientes/{id_cliente}/saldo', None, 200),
            ('get', '/clientes/{id_cliente}/parcelas', None, 200),
            ('get', '/clientes/{id_cliente}/limite', None, 200),
            ('put', '/clientes/{id_cliente}/limite', {'limite_credito': 1000}, 200),
            ('put', '/clientes/{id_cliente}/credito/bloqueio', {'bloqueado': False}, 200),
            ('get', '/vendas', None, 200),
            ('get', '/dashboard', None, 200),
            ('post', '/clientes', {'nome': 'Contrato', 'cpf': '52998224725', 'telefone': ['88999990000']}, 201),
            ('post', '/vendas', {'id_cliente': 5, 'modalidade': 'fiado', 'valor_total': 100,
                               'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat()}, 201),
            ('post', '/pagamentos', {'id_parcela': 2, 'valor_recebido': 10}, 201),
            ('post', '/login/', {}, 400),
        ]
        for metodo, caminho, corpo, status in casos:
            with self.subTest(metodo=metodo, caminho=caminho):
                url = '/api' + caminho.replace('{id_cliente}', '5')
                if corpo is None:
                    resposta = getattr(self.client, metodo)(url)
                else:
                    resposta = getattr(self.client, metodo)(url, json.dumps(corpo), content_type='application/json')
                self.assertEqual(resposta.status_code, status)
                esperado = schema['paths'][caminho][metodo]['responses'][str(status)]['content']['application/json']['schema']
                # Preserva os componentes na raiz para resolver os $ref locais.
                validador = OAS30Validator({'components': schema['components'], **esperado})
                validador.validate(resposta.json())
