# Formato de erros da API

Contrato das rotas implementadas, atualizado pela issue #48. Base: `/api`.
Validações em `core/validacoes.py`, `core/financeiro.py` e `core/views.py`,
dentro de `fiado-control/back_end`.

## Formato padrão

Os erros usam `erro` e `mensagem` em português, exceto venda rejeitada por
decisão de negócio, descrita adiante:

```json
{"erro": "campo_invalido", "mensagem": "Nome deve ser texto com até 100 caracteres"}
```

Nos três POSTs, `campo_obrigatorio` também lista os campos ausentes. `null`,
texto vazio, somente espaços e lista vazia são considerados ausentes:

```json
{"erro": "campo_obrigatorio", "mensagem": "Campos obrigatórios ausentes", "campos": ["cpf", "telefone"]}
```

## Todos os códigos retornados

| Código `erro` | HTTP | Condição |
|---|---|---|
| `json_invalido` | 400 | Corpo malformado, número fora do intervalo do leitor JSON ou JSON que não seja um objeto |
| `campo_obrigatorio` | 400 | Um ou mais campos obrigatórios ausentes |
| `campo_invalido` | 400 | Tipo, identificador, valor, modalidade, quantidade, formato de data ou filtro inválido |
| `telefone_invalido` | 400 | Telefone fora do formato ou campo que não seja lista de textos |
| `periodo_invalido` | 400 | Período do dashboard diferente de `dia`, `semana` ou `mes` |
| `cliente_nao_encontrado` | 404 | Identificador válido, mas cliente inexistente |
| `parcela_nao_encontrada` | 404 | Parcela inexistente ou não pertencente a venda aprovada |
| `metodo_nao_permitido` | 405 | Método não aceito na rota |
| `cpf_duplicado` | 409 | Mesmo CPF já cadastrado, independentemente da máscara |
| `cpf_invalido` | 422 | CPF fora do formato ou com dígitos verificadores inválidos |
| `vencimento_invalido` | 422 | Primeiro vencimento anterior à data de hoje |
| `valor_excede_devido` | 422 | Pagamento maior que o valor atualizado em aberto da parcela |
| `parcela_ja_paga` | 422 | Parcela já quitada |
| `nao_autenticado` | 401 | RF06: identidade validada ausente ou usuário inativo; inclui `WWW-Authenticate: Bearer` |
| `acesso_negado` | 403 | RF06: funcionário tentando alterar crédito ou perfil desconhecido |
| `limite_invalido` | 422 | Limite não numérico, booleano, não finito, negativo, maior que 99999999.99 ou com fração de centavo |

**Mudança da #48:** CPF duplicado retorna **409 `cpf_duplicado`**. O antigo
422 `cpf_invalido` para duplicidade não deve mais ser usado pelo consumidor.

## Códigos por rota

| Método / rota | Códigos |
|---|---|
| `GET /clientes` | `campo_invalido` |
| `POST /clientes` | `json_invalido`, `campo_obrigatorio`, `campo_invalido`, `telefone_invalido`, `cpf_invalido`, `cpf_duplicado` |
| `GET /clientes/{id}` | `campo_invalido`, `cliente_nao_encontrado` |
| `GET /clientes/{id}/saldo` | `campo_invalido`, `cliente_nao_encontrado` |
| `GET /clientes/{id}/parcelas` | `campo_invalido`, `cliente_nao_encontrado` |
| `GET /vendas` | `campo_invalido` |
| `POST /vendas` | `json_invalido`, `campo_obrigatorio`, `campo_invalido`, `cliente_nao_encontrado`, `vencimento_invalido`; decisões de negócio abaixo |
| `POST /pagamentos` | `json_invalido`, `campo_obrigatorio`, `campo_invalido`, `parcela_nao_encontrada`, `valor_excede_devido`, `parcela_ja_paga` |
| `GET /dashboard` | `periodo_invalido`, `campo_invalido` |
| `GET /clientes/{id}/limite` | `campo_invalido`, `nao_autenticado`, `acesso_negado`, `cliente_nao_encontrado` |
| `PUT /clientes/{id}/limite` | `json_invalido`, `campo_obrigatorio`, `campo_invalido`, `nao_autenticado`, `acesso_negado`, `cliente_nao_encontrado`, `limite_invalido` |
| `PUT /clientes/{id}/credito/bloqueio` | `json_invalido`, `campo_obrigatorio`, `campo_invalido`, `nao_autenticado`, `acesso_negado`, `cliente_nao_encontrado` |

Todas essas rotas também retornam `405 metodo_nao_permitido` para métodos não
suportados. Identificadores nas URLs e corpos devem ser inteiros positivos até
2147483647; textos contendo apenas dígitos também são aceitos. Booleanos,
frações, zero, negativos e valores fora desse intervalo são rejeitados.

## Regras de validação

- **Nome:** texto obrigatório, até 100 caracteres após retirar espaços externos.
- **CPF no cadastro:** texto de 11 dígitos ASCII, sem máscara ou no formato
  `XXX.XXX.XXX-XX`. Valida os dois dígitos verificadores e rejeita sequências de
  um dígito repetido. Salva sem máscara. A duplicidade considera os CPFs
  formatados do seed e é verificada antes dos dígitos verificadores; um CPF
  ilustrativo já existente continua retornando 409. Não consulta a situação
  cadastral na Receita Federal.
- **Telefone no cadastro:** lista não vazia de textos. Aceita DDD de dois
  dígitos (primeiro diferente de zero), fixo com oito dígitos iniciado por 2–5
  ou celular com nove iniciado por 9. DDI `55`/`+55` opcional; DDD pode ter
  parênteses, com separadores espaço, ponto ou hífen. Exemplos:
  `88999990000`, `(88) 99999-0000`, `+55 (88) 99999-0000`, `8833330000`.
  Salva somente DDD e número, removendo duplicados. Valida formato sem
  confirmar a existência da linha.
- **Valores:** número JSON positivo, finito, até duas casas decimais e até
  99999999.99. Rejeita textos, booleanos, zero, negativos e frações de centavo,
  sem arredondamento silencioso na entrada.
- **Limite de crédito (RF06):** segue a precisão e máximo acima, mas aceita
  zero. Limite inválido retorna 422 `limite_invalido`; campo ausente, `null`
  ou texto em branco retorna 400 `campo_obrigatorio`.
- **Bloqueio de crédito (RF06):** `bloqueado` deve ser booleano JSON.
  Campo ausente ou `null` retorna 400 `campo_obrigatorio`; tipo incorreto,
  400 `campo_invalido`. `false` é um valor válido.
- **Motivo de crédito:** opcional, texto de até 200 caracteres após retirar
  espaços externos; tipo incorreto ou excesso retorna 400 `campo_invalido`.
- **Parcelas:** em `a_prazo`, quantidade obrigatória e inteira positiva; cada
  parcela precisa ter pelo menos um centavo. Em `fiado`, quantidade omitida
  vale 1; informada, precisa ser o inteiro 1. Os vencimentos mensais precisam
  caber no intervalo de datas suportado (ano até 9999).
- **Vencimento:** data real no formato exato `AAAA-MM-DD`, a partir de hoje.
  Data malformada retorna 400; data válida anterior a hoje retorna 422.
- **Busca de clientes:** nome até 100 caracteres; CPF de 1 a 11 dígitos, com
  pontos/hífen opcionais; telefone parcial até 11 dígitos nacionais ou número
  completo com DDI 55. Busca não exige CPF completo nem recalcula seus dígitos.
- **Busca de vendas:** `id_cliente` válido; `status` em `aprovada`, `rejeitada`,
  `pendente_autorizacao`, `cancelada`; `modalidade` em `fiado`, `a_prazo`;
  datas ISO reais e `data_inicio` não posterior a `data_fim`. Filtros válidos
  são combinados na consulta ao banco.
- **Parcelas do cliente:** filtro `status` em `pendente`, `parcial`, `pago`,
  `atrasado`.
- **Dashboard:** `periodo` em `dia`, `semana`, `mes`; `dias` inteiro positivo
  cuja janela caiba no intervalo de datas suportado. Padrões: mês e sete dias.

Essas decisões de formato complementam RF01, RF02, RF03, RF05 e a issue #48.
Os requisitos disponíveis não definem limite máximo comercial de quantidade
de parcelas ou prazo além da coerência de valores e datas.

## Caso especial: venda rejeitada

O HTTP 422 por RN01, RN02 ou bloqueio explícito preserva o formato da rota 10
do [contrato da API](contratoAPI.md) e da issue #47:

```json
{"id_venda": 5, "status": "rejeitada", "motivo": "limite_credito_excedido"}
```

Motivos possíveis: `credito_bloqueado`, `parcelas_em_atraso` e
`limite_credito_excedido`, nessa ordem. São decisões de negócio persistidas,
sem `erro` e `mensagem`. A validação de entrada ocorre antes dessa decisão.

## Evidências de entrada inválida

Para os prints da #48, uma requisição inválida de cada uma das oito rotas:

| Método / caminho | Entrada inválida | HTTP / código esperado |
|---|---|---|
| `GET /clientes` | `?cpf=abc` | 400 `campo_invalido` |
| `GET /clientes/abc` | ID não numérico | 400 `campo_invalido` |
| `POST /clientes` | CPF `00000000000`, nome e telefone válidos | 422 `cpf_invalido` |
| `GET /clientes/0/saldo` | ID zero | 400 `campo_invalido` |
| `GET /clientes/1/parcelas` | `?status=invalido` | 400 `campo_invalido` |
| `POST /vendas` | `valor_total: -1`, demais campos válidos | 400 `campo_invalido` |
| `POST /pagamentos` | `valor_recebido: 0`, `id_parcela: 1` | 400 `campo_invalido` |
| `GET /dashboard` | `?periodo=ano` | 400 `periodo_invalido` |

Incluir também CPF duplicado (409) e, para a listagem de vendas já existente,
`GET /vendas?status=invalido` (400 `campo_invalido`). Mostrar método, URL,
corpo enviado quando houver, status HTTP e JSON retornado.
