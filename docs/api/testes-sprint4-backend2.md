# Sprint 4 — critérios de aceitação e testes de Backend 2

Alterações locais. Publicação, comentários e fechamento das issues ficam com o
responsável. Os testes usam PostgreSQL real em banco de teste, com schema/seed
isolados. A identidade é simulada pelo middleware **exclusivo de teste**.
Isso comprova as regras das views, não uma autenticação Bearer ponta a ponta.

## #63 — consultar limite

Classe `ConsultaCreditoTests`, em `core/test_credito.py`:

| Critério | Teste | Resultado exigido |
|---|---|---|
| Formato, dívida e coerência com saldo | `test_consulta_coerente_com_saldo_para_funcionario` | HTTP 200 com cinco campos iguais aos de `/saldo` |
| Limite/dívida zero e URL com barra | `test_cliente_sem_divida_e_limite_zero` | Valores zero e crédito desbloqueado |
| Dívida maior que limite e cliente bloqueado | `test_consulta_bloqueada_preserva_disponivel_financeiro` | Disponível zero, sem apagar dívida ou bloqueio |
| Não autenticado e headers forjados | `test_sem_identidade_nem_header_inventado_nao_acessa` | HTTP 401 |
| IDs inválidos e cliente inexistente | `test_identificador_e_cliente_inexistente` | HTTP 400 ou 404, com código de erro |
| Método incorreto | `test_metodo_nao_permitido` | HTTP 405 |

## #64 — alterar limite

Classe `AlteracaoCreditoTests`, em `core/test_credito.py`:

| Critério | Teste | Resultado exigido |
|---|---|---|
| Persistência e impacto nas próximas vendas | `test_gerente_define_limite_que_afeta_novas_vendas` | Limite 200,50; venda 200,51 rejeitada com HTTP 422 |
| Zero permitido | `test_limite_zero_permitido` | HTTP 200 e limite zero |
| Precisão, tipo e faixa | `test_valores_invalidos_nao_alteram_limite` | HTTP 422; limite anterior preservado |
| JSON/campos obrigatórios | `test_validacoes_de_corpo` | HTTP 400, erro padronizado |
| Identificador e existência | `test_put_identificador_invalido_e_cliente_ausente` | HTTP 400/404 |
| Escrita exclusiva de gerente | `test_funcionario_nao_altera_mesmo_forjando_autor`, `test_anonimo_nao_altera` | HTTP 403/401 |
| Perfil/situação conferidos no banco | `test_usuario_inativado_ou_perfil_alterado_nao_mantem_permissao` | HTTP 403 após mudança de perfil; 401 após inativação |
| Ator, data/hora, valores e motivo | `test_auditoria_persiste_ator_valores_motivo_e_horario` | Evento com ator 2 mesmo quando o corpo informa ator 1 |
| Atomicidade | `test_falha_de_auditoria_desfaz_limite` | Restrição real no banco causa rollback do limite |
| Idempotência e limite abaixo da dívida | `test_idempotencia_e_limite_abaixo_da_divida` | Dívida preservada, disponível zero, um só evento |
| Motivo e máximo permitido | `test_motivo_invalido_nao_atualiza` | Motivo inválido rejeitado; 200 caracteres e 99999999,99 aceitos |
| Concorrência | `test_duas_alteracoes_concorrentes_preservam_cadeia_de_auditoria` | Duas conexões concluem sem perder a cadeia anterior/novo |

## #65 — bloquear/desbloquear crédito

Classe `BloqueioCreditoTests`, em `core/test_credito.py`:

| Critério | Teste | Resultado exigido |
|---|---|---|
| Bloquear e desbloquear | `test_bloqueio_impede_venda_e_desbloqueio_permite` | Venda recebe 422 `credito_bloqueado`; após desbloqueio, 201 |
| Dívida e recebimentos preservados | `test_bloqueio_preserva_divida_e_permite_baixa` | Bloqueio não altera saldo; baixa reduz a dívida |
| Booleano estrito/campo obrigatório | `test_bloqueio_exige_booleano_estrito` | 400 para número/texto/lista/objeto ou ausência |
| Perfis | `test_bloqueio_funcionario_recebe_403`, `test_bloqueio_anonimo_recebe_401` | HTTP 403/401 |
| Método, JSON, identificador, inexistência | `test_bloqueio_erros_de_requisicao` | HTTP 405/400/404 |
| Auditoria e repetição | `test_bloqueio_idempotente_e_auditado` | Um evento, ator 2, estado false → true |
| Atomicidade | `test_falha_auditoria_desfaz_bloqueio` | Falha real no banco desfaz bloqueio |
| Demais regras após desbloqueio | `test_desbloqueio_nao_ignora_atraso` | Venda continua rejeitada por parcelas em atraso |

## #61 — contrato e rastreabilidade

- Este documento relaciona RF06/RN01/RN04/RN05 e RNF05 às operações e aos testes;
  serve como insumo para a matriz geral mantida por Requisitos.
- `ContratoRespostasTests.test_respostas_reais_das_13_operacoes_correspondem_ao_openapi`
  executa as 13 operações documentadas e valida os JSONs reais usando os schemas
  OpenAPI (o login legado é exercitado com entrada ausente e resposta 400).
- `DocumentacaoTests.test_credito_descreve_perfis_erros_e_dependencia_de_autenticacao`
  confere Bearer, respostas HTTP e a dependência explícita de `request.usuario`.
- Contrato e lista de erros atualizados em `contratoAPI.md` e `formato-de-erros.md`.

## #62 — OpenAPI e Swagger

Classe `DocumentacaoTests`, em `core/test_documentacao.py`:

| Critério | Teste | Resultado exigido |
|---|---|---|
| Especificação válida | `test_openapi_valido_com_todas_as_referencias` | Validação OpenAPI 3.0.3 sem erro |
| Apenas operações existentes, IDs únicos | `test_schema_publico_e_somente_operacoes_existentes` | 13 operações e URLs resolvíveis |
| HTML configura Swagger local | `test_swagger_aponta_schema_local_sem_envio_a_validador_externo` | UI aponta JSON local, validador remoto desabilitado, sem persistir autorização |
| Erros das rotas de documentação | `test_documentacao_rejeita_post_com_json` | HTTP 405 padronizado |
| Bearer, perfis e integração pendente | `test_credito_descreve_perfis_erros_e_dependencia_de_autenticacao` | Descrição e respostas correspondentes às views |

Inspeção no navegador em 27/10/2026: `/api/docs/`, JSON e recursos Swagger UI
retornaram HTTP 200; 13 operações renderizadas e nenhum erro no console.
O CDN precisa estar acessível. Isso não comprova a autenticação ainda pendente.

## Como executar e ver cada resultado

Resultado verificado em 27/10/2026: **118 testes passaram**, sendo 84 da base
e 34 adicionados nesta entrega. A migração `0002_auditoria_credito` foi aplicada
com sucesso na criação do banco de teste. Nenhuma issue foi fechada por esta etapa.

No PowerShell, a partir de `fiado-control/back_end`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv\Scripts\python.exe manage.py test core.test_credito.ConsultaCreditoTests --noinput --verbosity 2
.\.venv\Scripts\python.exe manage.py test core.test_credito.AlteracaoCreditoTests --noinput --verbosity 2
.\.venv\Scripts\python.exe manage.py test core.test_credito.BloqueioCreditoTests --noinput --verbosity 2
.\.venv\Scripts\python.exe manage.py test core.test_credito.ContratoRespostasTests core.test_documentacao --noinput --verbosity 2
.\.venv\Scripts\python.exe manage.py test core --noinput
```

## Pendências de integração

- Backend 1/3 deve entregar a validação do token e definir a identidade interna.
  Testes de token válido, inválido e expirado por HTTP real pertencem a essa
  integração; não estão sendo declarados aprovados aqui.
- Aplicar `manage.py migrate` no ambiente usado pela equipe antes de utilizar
  as escritas. A migração é exercitada no banco de teste; não altera a base de
  desenvolvimento durante esses testes.
- Docker não está disponível nesta sessão; execução de Compose não foi verificada.
