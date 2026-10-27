import re

from django.test import SimpleTestCase
from django.urls import resolve
from openapi_spec_validator import validate


class DocumentacaoTests(SimpleTestCase):
    def test_openapi_valido_com_todas_as_referencias(self):
        resposta = self.client.get('/api/openapi.json')
        self.assertEqual(resposta.status_code, 200)
        validate(resposta.json())

    def test_schema_publico_e_somente_operacoes_existentes(self):
        resposta = self.client.get('/api/openapi.json')
        self.assertEqual(resposta.status_code, 200)
        schema = resposta.json()
        self.assertTrue(schema['openapi'].startswith('3.0.'))
        ids = []
        for caminho, metodos in schema['paths'].items():
            caminho_real = re.sub(r'\{[^}]+\}', '5', caminho)
            resolve('/api' + caminho_real)
            for metodo, operacao in metodos.items():
                if metodo not in ('get', 'post', 'put', 'patch', 'delete'):
                    continue
                ids.append(operacao['operationId'])
                self.assertIn('responses', operacao)
                if metodo in ('post', 'put', 'patch'):
                    self.assertIn('requestBody', operacao)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 13)
        self.assertNotIn('/auth/login', schema['paths'])
        self.assertNotIn('/excecoes', schema['paths'])

    def test_swagger_aponta_schema_local_sem_envio_a_validador_externo(self):
        resposta = self.client.get('/api/docs/')
        self.assertEqual(resposta.status_code, 200)
        self.assertContains(resposta, 'SwaggerUIBundle')
        self.assertContains(resposta, '/api/openapi.json')
        self.assertContains(resposta, 'validatorUrl: null')
        self.assertContains(resposta, 'persistAuthorization: false')

    def test_documentacao_rejeita_post_com_json(self):
        for url in ('/api/docs/', '/api/openapi.json'):
            resposta = self.client.post(url)
            self.assertEqual(resposta.status_code, 405)
            self.assertEqual(resposta.json()['erro'], 'metodo_nao_permitido')

    def test_credito_descreve_perfis_erros_e_dependencia_de_autenticacao(self):
        resposta = self.client.get('/api/openapi.json')
        self.assertEqual(resposta.status_code, 200)
        schema = resposta.json()
        self.assertEqual(schema['components']['securitySchemes']['bearerAuth']['scheme'], 'bearer')
        for caminho, metodo in (('/clientes/{id_cliente}/limite', 'get'),
                                ('/clientes/{id_cliente}/limite', 'put'),
                                ('/clientes/{id_cliente}/credito/bloqueio', 'put')):
            operacao = schema['paths'][caminho][metodo]
            self.assertEqual(operacao['security'], [{'bearerAuth': []}])
            for codigo in ('200', '400', '401', '403', '404', '405'):
                self.assertIn(codigo, operacao['responses'])
            self.assertIn('request.usuario', operacao['description'])
