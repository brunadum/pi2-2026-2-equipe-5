import json
from datetime import date, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import sleep

from django.db import connection, connections, transaction
from django.test import Client, TransactionTestCase

SCHEMA_PATH = Path(__file__).resolve().parent.parent.parent.parent / "init-scripts" / "01-schema.sql"
SEED_PATH = Path(__file__).resolve().parent.parent.parent.parent / "init-scripts" / "02-seed.sql"


class RotasBase(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._reset_banco()

    def setUp(self):
        super().setUp()
        self._reset_banco()

    @classmethod
    def _reset_banco(cls):
        with connection.cursor() as cursor:
            cursor.execute("""
                DROP TABLE IF EXISTS recebimento CASCADE;
                DROP TABLE IF EXISTS configuracao CASCADE;
                DROP TABLE IF EXISTS pagamento CASCADE;
                DROP TABLE IF EXISTS venda CASCADE;
                DROP TABLE IF EXISTS cliente_telefone CASCADE;
                DROP TABLE IF EXISTS cliente CASCADE;
                DROP TABLE IF EXISTS usuario CASCADE;
            """)
            if SCHEMA_PATH.exists():
                cursor.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
            if SEED_PATH.exists():
                cursor.execute(SEED_PATH.read_text(encoding="utf-8"))

    def post(self, url, corpo):
        return self.client.post(url, json.dumps(corpo), content_type="application/json")

    def assertErro(self, resposta, status, codigo):
        self.assertEqual(resposta.status_code, status)
        corpo = resposta.json()
        self.assertEqual(corpo["erro"], codigo)
        self.assertTrue(corpo["mensagem"])


class ClientesTests(RotasBase):
    def test_lista_todos(self):
        r = self.client.get("/api/clientes")
        self.assertEqual(r.status_code, 200)
        lista = r.json()
        self.assertGreaterEqual(len(lista), 10)
        for c in lista:
            for campo in (
                "id_cliente",
                "nome",
                "cpf",
                "telefone",
                "limite_credito",
                "credito_bloqueado",
                "ativo",
            ):
                self.assertIn(campo, c)
            self.assertIsInstance(c["telefone"], list)

    def test_filtro_nome_cpf_telefone(self):
        self.assertGreaterEqual(len(self.client.get("/api/clientes?nome=maria").json()), 1)
        self.assertGreaterEqual(len(self.client.get("/api/clientes?cpf=12345678900").json()), 1)
        self.assertGreaterEqual(len(self.client.get("/api/clientes?telefone=88999990000").json()), 1)
        self.assertEqual(len(self.client.get("/api/clientes?nome=maria&cpf=98765432100").json()), 0)

    def test_busca_sem_resultado_devolve_lista_vazia(self):
        r = self.client.get("/api/clientes?nome=zzzz")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_cadastro_ok_nasce_com_limite_zero(self):
        r = self.post(
            "/api/clientes",
            {"nome": "Novo", "cpf": "999.888.777-66", "telefone": ["88900000000"]},
        )
        self.assertEqual(r.status_code, 201)
        c = r.json()
        self.assertEqual(c["limite_credito"], 0)
        self.assertFalse(c["credito_bloqueado"])
        self.assertTrue(c["ativo"])
        self.assertEqual(c["cpf"], "99988877766")

    def test_cadastro_campos_ausentes_lista_todos(self):
        r = self.post("/api/clientes", {"nome": "X"})
        self.assertErro(r, 400, "campo_obrigatorio")
        self.assertEqual(r.json()["campos"], ["cpf", "telefone"])

    def test_cadastro_cpf_duplicado(self):
        r = self.post("/api/clientes", {"nome": "X", "cpf": "12345678900", "telefone": ["1"]})
        self.assertErro(r, 422, "cpf_invalido")

    def test_cadastro_json_invalido(self):
        r = self.client.post("/api/clientes", "isso nao e json", content_type="application/json")
        self.assertErro(r, 400, "json_invalido")

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.delete("/api/clientes"), 405, "metodo_nao_permitido")


class SchemaIssue46Tests(RotasBase):
    def test_schema_novo_contem_campos_e_indices_sem_comando_adicional(self):
        # Executa apenas o schema oficial num namespace vazio do banco de testes.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('CREATE SCHEMA validacao_schema_issue46')
                cursor.execute('SET LOCAL search_path TO validacao_schema_issue46')
                cursor.execute(SCHEMA_PATH.read_text(encoding='utf-8'))
                cursor.execute("""
                    SELECT table_name, column_name FROM information_schema.columns
                    WHERE table_schema = 'validacao_schema_issue46'
                """)
                campos = set(cursor.fetchall())
                self.assertTrue({('cliente', 'credito_bloqueado'),
                                 ('recebimento', 'valor_juros'),
                                 ('recebimento', 'valor_multa')} <= campos)
                cursor.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'validacao_schema_issue46'")
                indices = {linha[0] for linha in cursor.fetchall()}
                self.assertTrue({'recebimento_parcela_idx', 'venda_cliente_idx', 'pagamento_venda_idx'} <= indices)
            transaction.set_rollback(True)


class ClienteDetalheTests(RotasBase):
    def test_detalhe_cliente_existente(self):
        r = self.client.get("/api/clientes/2")
        self.assertEqual(r.status_code, 200)
        c = r.json()
        self.assertEqual(c["id_cliente"], 2)
        self.assertEqual(c["nome"], "Maria Souza")
        self.assertEqual(c["cpf"], "12345678900")
        self.assertIn("88999990000", c["telefone"])
        self.assertEqual(c["limite_credito"], 500.00)

    def test_detalhe_cliente_inexistente(self):
        r = self.client.get("/api/clientes/999")
        self.assertErro(r, 404, "cliente_nao_encontrado")


class ClienteSaldoTests(RotasBase):
    def test_saldo_cliente_sem_atraso(self):
        r = self.client.get("/api/clientes/5/saldo")
        self.assertEqual(r.status_code, 200)
        s = r.json()
        self.assertEqual(s["id_cliente"], 5)
        self.assertEqual(s["saldo_devedor"], 0.0)
        self.assertEqual(s["limite_credito"], 1000.0)
        self.assertEqual(s["limite_disponivel"], 1000.0)
        self.assertFalse(s["possui_parcelas_atrasadas"])
        self.assertFalse(s["credito_bloqueado"])

    def test_saldo_cliente_inexistente(self):
        r = self.client.get("/api/clientes/999/saldo")
        self.assertErro(r, 404, "cliente_nao_encontrado")


class ClienteParcelasTests(RotasBase):
    def test_parcelas_cliente_com_calculos(self):
        r = self.client.get("/api/clientes/2/parcelas")
        self.assertEqual(r.status_code, 200)
        parcelas = r.json()
        self.assertGreaterEqual(len(parcelas), 2)
        for p in parcelas:
            for campo in (
                "id_parcela",
                "id_venda",
                "numero",
                "valor_parcela",
                "valor_pago",
                "saldo_parcela",
                "data_vencimento",
                "status",
                "dias_atraso",
                "juros",
                "multa",
                "valor_atualizado",
            ):
                self.assertIn(campo, p)

    def test_parcelas_filtro_status(self):
        r = self.client.get("/api/clientes/2/parcelas?status=pendente")
        self.assertEqual(r.status_code, 200)
        for p in r.json():
            self.assertEqual(p["status"], "pendente")

    def test_parcelas_status_invalido(self):
        r = self.client.get("/api/clientes/2/parcelas?status=invalido")
        self.assertErro(r, 400, "campo_invalido")

    def test_parcelas_cliente_inexistente(self):
        r = self.client.get("/api/clientes/999/parcelas")
        self.assertErro(r, 404, "cliente_nao_encontrado")


class VendasTests(RotasBase):
    def venda(self, **extra):
        corpo = {
            "id_cliente": 5,
            "modalidade": "a_prazo",
            "valor_total": 300.00,
            "quantidade_parcelas": 2,
            "data_primeiro_vencimento": "2026-11-05",
        }
        corpo.update(extra)
        return self.post("/api/vendas", corpo)

    def test_a_prazo_gera_parcelas_mensais(self):
        r = self.venda()
        self.assertEqual(r.status_code, 201)
        v = r.json()
        self.assertEqual(v["status"], "aprovada")
        self.assertEqual(v["data_venda"], date.today().isoformat())
        self.assertIn("id_usuario", v)
        self.assertEqual([p["valor_parcela"] for p in v["parcelas"]], [150.0, 150.0])
        self.assertEqual(
            [p["data_vencimento"] for p in v["parcelas"]],
            ["2026-11-05", "2026-12-05"],
        )
        self.assertEqual([p["numero"] for p in v["parcelas"]], [1, 2])

    def test_ultima_parcela_absorve_centavos(self):
        v = self.venda(valor_total=100.01, quantidade_parcelas=3).json()
        valores = [p["valor_parcela"] for p in v["parcelas"]]
        self.assertEqual(valores, [33.33, 33.33, 33.35])
        self.assertAlmostEqual(sum(valores), 100.01, places=2)

    def test_fiado_tem_uma_parcela(self):
        r = self.post(
            "/api/vendas",
            {
                "id_cliente": 5,
                "modalidade": "fiado",
                "valor_total": 50,
                "data_primeiro_vencimento": "2026-11-05",
            },
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()["parcelas"]), 1)

    def test_limite_excedido_devolve_rejeitada(self):
        r = self.venda(id_cliente=4, valor_total=50)
        self.assertEqual(r.status_code, 422)
        corpo = r.json()
        self.assertEqual(corpo["status"], "rejeitada")
        self.assertEqual(corpo["motivo"], "limite_credito_excedido")
        self.assertIn("id_venda", corpo)
        self.assertNotIn("erro", corpo)

    def test_parcela_atrasada_devolve_rejeitada(self):
        r = self.venda(id_cliente=3, valor_total=50)
        self.assertEqual(r.status_code, 422)
        corpo = r.json()
        self.assertEqual(corpo["status"], "rejeitada")
        self.assertEqual(corpo["motivo"], "parcelas_em_atraso")

    def test_a_prazo_sem_quantidade_parcelas(self):
        corpo = {
            "id_cliente": 5,
            "modalidade": "a_prazo",
            "valor_total": 50,
            "data_primeiro_vencimento": "2026-11-05",
        }
        self.assertErro(self.post("/api/vendas", corpo), 400, "campo_obrigatorio")

    def test_campo_obrigatorio_ausente(self):
        self.assertErro(self.post("/api/vendas", {"id_cliente": 5}), 400, "campo_obrigatorio")

    def test_campos_invalidos(self):
        self.assertErro(self.venda(modalidade="cartao"), 400, "campo_invalido")
        self.assertErro(self.venda(valor_total=0), 400, "campo_invalido")
        self.assertErro(self.venda(quantidade_parcelas=0), 400, "campo_invalido")
        self.assertErro(self.venda(data_primeiro_vencimento="05/10/2026"), 400, "campo_invalido")

    def test_cliente_inexistente(self):
        self.assertErro(self.venda(id_cliente=999), 404, "cliente_nao_encontrado")

    def test_consulta_vendas(self):
        r = self.client.get("/api/vendas")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.json()), 10)


class PagamentosTests(RotasBase):
    def setUp(self):
        super().setUp()
        # Estes testes tratam de principal sem encargos, independentemente do dia.
        with connection.cursor() as cursor:
            cursor.execute("UPDATE pagamento SET data_vencimento = %s WHERE id_pagamento = 1",
                           [date.today() + timedelta(days=30)])

    def test_baixa_total(self):
        # Parcela 1 (João Silva, 500.00 pendente)
        r = self.post("/api/pagamentos", {"id_parcela": 1, "valor_recebido": 500.00})
        self.assertEqual(r.status_code, 201)
        p = r.json()
        self.assertEqual(p["id_parcela"], 1)
        self.assertEqual(p["status_parcela"], "pago")
        self.assertEqual(p["saldo_parcela"], 0.0)
        self.assertEqual(p["data_pagamento"], date.today().isoformat())
        self.assertIn("id_pagamento", p)
        self.assertEqual(p["saldo_devedor_cliente"], 0.0)

    def test_baixa_parcial(self):
        # Parcela 1 (João Silva, 500.00 pendente)
        p = self.post("/api/pagamentos", {"id_parcela": 1, "valor_recebido": 200.00}).json()
        self.assertEqual(p["status_parcela"], "parcial")
        self.assertEqual(p["saldo_parcela"], 300.00)
        self.assertEqual(p["saldo_devedor_cliente"], 300.00)

    def test_valor_acima_do_devido(self):
        r = self.post("/api/pagamentos", {"id_parcela": 1, "valor_recebido": 9999.00})
        self.assertErro(r, 422, "valor_excede_devido")

    def test_parcela_inexistente(self):
        r = self.post("/api/pagamentos", {"id_parcela": 999, "valor_recebido": 10})
        self.assertErro(r, 404, "parcela_nao_encontrada")

    def test_parcela_ja_paga(self):
        # Parcela 5 já está paga no seed
        r = self.post("/api/pagamentos", {"id_parcela": 5, "valor_recebido": 50})
        self.assertErro(r, 422, "parcela_ja_paga")

    def test_campo_obrigatorio_e_valor_invalido(self):
        self.assertErro(self.post("/api/pagamentos", {"id_parcela": 1}), 400, "campo_obrigatorio")
        r = self.post("/api/pagamentos", {"id_parcela": 1, "valor_recebido": -5})
        self.assertErro(r, 400, "campo_invalido")

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.delete("/api/pagamentos"), 405, "metodo_nao_permitido")


class DashboardTests(RotasBase):
    def test_padrao_e_periodos(self):
        r = self.client.get("/api/dashboard")
        self.assertEqual(r.status_code, 200)
        corpo = r.json()
        self.assertEqual(corpo["periodo"], "mes")
        for campo in (
            "faturamento_total",
            "total_a_receber",
            "taxa_inadimplencia",
            "parcelas_vencidas",
            "parcelas_a_vencer",
        ):
            self.assertIn(campo, corpo)
        for periodo in ("dia", "semana", "mes"):
            r = self.client.get(f"/api/dashboard?periodo={periodo}")
            self.assertEqual(r.json()["periodo"], periodo)

    def test_filtro_dias(self):
        r_todos = self.client.get("/api/dashboard?dias=60").json()
        r_poucos = self.client.get("/api/dashboard?dias=1").json()
        self.assertGreaterEqual(
            len(r_todos["parcelas_a_vencer"]),
            len(r_poucos["parcelas_a_vencer"]),
        )

    def test_parametros_invalidos(self):
        self.assertErro(self.client.get("/api/dashboard?periodo=ano"), 400, "periodo_invalido")
        self.assertErro(self.client.get("/api/dashboard?dias=abc"), 400, "campo_invalido")
        self.assertErro(self.client.get("/api/dashboard?dias=0"), 400, "campo_invalido")

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.post("/api/dashboard"), 405, "metodo_nao_permitido")


class Issue46RegressaoTests(RotasBase):
    def setUp(self):
        super().setUp()
        with connection.cursor() as cursor:
            cursor.execute("UPDATE pagamento SET valor_parcela = 100, data_vencimento = %s, status = 'pendente' WHERE id_pagamento = 1",
                           [date.today() - timedelta(days=1)])

    def test_quita_valor_atualizado_com_encargos(self):
        parcela = self.client.get('/api/clientes/1/parcelas').json()[0]
        self.assertEqual(parcela['valor_atualizado'], 107.0)
        r = self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 107})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['status_parcela'], 'pago')
        self.assertEqual(self.client.get('/api/clientes/1/saldo').json()['saldo_devedor'], 0)

    def test_pagar_principal_nao_perdoa_encargos(self):
        r = self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 100})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['status_parcela'], 'parcial')
        self.assertEqual(r.json()['saldo_parcela'], 7)
        parcela = self.client.get('/api/clientes/1/parcelas').json()[0]
        self.assertEqual(parcela['valor_atualizado'], 7)
        self.assertEqual(self.client.get('/api/clientes/1/saldo').json()['saldo_devedor'], 7)
        self.assertEqual(self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 7}).json()['status_parcela'], 'pago')

    def test_saldo_e_dashboard_incluem_mesmos_encargos(self):
        antes = self.client.get('/api/dashboard').json()['total_a_receber']
        saldo = self.client.get('/api/clientes/1/saldo').json()['saldo_devedor']
        self.assertEqual(saldo, 107)
        self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 50})
        depois = self.client.get('/api/dashboard').json()['total_a_receber']
        self.assertAlmostEqual(antes - depois, 50, places=2)
        self.assertEqual(self.client.get('/api/clientes/1/saldo').json()['saldo_devedor'], 57)

    def test_id_fracionario_ou_booleano_nao_baixa_outra_parcela(self):
        for valor in (1.9, True, '1.9'):
            with self.subTest(valor=valor):
                self.assertErro(self.post('/api/pagamentos', {'id_parcela': valor, 'valor_recebido': 1}), 400, 'campo_invalido')

    def test_valores_sem_centavos_validos_sao_rejeitados(self):
        for valor in (0.001, 1.005, float('nan'), float('inf'), True):
            with self.subTest(valor=valor):
                self.assertErro(self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': valor}), 400, 'campo_invalido')

    def test_bloqueio_real_impede_venda(self):
        with connection.cursor() as cursor:
            cursor.execute('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS credito_bloqueado BOOLEAN NOT NULL DEFAULT FALSE')
            cursor.execute('UPDATE cliente SET credito_bloqueado = TRUE WHERE id_cliente = 5')
        self.assertTrue(self.client.get('/api/clientes/5').json()['credito_bloqueado'])
        self.assertTrue(next(c for c in self.client.get('/api/clientes').json() if c['id_cliente'] == 5)['credito_bloqueado'])
        r = self.post('/api/vendas', self._venda())
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()['motivo'], 'credito_bloqueado')

    def _venda(self, **extra):
        dados = {'id_cliente': 5, 'modalidade': 'a_prazo', 'valor_total': 80,
                 'quantidade_parcelas': 2, 'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat()}
        dados.update(extra)
        return dados

    def test_falha_segunda_parcela_desfaz_venda_inteira(self):
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM venda')
            antes = cursor.fetchone()[0]
        insercoes = 0

        def falhar(execute, sql, params, many, context):
            nonlocal insercoes
            if 'INSERT INTO pagamento ' in sql:
                insercoes += 1
                if insercoes == 2:
                    raise RuntimeError('falha simulada na segunda parcela')
            return execute(sql, params, many, context)

        with connection.execute_wrapper(falhar):
            with self.assertRaises(RuntimeError):
                self.post('/api/vendas', self._venda())
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM venda')
            self.assertEqual(cursor.fetchone()[0], antes)

    def test_data_fora_do_intervalo_nao_deixa_venda_incompleta(self):
        self.assertErro(self.post('/api/vendas', self._venda(data_primeiro_vencimento='9999-12-31')), 400, 'campo_invalido')

    def test_cadastro_telefone_invalido_nao_grava_cliente(self):
        r = self.post('/api/clientes', {'nome': 'Teste', 'cpf': '10120230344', 'telefone': ['1', '2' * 21]})
        self.assertErro(r, 400, 'campo_invalido')
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM cliente WHERE cpf = '10120230344'")
            self.assertEqual(cursor.fetchone()[0], 0)

    def _simultaneos(self, url, dados, insert):
        inicio = Barrier(2)

        def requisicao():
            try:
                inicio.wait(timeout=10)

                def atrasar(execute, sql, params, many, context):
                    if insert in sql:
                        sleep(0.15)
                    return execute(sql, params, many, context)

                with connections['default'].execute_wrapper(atrasar):
                    r = Client().post(url, json.dumps(dados), content_type='application/json')
                return r.status_code
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(requisicao)
            b = pool.submit(requisicao)
            return sorted([a.result(timeout=20), b.result(timeout=20)])

    def test_pagamentos_simultaneos_nao_excedem_divida(self):
        self.assertEqual(self._simultaneos('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 80},
                                          'INSERT INTO recebimento'), [201, 422])

    def test_vendas_simultaneas_nao_excedem_limite(self):
        with connection.cursor() as cursor:
            cursor.execute('UPDATE cliente SET limite_credito = 100 WHERE id_cliente = 5')
        self.assertEqual(self._simultaneos('/api/vendas', self._venda(), 'INSERT INTO venda'), [201, 422])

    def test_baixas_pequenas_nao_reaplicam_encargos(self):
        for valor, restante in ((1, 106), (6, 100), (100, 0)):
            r = self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': valor})
            self.assertEqual(r.status_code, 201)
            self.assertEqual(r.json()['saldo_parcela'], restante)
            self.assertEqual(self.client.get('/api/clientes/1/parcelas').json()[0]['valor_atualizado'], restante)

    def test_pagamento_antes_do_vencimento_reduz_base_dos_encargos(self):
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO recebimento (id_pagamento, valor_recebido, data_pagamento) VALUES (1, 60, %s)",
                           [date.today() - timedelta(days=2)])
        parcela = self.client.get('/api/clientes/1/parcelas').json()[0]
        self.assertEqual(parcela['saldo_parcela'], 40)
        self.assertEqual(parcela['juros'], 0.8)
        self.assertEqual(parcela['multa'], 2)
        self.assertEqual(parcela['valor_atualizado'], 42.8)
        self.assertEqual(self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 42.8}).json()['status_parcela'], 'pago')

    def test_falha_no_update_da_parcela_desfaz_recebimento(self):
        def falhar(execute, sql, params, many, context):
            if sql.startswith('UPDATE pagamento SET status'):
                raise RuntimeError('falha simulada na baixa')
            return execute(sql, params, many, context)
        with connection.execute_wrapper(falhar):
            with self.assertRaises(RuntimeError):
                self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 107})
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM recebimento')
            self.assertEqual(cursor.fetchone()[0], 0)
        self.assertEqual(self.client.get('/api/clientes/1/saldo').json()['saldo_devedor'], 107)

    def test_falha_telefone_desfaz_cliente(self):
        def falhar(execute, sql, params, many, context):
            if sql.startswith('INSERT INTO cliente_telefone'):
                raise RuntimeError('falha simulada no telefone')
            return execute(sql, params, many, context)
        with connection.execute_wrapper(falhar):
            with self.assertRaises(RuntimeError):
                self.post('/api/clientes', {'nome': 'Rollback', 'cpf': '12312312312', 'telefone': ['88999999999']})
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM cliente WHERE cpf = '12312312312'")
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_cadastros_simultaneos_mesmo_cpf(self):
        dados = {'nome': 'Concorrente', 'cpf': '123.123.123-12', 'telefone': ['88999999999']}
        self.assertEqual(self._simultaneos('/api/clientes', dados, 'INSERT INTO cliente '), [201, 422])

    def test_requisicoes_nao_criam_tabelas(self):
        def sem_ddl(execute, sql, params, many, context):
            self.assertFalse(sql.lstrip().upper().startswith(('CREATE ', 'ALTER ', 'DROP ')))
            return execute(sql, params, many, context)
        with connection.execute_wrapper(sem_ddl):
            for url in ('/api/clientes', '/api/clientes/1', '/api/clientes/1/saldo', '/api/clientes/1/parcelas', '/api/dashboard'):
                self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.post('/api/vendas', self._venda()).status_code, 201)
            self.assertEqual(self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 1}).status_code, 201)
            self.assertEqual(self.post('/api/clientes', {'nome': 'DDL', 'cpf': '12312312312', 'telefone': ['88999999999']}).status_code, 201)

    def test_vendas_rejeitam_identificadores_e_valores_invalidos(self):
        for extra in ({'id_cliente': True}, {'id_cliente': 'x'}, {'id_cliente': 5.9},
                      {'valor_total': 0.001}, {'valor_total': float('inf')},
                      {'valor_total': 0.01, 'quantidade_parcelas': 2},
                      {'data_primeiro_vencimento': '20261105'}):
            with self.subTest(extra=extra):
                self.assertErro(self.post('/api/vendas', self._venda(**extra)), 400, 'campo_invalido')

    def test_fim_do_mes_mantem_intervalos_mensais(self):
        r = self.post('/api/vendas', self._venda(data_primeiro_vencimento='2028-01-31', quantidade_parcelas=3))
        self.assertEqual(r.status_code, 201)
        self.assertEqual([p['data_vencimento'] for p in r.json()['parcelas']], ['2028-01-31', '2028-02-29', '2028-03-31'])


class RegrasNegocioTests(RotasBase):
    """Critérios RN01–RN03 da issue #47 sobre transações reais PostgreSQL."""

    def venda(self, valor=100, **extra):
        dados = {'id_cliente': 5, 'modalidade': 'a_prazo', 'valor_total': valor,
                 'quantidade_parcelas': 2,
                 'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat()}
        dados.update(extra)
        return self.post('/api/vendas', dados)

    def saldo(self):
        resposta = self.client.get('/api/clientes/5/saldo')
        self.assertEqual(resposta.status_code, 200)
        return resposta.json()

    def assertRejeitada(self, resposta, motivo):
        self.assertEqual(resposta.status_code, 422)
        corpo = resposta.json()
        self.assertEqual(corpo['status'], 'rejeitada')
        self.assertEqual(corpo['motivo'], motivo)
        self.assertIn('id_venda', corpo)
        self.assertNotIn('erro', corpo)
        with connection.cursor() as cursor:
            cursor.execute('SELECT status, motivo_rejeicao FROM venda WHERE id_venda = %s', [corpo['id_venda']])
            self.assertEqual(cursor.fetchone(), ('rejeitada', motivo))
            cursor.execute('SELECT COUNT(*) FROM pagamento WHERE id_venda = %s', [corpo['id_venda']])
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_rn01_compara_valor_com_limite_disponivel_apos_venda(self):
        self.assertEqual(self.venda(900).status_code, 201)
        antes = self.saldo()
        self.assertEqual(antes['saldo_devedor'], 900)
        self.assertEqual(antes['limite_disponivel'], 100)
        self.assertRejeitada(self.venda(100.01), 'limite_credito_excedido')
        self.assertEqual(self.saldo(), antes)

    def test_rn01_permite_venda_exatamente_no_limite_disponivel(self):
        self.assertEqual(self.venda(900).status_code, 201)
        self.assertEqual(self.venda(100).status_code, 201)
        self.assertEqual(self.saldo()['limite_disponivel'], 0)
        self.assertEqual(self.saldo()['saldo_devedor'], 1000)

    def test_rn02_usa_vencimento_real_mesmo_com_status_pendente(self):
        venda = self.venda().json()
        with connection.cursor() as cursor:
            cursor.execute("UPDATE pagamento SET data_vencimento = %s, status = 'pendente' WHERE id_pagamento = %s",
                           [date.today() - timedelta(days=1), venda['parcelas'][0]['id_parcela']])
        antes = self.saldo()
        self.assertTrue(antes['possui_parcelas_atrasadas'])
        self.assertGreater(antes['limite_disponivel'], 1)
        self.assertRejeitada(self.venda(1), 'parcelas_em_atraso')
        self.assertEqual(self.saldo(), antes)

    def test_rn02_parcela_que_vence_hoje_nao_bloqueia_venda(self):
        venda = self.venda().json()
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET data_vencimento = %s WHERE id_venda = %s',
                           [date.today(), venda['id_venda']])
        self.assertFalse(self.saldo()['possui_parcelas_atrasadas'])
        self.assertEqual(self.venda(1).status_code, 201)

    def test_rn02_parcial_vencida_bloqueia_ate_quitacao(self):
        venda = self.venda().json()
        pid = venda['parcelas'][0]['id_parcela']
        with connection.cursor() as cursor:
            cursor.execute('UPDATE pagamento SET data_vencimento = %s WHERE id_pagamento = %s',
                           [date.today() - timedelta(days=1), pid])
        parcial = self.post('/api/pagamentos', {'id_parcela': pid, 'valor_recebido': 20})
        self.assertEqual(parcial.status_code, 201)
        self.assertTrue(self.saldo()['possui_parcelas_atrasadas'])
        self.assertRejeitada(self.venda(1), 'parcelas_em_atraso')
        restante = parcial.json()['saldo_parcela']
        total = self.post('/api/pagamentos', {'id_parcela': pid, 'valor_recebido': restante})
        self.assertEqual(total.status_code, 201)
        self.assertFalse(self.saldo()['possui_parcelas_atrasadas'])
        self.assertEqual(self.venda(1).status_code, 201)

    def test_rn03_saldo_e_limite_mudam_apos_venda_parcial_e_quitacao(self):
        self.assertEqual(self.saldo()['saldo_devedor'], 0)
        venda = self.venda(300).json()
        self.assertEqual(self.saldo()['saldo_devedor'], 300)
        self.assertEqual(self.saldo()['limite_disponivel'], 700)
        pid = venda['parcelas'][0]['id_parcela']
        parcial = self.post('/api/pagamentos', {'id_parcela': pid, 'valor_recebido': 50})
        self.assertEqual(parcial.status_code, 201)
        self.assertEqual(parcial.json()['saldo_devedor_cliente'], 250)
        self.assertEqual(self.saldo()['saldo_devedor'], 250)
        self.assertEqual(self.saldo()['limite_disponivel'], 750)
        self.assertEqual(self.post('/api/pagamentos', {'id_parcela': pid, 'valor_recebido': 100}).status_code, 201)
        self.assertEqual(self.saldo()['saldo_devedor'], 150)
        self.assertEqual(self.saldo()['limite_disponivel'], 850)

    def saldo_em_outra_conexao(self):
        def consultar():
            try:
                return Client().get('/api/clientes/5/saldo').json()['saldo_devedor']
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(consultar).result(timeout=10)

    def test_rn03_venda_atualiza_saldo_dentro_da_mesma_transacao(self):
        observados = []
        parcelas_inseridas = 0

        def observar(execute, sql, params, many, context):
            nonlocal parcelas_inseridas
            resultado = execute(sql, params, many, context)
            if 'INSERT INTO pagamento ' in sql:
                parcelas_inseridas += 1
                if parcelas_inseridas == 2:
                    self.assertTrue(connection.in_atomic_block)
                    observados.append(self.saldo()['saldo_devedor'])
                    self.assertEqual(self.saldo_em_outra_conexao(), 0)
            return resultado

        with connection.execute_wrapper(observar):
            self.assertEqual(self.venda().status_code, 201)
        self.assertEqual(observados, [100])
        self.assertEqual(self.saldo_em_outra_conexao(), 100)

    def test_rn03_pagamento_atualiza_saldo_dentro_da_mesma_transacao(self):
        venda = self.venda().json()
        pid = venda['parcelas'][0]['id_parcela']
        observados = []

        def observar(execute, sql, params, many, context):
            resultado = execute(sql, params, many, context)
            if sql.startswith('UPDATE pagamento SET status'):
                self.assertTrue(connection.in_atomic_block)
                observados.append(self.saldo()['saldo_devedor'])
                self.assertEqual(self.saldo_em_outra_conexao(), 100)
            return resultado

        with connection.execute_wrapper(observar):
            resposta = self.post('/api/pagamentos', {'id_parcela': pid, 'valor_recebido': 20})
        self.assertEqual(resposta.status_code, 201)
        self.assertEqual(observados, [80])
        self.assertEqual(resposta.json()['saldo_devedor_cliente'], 80)
        self.assertEqual(self.saldo_em_outra_conexao(), 80)
