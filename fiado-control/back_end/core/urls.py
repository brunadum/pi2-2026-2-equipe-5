from django.urls import path

from . import views

urlpatterns = [
    path("clientes", views.clientes),
    path("vendas", views.vendas),
    path("pagamentos", views.pagamentos),
    path("dashboard", views.dashboard),
]