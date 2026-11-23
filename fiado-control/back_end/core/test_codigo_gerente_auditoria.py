"""Código do gerente (autorização de operações restritas) e consulta da auditoria."""

import datetime
import json
from importlib import import_module

import jwt
from django.conf import settings
from django.db import connection
from django.test import Client, TestCase

CODIGO = '123456'
OUTRO_CODIGO = '654321'


class BaseAutorizacao(TestCase):
    def setUp(self):
        self.client = Client()
        with connection.cursor() as cursor:
            cursor.execute(import_module('core.migrations.0009_codigo_gerente').SCHEMA_SQL)
            for perfil in ('ADMIN', 'COMUM'):
                cursor.execute('INSERT INTO perfil (nome) VALUES (%s) ON CONFLICT (nome) DO NOTHING', [perfil])
            ids = {}
            for nome, email, perfil in (('Gerente Teste', 'gerente_cg@teste.com', 'ADMIN'),
                                        ('Atendente Teste', 'atendente_cg@teste.com', 'COMUM'),
                                        ('Outro Atendente', 'outro_cg@teste.com', 'COMUM')):
                cursor.execute('SELECT id FROM perfil WHERE nome = %s', [perfil])
                cursor.execute(
                    'INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo) '
                    'VALUES (%s, %s, %s, %s, TRUE) RETURNING id_usuario',
                    [nome, email, 'hash', cursor.fetchone()[0]])
                ids[email] = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO cliente (nome, cpf, limite_credito) VALUES ('Cliente CG', '390.533.447-05', 100) "
                'RETURNING id_cliente')
            self.id_cliente = cursor.fetchone()[0]
        self.id_gerente = ids['gerente_cg@teste.com']
        self.id_atendente = ids['atendente_cg@teste.com']
        self.id_outro = ids['outro_cg@teste.com']
        self.gerente = self._bearer(self.id_gerente, 'gerente_cg@teste.com', 'ADMIN')
        self.atendente = self._bearer(self.id_atendente, 'atendente_cg@teste.com', 'COMUM')
        self.outro = self._bearer(self.id_outro, 'outro_cg@teste.com', 'COMUM')

    def _bearer(self, id_usuario, email, perfil):
        payload = {'id_usuario': id_usuario, 'email': email, 'perfil': perfil,
                   'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)}
        return {'HTTP_AUTHORIZATION': f"Bearer {jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')}"}

    def enviar(self, metodo, url, corpo=None, **cabecalhos):
        dados = json.dumps(corpo) if corpo is not None else None
        return getattr(self.client, metodo)(url, data=dados, content_type='application/json', **cabecalhos)

    def definir_codigo(self, codigo=CODIGO):
        resposta = self.enviar('put', '/api/configuracoes/codigo-gerente', {'codigo_novo': codigo}, **self.gerente)
        self.assertEqual(resposta.status_code, 200, resposta.content)

    def autorizar(self, auth, codigo=CODIGO):
        return self.enviar('post', '/api/autorizacoes/gerente', {'codigo': codigo}, **auth)

    def token(self, auth, codigo=CODIGO):
        resposta = self.autorizar(auth, codigo)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        return {'HTTP_X_AUTORIZACAO_GERENTE': resposta.json()['token_autorizacao']}

    def linhas(self, sql, parametros=()):
        with connection.cursor() as cursor:
            cursor.execute(sql, parametros)
            return cursor.fetchall()


class DefinirCodigoTests(BaseAutorizacao):
    def test_sem_codigo_informa_nao_definido_para_ambos_os_perfis(self):
        for auth in (self.gerente, self.atendente):
            resposta = self.client.get('/api/configuracoes/codigo-gerente', **auth)
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.json(), {'definido': False})

    def test_acesso_e_metodos(self):
        url = '/api/configuracoes/codigo-gerente'
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.enviar('put', url, {'codigo_novo': CODIGO}).status_code, 401)
        resposta = self.enviar('put', url, {'codigo_novo': CODIGO}, **self.atendente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (403, 'acesso_negado'))
        self.assertEqual(self.client.post(url, **self.gerente).status_code, 405)
        self.assertEqual(self.linhas('SELECT COUNT(*) FROM codigo_gerente'), [(0,)])

    def test_formato_do_codigo(self):
        url = '/api/configuracoes/codigo-gerente'
        for invalido in ('12345', '1234567', 'abcdef', '12 456', '', 123456, None, ['123456'], True):
            resposta = self.enviar('put', url, {'codigo_novo': invalido}, **self.gerente)
            self.assertEqual((resposta.status_code, resposta.json()['erro']), (400, 'codigo_invalido'), invalido)
        resposta = self.enviar('put', url, {}, **self.gerente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (400, 'campo_obrigatorio'))
        resposta = self.client.put(url, data='não é json', content_type='application/json', **self.gerente)
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(self.linhas('SELECT COUNT(*) FROM codigo_gerente'), [(0,)])

    def test_primeira_definicao_guarda_so_o_hash_e_audita_sem_o_codigo(self):
        self.definir_codigo()
        self.assertEqual(self.client.get('/api/configuracoes/codigo-gerente', **self.atendente).json(), {'definido': True})
        (guardado, autor), = self.linhas('SELECT codigo_hash, definido_por FROM codigo_gerente')
        self.assertNotIn(CODIGO, guardado)
        self.assertEqual(autor, self.id_gerente)
        auditoria = self.linhas("SELECT id_usuario, valores_anteriores::text, valores_novos::text, motivo "
                                "FROM auditoria_financeira WHERE operacao = 'codigo_gerente'")
        self.assertEqual(len(auditoria), 1)
        self.assertEqual(auditoria[0][0], self.id_gerente)
        self.assertNotIn(CODIGO, ' '.join(map(str, auditoria[0])))
        self.assertNotIn(guardado, ' '.join(map(str, auditoria[0])))

    def test_troca_exige_codigo_atual_correto(self):
        self.definir_codigo()
        url = '/api/configuracoes/codigo-gerente'
        resposta = self.enviar('put', url, {'codigo_novo': OUTRO_CODIGO}, **self.gerente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (422, 'codigo_atual_obrigatorio'))
        resposta = self.enviar('put', url, {'codigo_novo': OUTRO_CODIGO, 'codigo_atual': '000000'}, **self.gerente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (422, 'codigo_atual_invalido'))
        self.assertEqual(self.autorizar(self.atendente, CODIGO).status_code, 200)  # nada mudou

        resposta = self.enviar('put', url, {'codigo_novo': OUTRO_CODIGO, 'codigo_atual': CODIGO}, **self.gerente)
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(self.autorizar(self.atendente, CODIGO).status_code, 422)
        self.assertEqual(self.autorizar(self.atendente, OUTRO_CODIGO).status_code, 200)
        operacoes = self.linhas("SELECT motivo FROM auditoria_financeira WHERE operacao = 'codigo_gerente' ORDER BY id_auditoria")
        self.assertEqual([m for (m,) in operacoes], ['Código do gerente definido', 'Código do gerente alterado'])

    def test_troca_com_atual_de_formato_invalido_conta_como_falha(self):
        self.definir_codigo()
        resposta = self.enviar('put', '/api/configuracoes/codigo-gerente',
                               {'codigo_novo': OUTRO_CODIGO, 'codigo_atual': 'abc'}, **self.gerente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (422, 'codigo_atual_invalido'))
        self.assertEqual(self.linhas('SELECT tentativas_falhas FROM codigo_gerente'), [(1,)])


class AutorizarTests(BaseAutorizacao):
    def test_sem_codigo_definido(self):
        resposta = self.autorizar(self.atendente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (409, 'codigo_gerente_nao_definido'))

    def test_acesso_corpo_e_metodo(self):
        self.definir_codigo()
        url = '/api/autorizacoes/gerente'
        self.assertEqual(self.enviar('post', url, {'codigo': CODIGO}).status_code, 401)
        self.assertEqual(self.client.get(url, **self.atendente).status_code, 405)
        self.assertEqual(self.client.post(url, data='x', content_type='application/json', **self.atendente).status_code, 400)
        resposta = self.enviar('post', url, {}, **self.atendente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (400, 'campo_obrigatorio'))
        for invalido in ('12345', 'abcdef', 123456, None, [CODIGO]):
            resposta = self.enviar('post', url, {'codigo': invalido}, **self.atendente)
            self.assertEqual((resposta.status_code, resposta.json()['erro']), (422, 'codigo_gerente_invalido'), invalido)

    def test_codigo_correto_emite_token_para_gerente_e_funcionario(self):
        self.definir_codigo()
        for auth in (self.gerente, self.atendente):
            resposta = self.autorizar(auth)
            self.assertEqual(resposta.status_code, 200)
            corpo = resposta.json()
            self.assertIs(corpo['autorizado'], True)
            self.assertTrue(corpo['token_autorizacao'])
            self.assertEqual(corpo['expira_em_segundos'], 120)
        usos = self.linhas("SELECT id_usuario FROM auditoria_financeira WHERE operacao = 'autorizacao_gerente' ORDER BY id_auditoria")
        self.assertEqual(usos, [(self.id_gerente,), (self.id_atendente,)])

    def test_codigo_errado_e_422_sem_token(self):
        self.definir_codigo()
        resposta = self.autorizar(self.atendente, OUTRO_CODIGO)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (422, 'codigo_gerente_invalido'))
        self.assertNotIn('token_autorizacao', resposta.json())

    def test_bloqueio_apos_cinco_falhas_mesmo_com_codigo_certo(self):
        self.definir_codigo()
        for _ in range(4):
            self.assertEqual(self.autorizar(self.atendente, OUTRO_CODIGO).status_code, 422)
        self.assertEqual(self.autorizar(self.atendente, OUTRO_CODIGO).status_code, 422)  # 5ª falha ativa o bloqueio
        for codigo in (CODIGO, OUTRO_CODIGO):
            resposta = self.autorizar(self.atendente, codigo)
            self.assertEqual((resposta.status_code, resposta.json()['erro']), (429, 'codigo_gerente_bloqueado'))
            self.assertGreater(int(resposta['Retry-After']), 0)
            self.assertLessEqual(int(resposta['Retry-After']), 60)
        # O bloqueio vale também para tentar adivinhar o atual pela troca do código.
        resposta = self.enviar('put', '/api/configuracoes/codigo-gerente',
                               {'codigo_novo': OUTRO_CODIGO, 'codigo_atual': CODIGO}, **self.gerente)
        self.assertEqual(resposta.status_code, 429)

    def test_apos_o_bloqueio_expirar_o_codigo_certo_volta_a_valer_e_zera_o_contador(self):
        self.definir_codigo()
        for _ in range(5):
            self.autorizar(self.atendente, OUTRO_CODIGO)
        with connection.cursor() as cursor:
            cursor.execute("UPDATE codigo_gerente SET bloqueado_ate = NOW() - INTERVAL '1 second'")
        self.assertEqual(self.autorizar(self.atendente).status_code, 200)
        self.assertEqual(self.linhas('SELECT tentativas_falhas, bloqueado_ate FROM codigo_gerente'), [(0, None)])

    def test_acerto_zera_falhas_anteriores(self):
        self.definir_codigo()
        for _ in range(4):
            self.autorizar(self.atendente, OUTRO_CODIGO)
        self.assertEqual(self.autorizar(self.atendente).status_code, 200)
        for _ in range(4):  # recomeça do zero: mais quatro erros ainda não bloqueiam
            self.assertEqual(self.autorizar(self.atendente, OUTRO_CODIGO).status_code, 422)
        self.assertEqual(self.autorizar(self.atendente).status_code, 200)


class UsoDaAutorizacaoTests(BaseAutorizacao):
    """O token do código libera ao funcionário apenas as operações previstas."""

    def limite(self, auth, valor=250, **extra):
        return self.enviar('put', f'/api/clientes/{self.id_cliente}/limite', {'limite_credito': valor}, **auth, **extra)

    def test_funcionario_sem_token_continua_negado(self):
        resposta = self.limite(self.atendente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (403, 'acesso_negado'))
        resposta = self.limite(self.atendente, HTTP_X_AUTORIZACAO_GERENTE='')
        self.assertEqual(resposta.status_code, 403)

    def test_funcionario_com_token_altera_limite_e_a_auditoria_registra_quem_fez(self):
        self.definir_codigo()
        resposta = self.limite(self.atendente, 250, **self.token(self.atendente))
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(self.linhas('SELECT limite_credito FROM cliente WHERE id_cliente = %s', [self.id_cliente]), [(250,)])
        self.assertEqual(self.linhas("SELECT id_usuario FROM auditoria_credito WHERE operacao = 'alteracao_limite'"),
                         [(self.id_atendente,)])

    def test_token_de_outro_usuario_nao_serve(self):
        self.definir_codigo()
        resposta = self.limite(self.outro, 250, **self.token(self.atendente))
        self.assertEqual(resposta.status_code, 403)

    def test_token_invalido_expirado_ou_de_outra_natureza_nao_serve(self):
        self.definir_codigo()
        chave = f'{settings.SECRET_KEY}:autorizacao_gerente'
        agora = datetime.datetime.now(datetime.timezone.utc)
        expirado = jwt.encode({'tipo': 'autorizacao_gerente', 'id_usuario': self.id_atendente,
                               'exp': agora - datetime.timedelta(seconds=1)}, chave, algorithm='HS256')
        tipo_errado = jwt.encode({'tipo': 'login', 'id_usuario': self.id_atendente,
                                  'exp': agora + datetime.timedelta(minutes=1)}, chave, algorithm='HS256')
        sem_exp = jwt.encode({'tipo': 'autorizacao_gerente', 'id_usuario': self.id_atendente}, chave, algorithm='HS256')
        chave_errada = jwt.encode({'tipo': 'autorizacao_gerente', 'id_usuario': self.id_atendente,
                                   'exp': agora + datetime.timedelta(minutes=1)}, settings.SECRET_KEY, algorithm='HS256')
        bearer_de_login = self.atendente['HTTP_AUTHORIZATION'].split(' ', 1)[1]
        for token in (expirado, tipo_errado, sem_exp, chave_errada, bearer_de_login, 'lixo', 'a.b.c'):
            resposta = self.limite(self.atendente, 250, HTTP_X_AUTORIZACAO_GERENTE=token)
            self.assertEqual(resposta.status_code, 403, token)
        self.assertEqual(self.linhas('SELECT limite_credito FROM cliente WHERE id_cliente = %s', [self.id_cliente]), [(100,)])

    def test_token_nao_funciona_como_login(self):
        self.definir_codigo()
        token = self.token(self.atendente)['HTTP_X_AUTORIZACAO_GERENTE']
        resposta = self.client.get(f'/api/clientes/{self.id_cliente}/limite', HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(resposta.status_code, 401)

    def test_token_nao_libera_operacoes_fora_da_lista(self):
        self.definir_codigo()
        token = self.token(self.atendente)
        for metodo, url, corpo in (
            ('put', f'/api/clientes/{self.id_cliente}/credito/bloqueio', {'bloqueado': True}),
            ('put', '/api/configuracoes/', {'taxa_juros': 0.02, 'taxa_multa': 0.05}),
            ('get', '/api/usuarios', None),
            ('get', '/api/auditoria', None),
            ('put', '/api/produtos/1', {'nome': 'X', 'preco': 1}),
        ):
            resposta = self.enviar(metodo, url, corpo, **self.atendente, **token)
            self.assertEqual(resposta.status_code, 403, url)

    def test_token_libera_cadastro_de_usuario_mas_nao_a_listagem(self):
        self.definir_codigo()
        token = self.token(self.atendente)
        novo = {'nome': 'Novo Usuario', 'email': 'novo_cg@teste.com', 'senha': 'SenhaForte1', 'perfil': 'COMUM'}
        resposta = self.enviar('post', '/api/usuarios', novo, **self.atendente, **token)
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertEqual(self.enviar('post', '/api/usuarios', {**novo, 'email': 'x_cg@teste.com'}, **self.atendente).status_code, 403)

    def test_token_libera_cancelamento_e_estorno_ao_funcionario(self):
        self.definir_codigo()
        token = self.token(self.atendente)
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO venda (id_cliente, id_usuario, valor_total, modalidade, status) "
                "VALUES (%s, %s, 50, 'fiado', 'aprovada') RETURNING id_venda", [self.id_cliente, self.id_gerente])
            id_venda = cursor.fetchone()[0]
            cursor.execute("INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, status) "
                           "VALUES (%s, 50, CURRENT_DATE + 10, 'pendente')", [id_venda])
        sem = self.enviar('post', f'/api/vendas/{id_venda}/cancelar', {'motivo': 'Erro de lançamento'}, **self.atendente)
        self.assertEqual(sem.status_code, 403)
        com = self.enviar('post', f'/api/vendas/{id_venda}/cancelar', {'motivo': 'Erro de lançamento'}, **self.atendente, **token)
        self.assertEqual(com.status_code, 200, com.content)
        sem = self.enviar('post', '/api/pagamentos/999999/estornar', {'motivo': 'x'}, **self.atendente)
        self.assertEqual(sem.status_code, 403)
        com = self.enviar('post', '/api/pagamentos/999999/estornar', {'motivo': 'x'}, **self.atendente, **token)
        self.assertEqual((com.status_code, com.json()['erro']), (404, 'pagamento_nao_encontrado'))


class AuditoriaTests(BaseAutorizacao):
    URL = '/api/auditoria'

    def popular(self):
        self.definir_codigo()
        self.assertEqual(self.autorizar(self.atendente).status_code, 200)
        resposta = self.enviar('put', f'/api/clientes/{self.id_cliente}/limite',
                               {'limite_credito': 300, 'motivo': 'Renovação'}, **self.gerente)
        self.assertEqual(resposta.status_code, 200, resposta.content)

    def consultar(self, query='', auth=None):
        return self.client.get(self.URL + query, **(auth or self.gerente))

    def test_acesso_e_metodos(self):
        self.assertEqual(self.client.get(self.URL).status_code, 401)
        resposta = self.consultar(auth=self.atendente)
        self.assertEqual((resposta.status_code, resposta.json()['erro']), (403, 'acesso_negado'))
        self.assertEqual(self.client.post(self.URL, **self.gerente).status_code, 405)
        self.assertEqual(self.client.get(self.URL + '/', **self.gerente).status_code, 200)

    def test_sem_registros_devolve_lista_vazia(self):
        resposta = self.consultar()
        self.assertEqual((resposta.status_code, resposta.json()), (200, []))

    def test_reune_as_duas_trilhas_do_mais_recente_ao_mais_antigo(self):
        self.popular()
        registros = self.consultar().json()
        self.assertEqual({r['operacao'] for r in registros},
                         {'codigo_gerente', 'autorizacao_gerente', 'alteracao_limite'})
        self.assertEqual(len({r['id_auditoria'] for r in registros}), len(registros))
        datas = [r['data_hora'] for r in registros]
        self.assertEqual(datas, sorted(datas, reverse=True))
        limite = next(r for r in registros if r['operacao'] == 'alteracao_limite')
        self.assertEqual((limite['id_usuario'], limite['nome_usuario'], limite['id_recurso']),
                         (self.id_gerente, 'Gerente Teste', self.id_cliente))
        self.assertEqual((limite['valores_anteriores']['limite_credito'], limite['valores_novos']['limite_credito'],
                          limite['motivo']), (100, 300, 'Renovação'))
        for r in registros:
            for campo in ('id_auditoria', 'data_hora', 'id_usuario', 'nome_usuario', 'operacao', 'id_recurso',
                          'valores_anteriores', 'valores_novos', 'motivo'):
                self.assertIn(campo, r)

    def test_codigo_do_gerente_nunca_aparece(self):
        self.popular()
        texto = self.consultar().content.decode()
        self.assertNotIn(CODIGO, texto)
        self.assertNotIn('pbkdf2', texto)

    def test_filtros(self):
        self.popular()
        so_limite = self.consultar('?operacao=alteracao_limite').json()
        self.assertEqual([r['operacao'] for r in so_limite], ['alteracao_limite'])
        self.assertEqual(self.consultar('?operacao=inexistente').json(), [])
        do_atendente = self.consultar(f'?id_usuario={self.id_atendente}').json()
        self.assertEqual({r['id_usuario'] for r in do_atendente}, {self.id_atendente})
        self.assertEqual([r['operacao'] for r in do_atendente], ['autorizacao_gerente'])
        hoje = datetime.date.today()
        amanha = hoje + datetime.timedelta(days=2)
        ontem = hoje - datetime.timedelta(days=2)
        self.assertEqual(len(self.consultar(f'?data_inicio={ontem}&data_fim={amanha}').json()), 3)
        self.assertEqual(self.consultar(f'?data_inicio={amanha}').json(), [])
        self.assertEqual(self.consultar(f'?data_fim={ontem}').json(), [])
        combinado = self.consultar(f'?operacao=codigo_gerente&id_usuario={self.id_gerente}&data_inicio={ontem}').json()
        self.assertEqual(len(combinado), 1)
        self.assertEqual(len(self.consultar('?limite=1').json()), 1)

    def test_parametros_invalidos(self):
        for query in ('?data_inicio=2026-13-40', '?data_fim=ontem', '?data_inicio=2026-11-30&data_fim=2026-11-01',
                      '?id_usuario=abc', '?id_usuario=0', '?limite=0', '?limite=501', '?limite=x'):
            resposta = self.consultar(query)
            self.assertEqual((resposta.status_code, resposta.json()['erro']), (400, 'campo_invalido'), query)

    def test_injecao_em_operacao_e_tratada_como_texto(self):
        self.popular()
        resposta = self.consultar("?operacao=x'%20OR%20'1'='1")
        self.assertEqual((resposta.status_code, resposta.json()), (200, []))
