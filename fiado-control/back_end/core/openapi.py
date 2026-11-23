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

# --- Backend 1: edição/desativação de cliente, histórico, cancelamento, estorno e usuários ---
PERFIL_USUARIO = {'type': 'string', 'enum': ['ADMIN', 'COMUM']}
PERFIL_ENTRADA = {'type': 'string', 'enum': ['ADMIN', 'GERENTE', 'COMUM', 'FUNCIONARIO'],
                  'description': 'Aceita maiúsculas/minúsculas; GERENTE vira ADMIN e FUNCIONARIO vira COMUM.'}
MOTIVO = {'type': 'string', 'minLength': 1, 'maxLength': 200}
SCHEMAS.update({
    'ClienteAtualizacao': objeto({
        'nome': {'type': 'string', 'minLength': 1, 'maxLength': 100},
        'cpf': {'type': 'string', 'description': 'Opcional; se informado, CPF válido e único.'},
        'telefone': {'type': 'array', 'minItems': 1, 'items': TEXTO},
    }, ['nome', 'telefone']),
    'ClienteDesativado': objeto({'mensagem': TEXTO}),
    'Movimentacao': objeto({'tipo': {'type': 'string', 'enum': ['venda', 'cancelamento', 'pagamento']},
                            'id': ID, 'data': DATA, 'valor': VALOR}),
    'MotivoEntrada': objeto({'motivo': MOTIVO}),
    'VendaCancelada': objeto({'id_venda': ID, 'id_cliente': ID, 'status': {'type': 'string', 'enum': ['cancelada']},
                              'valor_estornado': VALOR, 'saldo_devedor_cliente': VALOR, 'motivo': MOTIVO}),
    'PagamentoEstornado': objeto({'id_pagamento': ID, 'id_parcela': ID, 'valor_estornado': VALOR,
                                  'status_parcela': {'type': 'string', 'enum': ['pendente', 'atrasado']},
                                  'saldo_parcela': VALOR, 'saldo_devedor_cliente': VALOR, 'motivo': MOTIVO}),
    'Usuario': objeto({'id_usuario': ID, 'nome': TEXTO, 'email': TEXTO, 'perfil': PERFIL_USUARIO, 'ativo': BOOLEANO}),
    'UsuarioLista': objeto({'usuarios': lista(ref('Usuario'))}),
    'UsuarioEntrada': objeto({
        'nome': {'type': 'string', 'minLength': 2, 'maxLength': 100},
        'email': {'type': 'string', 'format': 'email'},
        'senha': {'type': 'string', 'format': 'password', 'minLength': 6},
        'perfil': {**PERFIL_ENTRADA, 'default': 'COMUM'},
        'ativo': {'type': 'boolean', 'default': True},
    }, ['nome', 'email', 'senha']),
    'UsuarioAtualizacao': objeto({
        'nome': {'type': 'string', 'minLength': 2, 'maxLength': 100},
        'email': {'type': 'string', 'format': 'email'},
        'senha': {'type': 'string', 'format': 'password', 'minLength': 6},
        'perfil': PERFIL_ENTRADA, 'ativo': BOOLEANO,
    }),
})
del SCHEMAS['UsuarioAtualizacao']['required']  # todos os campos são opcionais; required vazio é inválido no OpenAPI 3.0
AUTENTICADA_BASE = [(401, 'nao_autenticado')]
ERROS_GERENTE = [(401, 'nao_autenticado'), (403, 'acesso_negado: somente gerente')]
CLIENTE_ATUALIZACAO_ERROS = [(400, 'json_invalido, campo_obrigatorio, campo_invalido ou telefone_invalido'),
                             (401, 'nao_autenticado'), (404, 'cliente_nao_encontrado'),
                             (409, 'cpf_duplicado'), (422, 'cpf_invalido')]
PATHS['/clientes/{id_cliente}']['put'] = operacao(
    'editarCliente', 'Editar nome, CPF e telefones do cliente', 'RF02', ref('Cliente'),
    entrada='ClienteAtualizacao', parametros=[CLIENTE_ID], erros=CLIENTE_ATUALIZACAO_ERROS, autenticada=True,
    descricao='Exige usuário autenticado (request.usuario). Nome e telefone são obrigatórios; CPF é opcional e, '
              'se omitido, permanece inalterado. Os telefones enviados substituem os anteriores.')
PATHS['/clientes/{id_cliente}']['delete'] = operacao(
    'desativarCliente', 'Desativar cliente sem dívida', 'RF02', ref('ClienteDesativado'),
    parametros=[CLIENTE_ID], autenticada=True,
    erros=[(400, 'campo_invalido'), (401, 'nao_autenticado'), (404, 'cliente_nao_encontrado'),
           (409, 'cliente_com_divida: saldo devedor maior que zero')],
    descricao='Exige usuário autenticado. Exclusão lógica (ativo = false); recusada quando há saldo devedor.')
PATHS['/clientes/{id_cliente}/historico'] = {'get': operacao(
    'consultarHistoricoCliente', 'Consultar histórico financeiro do cliente', 'RF04', lista(ref('Movimentacao')),
    parametros=[CLIENTE_ID, parametro('data_inicio', DATA), parametro('data_fim', DATA)], autenticada=True,
    erros=[(400, 'campo_invalido: id ou datas inválidas, ou data_inicio posterior a data_fim'),
           (401, 'nao_autenticado'), (404, 'cliente_nao_encontrado')],
    descricao='Vendas, cancelamentos e recebimentos do cliente, do mais recente para o mais antigo. '
              'Exige usuário autenticado; ambos os perfis.')}
PATHS['/vendas/{id_venda}/cancelar'] = {'post': operacao(
    'cancelarVenda', 'Cancelar venda aprovada com auditoria', 'RF13', ref('VendaCancelada'),
    entrada='MotivoEntrada', autenticada=True,
    parametros=[{'name': 'id_venda', 'in': 'path', 'required': True, 'schema': ID}],
    erros=[(400, 'json_invalido, campo_obrigatorio ou campo_invalido'), *ERROS_GERENTE,
           (404, 'venda_nao_encontrada'),
           (422, 'venda_ja_cancelada, venda_nao_cancelavel ou venda_possui_pagamentos')],
    descricao='Somente gerente. Só vendas aprovadas e sem recebimentos (estorne antes). Motivo obrigatório. '
              'Alteração de status e auditoria são atômicas. ' + INTEGRACAO)}
PATHS['/pagamentos/{id_pagamento}/estornar'] = {'post': operacao(
    'estornarPagamento', 'Estornar recebimento com auditoria', 'RF14', ref('PagamentoEstornado'),
    entrada='MotivoEntrada', autenticada=True,
    parametros=[{'name': 'id_pagamento', 'in': 'path', 'required': True, 'schema': ID,
                 'description': 'Identificador do recebimento (id_pagamento de GET /pagamentos), não da parcela.'}],
    erros=[(400, 'json_invalido, campo_obrigatorio ou campo_invalido'), *ERROS_GERENTE,
           (404, 'pagamento_nao_encontrado')],
    descricao='Somente gerente. Remove o recebimento e reabre a parcela (pendente ou atrasado). '
              'Motivo obrigatório; auditoria atômica. ' + INTEGRACAO)}
USUARIO_ID = {'name': 'id_usuario', 'in': 'path', 'required': True, 'schema': ID}
PATHS['/usuarios'] = {
    'get': operacao('listarUsuarios', 'Listar usuários', 'RF08', ref('UsuarioLista'), autenticada=True,
                    erros=ERROS_GERENTE, descricao='Somente gerente. ' + INTEGRACAO),
    'post': operacao('cadastrarUsuario', 'Cadastrar usuário com perfil', 'RF08', ref('Usuario'),
                     entrada='UsuarioEntrada', status='201', autenticada=True,
                     erros=[(400, 'json_invalido, campo_invalido ou perfil_nao_encontrado'), *ERROS_GERENTE,
                            (409, 'email_duplicado')],
                     descricao='Somente gerente. E-mail normalizado em minúsculas, senha com hash. Auditado. ' + INTEGRACAO),
}
PATHS['/usuarios/{id_usuario}'] = {
    'get': operacao('consultarUsuario', 'Consultar usuário', 'RF08', ref('Usuario'), parametros=[USUARIO_ID],
                    autenticada=True, erros=[(400, 'campo_invalido'), *ERROS_GERENTE, (404, 'usuario_nao_encontrado')],
                    descricao='Somente gerente.'),
    'put': operacao('editarUsuario', 'Editar usuário, perfil, situação ou senha', 'RF08', ref('Usuario'),
                    entrada='UsuarioAtualizacao', parametros=[USUARIO_ID], autenticada=True,
                    erros=[(400, 'json_invalido, campo_invalido ou perfil_nao_encontrado'), *ERROS_GERENTE,
                           (404, 'usuario_nao_encontrado'), (409, 'email_duplicado'),
                           (422, 'auto_bloqueio_nao_permitido')],
                    descricao='Somente gerente. Campos omitidos permanecem. O gerente não pode desativar nem '
                              'rebaixar a própria conta. Auditado. ' + INTEGRACAO),
}

# --- Código do gerente e auditoria ---
CODIGO_6 = {'type': 'string', 'pattern': '^[0-9]{6}$', 'description': 'Exatamente 6 dígitos.'}
SCHEMAS.update({
    'CodigoGerenteEstado': objeto({'definido': BOOLEANO}),
    'CodigoGerenteEntrada': objeto({'codigo_novo': CODIGO_6, 'codigo_atual': CODIGO_6}, ['codigo_novo']),
    'AutorizacaoEntrada': objeto({'codigo': CODIGO_6}),
    'Autorizacao': objeto({'autorizado': {'type': 'boolean', 'enum': [True]},
                           'token_autorizacao': {'type': 'string', 'description': 'Envie em X-Autorizacao-Gerente.'},
                           'expira_em_segundos': {'type': 'integer'}}),
    'RegistroAuditoria': objeto({
        'id_auditoria': {'type': 'string', 'description': 'Prefixo f (financeira) ou c (crédito) + número.'},
        'data_hora': {'type': 'string', 'format': 'date-time'}, 'id_usuario': ID, 'nome_usuario': TEXTO,
        'operacao': TEXTO, 'id_recurso': {'type': 'integer', 'description': 'Venda, recebimento, parcela, usuário ou cliente, conforme a operação.'},
        'valores_anteriores': {'type': 'object'}, 'valores_novos': {'type': 'object'}, 'motivo': TEXTO}),
})
HEADER_AUTORIZACAO = {'name': 'X-Autorizacao-Gerente', 'in': 'header', 'required': False, 'schema': TEXTO,
                      'description': 'Token de POST /autorizacoes/gerente. Permite a um funcionário realizar esta operação restrita.'}
for caminho, metodo in (('/vendas/{id_venda}/cancelar', 'post'), ('/pagamentos/{id_pagamento}/estornar', 'post'),
                        ('/clientes/{id_cliente}/limite', 'put'), ('/usuarios', 'post')):
    PATHS[caminho][metodo]['parameters'].append(HEADER_AUTORIZACAO)
    PATHS[caminho][metodo]['description'] += ' Funcionário só com X-Autorizacao-Gerente válido (código do gerente).'
ERRO_BLOQUEIO = (429, 'codigo_gerente_bloqueado: 5 erros seguidos bloqueiam novas tentativas por 60 s (cabeçalho Retry-After)')
PATHS['/configuracoes/codigo-gerente'] = {
    'get': operacao('consultarCodigoGerente', 'Informar se o código do gerente está definido', 'RF07', ref('CodigoGerenteEstado'),
                    autenticada=True, erros=AUTENTICADA_BASE + [(403, 'acesso_negado')],
                    descricao='Gerente ou funcionário ativos. Nunca devolve o código.'),
    'put': operacao('definirCodigoGerente', 'Definir ou trocar o código do gerente', 'RF07', ref('CodigoGerenteEstado'),
                    entrada='CodigoGerenteEntrada', autenticada=True,
                    erros=[(400, 'codigo_invalido, campo_obrigatorio ou json_invalido'), *ERROS_GERENTE,
                           (422, 'codigo_atual_obrigatorio ou codigo_atual_invalido'), ERRO_BLOQUEIO],
                    descricao='Somente gerente. A primeira definição dispensa codigo_atual; a troca o exige. '
                              'Só o hash é guardado; o código não entra na auditoria. Auditado.'),
}
PATHS['/autorizacoes/gerente'] = {'post': operacao(
    'autorizarComCodigoGerente', 'Validar o código do gerente e obter autorização temporária', 'RF07', ref('Autorizacao'),
    entrada='AutorizacaoEntrada', autenticada=True,
    erros=[(400, 'json_invalido ou campo_obrigatorio'), *AUTENTICADA_BASE, (409, 'codigo_gerente_nao_definido'),
           (422, 'codigo_gerente_invalido'), ERRO_BLOQUEIO],
    descricao='Gerente ou funcionário ativos. O token vale 120 s, só para o usuário que digitou o código, e '
              'é enviado em X-Autorizacao-Gerente. Não serve como Bearer de login. Cada uso é auditado.')}
PATHS['/auditoria'] = {'get': operacao(
    'consultarAuditoria', 'Consultar histórico de auditoria', 'RF11', lista(ref('RegistroAuditoria')),
    autenticada=True, erros=[(400, 'campo_invalido'), *ERROS_GERENTE],
    parametros=[parametro('operacao'), parametro('id_usuario', ID), parametro('data_inicio', DATA),
                parametro('data_fim', DATA), parametro('limite', {'type': 'integer', 'minimum': 1, 'maximum': 500, 'default': 200})],
    descricao='Somente gerente. Reúne auditoria financeira e de crédito, do mais recente ao mais antigo.')}

SCHEMA = {
    'openapi': '3.0.3',
    'info': {'title': 'Fiado Control — API', 'version': '0.7.0',
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
