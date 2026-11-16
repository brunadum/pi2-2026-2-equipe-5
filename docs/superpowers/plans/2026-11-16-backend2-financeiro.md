# Entrega Backend 2 — configurações e relatórios

Objetivo: concluir os ajustes autorizados em 16/11/2026, com persistência real e integração no Docker.

Arquitetura: manter Django, SQL parametrizado e PostgreSQL. Reutilizar o cálculo de parcelas e o middleware JWT. Configurações terão GET/PUT em `/configuracoes/cobranca` e alias `/configuracoes/`. A interface editará as duas taxas aprovadas no contrato, em percentual; a API mantém frações (0,02 = 2%). Juros e multa continuam sendo aplicados uma vez por parcela vencida, preservando a regra existente. Os controles especulativos do protótipo serão substituídos pelas regras efetivamente disponíveis.

Dashboard: faturamento e recebimentos filtrados pelo período; dívida e atraso representam a posição atual; taxa de inadimplência em fração e taxa de atraso em percentual. Gráfico das últimas quatro semanas com vendas aprovadas e recebimentos reais. GET `/pagamentos` lista recebimentos, sem confundir recebimento com parcela.

Relatórios: gerente autenticado consulta vendas aprovadas, recebimentos, clientes e posição financeira e exporta CSV. Exportações usam filtros do servidor, protegem células de fórmulas e não dependem de dados demonstrativos no navegador.

Rulings: continuar no checkout atual, que está em detached HEAD e é o diretório montado pelo Docker; não trocar worktree, não publicar nem criar commits sem solicitação. O pedido do usuário já autoriza implementar o diagnóstico anterior. Não alterar a política de cobrança para juros diários/mensais nem ampliar a configuração para regras que contradigam os requisitos.

- [x] 1. Escrever testes de configurações, pagamentos e indicadores com valores calculados manualmente; observar falhas.
- [x] 2. Implementar configurações auditadas, consultas financeiras e relatórios/CSV; verificar filtros, perfis, validação e persistência.
- [x] 3. Integrar token e telas; corrigir percentual, filtros de exportação, datas dos testes e gráfico do dashboard.
- [x] 4. Concluir catálogo e desconto do RF10 com validação, auditoria e testes, conforme diagnóstico autorizado.
- [x] 5. Atualizar contrato/OpenAPI e instruções. Aplicar migração aditiva, reconstruir frontend, testar suíte e navegação real no Docker. Revisar o diff completo antes da entrega.

Verificação: suíte Django conectada ao PostgreSQL Docker em banco `test_fiadocontrol`, testes HTTP autenticados, Playwright para login, alteração/recarregamento de configurações, períodos e downloads de relatórios. Conferir preservação dos dados existentes, falhas de permissão e erros de rede.

Riscos a verificar: taxas inválidas e precisão; pagamento parcial sem duplicação; datas de fronteira; exportação de nomes iniciados com caracteres de fórmula; mudanças concorrentes e rollback de auditoria. Deploy público e funcionalidades de usuários/exceções/cancelamentos permanecem entregas da equipe, fora deste conjunto de rotas.

Resultado final: 159 testes Django passaram; 10 arquivos JavaScript passaram em node --check; 6 asserções Postman contra o Docker passaram; cinco downloads CSV, login de ambos os perfis, persistência/reload das taxas e falha/recuperação de rede verificados no navegador. Revisão independente encontrou e confirmou a correção de uma corrida no modal de produtos. Execução local em computador com Docker foi a opção indicada pelo usuário; hospedagem pública não definida.

Correção de escopo do usuário: frontend restaurado integralmente ao HEAD original, incluindo scripts, telas e Dockerfile; proxy adicional removido. APIs e testes de backend preservados. As verificações de interface acima são históricas e não representam integração concluída do frontend original. Token compartilhado e divergência de campos de configuração foram registrados para a equipe de frontend.

Atualização solicitada após novos erros: correção mínima no envio do token (duas linhas em services/api.js, sem telas) e adaptação de backend aos onze campos. Usuário confirmou juros mensais/multa diária; adotados juros simples por dias/30, com amortizações ponderadas. Migração0006 preserva registros antigos até salvar. Validação de políticas obrigatórias evita confirmar opções não implementadas; limites/parciais/permissões dinâmicas são efetivos. Revisão independente apontou teto acumulado de desconto e GET→PUT misto; ambos tiveram regressões observadas falhando e depois passando.
