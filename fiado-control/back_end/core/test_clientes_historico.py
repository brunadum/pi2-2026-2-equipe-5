import datetime
import json
from decimal import Decimal
import jwt
from django.conf import settings
from django.db import connection
from django.test import Client, TestCase


class ClienteEdicaoHistoricoTests(TestCase):
    def setUp(self):
        self.client = Client()
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO perfil (nome) VALUES ('ADMIN') ON CONFLICT (nome) DO NOTHING")
            cursor.execute("SELECT id FROM perfil WHERE nome = 'ADMIN'")
            id_perfil = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo) "
                "VALUES ('Admin Teste', 'admin_hist@teste.com', 'hash', %s, TRUE) RETURNING id_usuario",
                [id_perfil],
            )
            self.id_usuario = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO cliente (nome, cpf, limite_credito, ativo) "
                "VALUES ('Maria Antiga', '52998224725', 500.00, TRUE) RETURNING id_cliente"
            )
            self.id_cliente = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO cliente_telefone (id_cliente, numero) VALUES (%s, '88999990000')",
                [self.id_cliente],
            )

            cursor.execute(
                "INSERT INTO venda (id_cliente, id_usuario, data_venda, valor_total, modalidade, status) "
                "VALUES (%s, %s, '2026-09-05 10:00:00', 300.00, 'a_prazo', 'aprovada') RETURNING id_venda",
                [self.id_cliente, self.id_usuario],
            )
            id_venda = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, status) "
                "VALUES (%s, 150.00, '2026-10-05', 'pendente') RETURNING id_pagamento",
                [id_venda],
            )
            id_parcela = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO recebimento (id_pagamento, valor_recebido, data_pagamento, id_usuario) "
                "VALUES (%s, 90.00, '2026-09-20', %s)",
                [id_parcela, self.id_usuario],
            )

        payload = {
            "id_usuario": self.id_usuario,
            "email": "admin_hist@teste.com",
            "perfil": "ADMIN",
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_put_cliente_atualiza_nome_e_telefones_sem_exigir_cpf(self):
        resp = self.client.put(
            f"/api/clientes/{self.id_cliente}",
            data=json.dumps({"nome": "Maria Souza", "telefone": ["88999990000", "8833330000"]}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["nome"], "Maria Souza")
        self.assertEqual(body["telefone"], ["88999990000", "8833330000"])
        self.assertEqual(Decimal(str(body["limite_credito"])), Decimal("500.00"))

    def test_historico_retorna_movimentacoes_ordenadas_e_filtra_por_periodo(self):
        resp = self.client.get(f"/api/clientes/{self.id_cliente}/historico", **self.auth)
        self.assertEqual(resp.status_code, 200)
        itens = resp.json()
        self.assertEqual(len(itens), 2)
        self.assertEqual(itens[0]["tipo"], "pagamento")
        self.assertEqual(itens[0]["valor"], 90.0)
        self.assertEqual(itens[1]["tipo"], "venda")

        resp_filtrado = self.client.get(
            f"/api/clientes/{self.id_cliente}/historico?data_inicio=2026-09-10&data_fim=2026-09-30",
            **self.auth,
        )
        self.assertEqual(resp_filtrado.status_code, 200)
        self.assertEqual(len(resp_filtrado.json()), 1)
        self.assertEqual(resp_filtrado.json()[0]["tipo"], "pagamento")

    def test_historico_exige_autenticacao_e_valida_cliente_inexistente(self):
        resp_401 = self.client.get(f"/api/clientes/{self.id_cliente}/historico")
        self.assertEqual(resp_401.status_code, 401)

        resp_404 = self.client.get("/api/clientes/999999/historico", **self.auth)
        self.assertEqual(resp_404.status_code, 404)