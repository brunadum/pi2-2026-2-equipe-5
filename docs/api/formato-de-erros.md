# Formato de erros da API

## Formato padrão

Toda resposta de erro das rotas implementadas segue este formato, exceto o caso de venda rejeitada (ver abaixo):

```json
{
  "erro": "codigo_do_erro",
  "mensagem": "Texto em português explicando o erro"
}
```

Em `POST /api/clientes`, o erro `campo_obrigatorio` traz também a lista de campos ausentes:

```json
{
  "erro": "campo_obrigatorio",
  "mensagem": "Campos obrigatórios ausentes",
  "campos": ["cpf", "telefone"]
}
```

## Códigos HTTP usados

| Código | Quando |
|---|---|
| 400 | Corpo da requisição não é um JSON válido, falta um campo obrigatório ou um campo tem formato inválido |
| 404 | O recurso pedido não existe nos dados fixos (cliente ou parcela) |
| 405 | Método HTTP não suportado pela rota |
| 422 | Regra de negócio impede a ação (CPF já cadastrado, venda rejeitada, pagamento acima do devido) |

## Códigos de erro por rota

| Rota | Código de erro | HTTP |
|---|---|---|
| `POST /api/clientes` | `json_invalido`, `campo_obrigatorio` | 400 |
| `POST /api/clientes` | `cpf_invalido` | 422 |
| `POST /api/vendas` | `json_invalido`, `campo_obrigatorio`, `campo_invalido` | 400 |
| `POST /api/vendas` | `cliente_nao_encontrado` | 404 |
| `POST /api/pagamentos` | `json_invalido`, `campo_obrigatorio`, `campo_invalido` | 400 |
| `POST /api/pagamentos` | `parcela_nao_encontrada` | 404 |
| `POST /api/pagamentos` | `valor_excede_devido` | 422 |
| `GET /api/dashboard` | `periodo_invalido`, `campo_invalido` | 400 |
| Qualquer rota | `metodo_nao_permitido` | 405 |

`campo_invalido` cobre formato errado: modalidade diferente de `fiado` e `a_prazo`, data fora de `AAAA-MM-DD`, valor menor ou igual a zero e `dias` que não seja inteiro maior que zero.

## Caso especial: venda rejeitada

Quando `POST /api/vendas` é rejeitado, a resposta (422) não segue o formato padrão de erro. Ela segue o formato definido na rota 10 do contrato (`docs/api/contratoAPI.md`):

```json
{
  "id_venda": 5,
  "status": "rejeitada",
  "motivo": "limite_credito_excedido"
}
```

O `motivo` é `limite_credito_excedido` ou `credito_bloqueado`. Esse formato representa uma decisão de negócio, não um erro de requisição, por isso não tem os campos `erro` e `mensagem`.
