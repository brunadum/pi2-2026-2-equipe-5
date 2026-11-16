# Sprint 5 — Backend 2: configurações e relatórios

Entrega em 16/11/2026. Requisitos: RF01, RF05, RF09, RF10, RF12; integridade RN03/RN04/RN05 e RNF01/RNF02/RNF05.

## Resultado

Configurações de juros e multa são consultadas e gravadas no PostgreSQL, com histórico e autoria autenticada. As duas URLs `/api/configuracoes/cobranca` e `/api/configuracoes/` usam a mesma implementação do contrato de cobrança.

Dashboard e relatórios mostram faturamento aprovado, recebimentos efetivos, dívida atual, valor vencido e taxa de atraso. Os filtros de faturamento/recebimento são feitos no servidor. A taxa em percentual foi separada da fração para evitar exibir 0,12% quando a inadimplência é 12%.

`GET /api/pagamentos` lista as baixas efetivamente registradas, incluindo forma de pagamento e usuário. Não lista parcelas como se fossem dinheiro recebido. O seed antigo possui parcelas quitadas sem registros de baixa; elas não geram recebimentos fictícios.

As cinco categorias de relatório possuem consulta JSON e exportação CSV no servidor. Os arquivos respeitam os filtros, preservam acentos e neutralizam células de texto que poderiam ser interpretadas como fórmulas. Uma consulta sem resultados ainda gera um CSV válido.

O backend disponibiliza catálogo compartilhado e desconto de parcela. O desconto possui motivo obrigatório, reduz o saldo e registra auditoria na mesma transação. Descontos não aumentam os recebimentos do dashboard. A integração dessas rotas às telas é responsabilidade do frontend.

Correção de escopo solicitada pelo usuário: todas as alterações feitas no frontend foram desfeitas, incluindo telas, scripts, configuração e proxy. O frontend original utiliza `http://localhost:8001/api`. Após a confirmação do erro pelo usuário, foi aplicado um ajuste pontual de duas linhas em `js/services/api.js`: envio do token existente em Bearer. HTML, CSS, navegação e os demais scripts permanecem originais.

## Critérios de aceitação verificados

| Requisito | Critério | Evidência automatizada |
|---|---|---|
| RF10/RN04 | Alterar taxas persiste, afeta saldo e registra o autor real | `ConfiguracoesTests.test_consulta_e_alteracao_persistem_e_afetam_encargos` |
| RF10/RNF05 | Taxas inválidas não alteram dados; zero é aceito | `test_taxas_invalidas_nao_alteram_configuracao` |
| RF10/RN04 | Repetição sem mudança não duplica auditoria | `test_repeticao_nao_duplica_auditoria` |
| RF10/RNF05 | Falha de auditoria desfaz a configuração | `test_falha_da_auditoria_desfaz_configuracao` |
| RF10/RNF05 | Alterações concorrentes preservam o histórico | `test_alteracoes_concorrentes_preservam_historico` |
| RF09/RF12 | Faturamento exclui rejeitadas; recebimento respeita período; percentual é correto | `RelatoriosTests.test_dashboard_exclui_rejeitadas_filtra_recebimentos_e_informa_percentual` |
| RF05/RF12 | Recebimentos reais com filtros e datas válidas | `test_pagamentos_lista_recebimentos_reais_com_filtros` |
| RF12 | Relatórios filtrados e exportação protegida | `test_relatorios_filtram_vendas_aprovadas_e_recebimentos`, `test_csv_preserva_acentos_e_impede_formulas` |
| RNF01/RNF02 | Anônimo recebe 401 e funcionário não acessa consolidado | Testes de permissão em `ConfiguracoesTests` e `RelatoriosTests`; JWT real em `JWTIntegracaoTests` |
| RF01 | Catálogo persiste e não duplica nome | `CatalogoTests` |
| RF10/RN03 | Desconto reduz dívida sem fabricar recebimento e pode quitar parcela | `DescontosTests` |
| RF10/RN04 | Falha na auditoria desfaz desconto | `test_falha_da_auditoria_desfaz_desconto` |
| RF05 | Forma de recebimento e autor do JWT são preservados | `JWTIntegracaoTests.test_recebimento_persiste_forma_e_autor_do_login` |
| Contrato | Novas respostas correspondem ao OpenAPI | `test_novas_rotas_financeiras_usam_jwt_e_correspondem_ao_openapi`, `DocumentacaoTests` |

Os testes de venda usam vencimentos futuros calculados a partir do ano atual, corrigindo as seis falhas causadas pela data fixa de 05/11/2026. O cenário explícito de vencimento inválido continua testado.

## Executar a verificação

No PowerShell, a partir de `fiado-control/back_end`, com as dependências de teste já instaladas e PostgreSQL Docker disponível:

```powershell
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
.\.venv\Scripts\python.exe manage.py test core --noinput --verbosity 1
```

O Django cria/remove `test_fiadocontrol`. O reset de esquema dos testes acontece exclusivamente nesse banco. Resultado da suíte desta entrega: 159 testes passaram.

Verificação histórica no navegador, em 16/11/2026, com alterações temporárias de frontend posteriormente desfeitas a pedido do usuário (não descreve o estado atual das telas):

- Login de gerente, indicadores de relatório e troca de período com HTTP 200 pelo proxy `/api`.
- Downloads dos cinco CSVs (vendas, pagamentos, clientes, inadimplência e financeiro) concluídos sem falha.
- Login de funcionário direciona a Clientes e impede exportações financeiras; gerente acessa os relatórios.
- Falha de rede simulada limpa os indicadores antigos e desabilita exportações; ao recuperar a conexão, a tela volta a carregar os dados.
- Taxa de juros alterada de 2% para 3%, recarregada do servidor e restaurada para 2%; multa original de 5% preservada.
- Configurações e relatórios em largura de 390 px sem rolagem horizontal.
- Formulário de desconto exige seleção de uma parcela e confirmação; cancelar não dispara POST nem altera a dívida.
- Seis asserções Postman passaram contra dashboard, pagamentos e configurações pelo proxy do Docker.
- Regressão do modal testada com POST de catálogo atrasado e resposta simulada: antes, Escape permitia substituir o item B pelo item A; depois, modal/campos ficam bloqueados e os dois itens são preservados. O cenário não registra venda nem altera o catálogo real.

## Banco e limites da entrega

Migrações aditivas `0004_auditoria_financeira` e `0005_catalogo_descontos`: auditoria financeira, forma de recebimento, catálogo se ausente e descontos separados. Nenhuma tabela de vendas/clientes existente é apagada. Backup local foi salvo antes de aplicar as migrações no ambiente Docker.

Juros e multa mantêm a regra já implementada: aplicação única à parcela vencida, com abatimentos. Não foi introduzida cobrança diária ou mensal proporcional. As taxas afetam encargos ainda abertos, e não modificam o dinheiro já recebido.

Esta entrega conclui as integrações descritas acima. O controle global dos endpoints legados continua na issue #60; edição/histórico completo de clientes, usuários, exceções e cancelamentos continuam nos respectivos escopos da equipe. Os controles antigos de frontend que ainda usam armazenamento local nessas outras funcionalidades não equivalem a gravação no servidor. A conclusão deste conjunto não substitui a validação com o cliente nem a liberação do sistema inteiro para operação real.


## Compatibilidade com o frontend original

- As rotas protegidas exigem `Authorization: Bearer <token>`. O serviço compartilhado agora encaminha o token existente da sessão; a autenticação do backend permanece exigida.
- O endpoint `/api/configuracoes/` foi adaptado para receber e devolver os onze campos da tela. Juros mensais e multa diária foram confirmados expressamente pelo usuário; a regra entra em vigor ao salvar o payload da tela. A URL `/api/configuracoes/cobranca` mantém compatibilidade com taxas em fração.
- As cinco exportações CSV estão disponíveis na API; a tela original continua com sua implementação própria de exportação. Os indicadores adicionais do dashboard mantêm compatibilidade com os nomes esperados por ela.


## Atualização: integração pontual e cobrança mensal/diária

O usuário confirmou **juros mensais e multa diária, conforme a tela**. O backend passa a aceitar os onze campos originais sem mudança de layout. `GET /configuracoes/` não grava nem muda o modo de cobrança; registros antigos permanecem em modo `unica`. Ao salvar o payload completo da tela, o modo passa a `mensal_diaria`.

- Juros simples proporcionais aos dias, com mês comercial de 30 dias; multa proporcional a cada dia de atraso. Valores são arredondados para centavos.
- A base é ponderada pelos dias em que o principal ficou aberto. Pagamentos/descontos reduzem a base a partir da data do abatimento. Exemplo: principal100, 30 dias em atraso, juros10% ao mês e multa0,33% ao dia resultam em119,90.
- Percentuais na tela têm até duas casas decimais. As taxas em fração aceitam quatro casas para preservar0,33%=0,0033.
- Limite padrão é aplicado ao cadastrar clientes; teto de desconto é cumulativo por parcela; opção de baixa parcial e permissões de cadastro/recebimento para operadores são aplicadas no servidor.
- Regras obrigatórias não são desligadas por configuração: CPF obrigatório, bloqueio de venda com atraso e relatórios financeiros exclusivos do gerente. A aprovação por senha de administrador ainda não existe. Tentar ativar/desativar essas opções de forma incompatível retorna422 `politica_nao_disponivel`, sem gravação fictícia. Os valores devolvidos pelo GET refletem essas regras atuais.
- Quando um objeto recebido pelo GET contém os dois formatos de taxas, os campos da tela prevalecem no PUT. As políticas não são ignoradas silenciosamente.

Migração0006 amplia a precisão das taxas e acrescenta modo/preferências; não altera taxas nem registros financeiros existentes. Backup foi salvo antes da aplicação no Docker.

Validação adicional: `node --test tests/api-client-auth.test.cjs` verifica o cliente HTTP real contra servidor local: token encaminhado e401 preservado sem sessão. `core.test_configuracoes_tela` cobre o contrato completo, precisão, cobrança proporcional, amortizações, políticas, limites e teto cumulativo. No navegador, as telas originais de Configurações e Relatórios carregaram com HTTP200 e sem avisos de autenticação.

Resultado da verificação após esta atualização: **172 testes Django passaram**, **2 testes Node passaram** e as duas telas originais carregaram no navegador sem os avisos de autenticação. O teste de gravação usa banco de teste isolado; a verificação de leitura no navegador não altera as taxas da instalação.
