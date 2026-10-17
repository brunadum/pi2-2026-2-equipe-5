from django.urls import path

from . import views
from .login import login

urlpatterns = [
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
