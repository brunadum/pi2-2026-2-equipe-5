import datetime
import json
from decimal import Decimal
import jwt
from django.conf import settings
from django.db import connection
from django.test import Client, TestCase


class CancelamentoEstornoTests(TestCase):
    def setUp(self):
        self.client = Client()
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO perfil (nome) VALUES ('ADMIN') ON CONFLICT (nome) DO NOTHING")
            cursor.execute("INSERT INTO perfil (nome) VALUES ('COMUM') ON CONFLICT (nome) DO NOTHING")

            cursor.execute("SELECT id FROM perfil WHERE nome = 'ADMIN'")
            id_admin = cursor.fetchone()[0]
            cursor.execute("SELECT id FROM perfil WHERE nome = 'COMUM'")
            id_comum = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo) "
                "VALUES ('Gerente Teste', 'ger_canc@teste.com', 'hash', %s, TRUE) RETURNING id_usuario",
                [id_admin],
            )
            self.id_gerente = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo) "
                "VALUES ('Operador Teste', 'op_canc@teste.com', 'hash', %s, TRUE) RETURNING id_usuario",
                [id_comum],
            )
            self.id_operador = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO cliente (nome, cpf, limite_credito, ativo) "
                "VALUES ('Carlos Lima', '52998224725', 1000.00, TRUE) RETURNING id_cliente"
            )
            self.id_cliente = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO venda (id_cliente, id_usuario, data_venda, valor_total, modalidade, status) "
                "VALUES (%s, %s, CURRENT_TIMESTAMP, 200.00, 'fiado', 'aprovada') RETURNING id_venda",
                [self.id_cliente, self.id_gerente],
            )
            self.id_venda = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, status) "
                "VALUES (%s, 200.00, CURRENT_DATE + INTERVAL '10 days', 'pendente') RETURNING id_pagamento",
                [self.id_venda],
            )
            self.id_parcela = cursor.fetchone()[0]

        self.auth_gerente = self._token(self.id_gerente, "ger_canc@teste.com", "ADMIN")
        self.auth_operador = self._token(self.id_operador, "op_canc@teste.com", "COMUM")

    def _token(self, id_usuario, email, perfil):
        payload = {
            "id_usuario": id_usuario,
            "email": email,
            "perfil": perfil,
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        }
        return {"HTTP_AUTHORIZATION": f"Bearer {jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')}"}

    def test_cancelar_venda_sem_pagamentos_libera_saldo_e_audita(self):
        resp = self.client.post(
            f"/api/vendas/{self.id_venda}/cancelar",
            data=json.dumps({"motivo": "Erro de lançamento"}),
            content_type="application/json",
            **self.auth_gerente,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["status"], "cancelada")
        self.assertEqual(Decimal(str(body["saldo_devedor_cliente"])), Decimal("0.00"))

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT operacao, motivo FROM auditoria_financeira WHERE id_recurso = %s AND operacao = 'cancelamento_venda'",
                [self.id_venda],
            )
            self.assertEqual(cursor.fetchone(), ("cancelamento_venda", "Erro de lançamento"))

    def test_nao_permite_cancelar_venda_com_pagamento_ativo_e_estorna_depois(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO recebimento (id_pagamento, valor_recebido, data_pagamento, id_usuario) "
                "VALUES (%s, 200.00, CURRENT_DATE, %s) RETURNING id_recebimento",
                [self.id_parcela, self.id_gerente],
            )
            id_recebimento = cursor.fetchone()[0]
            cursor.execute("UPDATE pagamento SET status = 'pago', data_pagamento = CURRENT_DATE WHERE id_pagamento = %s", [self.id_parcela])

        # Tentar cancelar venda com pagamento deve falhar com 422
        resp_bloqueado = self.client.post(
            f"/api/vendas/{self.id_venda}/cancelar",
            data=json.dumps({"motivo": "Tentativa indevida"}),
            content_type="application/json",
            **self.auth_gerente,
        )
        self.assertEqual(resp_bloqueado.status_code, 422)

        # Estornar o pagamento reabre o saldo da parcela e registra auditoria
        resp_estorno = self.client.post(
            f"/api/pagamentos/{id_recebimento}/estornar",
            data=json.dumps({"motivo": "Estorno Pix duplicado"}),
            content_type="application/json",
            **self.auth_gerente,
        )
        self.assertEqual(resp_estorno.status_code, 200)
        self.assertEqual(resp_estorno.json()["status_parcela"], "pendente")
        self.assertEqual(Decimal(str(resp_estorno.json()["saldo_devedor_cliente"])), Decimal("200.00"))

        resp_cancela = self.client.post(
            f"/api/vendas/{self.id_venda}/cancelar",
            data=json.dumps({"motivo": "Cancelamento após estorno"}),
            content_type="application/json",
            **self.auth_gerente,
        )
        self.assertEqual(resp_cancela.status_code, 200)

    def test_permissao_e_validacao_motivo(self):
        resp_403 = self.client.post(
            f"/api/vendas/{self.id_venda}/cancelar",
            data=json.dumps({"motivo": "Teste"}),
            content_type="application/json",
            **self.auth_operador,
        )
        self.assertEqual(resp_403.status_code, 403)

        resp_400 = self.client.post(
            f"/api/vendas/{self.id_venda}/cancelar",
            data=json.dumps({}),
            content_type="application/json",
            **self.auth_gerente,
        )
        self.assertEqual(resp_400.status_code, 400)