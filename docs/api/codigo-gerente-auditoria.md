# Código do gerente e consulta de auditoria

OpenAPI 0.7.0. Atende o contrato proposto pelo frontend (`js/services/codigo-gerente.js`, `js/services/auditoria.js`).

## Código do gerente

Código de 6 dígitos, definido pelo gerente, que libera operações restritas. Só o **hash** (Django `make_password`) é guardado, na tabela `codigo_gerente` (linha única, migração `0009`). O código não aparece em respostas, logs nem na auditoria.

| Rota | Quem | Resultado |
|---|---|---|
| `GET /api/configuracoes/codigo-gerente` | gerente ou funcionário | `{"definido": true\|false}` |
| `PUT /api/configuracoes/codigo-gerente` | somente gerente | Corpo `{"codigo_novo", "codigo_atual"?}`. A 1ª definição dispensa `codigo_atual`; a troca o exige |
| `POST /api/autorizacoes/gerente` | gerente ou funcionário | Corpo `{"codigo"}` → `{"autorizado": true, "token_autorizacao", "expira_em_segundos": 120}` |

Erros: `400 codigo_invalido` (fora de 6 dígitos), `422 codigo_atual_obrigatorio`, `422 codigo_atual_invalido`, `422 codigo_gerente_invalido`, `409 codigo_gerente_nao_definido` e `429 codigo_gerente_bloqueado` (cabeçalho `Retry-After`).

**Proteção contra tentativas:** 5 erros seguidos bloqueiam por 60 s no servidor, tanto em `POST /autorizacoes/gerente` quanto na troca do código. O contador zera ao acertar.

**Token de autorização.** Vale 120 s e só para o usuário que digitou o código. Usa chave derivada, por isso não funciona como Bearer de login. Enviado em `X-Autorizacao-Gerente`, permite a um **funcionário**:

- `PUT /clientes/{id}/limite`
- `POST /vendas/{id}/cancelar`
- `POST /pagamentos/{id}/estornar`
- `POST /usuarios`

Nenhuma outra operação de gerente é liberada (bloqueio de crédito, configurações, listagem de usuários, auditoria e relatórios continuam só do gerente). A auditoria registra o funcionário como autor, e cada uso do código gera o evento `autorizacao_gerente`. Alterar o código gera `codigo_gerente`.

Limitação conhecida: o token não é de uso único; vale até expirar (120 s).

## Auditoria

`GET /api/auditoria` (somente gerente) reúne `auditoria_financeira` e `auditoria_credito`, do mais recente ao mais antigo. Filtros opcionais: `operacao`, `id_usuario`, `data_inicio`, `data_fim` (AAAA-MM-DD) e `limite` (1–500, padrão 200). Datas inválidas, `data_inicio` posterior a `data_fim` e ids inválidos retornam `400 campo_invalido`.

Cada registro: `id_auditoria` (texto `f12` ou `c5`, pois as duas tabelas têm numeração própria), `data_hora`, `id_usuario`, `nome_usuario`, `operacao`, `id_recurso`, `valores_anteriores`, `valores_novos`, `motivo`.

## Testes

`core/test_codigo_gerente_auditoria.py` (28 testes): definição e troca, formato, bloqueio e liberação, uso do token e seus limites (expirado, de outro usuário, de outra natureza, fora da lista) e filtros da auditoria. Em `core/test_documentacao.py`, a contagem passou a 45 operações.
