# Formato de erros da API

## Formato padrão

Toda resposta de erro das rotas implementadas segue este formato, exceto o caso de venda rejeitada (ver abaixo):

```json
{
  "erro": "codigo_do_erro",
  "mensagem": "Texto em português explicando o erro"
}
```

## Códigos HTTP usados

| Código | Quando |
|---|---|
| 400 | Corpo da requisição não é um JSON válido, ou falta um campo obrigatório |
| 404 | O recurso pedido não existe nos dados fixos (cliente, venda ou parcela) |
| 405 | Método HTTP não suportado pela rota |
| 422 | Regra de negócio impede a ação (CPF já cadastrado, venda rejeitada por limite) |

## Códigos de erro por rota

| Rota | Código de erro | HTTP |
|---|---|---|
| `GET/POST /api/clientes` | `json_invalido`, `campo_obrigatorio` | 400 |
| `POST /api/clientes` | `cpf_invalido` | 422 |
| `POST /api/vendas` | `json_invalido`, `campo_obrigatorio` | 400 |
| `POST /api/vendas` | `cliente_nao_encontrado` | 404 |
| `POST /api/vendas/{id_venda}/pagamentos` | `json_invalido`, `campo_obrigatorio` | 400 |
| `POST /api/vendas/{id_venda}/pagamentos` | `venda_nao_encontrada`, `pagamento_nao_encontrado` | 404 |
| `GET /api/dashboard/totais` | `periodo_invalido` | 400 |
| Qualquer rota | `metodo_nao_permitido` | 405 |

## Caso especial: venda rejeitada

Quando `POST /api/vendas` é rejeitado por limite de crédito excedido, a resposta (422) não segue o formato padrão de erro. Ela segue o formato definido na rota 5 do contrato (`docs/api/contratoAPI.md`):

```json
{
  "id_venda": 5,
  "status": "rejeitada",
  "motivo": "limite_credito_excedido"
}
```

Esse formato representa uma decisão de negócio, não um erro de requisição, por isso não tem os campos `erro` e `mensagem`.