import datetime
import json
import jwt
from django.conf import settings
from django.db import connection
from django.test import Client, TestCase


class GestaoUsuariosTests(TestCase):
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
                "VALUES ('Admin Master', 'admin_usr@teste.com', 'hash', %s, TRUE) RETURNING id_usuario",
                [id_admin],
            )
            self.id_admin = cursor.fetchone()[0]

            cursor.execute(
                "INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo) "
                "VALUES ('Operador Loja', 'op_usr@teste.com', 'hash', %s, TRUE) RETURNING id_usuario",
                [id_comum],
            )
            self.id_comum = cursor.fetchone()[0]

        self.auth_admin = self._token(self.id_admin, "admin_usr@teste.com", "ADMIN")
        self.auth_comum = self._token(self.id_comum, "op_usr@teste.com", "COMUM")

    def _token(self, id_usuario, email, perfil):
        payload = {
            "id_usuario": id_usuario,
            "email": email,
            "perfil": perfil,
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        }
        return {"HTTP_AUTHORIZATION": f"Bearer {jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')}"}

    def test_criar_listar_e_login_novo_usuario(self):
        resp_post = self.client.post(
            "/api/usuarios",
            data=json.dumps({
                "nome": "Novo Atendente",
                "email": "novo@teste.com",
                "senha": "SenhaForte123",
                "perfil": "COMUM",
            }),
            content_type="application/json",
            **self.auth_admin,
        )
        self.assertEqual(resp_post.status_code, 201)
        novo_id = resp_post.json()["id_usuario"]

        resp_login = self.client.post(
            "/api/login/",
            data=json.dumps({"email": "novo@teste.com", "senha": "SenhaForte123"}),
            content_type="application/json",
        )
        self.assertEqual(resp_login.status_code, 200)
        self.assertEqual(resp_login.json()["perfil"], "COMUM")

        resp_get = self.client.get("/api/usuarios", **self.auth_admin)
        self.assertEqual(resp_get.status_code, 200)
        emails = [u["email"] for u in resp_get.json()["usuarios"]]
        self.assertIn("novo@teste.com", emails)

        # Editar perfil e desativar usuário
        resp_put = self.client.put(
            f"/api/usuarios/{novo_id}",
            data=json.dumps({"perfil": "ADMIN", "ativo": False}),
            content_type="application/json",
            **self.auth_admin,
        )
        self.assertEqual(resp_put.status_code, 200)
        self.assertEqual(resp_put.json()["perfil"], "ADMIN")
        self.assertFalse(resp_put.json()["ativo"])

    def test_bloqueia_acesso_comum_e_auto_bloqueio_admin(self):
        resp_403 = self.client.get("/api/usuarios", **self.auth_comum)
        self.assertEqual(resp_403.status_code, 403)

        resp_422 = self.client.put(
            f"/api/usuarios/{self.id_admin}",
            data=json.dumps({"ativo": False}),
            content_type="application/json",
            **self.auth_admin,
        )
        self.assertEqual(resp_422.status_code, 422)