import json
from datetime import date, timedelta

from django.test import SimpleTestCase


class RotasBase(SimpleTestCase):
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
        self.assertGreaterEqual(len(lista), 3)
        for c in lista:
            for campo in ("id_cliente", "nome", "cpf", "telefone", "limite_credito",
                          "credito_bloqueado", "ativo"):
                self.assertIn(campo, c)
            self.assertIsInstance(c["telefone"], list)

    def test_filtro_nome_cpf_telefone(self):
        self.assertEqual(len(self.client.get("/api/clientes?nome=maria").json()), 1)
        self.assertEqual(len(self.client.get("/api/clientes?cpf=12345678900").json()), 1)
        self.assertEqual(len(self.client.get("/api/clientes?telefone=88999990000").json()), 1)
        self.assertEqual(len(self.client.get("/api/clientes?nome=maria&cpf=98765432100").json()), 0)

    def test_busca_sem_resultado_devolve_lista_vazia(self):
        r = self.client.get("/api/clientes?nome=zzzz")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_cadastro_ok_nasce_com_limite_zero(self):
        r = self.post("/api/clientes", {"nome": "Novo", "cpf": "999.888.777-66",
                                         "telefone": ["88900000000"]})
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


class VendasTests(RotasBase):
    def venda(self, **extra):
        corpo = {"id_cliente": 1, "modalidade": "a_prazo", "valor_total": 300.00,
                 "quantidade_parcelas": 2, "data_primeiro_vencimento": "2026-10-05"}
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
        self.assertEqual([p["data_vencimento"] for p in v["parcelas"]],
                         ["2026-10-05", "2026-11-05"])
        self.assertEqual([p["numero"] for p in v["parcelas"]], [1, 2])

    def test_ultima_parcela_absorve_centavos(self):
        v = self.venda(id_cliente=4, valor_total=100.01, quantidade_parcelas=3).json()
        valores = [p["valor_parcela"] for p in v["parcelas"]]
        self.assertEqual(valores, [33.33, 33.33, 33.35])
        self.assertAlmostEqual(sum(valores), 100.01, places=2)

    def test_vencimento_dia_31_cai_no_ultimo_dia_do_mes(self):
        v = self.venda(id_cliente=4, quantidade_parcelas=2,
                       data_primeiro_vencimento="2026-01-31").json()
        self.assertEqual(v["parcelas"][1]["data_vencimento"], "2026-02-28")

    def test_fiado_tem_uma_parcela(self):
        r = self.post("/api/vendas", {"id_cliente": 1, "modalidade": "fiado",
                                       "valor_total": 50, "data_primeiro_vencimento": "2026-10-05"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()["parcelas"]), 1)

    def test_id_venda_nao_pula_numero(self):
        a = self.venda().json()["id_venda"]
        b = self.venda().json()["id_venda"]
        self.assertEqual(b, a + 1)

    def test_limite_excedido_devolve_rejeitada(self):
        r = self.venda(id_cliente=3, valor_total=999)
        self.assertEqual(r.status_code, 422)
        corpo = r.json()
        self.assertEqual(corpo["status"], "rejeitada")
        self.assertEqual(corpo["motivo"], "limite_credito_excedido")
        self.assertIn("id_venda", corpo)
        self.assertNotIn("erro", corpo)

    def test_a_prazo_sem_quantidade_parcelas(self):
        corpo = {"id_cliente": 1, "modalidade": "a_prazo", "valor_total": 50,
                 "data_primeiro_vencimento": "2026-10-05"}
        self.assertErro(self.post("/api/vendas", corpo), 400, "campo_obrigatorio")

    def test_campo_obrigatorio_ausente(self):
        self.assertErro(self.post("/api/vendas", {"id_cliente": 1}), 400, "campo_obrigatorio")

    def test_campos_invalidos(self):
        self.assertErro(self.venda(modalidade="cartao"), 400, "campo_invalido")
        self.assertErro(self.venda(valor_total=0), 400, "campo_invalido")
        self.assertErro(self.venda(quantidade_parcelas=0), 400, "campo_invalido")
        self.assertErro(self.venda(data_primeiro_vencimento="05/10/2026"), 400, "campo_invalido")

    def test_cliente_inexistente(self):
        self.assertErro(self.venda(id_cliente=99), 404, "cliente_nao_encontrado")

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.get("/api/vendas"), 405, "metodo_nao_permitido")


class PagamentosTests(RotasBase):
    def test_baixa_total(self):
        r = self.post("/api/pagamentos", {"id_parcela": 10, "valor_recebido": 90.00})
        self.assertEqual(r.status_code, 201)
        p = r.json()
        self.assertEqual(p["id_parcela"], 10)
        self.assertEqual(p["status_parcela"], "pago")
        self.assertEqual(p["saldo_parcela"], 0)
        self.assertEqual(p["saldo_devedor_cliente"], 320.00)
        self.assertEqual(p["data_pagamento"], date.today().isoformat())
        self.assertIn("id_pagamento", p)

    def test_baixa_parcial(self):
        p = self.post("/api/pagamentos", {"id_parcela": 10, "valor_recebido": 40}).json()
        self.assertEqual(p["status_parcela"], "parcial")
        self.assertEqual(p["saldo_parcela"], 50.00)
        self.assertEqual(p["saldo_devedor_cliente"], 370.00)

    def test_valor_acima_do_devido(self):
        r = self.post("/api/pagamentos", {"id_parcela": 10, "valor_recebido": 100})
        self.assertErro(r, 422, "valor_excede_devido")

    def test_parcela_inexistente(self):
        r = self.post("/api/pagamentos", {"id_parcela": 99, "valor_recebido": 10})
        self.assertErro(r, 404, "parcela_nao_encontrada")

    def test_campo_obrigatorio_e_valor_invalido(self):
        self.assertErro(self.post("/api/pagamentos", {"id_parcela": 10}), 400, "campo_obrigatorio")
        r = self.post("/api/pagamentos", {"id_parcela": 10, "valor_recebido": -5})
        self.assertErro(r, 400, "campo_invalido")

    def test_rota_antiga_nao_existe_mais(self):
        r = self.post("/api/vendas/1/pagamentos", {"id_pagamento": 10, "valor_recebido": 90})
        self.assertEqual(r.status_code, 404)

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.get("/api/pagamentos"), 405, "metodo_nao_permitido")


class DashboardTests(RotasBase):
    def test_padrao_e_periodos(self):
        r = self.client.get("/api/dashboard")
        self.assertEqual(r.status_code, 200)
        corpo = r.json()
        self.assertEqual(corpo["periodo"], "mes")
        for campo in ("faturamento_total", "total_a_receber", "taxa_inadimplencia",
                      "parcelas_vencidas", "parcelas_a_vencer"):
            self.assertIn(campo, corpo)
        for periodo in ("dia", "semana", "mes"):
            r = self.client.get(f"/api/dashboard?periodo={periodo}")
            self.assertEqual(r.json()["periodo"], periodo)

    def test_datas_relativas_a_hoje(self):
        corpo = self.client.get("/api/dashboard").json()
        atrasada = corpo["parcelas_vencidas"][0]
        esperado = date.today() - timedelta(days=atrasada["dias_atraso"])
        self.assertEqual(atrasada["data_vencimento"], esperado.isoformat())
        for p in corpo["parcelas_a_vencer"]:
            self.assertGreater(date.fromisoformat(p["data_vencimento"]), date.today())

    def test_filtro_dias(self):
        self.assertEqual(len(self.client.get("/api/dashboard?dias=7").json()["parcelas_a_vencer"]), 2)
        self.assertEqual(len(self.client.get("/api/dashboard?dias=4").json()["parcelas_a_vencer"]), 1)

    def test_parametros_invalidos(self):
        self.assertErro(self.client.get("/api/dashboard?periodo=ano"), 400, "periodo_invalido")
        self.assertErro(self.client.get("/api/dashboard?dias=abc"), 400, "campo_invalido")
        self.assertErro(self.client.get("/api/dashboard?dias=0"), 400, "campo_invalido")

    def test_rota_antiga_nao_existe_mais(self):
        self.assertEqual(self.client.get("/api/dashboard/totais").status_code, 404)

    def test_metodo_nao_permitido(self):
        self.assertErro(self.client.post("/api/dashboard"), 405, "metodo_nao_permitido")