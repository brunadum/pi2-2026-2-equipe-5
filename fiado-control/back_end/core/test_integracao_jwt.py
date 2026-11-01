"""Integração HTTP do login, JWT, perfis e rotas RF06 com PostgreSQL real."""

import json
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import connection
from django.test import override_settings
from openapi_schema_validator import OAS30Validator

from .openapi import SCHEMAS
from .test_credito import CreditoBase


@override_settings(MIDDLEWARE=settings.MIDDLEWARE, CREDITO_TESTE_USUARIO=None)
class JWTIntegracaoTests(CreditoBase):
    def setUp(self):
        super().setUp()
        with connection.cursor() as cursor:
            cursor.execute('UPDATE usuario SET senha_hash = %s', [make_password('SenhaTeste@123')])

    def autenticar(self, email):
        resposta = self.post('/api/login/', {'email': email, 'senha': 'SenhaTeste@123'})
        self.assertEqual(resposta.status_code, 200)
        self.assertIn('token', resposta.json())
        OAS30Validator(SCHEMAS['LoginAtual']).validate(resposta.json())
        return {'HTTP_AUTHORIZATION': 'Bearer ' + resposta.json()['token']}

    def test_login_admin_e_comum_consultam_limite(self):
        for email, perfil in (('gerente@loja.com', 'ADMIN'), ('funcionario@loja.com', 'COMUM')):
            with self.subTest(perfil=perfil):
                headers = self.autenticar(email)
                resposta = self.client.get('/api/clientes/4/limite', **headers)
                self.assertEqual(resposta.status_code, 200)
                self.assertEqual(resposta.json()['id_cliente'], 4)

    def test_nomes_gerente_e_funcionario_do_seed_tambem_funcionam(self):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE perfil SET nome = 'gerente' WHERE nome = 'ADMIN'")
            cursor.execute("UPDATE perfil SET nome = 'funcionario' WHERE nome = 'COMUM'")
        for email, dashboard_status in (('gerente@loja.com', 200), ('funcionario@loja.com', 403)):
            headers = self.autenticar(email)
            self.assertEqual(self.client.get('/api/clientes/4/limite', **headers).status_code, 200)
            self.assertEqual(self.client.get('/api/dashboard', **headers).status_code, dashboard_status)

    def test_admin_altera_limite_bloqueio_e_auditoria(self):
        headers = self.autenticar('gerente@loja.com')
        limite = self.client.put('/api/clientes/5/limite', json.dumps({'limite_credito': 500}),
                                 content_type='application/json', **headers)
        self.assertEqual(limite.status_code, 200)
        bloqueio = self.client.put('/api/clientes/5/credito/bloqueio', json.dumps({'bloqueado': True}),
                                   content_type='application/json', **headers)
        self.assertEqual(bloqueio.status_code, 200)
        with connection.cursor() as cursor:
            cursor.execute('SELECT id_usuario FROM auditoria_credito ORDER BY id_auditoria')
            self.assertEqual(cursor.fetchall(), [(2,), (2,)])

    def test_fluxo_jwt_limite_500_divida_180_disponivel_320(self):
        headers = self.autenticar('gerente@loja.com')
        resposta = self.client.put('/api/clientes/4/limite', json.dumps({'limite_credito': 500}),
                                   content_type='application/json', **headers)
        self.assertEqual(resposta.status_code, 200)
        venda = {'id_cliente': 4, 'modalidade': 'fiado', 'valor_total': 180,
                 'data_primeiro_vencimento': (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()}
        self.assertEqual(self.client.post('/api/vendas', json.dumps(venda), content_type='application/json', **headers).status_code, 201)
        for email in ('gerente@loja.com', 'funcionario@loja.com'):
            resposta = self.client.get('/api/clientes/4/limite', **self.autenticar(email))
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.json(), {'id_cliente': 4, 'limite_credito': 500,
                             'saldo_devedor': 180, 'limite_disponivel': 320, 'credito_bloqueado': False})

    def test_identificador_invalido_e_cliente_ausente_com_jwt(self):
        headers = self.autenticar('gerente@loja.com')
        self.assertErro(self.client.get('/api/clientes/abc/limite', **headers), 400, 'campo_invalido')
        self.assertErro(self.client.get('/api/clientes/2147483647/limite', **headers), 404, 'cliente_nao_encontrado')

    def test_perfil_desconhecido_nao_recebe_permissoes(self):
        headers = self.autenticar('gerente@loja.com')
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO perfil (nome) VALUES ('SEM_ACESSO') RETURNING id")
            cursor.execute('UPDATE usuario SET id_perfil = %s WHERE id_usuario = 2', [cursor.fetchone()[0]])
        self.assertErro(self.client.get('/api/clientes/4/limite', **headers), 403, 'acesso_negado')

    def test_comum_nao_altera_limite_nem_bloqueio(self):
        headers = self.autenticar('funcionario@loja.com')
        for caminho, corpo in (('limite', {'limite_credito': 500, 'perfil': 'ADMIN', 'id_usuario': 2}),
                                ('credito/bloqueio', {'bloqueado': True})):
            resposta = self.client.put('/api/clientes/5/' + caminho, json.dumps(corpo),
                                       content_type='application/json', **headers)
            self.assertErro(resposta, 403, 'acesso_negado')
        with connection.cursor() as cursor:
            cursor.execute('SELECT limite_credito, credito_bloqueado FROM cliente WHERE id_cliente = 5')
            self.assertEqual(cursor.fetchone(), (1000, False))
            cursor.execute('SELECT COUNT(*) FROM auditoria_credito')
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_token_expirado_invalido_e_assinatura_incorreta_retornam_401(self):
        expirado = jwt.encode({'id_usuario': 2, 'exp': datetime.now(timezone.utc) - timedelta(seconds=1)},
                              settings.SECRET_KEY, algorithm='HS256')
        adulterado = jwt.encode({'id_usuario': 2, 'exp': datetime.now(timezone.utc) + timedelta(hours=1)},
                                'chave-diferente-exclusiva-do-teste-com-mais-de-32-caracteres', algorithm='HS256')
        for token in ('invalido', expirado, adulterado):
            with self.subTest(token_tipo='expirado ou inválido'):
                self.assertErro(self.client.get('/api/clientes/4/limite', HTTP_AUTHORIZATION='Bearer ' + token),
                                401, 'nao_autenticado')

    def test_usuario_inativo_nao_entra_e_token_existente_perde_acesso(self):
        headers = self.autenticar('gerente@loja.com')
        with connection.cursor() as cursor:
            cursor.execute('UPDATE usuario SET ativo = FALSE WHERE id_usuario = 2')
        self.assertEqual(self.post('/api/login/', {'email': 'gerente@loja.com', 'senha': 'SenhaTeste@123'}).status_code, 401)
        self.assertErro(self.client.get('/api/clientes/4/limite', **headers), 401, 'nao_autenticado')

    def test_perfil_atual_do_banco_prevalece_sobre_perfil_do_token(self):
        headers = self.autenticar('gerente@loja.com')
        with connection.cursor() as cursor:
            cursor.execute("UPDATE usuario SET id_perfil = (SELECT id FROM perfil WHERE nome = 'COMUM') WHERE id_usuario = 2")
        resposta = self.client.put('/api/clientes/5/limite', json.dumps({'limite_credito': 500}),
                                   content_type='application/json', **headers)
        self.assertErro(resposta, 403, 'acesso_negado')

    def test_admin_acessa_dashboard_e_comum_recebe_403(self):
        self.assertEqual(self.client.get('/api/dashboard', **self.autenticar('gerente@loja.com')).status_code, 200)
        self.assertEqual(self.client.get('/api/dashboard', **self.autenticar('funcionario@loja.com')).status_code, 403)

    def test_seed_cria_ambos_os_perfis_com_hash_sem_duplicar_usuarios(self):
        from .seed_usuarios import gerar_usuarios

        gerar_usuarios()
        gerar_usuarios()
        with connection.cursor() as cursor:
            cursor.execute('''SELECT u.email, u.senha_hash, p.nome FROM usuario u
                              JOIN perfil p ON p.id = u.id_perfil
                              WHERE u.email IN ('admin@teste.com', 'comum@teste.com') ORDER BY u.email''')
            usuarios = cursor.fetchall()
        self.assertEqual(len(usuarios), 2)
        self.assertEqual([(email, perfil) for email, _, perfil in usuarios],
                         [('admin@teste.com', 'ADMIN'), ('comum@teste.com', 'COMUM')])
        for _, senha_hash, _ in usuarios:
            self.assertNotEqual(senha_hash, 'Fiad0@2026!')
            self.assertTrue(check_password('Fiad0@2026!', senha_hash))
