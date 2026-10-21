import json
import tempfile
from datetime import date, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import sleep

from django.db import connection, connections, transaction
from django.test import Client, TransactionTestCase

TEMP_DIR = Path(tempfile.gettempdir()) / "init-scripts"
TEMP_DIR.mkdir(parents=True, exist_ok=True)
SCHEMA_PATH = TEMP_DIR / "01-schema.sql"

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
        schema_sql = """
        CREATE TABLE usuario (
            id_usuario SERIAL PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('gerente', 'funcionario')),
            ativo BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE cliente (
            id_cliente SERIAL PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            cpf VARCHAR(14) UNIQUE NOT NULL,
            limite_credito DECIMAL(10,2) DEFAULT 0.00,
            credito_bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
            ativo BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE cliente_telefone (
            id_telefone SERIAL PRIMARY KEY,
            id_cliente INT NOT NULL,
            numero VARCHAR(20) NOT NULL,
            FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE
        );

        CREATE TABLE venda (
            id_venda SERIAL PRIMARY KEY,
            id_cliente INT NOT NULL,
            id_usuario INT NOT NULL,
            data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            valor_total DECIMAL(10,2) NOT NULL,
            modalidade VARCHAR(20) NOT NULL CHECK (modalidade IN ('fiado', 'a_prazo')),
            status VARCHAR(20) DEFAULT 'aprovada' CHECK (status IN ('aprovada', 'rejeitada', 'pendente_autorizacao')),
            motivo_rejeicao VARCHAR(100),
            autorizado_por INT,
            FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
            FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
            FOREIGN KEY (autorizado_por) REFERENCES usuario(id_usuario)
        );

        CREATE TABLE pagamento (
            id_pagamento SERIAL PRIMARY KEY,
            id_venda INT NOT NULL,
            valor_parcela DECIMAL(10,2) NOT NULL,
            data_vencimento DATE NOT NULL,
            data_pagamento DATE,
            status VARCHAR(20) NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')),
            FOREIGN KEY (id_venda) REFERENCES venda(id_venda) ON DELETE CASCADE
        );

        CREATE TABLE configuracao (
            id_configuracao SERIAL PRIMARY KEY,
            taxa_juros DECIMAL(5,2) NOT NULL,
            taxa_multa DECIMAL(5,2) NOT NULL,
            definido_por INT NOT NULL,
            FOREIGN KEY (definido_por) REFERENCES usuario(id_usuario)
        );

        CREATE TABLE recebimento (
            id_recebimento SERIAL PRIMARY KEY,
            id_pagamento INT NOT NULL,
            valor_recebido DECIMAL(10,2) NOT NULL,
            valor_juros DECIMAL(10,2) NOT NULL DEFAULT 0,
            valor_multa DECIMAL(10,2) NOT NULL DEFAULT 0,
            data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
            id_usuario INT,
            FOREIGN KEY (id_pagamento) REFERENCES pagamento(id_pagamento) ON DELETE CASCADE,
            FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
        );

        CREATE INDEX recebimento_parcela_idx ON recebimento (id_pagamento);
        CREATE INDEX venda_cliente_idx ON venda (id_cliente);
        CREATE INDEX pagamento_venda_idx ON pagamento (id_venda);
        """

        # 2. O Seed dentro da sua própria variável com aspas triplas
        seed_sql = """
        INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES 
        ('Carlos Funcionario', 'funcionario@loja.com', 'hash123', 'funcionario'),
        ('Maria Gerente', 'gerente@loja.com', 'hash123', 'gerente'),
        ('Ana Vendedora', 'ana@loja.com', 'hash123', 'funcionario');

        INSERT INTO cliente (nome, cpf, limite_credito) VALUES 
        ('João Silva', '111.111.111-11', 1500.00),          
        ('Maria Souza', '12345678900', 500.00),             -- Cliente base da documentação da API
        ('João Lima', '333.333.333-33', 800.00),            -- Cliente para teste de atraso no dashboard
        ('Cliente Sem Limite', '222.222.222-22', 0.00),     -- Para testar venda rejeitada
        ('Pedro Alves', '444.444.444-44', 1000.00),
        ('Lucas Mendes', '555.555.555-55', 1200.00),
        ('Fernanda Costa', '666.666.666-66', 300.00),
        ('Camila Rocha', '777.777.777-77', 2000.00),
        ('Bruno Santos', '888.888.888-88', 600.00),
        ('Amanda Ribeiro', '999.999.999-99', 400.00);

        INSERT INTO cliente_telefone (id_cliente, numero) VALUES 
        (1, '88999991111'),
        (2, '88999990000'),
        (2, '8833330000'), 
        (3, '88999993333'),
        (4, '88999994444'),
        (5, '88999995555'),
        (6, '88999996666'),
        (7, '88999997777'),
        (8, '88999998888'),
        (9, '88999999999'),
        (10, '88999990001');

        INSERT INTO venda (id_cliente, id_usuario, valor_total, modalidade, status, motivo_rejeicao, autorizado_por) VALUES 
        (1, 1, 500.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 1: Gera a parcela do CT-002
        (2, 1, 300.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 2: Maria Souza (API)
        (3, 1, 120.00, 'fiado', 'aprovada', NULL, NULL),                   -- Venda 3: João Lima (API atrasados)
        (4, 1, 300.00, 'fiado', 'rejeitada', 'limite_credito_excedido', NULL), -- Venda 4: Rejeitada automática
        (5, 3, 150.00, 'fiado', 'aprovada', NULL, NULL),                   -- Venda 5: Venda normal
        (6, 3, 800.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 6: Venda normal
        (7, 1, 400.00, 'fiado', 'rejeitada', 'limite_credito_excedido', NULL), -- Venda 7: Rejeitada que ficará assim
        (7, 1, 400.00, 'fiado', 'aprovada', NULL, 2),                      -- Venda 8: Exceção aprovada pelo Gerente (id 2)
        (8, 1, 1000.00, 'a_prazo', 'aprovada', NULL, NULL),                -- Venda 9: Venda normal
        (9, 3, 50.00, 'fiado', 'aprovada', NULL, NULL);                    -- Venda 10: Venda normal

        INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, data_pagamento, status) VALUES 
        (1, 500.00, '2026-10-10', NULL, 'pendente'),             
        (2, 150.00, '2026-10-05', NULL, 'pendente'),             
        (2, 150.00, '2026-11-05', NULL, 'pendente'),             
        (3, 120.00, '2026-09-10', NULL, 'atrasado'),             
        (5, 150.00, '2026-09-20', '2026-09-20', 'pago'),         
        (6, 400.00, '2026-10-15', NULL, 'pendente'),             
        (6, 400.00, '2026-11-15', NULL, 'pendente'),             
        (8, 400.00, '2026-10-01', NULL, 'pendente'),             
        (9, 500.00, '2026-08-01', '2026-08-01', 'pago'),         
        (9, 500.00, '2026-09-01', NULL, 'atrasado'),             
        (10, 50.00, '2026-09-25', NULL, 'pendente');

        INSERT INTO configuracao (taxa_juros, taxa_multa, definido_por) VALUES 
        (0.02, 0.05, 2);
        """

        SCHEMA_PATH.write_text(schema_sql, encoding="utf-8")

        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
            
            if schema_sql.strip() and not schema_sql.strip().startswith("-- COLE"):
                cursor.execute(schema_sql)
            if seed_sql.strip() and not seed_sql.strip().startswith("-- COLE"):
                cursor.execute(seed_sql)

            cursor.execute("""
                SELECT setval('usuario_id_usuario_seq', COALESCE((SELECT MAX(id_usuario) FROM usuario), 1));
                SELECT setval('cliente_id_cliente_seq', COALESCE((SELECT MAX(id_cliente) FROM cliente), 1));
                SELECT setval('cliente_telefone_id_telefone_seq', COALESCE((SELECT MAX(id_telefone) FROM cliente_telefone), 1));
                SELECT setval('venda_id_venda_seq', COALESCE((SELECT MAX(id_venda) FROM venda), 1));
                SELECT setval('pagamento_id_pagamento_seq', COALESCE((SELECT MAX(id_pagamento) FROM pagamento), 1));
                SELECT setval('recebimento_id_recebimento_seq', COALESCE((SELECT MAX(id_recebimento) FROM recebimento), 1));
                SELECT setval('configuracao_id_configuracao_seq', COALESCE((SELECT MAX(id_configuracao) FROM configuracao), 1));
            """)

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
            {"nome": "Novo", "cpf": "529.982.247-25", "telefone": ["88900000000"]},
        )
        self.assertEqual(r.status_code, 201)
        c = r.json()
        self.assertEqual(c["limite_credito"], 0)
        self.assertFalse(c["credito_bloqueado"])
        self.assertTrue(c["ativo"])
        self.assertEqual(c["cpf"], "52998224725")

    def test_cadastro_campos_ausentes_lista_todos(self):
        r = self.post("/api/clientes", {"nome": "X"})
        self.assertErro(r, 400, "campo_obrigatorio")
        self.assertEqual(r.json()["campos"], ["cpf", "telefone"])

    def test_cadastro_cpf_duplicado(self):
        r = self.post("/api/clientes", {"nome": "X", "cpf": "12345678900", "telefone": ["88999990000"]})
        self.assertErro(r, 409, "cpf_duplicado")

    def test_cadastro_json_invalido(self):
        r = self.client.post("/api/clientes", "isso nao e json", content_type="application/json")
        self.assertErro(r, 400, "json_invalido")

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.delete("/api/clientes"), 405, "metodo_nao_permitido")


class SchemaIssue46Tests(RotasBase):
    def test_schema_novo_contem_campos_e_indices_sem_comando_adicional(self):
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
        with connection.cursor() as cursor:
            cursor.execute("UPDATE pagamento SET data_vencimento = %s WHERE id_pagamento = 1",
                           [date.today() + timedelta(days=30)])

    def test_baixa_total(self):
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
        self.assertErro(r, 400, 'telefone_invalido')
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
                self.post('/api/clientes', {'nome': 'Rollback', 'cpf': '52998224725', 'telefone': ['88999999999']})
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM cliente WHERE cpf = '52998224725'")
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_cadastros_simultaneos_mesmo_cpf(self):
        dados = {'nome': 'Concorrente', 'cpf': '529.982.247-25', 'telefone': ['88999999999']}
        self.assertEqual(self._simultaneos('/api/clientes', dados, 'INSERT INTO cliente '), [201, 409])

    def test_requisicoes_nao_criam_tabelas(self):
        def sem_ddl(execute, sql, params, many, context):
            self.assertFalse(sql.lstrip().upper().startswith(('CREATE ', 'ALTER ', 'DROP ')))
            return execute(sql, params, many, context)
        with connection.execute_wrapper(sem_ddl):
            for url in ('/api/clientes', '/api/clientes/1', '/api/clientes/1/saldo', '/api/clientes/1/parcelas', '/api/dashboard'):
                self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.post('/api/vendas', self._venda()).status_code, 201)
            self.assertEqual(self.post('/api/pagamentos', {'id_parcela': 1, 'valor_recebido': 1}).status_code, 201)
            self.assertEqual(self.post('/api/clientes', {'nome': 'DDL', 'cpf': '52998224725', 'telefone': ['88999999999']}).status_code, 201)

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


class ValidacoesEntradasTests(RotasBase):
    def cliente(self, **extra):
        dados = {'nome': 'Cliente Valido', 'cpf': '529.982.247-25', 'telefone': ['(88) 99999-0000']}
        dados.update(extra)
        return self.post('/api/clientes', dados)

    def venda(self, **extra):
        dados = {'id_cliente': 5, 'modalidade': 'a_prazo', 'valor_total': 100,
                 'quantidade_parcelas': 2,
                 'data_primeiro_vencimento': (date.today() + timedelta(days=30)).isoformat()}
        dados.update(extra)
        return self.post('/api/vendas', dados)

    def test_cpf_invalido_nao_cadastra(self):
        for cpf in ('00000000000', '52998224724', '123', 'abc52998224725', '５２９９８２２４７２５', True):
            with self.subTest(cpf=cpf):
                self.assertErro(self.cliente(cpf=cpf), 422, 'cpf_invalido')
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM cliente')
            self.assertEqual(cursor.fetchone()[0], 10)

    def test_cpf_valido_com_e_sem_mascara_tem_mesma_identidade(self):
        r = self.cliente()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['cpf'], '52998224725')
        self.assertErro(self.cliente(cpf='52998224725'), 409, 'cpf_duplicado')

    def test_cpf_duplicado_do_seed_retorna_conflito(self):
        self.assertErro(self.cliente(cpf='111.111.111-11'), 409, 'cpf_duplicado')

    def test_telefone_invalido_nao_cadastra(self):
        for telefone in (['123'], ['sem telefone'], ['88999990000abc'], [None], [99999999999], ['(00) 99999-0000'], ['(88 99999-0000']):
            with self.subTest(telefone=telefone):
                self.assertErro(self.cliente(telefone=telefone), 400, 'telefone_invalido')

    def test_normaliza_telefones_validos_e_remove_duplicados(self):
        r = self.cliente(telefone=['(88) 99999-0000', '+55 (88) 99999-0000', '8833330000'])
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['telefone'], ['88999990000', '8833330000'])

    def test_nome_em_branco_e_campos_ausentes(self):
        r = self.cliente(nome='   ')
        self.assertErro(r, 400, 'campo_obrigatorio')
        self.assertIn('nome', r.json()['campos'])
        self.assertErro(self.cliente(nome='X' * 101), 400, 'campo_invalido')

    def test_identificadores_invalidos_retornam_json_nas_tres_consultas(self):
        for valor in ('abc', '0', '-1', '2147483648', '1.5'):
            for sufixo in ('', '/saldo', '/parcelas'):
                with self.subTest(valor=valor, sufixo=sufixo):
                    self.assertErro(self.client.get(f'/api/clientes/{valor}{sufixo}'), 400, 'campo_invalido')

    def test_filtros_invalidos_de_clientes(self):
        for query in ('cpf=abc', 'cpf=123456789012', 'telefone=abc', 'telefone=12345678901234', 'nome=' + 'x' * 101):
            with self.subTest(query=query):
                self.assertErro(self.client.get('/api/clientes?' + query), 400, 'campo_invalido')

    def test_filtros_parciais_e_formatados_continuam_funcionando(self):
        self.assertEqual(len(self.client.get('/api/clientes?cpf=111.111.111-11').json()), 1)
        self.assertGreater(len(self.client.get('/api/clientes?telefone=8899').json()), 0)

    def test_vencimento_passado_retorna_422_sem_gravar_venda(self):
        self.assertErro(self.venda(data_primeiro_vencimento=(date.today() - timedelta(days=1)).isoformat()), 422, 'vencimento_invalido')
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM venda')
            self.assertEqual(cursor.fetchone()[0], 10)

    def test_vencimento_hoje_e_permitido(self):
        self.assertEqual(self.venda(data_primeiro_vencimento=date.today().isoformat()).status_code, 201)

    def test_fiado_rejeita_multiplas_parcelas(self):
        for quantidade in (2, True, 1.5, '1', 0):
            with self.subTest(quantidade=quantidade):
                self.assertErro(self.venda(modalidade='fiado', quantidade_parcelas=quantidade), 400, 'campo_invalido')

    def test_venda_rejeita_valor_e_quantidade_incoerentes(self):
        for campos in ({'valor_total': 0}, {'valor_total': -1}, {'valor_total': 1.001},
                       {'valor_total': True}, {'valor_total': '100'},
                       {'valor_total': 0.01, 'quantidade_parcelas': 2},
                       {'quantidade_parcelas': 1.5}, {'quantidade_parcelas': True},
                       {'data_primeiro_vencimento': '2026-02-30'}):
            with self.subTest(campos=campos):
                self.assertErro(self.venda(**campos), 400, 'campo_invalido')

    def test_pagamento_invalido_nao_grava_recebimento(self):
        for dados in ({'id_parcela': 1, 'valor_recebido': 0}, {'id_parcela': 1, 'valor_recebido': -1},
                      {'id_parcela': 1, 'valor_recebido': 0.001}, {'id_parcela': True, 'valor_recebido': 1}):
            with self.subTest(dados=dados):
                self.assertErro(self.post('/api/pagamentos', dados), 400, 'campo_invalido')
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM recebimento')
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_corpos_nao_objeto_e_json_malformado(self):
        for rota in ('/api/clientes', '/api/vendas', '/api/pagamentos'):
            for corpo in ('[]', 'null', '{', '"texto"'):
                with self.subTest(rota=rota, corpo=corpo):
                    self.assertErro(self.client.post(rota, corpo, content_type='application/json'), 400, 'json_invalido')

    def test_expoente_json_fora_do_intervalo_nao_retorna_500(self):
        for rota in ('/api/clientes', '/api/vendas', '/api/pagamentos'):
            for numero in ('1e9999999999999999999', '1e-9999999999999999999'):
                with self.subTest(rota=rota, numero=numero):
                    corpo = '{"extra":' + numero + '}'
                    self.assertErro(self.client.post(rota, corpo, content_type='application/json'), 400, 'json_invalido')

    def test_filtros_invalidos_na_listagem_de_vendas(self):
        for query in ('id_cliente=x', 'status=invalido', 'modalidade=cartao',
                      'data_inicio=2026-02-30', 'data_inicio=2026-10-20&data_fim=2026-10-01'):
            with self.subTest(query=query):
                self.assertErro(self.client.get('/api/vendas?' + query), 400, 'campo_invalido')

    def test_filtros_validos_da_listagem_de_vendas(self):
        self.assertEqual(self.client.get('/api/vendas?id_cliente=999999').json(), [])
        r = self.client.get('/api/vendas?status=rejeitada&modalidade=fiado')
        self.assertEqual(r.status_code, 200)
        self.assertGreater(len(r.json()), 0)
        self.assertTrue(all(v['status'] == 'rejeitada' and v['modalidade'] == 'fiado' for v in r.json()))

    def test_dashboard_rejeita_periodo_e_janela_invalidos(self):
        self.assertErro(self.client.get('/api/dashboard?periodo=ano'), 400, 'periodo_invalido')
        for dias in ('0', '-1', '1.5', 'abc', '99999999999999999999'):
            with self.subTest(dias=dias):
                self.assertErro(self.client.get('/api/dashboard?dias=' + dias), 400, 'campo_invalido')
