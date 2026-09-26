from django.urls import path

from . import views

urlpatterns = [
    path("clientes", views.clientes),
    path("vendas", views.vendas),
    path("vendas/<int:id_venda>/pagamentos", views.pagamentos),
]