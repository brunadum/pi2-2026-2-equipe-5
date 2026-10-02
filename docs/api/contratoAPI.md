# Contrato da API — Fiado Control

Equivalente à seção 6 (Mapeamento das Rotas do Contrato aos Requisitos) do
`FiadoControl_REQ`: 37 rotas, cada uma ligada a um requisito. Rotas de
autenticação detalhadas em `docs/api/contrato-rotas-autenticacao.md`.

Nomes de campo conferem com o MER (`USUÁRIO`, `CLIENTE`, `VENDA`, `PAGAMENTO`,
`CONFIGURAÇÃO`), com as ressalvas de parcela e pagamento descritas na rota 14.

## Convenções

- **Base**: `/api`. Os caminhos do REQ aparecem aqui sem o prefixo.
- **Datas**: `YYYY-MM-DD` (ISO 8601). **Valores**: número decimal, 2 casas.
- **Autenticação**: `Authorization: Bearer <token>` em todas as rotas, exceto o login.
- **Perfis**: Gerente e Funcionário. A coluna *Perfil* segue a seção 3 do REQ.
  `Permissão: x` significa que a rota exige a permissão individual `x` do
  usuário (`cancelar_vendas`, `estornar_pagamentos`, `conceder_descontos`),
  conforme RF08, RF10 e RF13.
- **Erros**: formato `{ "erro": "codigo", "mensagem": "texto" }`. Perfil sem
  acesso à rota retorna `403 acesso_negado`; sem token válido, `401 nao_autenticado`
  (RNF01, RNF02, RN05).

## Índice

| # | Método | Caminho | Requisito | Perfil |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | RNF01 | Todos |
| 2 | POST | `/auth/logout` | RNF01 | Todos |
| 3 | GET | `/clientes` | RF02 | Todos |
| 4 | GET | `/clientes/{id}` | RF02, RF04 | Todos |
| 5 | POST | `/clientes` | RF03 | Todos |
| 6 | PUT | `/clientes/{id}` | RF03 | Todos |
| 7 | GET | `/clientes/{id}/saldo` | RF04 | Todos |
| 8 | GET | `/clientes/{id}/historico` | RF04 | Todos |
| 9 | GET | `/clientes/{id}/parcelas` | RF04, RF05 | Todos |
| 10 | POST | `/vendas` | RF01 | Todos |
| 11 | GET | `/vendas` | RF12 | Gerente (Funcionário: só as próprias) |
| 12 | GET | `/vendas/{id}` | RF01, RF12 | Gerente (Funcionário: só as próprias) |
| 13 | POST | `/vendas/{id}/cancelamento` | RF13 | Permissão: cancelar_vendas |
| 14 | POST | `/pagamentos` | RF05 | Todos |
| 15 | GET | `/pagamentos/{id}` | RF05 | Todos |
| 16 | POST | `/pagamentos/{id}/estorno` | RF13 | Permissão: estornar_pagamentos |
| 17 | POST | `/pagamentos/{id}/desconto` | RF10 | Permissão: conceder_descontos |
| 18 | GET | `/clientes/{id}/limite` | RF06 | Todos |
| 19 | PUT | `/clientes/{id}/limite` | RF06 | Gerente |
| 20 | PUT | `/clientes/{id}/credito/bloqueio` | RF06 | Gerente |
| 21 | POST | `/excecoes` | RF07 | Todos |
| 22 | GET | `/excecoes` | RF07 | Gerente |
| 23 | PUT | `/excecoes/{id}/aprovar` | RF07 | Gerente |
| 24 | PUT | `/excecoes/{id}/negar` | RF07 | Gerente |
| 25 | GET | `/usuarios` | RF08 | Gerente |
| 26 | POST | `/usuarios` | RF08 | Gerente |
| 27 | PUT | `/usuarios/{id}` | RF08 | Gerente |
| 28 | PUT | `/usuarios/{id}/inativar` | RF08 | Gerente |
| 29 | GET | `/dashboard` | RF09 | Gerente |
| 30 | GET | `/configuracoes/cobranca` | RF10 | Gerente |
| 31 | PUT | `/configuracoes/cobranca` | RF10 | Gerente |
| 32 | GET | `/auditoria` | RF11 | Gerente |
| 33 | GET | `/relatorios/vendas` | RF12 | Gerente |
| 34 | GET | `/relatorios/pagamentos` | RF12 | Gerente |
| 35 | GET | `/relatorios/clientes` | RF12 | Gerente |
| 36 | GET | `/relatorios/financeiro` | RF12 | Gerente |
| 37 | GET | `/relatorios/{tipo}/exportar` | RF12 | Gerente |

---

## Autenticação (RNF01)

### 1. Login — `POST /auth/login`
### 2. Logout — `POST /auth/logout`

Contrato completo em `docs/api/contrato-rotas-autenticacao.md`. A resposta do
login traz o `perfil` (`gerente` ou `funcionario`), que o front usa para
liberar as telas (UC01).

---

## Clientes (RF02, RF03, RF04)

### 3. Listar clientes — `GET /clientes`

- **Requisito**: RF02
- **Entrada** (query params, todos opcionais e combináveis):
```json
{ "nome": "Maria", "cpf": "12345678900", "telefone": "88999990000" }
```
- **Saída** (200). Lista vazia quando nenhum cliente corresponde, e o front
  oferece o cadastro (RF02, cenário 4):
```json
[
  {
    "id_cliente": 1,
    "nome": "Maria Souza",
    "cpf": "12345678900",
    "telefone": ["88999990000"],
    "limite_credito": 500.00,
    "credito_bloqueado": false,
    "ativo": true
  }
]
```

### 4. Detalhar cliente — `GET /clientes/{id}`

- **Requisito**: RF02, RF04
- **Entrada**: nenhuma (id na URL)
- **Saída** (200). Saldo, parcelas e histórico ficam nas rotas 7, 8 e 9:
```json
{
  "id_cliente": 1,
  "nome": "Maria Souza",
  "cpf": "12345678900",
  "telefone": ["88999990000"],
  "limite_credito": 500.00,
  "credito_bloqueado": false,
  "ativo": true
}
```
- **Erro** (404): `cliente_nao_encontrado`

### 5. Cadastrar cliente — `POST /clientes`

- **Requisito**: RF03
- **Entrada**: campos obrigatórios `nome`, `cpf` e `telefone`. O limite de
  crédito não é informado aqui: começa em `0.00` e é definido pelo gerente na
  rota 19.
```json
{ "nome": "Maria Souza", "cpf": "12345678900", "telefone": ["88999990000"] }
```
- **Saída** (201): mesmo formato da rota 4.
- **Erros**:
  - 400 `campo_obrigatorio`, listando os campos que faltam (RF03, cenário 2):
    `{ "erro": "campo_obrigatorio", "mensagem": "Campos obrigatórios ausentes", "campos": ["cpf"] }`
  - 422 `cpf_invalido`: `{ "erro": "cpf_invalido", "mensagem": "CPF já cadastrado para outro cliente" }`

### 6. Editar cliente — `PUT /clientes/{id}`

- **Requisito**: RF03
- **Entrada** (limite de crédito não é editável aqui):
```json
{ "nome": "Maria Souza", "telefone": ["88999990000", "8833330000"] }
```
- **Saída** (200): mesmo formato da rota 4.
- **Erro** (404): `cliente_nao_encontrado`

### 7. Consultar saldo devedor — `GET /clientes/{id}/saldo`

- **Requisito**: RF04 · **Regras**: RN02, RN03
- **Entrada**: nenhuma
- **Saída** (200). Com `saldo_devedor` zerado, o front informa que não há
  valores em aberto. Traz o que o funcionário precisa ver antes de concluir uma
  venda (RF04, cenário 3):
```json
{
  "id_cliente": 1,
  "saldo_devedor": 180.00,
  "limite_credito": 500.00,
  "limite_disponivel": 320.00,
  "possui_parcelas_atrasadas": false,
  "credito_bloqueado": false
}
```
- **Erro** (404): `cliente_nao_encontrado`

### 8. Histórico financeiro — `GET /clientes/{id}/historico`

- **Requisito**: RF04
- **Entrada** (query params, opcionais; sem eles vale o período padrão
  definido na implementação):
```json
{ "data_inicio": "2026-08-01", "data_fim": "2026-09-30" }
```
- **Saída** (200), do mais recente para o mais antigo. `tipo` é `venda`,
  `pagamento`, `estorno` ou `cancelamento`:
```json
[
  { "tipo": "pagamento", "id": 21, "data": "2026-09-20", "valor": 90.00 },
  { "tipo": "venda", "id": 5, "data": "2026-09-05", "valor": 300.00 }
]
```
- **Erro** (404): `cliente_nao_encontrado`

### 9. Listar parcelas do cliente — `GET /clientes/{id}/parcelas`

- **Requisito**: RF04, RF05 · **Regras**: RN03
- **Entrada** (query param opcional): `status` = `pendente`, `parcial`, `pago` ou `atrasado`
- **Saída** (200). Para parcela em atraso, `juros` e `multa` vêm calculados
  pela configuração de cobrança (RF10, cenário 1) e `valor_atualizado` é o
  valor devido hoje:
```json
[
  {
    "id_parcela": 10,
    "id_venda": 5,
    "numero": 1,
    "valor_parcela": 150.00,
    "valor_pago": 60.00,
    "saldo_parcela": 90.00,
    "data_vencimento": "2026-09-05",
    "status": "atrasado",
    "dias_atraso": 15,
    "juros": 1.80,
    "multa": 4.50,
    "valor_atualizado": 96.30
  }
]
```
- **Erro** (404): `cliente_nao_encontrado`

---

## Vendas (RF01, RF12, RF13)

### 10. Registrar venda — `POST /vendas`

- **Requisito**: RF01 · **Regras**: RN01, RN02, RN03
- **Entrada**: o sistema calcula as parcelas a partir de `quantidade_parcelas`
  e `data_primeiro_vencimento`, em intervalos mensais (RF01, cenário 3). Para
  `fiado`, `quantidade_parcelas` é 1.
```json
{
  "id_cliente": 1,
  "modalidade": "a_prazo",
  "valor_total": 300.00,
  "quantidade_parcelas": 2,
  "data_primeiro_vencimento": "2026-10-05"
}
```
- **Saída — venda aprovada** (201):
```json
{
  "id_venda": 5,
  "id_cliente": 1,
  "id_usuario": 3,
  "modalidade": "a_prazo",
  "data_venda": "2026-09-20",
  "valor_total": 300.00,
  "status": "aprovada",
  "parcelas": [
    { "id_parcela": 10, "numero": 1, "valor_parcela": 150.00, "data_vencimento": "2026-10-05" },
    { "id_parcela": 11, "numero": 2, "valor_parcela": 150.00, "data_vencimento": "2026-11-05" }
  ]
}
```
- **Saída — venda rejeitada** (422). Não segue o formato padrão de erro
  porque é decisão de negócio. `motivo` é `limite_credito_excedido` (RN01),
  `parcelas_em_atraso` (RN02) ou `credito_bloqueado` (RF06). Nos dois
  primeiros casos o funcionário pode pedir aprovação pela rota 21; o bloqueio
  de crédito só sai pela rota 20.
```json
{ "id_venda": 5, "status": "rejeitada", "motivo": "limite_credito_excedido" }
```
- **Erros**: 400 `json_invalido` / `campo_obrigatorio`; 404 `cliente_nao_encontrado`

### 11. Consultar vendas — `GET /vendas`

- **Requisito**: RF12
- **Entrada** (query params, todos opcionais): `id_cliente`, `status`
  (`aprovada`, `rejeitada`, `pendente_autorizacao`, `cancelada`),
  `modalidade`, `data_inicio`, `data_fim`
- **Saída** (200):
```json
[
  { "id_venda": 5, "id_cliente": 1, "nome_cliente": "Maria Souza", "data_venda": "2026-09-20", "valor_total": 300.00, "modalidade": "a_prazo", "status": "aprovada" }
]
```

### 12. Consultar venda específica — `GET /vendas/{id}`

- **Requisito**: RF01, RF12
- **Saída** (200): formato da rota 10 (aprovada), acrescido de `motivo_rejeicao`
  e `autorizado_por` quando houver.
- **Erro** (404): `venda_nao_encontrada`

### 13. Cancelar venda — `POST /vendas/{id}/cancelamento`

- **Requisito**: RF13 · **Regras**: RN03, RN04, RN05
- **Entrada**:
```json
{ "motivo": "Venda lançada para o cliente errado" }
```
- **Saída** (200). Atualiza o saldo devedor e gera registro de auditoria:
```json
{ "id_venda": 5, "status": "cancelada", "saldo_devedor_cliente": 0.00 }
```
- **Erros**: 400 `campo_obrigatorio` (motivo); 403 `acesso_negado`;
  404 `venda_nao_encontrada`; 422 `venda_ja_cancelada`

---

## Pagamentos (RF05, RF10, RF13)

### 14. Registrar pagamento — `POST /pagamentos`

- **Requisito**: RF05 · **Regras**: RN03
- **Entrada**: `id_parcela` identifica a parcela a ser baixada. Valor menor
  que o devido gera baixa parcial.
```json
{ "id_parcela": 10, "valor_recebido": 90.00 }
```
- **Saída** (201). `status_parcela` é `pago` (baixa total) ou `parcial`
  (baixa parcial, parcela continua aberta com o saldo restante):
```json
{
  "id_pagamento": 21,
  "id_parcela": 10,
  "valor_recebido": 90.00,
  "data_pagamento": "2026-09-20",
  "status_parcela": "pago",
  "saldo_parcela": 0.00,
  "saldo_devedor_cliente": 90.00
}
```
- **Erros**: 400 `json_invalido` / `campo_obrigatorio`; 404 `parcela_nao_encontrada`;
  422 `valor_excede_devido` (RF05, cenário 3); 422 `parcela_ja_paga`

> `id_parcela` identifica a parcela (antes chamada `id_pagamento`) e
> `id_pagamento` identifica o recebimento. A separação é necessária para
> estornar um recebimento (rota 16) e aceitar mais de um pagamento parcial na
> mesma parcela.

### 15. Consultar pagamento — `GET /pagamentos/{id}`

- **Requisito**: RF05
- **Saída** (200). Inclui os dados do comprovante de pagamento (UC04):
```json
{
  "id_pagamento": 21,
  "id_parcela": 10,
  "id_venda": 5,
  "valor_recebido": 90.00,
  "data_pagamento": "2026-09-20",
  "status": "efetivado",
  "id_usuario": 3,
  "comprovante": {
    "numero": "000021",
    "cliente": { "id_cliente": 1, "nome": "Maria Souza" }
  }
}
```
- **Erro** (404): `pagamento_nao_encontrado`

### 16. Estornar pagamento — `POST /pagamentos/{id}/estorno`

- **Requisito**: RF13 · **Regras**: RN03, RN04, RN05
- **Entrada**:
```json
{ "motivo": "Valor lançado em duplicidade" }
```
- **Saída** (200). Reabre a parcela, recalcula o saldo devedor e gera
  registro de auditoria:
```json
{
  "id_pagamento": 21,
  "status": "estornado",
  "id_parcela": 10,
  "status_parcela": "pendente",
  "saldo_devedor_cliente": 180.00
}
```
- **Erros**: 400 `campo_obrigatorio` (motivo); 403 `acesso_negado`;
  404 `pagamento_nao_encontrado`; 422 `pagamento_ja_estornado`

### 17. Aplicar desconto — `POST /pagamentos/{id}/desconto`

- **Requisito**: RF10 · **Regras**: RN03, RN04, RN05
- **Entrada**:
```json
{ "valor_desconto": 10.00, "motivo": "Cliente antigo" }
```
- **Saída** (200). Reduz o valor devido da parcela do pagamento, atualiza o
  saldo e gera registro de auditoria:
```json
{
  "id_pagamento": 21,
  "id_parcela": 10,
  "valor_desconto": 10.00,
  "valor_devido_atualizado": 86.30
}
```
- **Erros**: 403 `acesso_negado`; 404 `pagamento_nao_encontrado`;
  422 `desconto_invalido` (maior que o valor devido ou negativo)

---

## Limite de crédito (RF06)

### 18. Consultar limite — `GET /clientes/{id}/limite`

- **Requisito**: RF06
- **Saída** (200):
```json
{
  "id_cliente": 1,
  "limite_credito": 500.00,
  "saldo_devedor": 180.00,
  "limite_disponivel": 320.00,
  "credito_bloqueado": false
}
```
- **Erro** (404): `cliente_nao_encontrado`

### 19. Definir ou alterar limite — `PUT /clientes/{id}/limite`

- **Requisito**: RF06 · **Regras**: RN01, RN04
- **Entrada**:
```json
{ "limite_credito": 600.00 }
```
- **Saída** (200): mesmo formato da rota 18. A alteração gera registro de
  auditoria com o valor anterior e o novo.
- **Erros**: 403 `acesso_negado`; 404 `cliente_nao_encontrado`; 422 `limite_invalido`

### 20. Bloquear ou desbloquear crédito — `PUT /clientes/{id}/credito/bloqueio`

- **Requisito**: RF06 · **Regras**: RN01, RN04
- **Entrada**:
```json
{ "bloqueado": true }
```
- **Saída** (200): `{ "id_cliente": 1, "credito_bloqueado": true }`. Com o
  bloqueio ativo, `POST /vendas` rejeita com `credito_bloqueado`.
- **Erros**: 403 `acesso_negado`; 404 `cliente_nao_encontrado`

---

## Exceções de crédito (RF07)

Substituem o antigo `PATCH /vendas/{id}/autorizar`. Fluxo: a venda rejeitada
pela rota 10 recebe uma solicitação de exceção (21); o gerente aprova (23) ou
nega (24).

### 21. Solicitar aprovação — `POST /excecoes`

- **Requisito**: RF07 · **Regras**: RN01, RN02, RN05
- **Entrada**:
```json
{ "id_venda": 5, "justificativa": "Cliente antigo, paga todo mês" }
```
- **Saída** (201). A venda passa a `pendente_autorizacao` e não pode ser
  concluída até a decisão:
```json
{
  "id_excecao": 1,
  "id_venda": 5,
  "status": "pendente",
  "id_usuario_solicitante": 3,
  "data_solicitacao": "2026-09-20"
}
```
- **Erros**: 400 `campo_obrigatorio`; 404 `venda_nao_encontrada`;
  422 `venda_nao_rejeitada`; 422 `excecao_nao_permitida` (rejeição por
  `credito_bloqueado`)

### 22. Consultar exceções — `GET /excecoes`

- **Requisito**: RF07
- **Entrada** (query param opcional): `status` = `pendente`, `aprovada` ou `negada`
- **Saída** (200):
```json
[
  { "id_excecao": 1, "id_venda": 5, "nome_cliente": "Maria Souza", "valor_total": 300.00, "motivo": "limite_credito_excedido", "status": "pendente", "id_usuario_solicitante": 3, "data_solicitacao": "2026-09-20" }
]
```

### 23. Aprovar exceção — `PUT /excecoes/{id}/aprovar`

- **Requisito**: RF07 · **Regras**: RN01, RN02, RN05
- **Entrada**: nenhuma (o gerente vem do token)
- **Saída** (200). A venda vira `aprovada`, as parcelas são geradas e o
  saldo devedor é atualizado:
```json
{
  "id_excecao": 1,
  "status": "aprovada",
  "id_venda": 5,
  "status_venda": "aprovada",
  "autorizado_por": 2
}
```
- **Erros**: 403 `acesso_negado`; 404 `excecao_nao_encontrada`; 422 `excecao_ja_decidida`

### 24. Negar exceção — `PUT /excecoes/{id}/negar`

- **Requisito**: RF07 · **Regras**: RN05
- **Entrada** (opcional):
```json
{ "motivo": "Cliente com três parcelas vencidas" }
```
- **Saída** (200). A venda continua `rejeitada` e a decisão fica registrada:
```json
{ "id_excecao": 1, "status": "negada", "id_venda": 5, "status_venda": "rejeitada" }
```
- **Erros**: 403 `acesso_negado`; 404 `excecao_nao_encontrada`; 422 `excecao_ja_decidida`

---

## Usuários (RF08)

### 25. Listar usuários — `GET /usuarios`

- **Requisito**: RF08 · **Regras**: RN05
- **Saída** (200). Nunca devolve senha nem hash:
```json
[
  {
    "id_usuario": 3,
    "nome": "Carlos Lima",
    "email": "carlos@casadoprodutor.com",
    "perfil": "funcionario",
    "ativo": true,
    "permissoes": { "cancelar_vendas": false, "estornar_pagamentos": false, "conceder_descontos": false }
  }
]
```

### 26. Cadastrar usuário — `POST /usuarios`

- **Requisito**: RF08 · **Regras**: RN05
- **Entrada**: a senha é guardada com BCrypt (REQ, seção 3.3).
```json
{
  "nome": "Carlos Lima",
  "email": "carlos@casadoprodutor.com",
  "senha": "********",
  "perfil": "funcionario",
  "permissoes": { "cancelar_vendas": false, "estornar_pagamentos": false, "conceder_descontos": false }
}
```
- **Saída** (201): mesmo formato de um item da rota 25.
- **Erros**: 400 `campo_obrigatorio`; 403 `acesso_negado`; 422 `email_ja_cadastrado`

### 27. Alterar usuário — `PUT /usuarios/{id}`

- **Requisito**: RF08 · **Regras**: RN05
- **Entrada**: mesmos campos da rota 26; `senha` é opcional e só muda se enviada.
- **Saída** (200): mesmo formato de um item da rota 25.
- **Erros**: 403 `acesso_negado`; 404 `usuario_nao_encontrado`; 422 `email_ja_cadastrado`

### 28. Inativar usuário — `PUT /usuarios/{id}/inativar`

- **Requisito**: RF08 · **Regras**: RN05
- **Entrada**: nenhuma
- **Saída** (200): `{ "id_usuario": 3, "ativo": false }`. Contas inativas não
  fazem login.
- **Erros**: 403 `acesso_negado`; 404 `usuario_nao_encontrado`

---

## Dashboard (RF09)

### 29. Indicadores financeiros — `GET /dashboard`

- **Requisito**: RF09 · **Regras**: RN02, RN05
- **Entrada** (query params, opcionais): `periodo` = `dia`, `semana` ou `mes`
  (padrão `mes`); `dias` = janela, em dias, das parcelas próximas do
  vencimento (padrão 7)
```json
{ "periodo": "mes", "dias": 7 }
```
- **Saída** (200):
```json
{
  "periodo": "mes",
  "faturamento_total": 4200.00,
  "total_a_receber": 1800.00,
  "taxa_inadimplencia": 0.12,
  "parcelas_vencidas": [
    { "id_cliente": 3, "nome": "João Lima", "id_parcela": 7, "valor_parcela": 120.00, "data_vencimento": "2026-09-10", "dias_atraso": 10 }
  ],
  "parcelas_a_vencer": [
    { "id_cliente": 1, "nome": "Maria Souza", "id_parcela": 10, "valor_parcela": 90.00, "data_vencimento": "2026-09-27" }
  ]
}
```
- **Erros**: 400 `periodo_invalido`; 403 `acesso_negado`

---

## Configuração de cobrança (RF10)

### 30. Consultar configuração — `GET /configuracoes/cobranca`
### 31. Alterar configuração — `PUT /configuracoes/cobranca`

- **Requisito**: RF10 · **Regras**: RN04, RN05
- **Entrada** (PUT):
```json
{ "taxa_juros": 0.02, "taxa_multa": 0.05 }
```
- **Saída** (GET e PUT, 200):
```json
{ "id_configuracao": 1, "taxa_juros": 0.02, "taxa_multa": 0.05, "definido_por": 2 }
```
- **Erros**: 400 `campo_obrigatorio`; 403 `acesso_negado`

---

## Auditoria (RF11)

### 32. Consultar auditoria — `GET /auditoria`

- **Requisito**: RF11 · **Regras**: RN04
- **Entrada** (query params, todos opcionais): `id_usuario`, `operacao`
  (`cancelamento_venda`, `estorno_pagamento`, `desconto`, `alteracao_limite`,
  `alteracao_manual`), `data_inicio`, `data_fim`
- **Saída** (200):
```json
[
  {
    "id_auditoria": 8,
    "id_usuario": 2,
    "nome_usuario": "Ana Gerente",
    "data_hora": "2026-09-20T14:32:10",
    "operacao": "alteracao_limite",
    "valor_anterior": 500.00,
    "valor_novo": 600.00,
    "referencia": { "tipo": "cliente", "id": 1 }
  }
]
```
- **Erro** (403): `acesso_negado`

---

## Relatórios (RF12)

Todos os relatórios aceitam `data_inicio` e `data_fim` e devolvem o mesmo
envelope: `tipo`, `filtros`, `itens` e `totais`.

### 33. Relatório de vendas — `GET /relatorios/vendas`

- **Filtros**: `data_inicio`, `data_fim`, `id_cliente`, `modalidade`, `status`
- **Saída** (200):
```json
{
  "tipo": "vendas",
  "filtros": { "data_inicio": "2026-09-01", "data_fim": "2026-09-30" },
  "itens": [
    { "id_venda": 5, "data_venda": "2026-09-20", "nome_cliente": "Maria Souza", "modalidade": "a_prazo", "valor_total": 300.00, "status": "aprovada" }
  ],
  "totais": { "quantidade": 1, "valor_total": 300.00 }
}
```

### 34. Relatório de pagamentos — `GET /relatorios/pagamentos`

- **Filtros**: `data_inicio`, `data_fim`, `id_cliente`
- **Itens**: `id_pagamento`, `id_parcela`, `nome_cliente`, `valor_recebido`,
  `data_pagamento`, `status`
- **Totais**: `quantidade`, `valor_recebido`

### 35. Relatório de clientes — `GET /relatorios/clientes`

- **Filtros**: `data_inicio`, `data_fim`, `situacao` (`em_dia`, `em_atraso`, `bloqueado`)
- **Itens**: `id_cliente`, `nome`, `limite_credito`, `saldo_devedor`,
  `parcelas_atrasadas`, `credito_bloqueado`
- **Totais**: `quantidade`, `saldo_devedor`

### 36. Relatório financeiro — `GET /relatorios/financeiro`

- **Filtros**: `data_inicio`, `data_fim`
- **Itens**: um por dia, com `data`, `faturamento`, `recebido`, `a_receber`
- **Totais**: `faturamento_total`, `total_recebido`, `total_a_receber`,
  `taxa_inadimplencia`

### 37. Exportar relatório — `GET /relatorios/{tipo}/exportar`

- **Caminho**: `tipo` = `vendas`, `pagamentos`, `clientes` ou `financeiro`
- **Entrada** (query params): `formato` (padrão `csv`) e os mesmos filtros do
  relatório escolhido
- **Saída** (200): arquivo para download (`Content-Disposition: attachment`)
- **Erros**: 400 `formato_invalido`; 403 `acesso_negado`; 404 `relatorio_inexistente`

Erros de 403 e 401 valem para todos os relatórios (rotas 33 a 37).
