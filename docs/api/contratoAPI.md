# Contrato da API — Fiado Control

Cobre as issues #10 (rotas de cliente), #11 (rotas de venda e pagamento) e
#12 (rotas de dashboard), fechando as 10 rotas da entrega individual do
Integrante 2 na Sprint 1.

Nomes de campo conferem com o MER (entidades `USUÁRIO`, `CLIENTE`, `VENDA`,
`PAGAMENTO`, `CONFIGURAÇÃO`).

Formato de data usado em toda a API: `YYYY-MM-DD` (ISO 8601).

---

## Cliente (issue #10)

### 1. Listar clientes

- **Caminho**: `/api/clientes`
- **Método**: `GET`
- **Entrada** (query params, todos opcionais e combináveis):
```json
{ "nome": "Maria", "cpf": "12345678900", "telefone": "88999990000" }
```
- **Saída** (200):
```json
[
  {
    "id_cliente": 1,
    "nome": "Maria Souza",
    "cpf": "12345678900",
    "telefone": ["88999990000"],
    "limite_credito": 500.00,
    "ativo": true
  }
]
```

### 2. Cadastrar cliente

- **Caminho**: `/api/clientes`
- **Método**: `POST`
- **Entrada**:
```json
{
  "nome": "Maria Souza",
  "cpf": "12345678900",
  "telefone": ["88999990000"],
  "limite_credito": 500.00
}
```
- **Saída** (201):
```json
{
  "id_cliente": 1,
  "nome": "Maria Souza",
  "cpf": "12345678900",
  "telefone": ["88999990000"],
  "limite_credito": 500.00,
  "ativo": true
}
```
- **Erro de validação** (422):
```json
{ "erro": "cpf_invalido", "mensagem": "CPF já cadastrado para outro cliente" }
```

### 3. Detalhar cliente

- **Caminho**: `/api/clientes/{id_cliente}`
- **Método**: `GET`
- **Entrada**: nenhuma (id na URL)
- **Saída** (200) — inclui saldo devedor e parcelas pendentes, cobrindo a
  consulta do UC03 (limite de crédito) e do UC04 (parcelas em aberto):
```json
{
  "id_cliente": 1,
  "nome": "Maria Souza",
  "cpf": "12345678900",
  "telefone": ["88999990000"],
  "limite_credito": 500.00,
  "ativo": true,
  "saldo_devedor": 180.00,
  "parcelas_pendentes": [
    { "id_pagamento": 10, "id_venda": 5, "valor_parcela": 90.00, "data_vencimento": "2026-10-01", "status": "pendente" }
  ]
}
```

### 4. Editar cliente

- **Caminho**: `/api/clientes/{id_cliente}`
- **Método**: `PUT`
- **Entrada**:
```json
{ "nome": "Maria Souza", "telefone": ["88999990000", "8833330000"], "limite_credito": 600.00 }
```
- **Saída** (200): mesmo formato da rota 3, sem `parcelas_pendentes`.

---

## Venda e Pagamento (issue #11)

### 5. Registrar venda

- **Caminho**: `/api/vendas`
- **Método**: `POST`
- **Entrada**:
```json
{
  "id_cliente": 1,
  "modalidade": "a_prazo",
  "valor_total": 300.00,
  "parcelas": [
    { "valor_parcela": 150.00, "data_vencimento": "2026-10-05" },
    { "valor_parcela": 150.00, "data_vencimento": "2026-11-05" }
  ]
}
```
- **Saída — venda aprovada** (201):
```json
{
  "id_venda": 5,
  "id_cliente": 1,
  "modalidade": "a_prazo",
  "data_venda": "2026-09-20",
  "valor_total": 300.00,
  "status": "aprovada"
}
```
- **Saída — venda rejeitada** (422), decisão já fechada anteriormente:
```json
{
  "id_venda": 5,
  "status": "rejeitada",
  "motivo": "limite_credito_excedido"
}
```

### 6. Autorizar venda rejeitada

- **Caminho**: `/api/vendas/{id_venda}/autorizar`
- **Método**: `PATCH`
- **Restrição**: apenas papel Gerente
- **Entrada**:
```json
{ "id_usuario_gerente": 2 }
```
- **Saída** (200):
```json
{
  "id_venda": 5,
  "status": "aprovada",
  "autorizado_por": 2
}
```

### 7. Registrar pagamento (baixa de parcela)

- **Caminho**: `/api/vendas/{id_venda}/pagamentos`
- **Método**: `POST`
- **Entrada**:
```json
{ "id_pagamento": 10, "valor_recebido": 90.00 }
```
- **Saída** (200) — devolve o saldo devedor atualizado do cliente, cobrindo
  o critério de aceitação da issue #11:
```json
{
  "id_pagamento": 10,
  "status": "pago",
  "data_pagamento": "2026-09-20",
  "saldo_devedor_cliente": 90.00
}
```

---

## Dashboard (issue #12)

### 8. Clientes próximos do vencimento

- **Caminho**: `/api/dashboard/vencimentos`
- **Método**: `GET`
- **Restrição**: apenas papel Gerente
- **Entrada** (query param):
```json
{ "dias": 7 }
```
- **Saída** (200):
```json
[
  { "id_cliente": 1, "nome": "Maria Souza", "id_pagamento": 10, "valor_parcela": 90.00, "data_vencimento": "2026-09-27" }
]
```

### 9. Clientes em atraso

- **Caminho**: `/api/dashboard/atrasados`
- **Método**: `GET`
- **Restrição**: apenas papel Gerente
- **Entrada**: nenhuma
- **Saída** (200):
```json
[
  { "id_cliente": 3, "nome": "João Lima", "id_pagamento": 7, "valor_parcela": 120.00, "data_vencimento": "2026-09-10", "dias_atraso": 10 }
]
```

### 10. Totais de vendas por período

- **Caminho**: `/api/dashboard/totais`
- **Método**: `GET`
- **Restrição**: apenas papel Gerente
- **Entrada** (query param):
```json
{ "periodo": "mes" }
```
- Valores aceitos para `periodo`: `dia`, `semana`, `mes`
- **Saída** (200):
```json
{
  "periodo": "mes",
  "faturamento_total": 4200.00,
  "total_a_receber": 1800.00,
  "taxa_inadimplencia": 0.12
}
```

---

## Rotas adicionais (fora da contagem das 10)

Decisão de design já registrada anteriormente, ainda sem issue própria no
board — mantida aqui para não se perder:

### Configuração de juros e multa

- **Caminho**: `/api/configuracoes/juros`
- **Métodos**: `GET`, `PUT`
- **Restrição**: apenas papel Dono
- **Entrada** (PUT):
```json
{ "taxa_juros": 0.02, "taxa_multa": 0.05 }
```
- **Saída**:
```json
{ "id_configuracao": 1, "taxa_juros": 0.02, "taxa_multa": 0.05, "definido_por": 2 }
```
