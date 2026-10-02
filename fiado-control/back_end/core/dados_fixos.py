# Dados fixos da Sprint 2.
# Serão substituídos pela consulta ao banco na integração.

# Usuário que "registrou" as vendas enquanto não há autenticação.
ID_USUARIO_FIXO = 3

CLIENTES = [
    {
        "id_cliente": 1,
        "nome": "Maria Souza",
        "cpf": "12345678900",
        "telefone": ["88999990000"],
        "limite_credito": 500.00,
        "credito_bloqueado": False,
        "ativo": True,
    },
    {
        "id_cliente": 2,
        "nome": "Ana Pereira",
        "cpf": "98765432100",
        "telefone": ["88988887777", "8833330000"],
        "limite_credito": 300.00,
        "credito_bloqueado": False,
        "ativo": True,
    },
    {
        "id_cliente": 3,
        "nome": "João Lima",
        "cpf": "11122233344",
        "telefone": ["88977776666"],
        "limite_credito": 200.00,
        "credito_bloqueado": False,
        "ativo": True,
    },
    {
        "id_cliente": 4,
        "nome": "Carlos Mendes",
        "cpf": "55566677788",
        "telefone": ["88966665555"],
        "limite_credito": 800.00,
        "credito_bloqueado": False,
        "ativo": True,
    },
]

# Parcelas em aberto. "saldo_devedor_cliente" é o saldo do cliente ANTES do
# pagamento; a resposta de POST /pagamentos desconta o valor recebido.
PARCELAS_PENDENTES = [
    {
        "id_parcela": 10,
        "id_venda": 1,
        "id_cliente": 1,
        "valor_parcela": 90.00,
        "saldo_devedor_cliente": 410.00,
    },
    {
        "id_parcela": 11,
        "id_venda": 2,
        "id_cliente": 2,
        "valor_parcela": 150.00,
        "saldo_devedor_cliente": 150.00,
    },
]

TOTAIS_POR_PERIODO = {
    "dia": {
        "faturamento_total": 350.00,
        "total_a_receber": 620.00,
        "taxa_inadimplencia": 0.05,
    },
    "semana": {
        "faturamento_total": 1800.00,
        "total_a_receber": 1200.00,
        "taxa_inadimplencia": 0.08,
    },
    "mes": {
        "faturamento_total": 4200.00,
        "total_a_receber": 1800.00,
        "taxa_inadimplencia": 0.12,
    },
}

# As datas são calculadas a partir de hoje na view, para os dados não
# envelhecerem.
PARCELAS_VENCIDAS = [
    {
        "id_cliente": 3,
        "nome": "João Lima",
        "id_parcela": 7,
        "valor_parcela": 120.00,
        "dias_atraso": 10,
    },
]

PARCELAS_A_VENCER = [
    {
        "id_cliente": 1,
        "nome": "Maria Souza",
        "id_parcela": 10,
        "valor_parcela": 90.00,
        "dias_para_vencer": 3,
    },
    {
        "id_cliente": 2,
        "nome": "Ana Pereira",
        "id_parcela": 11,
        "valor_parcela": 150.00,
        "dias_para_vencer": 6,
    },
]