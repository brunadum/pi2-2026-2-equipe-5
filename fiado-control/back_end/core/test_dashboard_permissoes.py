from django.conf import settings
from django.test import override_settings

from .tests import RotasBase


@override_settings(
    MIDDLEWARE=[
        *settings.MIDDLEWARE,
        "core.test_credito.IdentidadeTesteMiddleware",
    ]
)
class DashboardPermissoesTests(RotasBase):

    @override_settings(CREDITO_TESTE_USUARIO=2)
    def test_gerente_pode_acessar_dashboard(self):
        resposta = self.client.get("/api/dashboard")
        self.assertEqual(resposta.status_code, 200)

    @override_settings(CREDITO_TESTE_USUARIO=1)
    def test_funcionario_nao_pode_acessar_dashboard(self):
        resposta = self.client.get("/api/dashboard")
        self.assertEqual(resposta.status_code, 403)

    def test_usuario_nao_autenticado_nao_pode_acessar_dashboard(self):
        resposta = self.client.get("/api/dashboard")
        self.assertEqual(resposta.status_code, 401)