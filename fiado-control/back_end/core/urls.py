from django.urls import path

from . import views
from . import credito
from . import documentacao
from .login import login

urlpatterns = [
    path("openapi.json", documentacao.openapi, name="api-openapi"),
    path("docs/", documentacao.swagger, name="api-docs"),
    path("clientes/<str:id_cliente>/credito/bloqueio", credito.bloqueio),
    path("clientes/<str:id_cliente>/credito/bloqueio/", credito.bloqueio),
    path("clientes/<str:id_cliente>/limite", credito.limite),
    path("clientes/<str:id_cliente>/limite/", credito.limite),
    path("login/",login),
    path("clientes", views.clientes),
    path("clientes/", views.clientes),
    path("clientes/<str:id_cliente>", views.cliente_detalhe),
    path("clientes/<str:id_cliente>/", views.cliente_detalhe),
    path("clientes/<str:id_cliente>/saldo", views.cliente_saldo),
    path("clientes/<str:id_cliente>/saldo/", views.cliente_saldo),
    path("clientes/<str:id_cliente>/parcelas", views.cliente_parcelas),
    path("clientes/<str:id_cliente>/parcelas/", views.cliente_parcelas),
    path("vendas", views.vendas),
    path("vendas/", views.vendas),
    path("pagamentos", views.pagamentos),
    path("pagamentos/", views.pagamentos),
    path("dashboard", views.dashboard),
    path("dashboard/", views.dashboard),
]
