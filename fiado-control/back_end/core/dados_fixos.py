# Dados fixos da Sprint 2. 
# Serão substituídos pela consulta ao banco na integração.

CLIENTES = [
    {
        "id_cliente": 1,
        "nome": "Maria Souza",
        "cpf": "12345678900",
        "telefone": ["88999990000"],
        "limite_credito": 500.00,
        "ativo": True,
    },
    {
        "id_cliente": 2,
        "nome": "Ana Pereira",
        "cpf": "98765432100",
        "telefone": ["88988887777", "8833330000"],
        "limite_credito": 300.00,
        "ativo": True,
    },
    {
        "id_cliente": 3,
        "nome": "João Lima",
        "cpf": "11122233344",
        "telefone": ["88977776666"],
        "limite_credito": 200.00,
        "ativo": True,
    },
    {
        "id_cliente": 4,
        "nome": "Carlos Mendes",
        "cpf": "55566677788",
        "telefone": ["88966665555"],
        "limite_credito": 800.00,
        "ativo": True,
    },
]

PARCELAS_PENDENTES = [
    {
        "id_venda": 1,
        "id_pagamento": 10,
        "id_cliente": 1,
        "valor_parcela": 90.00,
        "saldo_devedor_cliente": 410.00,
    },
    {
        "id_venda": 2,
        "id_pagamento": 11,
        "id_cliente": 2,
        "valor_parcela": 150.00,
        "saldo_devedor_cliente": 150.00,
    },
]