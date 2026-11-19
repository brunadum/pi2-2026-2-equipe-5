from django.urls import path

from . import views
from . import credito
from . import documentacao
from . import configuracoes, relatorios, produtos, descontos, operacoes_financeiras


urlpatterns = [
    path('produtos', produtos.produtos),
    path('produtos/', produtos.produtos),
    path('produtos/<str:id_produto>', produtos.produtos),
    path('produtos/<str:id_produto>/', produtos.produtos),
    path('pagamentos/<str:id_parcela>/desconto', descontos.desconto),
    path('pagamentos/<str:id_parcela>/desconto/', descontos.desconto),
    path('configuracoes/cobranca', configuracoes.cobranca),
    path('configuracoes/cobranca/', configuracoes.cobranca),
    path('configuracoes', configuracoes.sistema),
    path('configuracoes/', configuracoes.sistema),
    path('relatorios/<str:tipo>/exportar', relatorios.relatorio, {'exportar': True}),
    path('relatorios/<str:tipo>/exportar/', relatorios.relatorio, {'exportar': True}),
    path('relatorios/<str:tipo>', relatorios.relatorio),
    path('relatorios/<str:tipo>/', relatorios.relatorio),
    path("openapi.json", documentacao.openapi, name="api-openapi"),
    path("docs/", documentacao.swagger, name="api-docs"),
    path("clientes/<str:id_cliente>/credito/bloqueio", credito.bloqueio),
    path("clientes/<str:id_cliente>/credito/bloqueio/", credito.bloqueio),
    path("clientes/<str:id_cliente>/limite", credito.limite),
    path("clientes/<str:id_cliente>/limite/", credito.limite),
    path('login/', views.login_usuario, name='login'),
    path("clientes", views.clientes),
    path("clientes/", views.clientes),
    path("clientes/<str:id_cliente>", views.cliente_detalhe),
    path("clientes/<str:id_cliente>/", views.cliente_detalhe),
    path("clientes/<str:id_cliente>/saldo", views.cliente_saldo),
    path("clientes/<str:id_cliente>/saldo/", views.cliente_saldo),
    path("clientes/<str:id_cliente>/historico", views.cliente_historico),
    path("clientes/<str:id_cliente>/historico/", views.cliente_historico),
    path("clientes/<str:id_cliente>/parcelas", views.cliente_parcelas),
    path("clientes/<str:id_cliente>/parcelas/", views.cliente_parcelas),
    path("vendas", views.vendas),
    path("vendas/", views.vendas),
    path("vendas/<str:id_venda>/cancelar", operacoes_financeiras.cancelar_venda),
    path("vendas/<str:id_venda>/cancelar/", operacoes_financeiras.cancelar_venda),
    path("pagamentos", views.pagamentos),
    path("pagamentos/", views.pagamentos),
    path("pagamentos/<str:id_pagamento>/estornar", operacoes_financeiras.estornar_pagamento),
    path("pagamentos/<str:id_pagamento>/estornar/", operacoes_financeiras.estornar_pagamento),
    path("dashboard", views.dashboard),
    path("dashboard/", views.dashboard),
]