from django.urls import path

from . import views

urlpatterns = [
    path("clientes", views.clientes),
    path("clientes/", views.clientes),
    path("clientes/<int:id_cliente>", views.cliente_detalhe),
    path("clientes/<int:id_cliente>/", views.cliente_detalhe),
    path("clientes/<int:id_cliente>/saldo", views.cliente_saldo),
    path("clientes/<int:id_cliente>/saldo/", views.cliente_saldo),
    path("clientes/<int:id_cliente>/parcelas", views.cliente_parcelas),
    path("clientes/<int:id_cliente>/parcelas/", views.cliente_parcelas),
    path("vendas", views.vendas),
    path("vendas/", views.vendas),
    path("pagamentos", views.pagamentos),
    path("pagamentos/", views.pagamentos),
    path("dashboard", views.dashboard),
    path("dashboard/", views.dashboard),
]