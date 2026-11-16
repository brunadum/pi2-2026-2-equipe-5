"""Contrato executável das operações disponíveis, servido em /api/openapi.json."""


def ref(nome):
    return {'$ref': f'#/components/schemas/{nome}'}


def objeto(campos, obrigatorios=None):
    return {'type': 'object', 'properties': campos,
            'required': list(campos) if obrigatorios is None else obrigatorios}


def lista(schema):
    return {'type': 'array', 'items': schema}


ID = {'type': 'integer', 'minimum': 1, 'maximum': 2147483647}
VALOR = {'type': 'number', 'minimum': 0}
POSITIVO = {'type': 'number', 'exclusiveMinimum': True, 'minimum': 0,
            'maximum': 99999999.99, 'multipleOf': 0.01}
DATA = {'type': 'string', 'format': 'date'}
TEXTO = {'type': 'string'}
BOOLEANO = {'type': 'boolean'}
STATUS_PARCELA = {'type': 'string', 'enum': ['pendente', 'parcial', 'pago', 'atrasado']}
MODALIDADE = {'type': 'string', 'enum': ['fiado', 'a_prazo']}
STATUS_VENDA = {'type': 'string', 'enum': ['aprovada', 'rejeitada', 'pendente_autorizacao', 'cancelada']}
IDENTIFICADOR_ENTRADA = {'oneOf': [ID, {'type': 'string', 'pattern': '^[0-9]+$'}],
                         'description': 'Inteiro positivo até 2147483647; texto de dígitos também é aceito.'}

CLIENTE = objeto({
    'id_cliente': ID, 'nome': TEXTO, 'cpf': TEXTO, 'telefone': lista(TEXTO),
    'limite_credito': VALOR, 'credito_bloqueado': BOOLEANO, 'ativo': BOOLEANO,
})
CREDITO = objeto({
    'id_cliente': ID, 'limite_credito': VALOR, 'saldo_devedor': VALOR,
    'limite_disponivel': VALOR, 'credito_bloqueado': BOOLEANO,
})
PARCELA = objeto({
    'id_parcela': ID, 'id_venda': ID, 'numero': ID, 'valor_parcela': VALOR,
    'valor_pago': VALOR, 'saldo_parcela': VALOR, 'data_vencimento': DATA,
    'status': STATUS_PARCELA, 'dias_atraso': {'type': 'integer', 'minimum': 0},
    'juros': VALOR, 'multa': VALOR, 'valor_atualizado': VALOR,
})
VENDA = objeto({
    'id_venda': ID, 'id_cliente': ID, 'nome_cliente': TEXTO, 'id_usuario': ID,
    'data_venda': {'type': 'string', 'format': 'date-time'}, 'valor_total': VALOR,
    'modalidade': MODALIDADE, 'status': STATUS_VENDA,
    'motivo_rejeicao': {'type': 'string', 'nullable': True},
    'autorizado_por': {'type': 'integer', 'nullable': True},
})
PARCELA_DASHBOARD = objeto({
    'id_cliente': ID, 'nome': TEXTO, 'id_parcela': ID, 'valor_parcela': VALOR,
    'data_vencimento': DATA, 'dias_atraso': {'type': 'integer', 'minimum': 0},
}, ['id_cliente', 'nome', 'id_parcela', 'valor_parcela', 'data_vencimento'])

SCHEMAS = {
    'Erro': objeto({'erro': TEXTO, 'mensagem': TEXTO, 'campos': lista(TEXTO)}, ['erro', 'mensagem']),
    'Cliente': CLIENTE,
    'Credito': CREDITO,
    'Saldo': objeto({**CREDITO['properties'], 'possui_parcelas_atrasadas': BOOLEANO}),
    'Parcela': PARCELA,
    'Venda': VENDA,
    'ClienteEntrada': objeto({
        'nome': {'type': 'string', 'minLength': 1, 'maxLength': 100},
        'cpf': {'type': 'string', 'description': 'CPF válido de 11 dígitos, com ou sem máscara.'},
        'telefone': {'type': 'array', 'minItems': 1, 'items': TEXTO,
                     'description': 'Fixo ou celular com DDD, DDI 55 opcional.'},
    }),
    'LimiteEntrada': objeto({
        'limite_credito': {'type': 'number', 'minimum': 0, 'maximum': 99999999.99,
                           'multipleOf': 0.01, 'example': 600},
        'motivo': {'type': 'string', 'maxLength': 200},
    }, ['limite_credito']),
    'BloqueioEntrada': objeto({'bloqueado': BOOLEANO, 'motivo': {'type': 'string', 'maxLength': 200}}, ['bloqueado']),
    'Bloqueio': objeto({'id_cliente': ID, 'credito_bloqueado': BOOLEANO}),
    'VendaEntrada': objeto({
        'id_cliente': IDENTIFICADOR_ENTRADA, 'modalidade': MODALIDADE,
        'valor_total': POSITIVO, 'data_primeiro_vencimento': DATA,
        'quantidade_parcelas': {'type': 'integer', 'minimum': 1},
    }, ['id_cliente', 'modalidade', 'valor_total', 'data_primeiro_vencimento']),
    'VendaCriada': objeto({
        'id_venda': ID, 'id_cliente': ID, 'id_usuario': ID, 'modalidade': MODALIDADE,
        'data_venda': DATA, 'valor_total': VALOR, 'status': {'type': 'string', 'enum': ['aprovada']},
        'parcelas': lista(objeto({'id_parcela': ID, 'numero': ID, 'valor_parcela': VALOR, 'data_vencimento': DATA})),
    }),
    'VendaRejeitada': objeto({'id_venda': ID, 'status': {'type': 'string', 'enum': ['rejeitada']},
                             'motivo': {'type': 'string', 'enum': ['credito_bloqueado', 'parcelas_em_atraso', 'limite_credito_excedido']}}),
    'PagamentoEntrada': objeto({'id_parcela': IDENTIFICADOR_ENTRADA, 'valor_recebido': POSITIVO,
                               'forma_pagamento': {'type': 'string', 'enum': ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro']}}, ['id_parcela', 'valor_recebido']),
    'PagamentoCriado': objeto({
        'id_pagamento': ID, 'id_parcela': ID, 'valor_recebido': VALOR,
        'data_pagamento': DATA, 'status_parcela': {'type': 'string', 'enum': ['pago', 'parcial']},
        'saldo_parcela': VALOR, 'saldo_devedor_cliente': VALOR,
    }),
    'Dashboard': objeto({
        'periodo': {'type': 'string', 'enum': ['dia', 'semana', 'mes']},
        'faturamento_total': VALOR, 'total_a_receber': VALOR, 'total_recebido': VALOR,
        'total_vencido': VALOR, 'taxa_atraso': {'type': 'number', 'minimum': 0, 'maximum': 100},
        'clientes_inadimplentes': {'type': 'integer', 'minimum': 0},
        'faturamento_semanal': lista(objeto({'rotulo': TEXTO, 'valor': VALOR, 'recebido': VALOR})),
        'taxa_inadimplencia': {'type': 'number', 'minimum': 0, 'maximum': 1},
        'parcelas_vencidas': lista(PARCELA_DASHBOARD), 'parcelas_a_vencer': lista(PARCELA_DASHBOARD),
    }),
    'LoginEntrada': objeto({'email': TEXTO, 'senha': {'type': 'string', 'format': 'password'}}),
    'LoginAtual': objeto({'token': {'type': 'string', 'description': 'JWT HS256 com validade de 24 horas'},
                          'nome': TEXTO, 'perfil': {'type': 'string', 'enum': ['ADMIN', 'COMUM', 'gerente', 'funcionario']}}),
    # O login legado ainda não usa o envelope padronizado de erro.
    'ErroLoginAtual': objeto({'erro': TEXTO}),
}

TAXA = {'type': 'number', 'minimum': 0, 'maximum': 1, 'multipleOf': 0.0001}
SCHEMAS.update({
    'ConfiguracaoEntrada': objeto({'taxa_juros': TAXA, 'taxa_multa': TAXA}),
    'Configuracao': objeto({'id_configuracao': ID, 'taxa_juros': TAXA, 'taxa_multa': TAXA, 'definido_por': ID}),
    'Recebimento': objeto({'id_pagamento': ID, 'id_parcela': ID, 'id_venda': ID, 'id_cliente': ID,
                           'nome_cliente': TEXTO, 'valor_recebido': VALOR, 'valor_juros': VALOR,
                           'valor_multa': VALOR, 'data_pagamento': DATA,
                           'id_usuario': {'type': 'integer', 'nullable': True},
                           'forma_pagamento': {'type': 'string', 'nullable': True}}),
    'Produto': objeto({'id': ID, 'nome': TEXTO, 'preco': VALOR, 'quantidade_estoque': {'type': 'integer'}}),
    'ProdutoEntrada': objeto({'nome': {'type': 'string', 'minLength': 1, 'maxLength': 150}, 'preco': POSITIVO}),
    'DescontoEntrada': objeto({'valor_desconto': POSITIVO, 'motivo': {'type': 'string', 'minLength': 1, 'maxLength': 200}}),
    'Desconto': objeto({'id_desconto': {'type': 'integer'}, 'id_parcela': ID, 'valor_desconto': VALOR,
                        'valor_devido_atualizado': VALOR, 'saldo_devedor_cliente': VALOR}),
})
PERCENTUAL = {'type': 'number', 'minimum': 0, 'maximum': 100, 'multipleOf': 0.01}
SISTEMA = {
    'multa_diaria_percentual': PERCENTUAL, 'juros_mensais_percentual': PERCENTUAL,
    'desconto_maximo_percentual': PERCENTUAL,
    'limite_padrao_cliente': {'type': 'number', 'minimum': 0, 'maximum': 99999999.99, 'multipleOf': 0.01},
    'bloquear_vendas_atraso': BOOLEANO, 'permitir_cliente_sem_cpf': BOOLEANO,
    'exigir_senha_venda': BOOLEANO, 'permitir_venda_parcial': BOOLEANO,
    'operador_cadastrar_cliente': BOOLEANO, 'operador_registrar_pagamento': BOOLEANO,
    'restringir_relatorios_admin': BOOLEANO,
}
SCHEMAS['SistemaEntrada'] = {'anyOf': [objeto(SISTEMA), ref('ConfiguracaoEntrada')]}
SCHEMAS['Sistema'] = objeto({**SCHEMAS['Configuracao']['properties'], **SISTEMA,
                             'modo_cobranca': {'type': 'string', 'enum': ['unica', 'mensal_diaria']}})


def resposta(schema, descricao):
    return {'description': descricao, 'content': {'application/json': {'schema': schema}}}


def parametro(nome, schema=TEXTO):
    return {'name': nome, 'in': 'query', 'required': False, 'schema': schema}


def operacao(identificador, titulo, requisito, saida, *, entrada=None, parametros=(), erros=(),
             descricao='', autenticada=False, status='200'):
    respostas = {status: resposta(saida, 'Operação realizada'),
                 '405': resposta(ref('Erro'), 'metodo_nao_permitido')}
    for codigo, mensagem in erros:
        respostas[str(codigo)] = resposta(ref('Erro'), mensagem)
    dados = {'operationId': identificador, 'summary': titulo, 'tags': [requisito],
             'description': descricao, 'parameters': list(parametros), 'responses': respostas,
             'security': [{'bearerAuth': []}] if autenticada else []}
    if entrada:
        dados['requestBody'] = {'required': True, 'content': {'application/json': {'schema': ref(entrada)}}}
    return dados


CLIENTE_ID = {'name': 'id_cliente', 'in': 'path', 'required': True, 'schema': ID}
ERROS_CREDITO = [(400, 'json_invalido, campo_obrigatorio ou campo_invalido'),
                 (401, 'nao_autenticado: identidade ausente ou usuário inativo'),
                 (403, 'acesso_negado: perfil sem permissão'), (404, 'cliente_nao_encontrado')]
INTEGRACAO = ('O middleware JWT valida a assinatura e expiração do Bearer e define request.usuario como '
              'core.models.Usuario. ADMIN equivale a gerente e COMUM a funcionário; '
              'os nomes gerente/funcionario também são aceitos na tabela perfil. '
              'A identidade, situação ativa e perfil são conferidos no banco a cada requisição.')
LEGADO = ('Operação existente. A proteção global por Bearer/perfil prevista no contrato '
          'ainda depende de Backend 1/3 (#60); esta versão não aplica essa proteção à rota legada.')

PATHS = {
    '/clientes': {
        'get': operacao('listarClientes', 'Pesquisar clientes', 'RF02', lista(ref('Cliente')),
                        parametros=[parametro(n) for n in ('nome', 'cpf', 'telefone')],
                        erros=[(400, 'campo_invalido')], descricao=LEGADO),
        'post': operacao('cadastrarCliente', 'Cadastrar cliente com limite zero', 'RF03', ref('Cliente'),
                         entrada='ClienteEntrada', status='201', descricao=LEGADO,
                         erros=[(400, 'json_invalido, campo_obrigatorio, campo_invalido ou telefone_invalido'),
                                (409, 'cpf_duplicado'), (422, 'cpf_invalido')]),
    },
    '/clientes/{id_cliente}': {
        'get': operacao('detalharCliente', 'Consultar dados do cliente', 'RF02', ref('Cliente'),
                        parametros=[CLIENTE_ID], descricao=LEGADO,
                        erros=[(400, 'campo_invalido'), (404, 'cliente_nao_encontrado')]),
    },
    '/clientes/{id_cliente}/saldo': {
        'get': operacao('consultarSaldo', 'Consultar saldo devedor', 'RF04', ref('Saldo'),
                        parametros=[CLIENTE_ID], descricao=LEGADO,
                        erros=[(400, 'campo_invalido'), (404, 'cliente_nao_encontrado')]),
    },
    '/clientes/{id_cliente}/parcelas': {
        'get': operacao('listarParcelas', 'Consultar parcelas do cliente', 'RF04', lista(ref('Parcela')),
                        parametros=[CLIENTE_ID, parametro('status', STATUS_PARCELA)], descricao=LEGADO,
                        erros=[(400, 'campo_invalido'), (404, 'cliente_nao_encontrado')]),
    },
    '/clientes/{id_cliente}/limite': {
        'get': operacao('consultarLimite', 'Consultar limite e disponibilidade de crédito', 'RF06', ref('Credito'),
                        parametros=[CLIENTE_ID], erros=ERROS_CREDITO, autenticada=True,
                        descricao='Gerente e funcionário ativos. ' + INTEGRACAO),
        'put': operacao('alterarLimite', 'Alterar limite de crédito com auditoria', 'RF06', ref('Credito'),
                        entrada='LimiteEntrada', parametros=[CLIENTE_ID], autenticada=True,
                        erros=[*ERROS_CREDITO, (422, 'limite_invalido')],
                        descricao='Somente gerente. Zero é permitido; não altera dívida existente. '
                                  'Auditoria e limite são atômicos. Repetição sem mudança não gera evento. ' + INTEGRACAO),
    },
    '/clientes/{id_cliente}/credito/bloqueio': {
        'put': operacao('alterarBloqueio', 'Bloquear ou desbloquear crédito', 'RF06', ref('Bloqueio'),
                        entrada='BloqueioEntrada', parametros=[CLIENTE_ID], erros=ERROS_CREDITO,
                        autenticada=True, descricao='Somente gerente. Bloqueio impede novas vendas, '
                        'preserva dívidas e permite receber parcelas existentes. '
                        'Repetição sem mudança não gera evento. ' + INTEGRACAO),
    },
    '/vendas': {
        'get': operacao('listarVendas', 'Consultar vendas', 'RF12', lista(ref('Venda')), descricao=LEGADO,
                        parametros=[parametro('id_cliente', ID), parametro('status', STATUS_VENDA),
                                    parametro('modalidade', MODALIDADE), parametro('data_inicio', DATA), parametro('data_fim', DATA)],
                        erros=[(400, 'campo_invalido')]),
        'post': operacao('registrarVenda', 'Registrar venda fiado ou a prazo', 'RF01', ref('VendaCriada'),
                         entrada='VendaEntrada', status='201', erros=[(400, 'json_invalido, campo_obrigatorio ou campo_invalido'),
                         (404, 'cliente_nao_encontrado'), (422, 'vencimento_invalido ou venda rejeitada')],
                         descricao='Em a_prazo, quantidade_parcelas é obrigatória; em fiado, deve ser 1. '
                                   'Vencimento a partir de hoje. Rejeição por negócio persiste a venda sem parcelas. ' + LEGADO),
    },
    '/pagamentos': {
        'post': operacao('registrarPagamento', 'Registrar baixa total ou parcial', 'RF05', ref('PagamentoCriado'),
                         entrada='PagamentoEntrada', status='201', descricao=LEGADO,
                         erros=[(400, 'json_invalido, campo_obrigatorio ou campo_invalido'),
                                (404, 'parcela_nao_encontrada'), (422, 'valor_excede_devido ou parcela_ja_paga')]),
    },
    '/dashboard': {
        'get': operacao('consultarDashboard', 'Consultar dashboard financeiro', 'RF09', ref('Dashboard'),
                        descricao='Somente gerente ativo autenticado. ' + INTEGRACAO, autenticada=True,
                        parametros=[parametro('periodo', {'type': 'string', 'enum': ['dia', 'semana', 'mes'], 'default': 'mes'}),
                                    parametro('dias', {'type': 'integer', 'minimum': 1, 'default': 7})],
                        erros=[(400, 'periodo_invalido ou campo_invalido'), (401, 'nao_autenticado'), (403, 'Perfil sem permissão')]),
    },
    '/login/': {
        'post': operacao('loginAtual', 'Autenticar usuário e obter JWT', 'RNF01', ref('LoginAtual'),
                         entrada='LoginEntrada', descricao='POST /api/login/ valida senha com hash e usuário ativo. '
                         'Retorna token, nome e perfil. Envie o token como Authorization: Bearer <token>. '
                         'O JWT expira em 24 horas. /auth/login e /auth/logout ainda não existem nesta versão.'),
    },
}
PATHS['/vendas']['post']['responses']['422'] = resposta(
    {'oneOf': [ref('Erro'), ref('VendaRejeitada')]},
    'vencimento_invalido ou rejeição por credito_bloqueado, parcelas_em_atraso, limite_credito_excedido')

FILTROS_FINANCEIROS = [
    parametro('periodo', {'type': 'string', 'enum': ['dia', 'semana', 'mes']}),
    parametro('data_inicio', DATA), parametro('data_fim', DATA), parametro('id_cliente', ID),
]
ERROS_FINANCEIROS = [(400, 'campo_invalido ou periodo_invalido'), (401, 'nao_autenticado'), (403, 'acesso_negado')]
PATHS['/pagamentos']['get'] = operacao(
    'listarRecebimentos', 'Listar recebimentos efetivos', 'RF05', lista(ref('Recebimento')),
    parametros=FILTROS_FINANCEIROS, erros=ERROS_FINANCEIROS, autenticada=True,
    descricao='Somente gerente. Cada registro é um recebimento; id_pagamento identifica recebimento e id_parcela identifica a parcela. Descontos não são recebimentos.')
PATHS['/configuracoes/cobranca'] = {
    'get': operacao('consultarConfiguracao', 'Consultar taxas de cobrança', 'RF10', ref('Configuracao'),
                    autenticada=True, erros=[*ERROS_FINANCEIROS, (404, 'configuracao_nao_encontrada')],
                    descricao='Somente gerente. Taxas em fração: 0.02 significa 2%. Alias /configuracoes/. Encargos aplicados uma vez à parcela vencida.'),
    'put': operacao('alterarConfiguracao', 'Alterar taxas com auditoria', 'RF10', ref('Configuracao'),
                    entrada='ConfiguracaoEntrada', autenticada=True,
                    erros=[*ERROS_FINANCEIROS, (422, 'taxa_invalida')],
                    descricao='Somente gerente. Autor vem do JWT, com auditoria transacional. Atualiza os saldos ainda abertos. Repetição sem mudança não gera evento.'),
}
PATHS['/configuracoes'] = {
    'get': operacao('consultarConfiguracoesSistema', 'Consultar configuração compatível com a tela', 'RF10', ref('Sistema'),
                    autenticada=True, erros=[*ERROS_FINANCEIROS, (404, 'configuracao_nao_encontrada')],
                    descricao='Somente gerente. Retorna os onze campos usados pela tela original, as taxas em fração e o modo de cobrança atual. Nenhuma gravação ocorre no GET.'),
    'put': operacao('alterarConfiguracoesSistema', 'Gravar configuração da tela e ativar juros mensais/multa diária', 'RF10', ref('Sistema'),
                    entrada='SistemaEntrada', autenticada=True,
                    erros=[*ERROS_FINANCEIROS, (422, 'configuracao_invalida ou politica_nao_disponivel')],
                    descricao='Somente gerente. Juros simples proporcionais aos dias, mês de 30 dias, mais multa diária; principal amortizado deixa de gerar encargos a partir da data do abatimento. '
                              'Valida e aplica limite padrão, desconto máximo, baixas parciais e permissões de operadores. '
                              'Bloqueio por atraso e restrição financeira ao gerente são obrigatórios; CPF permanece obrigatório. Aprovação por senha não está disponível. '
                              'Também aceita o payload legado taxa_juros/taxa_multa, preservando o modo atual.'),
}
PATHS['/produtos'] = {
    'get': operacao('listarProdutos', 'Consultar catálogo compartilhado', 'RF01', lista(ref('Produto')),
                    autenticada=True, erros=ERROS_FINANCEIROS),
    'post': operacao('cadastrarProduto', 'Cadastrar produto', 'RF01', ref('Produto'),
                     entrada='ProdutoEntrada', status='201', autenticada=True,
                     erros=[*ERROS_FINANCEIROS, (409, 'produto_duplicado'), (422, 'valor_invalido')]),
}
PATHS['/produtos/{id_produto}'] = {
    'put': operacao('alterarProduto', 'Alterar nome ou preço do produto', 'RF01', ref('Produto'),
                    entrada='ProdutoEntrada', autenticada=True,
                    parametros=[{'name': 'id_produto', 'in': 'path', 'required': True, 'schema': ID}],
                    erros=[*ERROS_FINANCEIROS, (404, 'produto_nao_encontrado'), (409, 'produto_duplicado'), (422, 'valor_invalido')],
                    descricao='Somente gerente.'),
}
PATHS['/pagamentos/{id_parcela}/desconto'] = {
    'post': operacao('concederDesconto', 'Conceder desconto auditado à parcela', 'RF10', ref('Desconto'),
                     entrada='DescontoEntrada', autenticada=True,
                     parametros=[{'name': 'id_parcela', 'in': 'path', 'required': True, 'schema': ID}],
                     erros=[*ERROS_FINANCEIROS, (404, 'parcela_nao_encontrada'), (422, 'desconto_invalido')],
                     descricao='Somente gerente. O identificador no caminho é o da parcela. Atualiza dívida e auditoria na mesma transação; não soma desconto a recebimentos.'),
}
for tipo, schema in (('vendas', lista(ref('Venda'))), ('pagamentos', lista(ref('Recebimento'))),
                     ('clientes', lista(ref('Cliente'))), ('financeiro', ref('Dashboard')),
                     ('inadimplencia', lista(PARCELA_DASHBOARD))):
    PATHS[f'/relatorios/{tipo}'] = {'get': operacao(
        f'relatorio_{tipo}', f'Consultar relatório de {tipo}', 'RF12', schema,
        parametros=FILTROS_FINANCEIROS, erros=ERROS_FINANCEIROS, autenticada=True,
        descricao='Somente gerente. Vendas aprovadas e recebimentos são filtrados por período; clientes e inadimplência representam a posição atual.')}
    exportacao = operacao(f'exportar_{tipo}', f'Exportar relatório de {tipo} em CSV', 'RF12', TEXTO,
                         parametros=FILTROS_FINANCEIROS, erros=ERROS_FINANCEIROS, autenticada=True)
    exportacao['responses']['200'] = {'description': 'CSV UTF-8 com BOM, separador ponto e vírgula e proteção contra fórmulas.',
                                      'content': {'text/csv': {'schema': TEXTO}}}
    PATHS[f'/relatorios/{tipo}/exportar'] = {'get': exportacao}
for codigo in ('400', '401'):
    PATHS['/login/']['post']['responses'][codigo] = resposta(ref('ErroLoginAtual'), 'Dados ausentes/JSON inválido ou credenciais inválidas')
PATHS['/login/']['post']['responses']['405'] = resposta(ref('ErroLoginAtual'), 'Método não permitido')

SCHEMA = {
    'openapi': '3.0.3',
    'info': {'title': 'Fiado Control — API', 'version': '0.5.1',
             'description': 'Somente operações implementadas. Login JWT em /login/. '
             'Crédito e dashboard exigem Bearer válido e verificam as permissões no banco. '
             'As demais operações ainda aguardam a proteção global por perfil.'},
    'servers': [{'url': '/api', 'description': 'Backend no mesmo servidor desta documentação'}],
    'paths': PATHS,
    'components': {'schemas': SCHEMAS, 'securitySchemes': {
        'bearerAuth': {'type': 'http', 'scheme': 'bearer',
                       'bearerFormat': 'JWT', 'description': 'Token obtido em POST /api/login/, válido por 24 horas.'},
    }},
}
