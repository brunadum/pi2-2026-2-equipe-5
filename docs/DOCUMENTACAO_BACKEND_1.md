# Relatório e Documentação de Entrega: Backend 1

Este documento comprova e detalha o cumprimento integral das especificações solicitadas para o módulo **Backend 1**, englobando a arquitetura de acesso ao banco de dados relacional, o tratamento e teste de restrições de integridade, e o mapeamento de índices para otimização de consultas.

---

##  Resumo do Cumprimento dos Requisitos

| Requisito | Descrição | Status | Evidência no Código |
| :--- | :--- | :---: | :--- |
| **1. Acesso ao Banco pelas Rotas** | Manipulação via cursores nativos e transações atômicas nas views da API. | **Concluído** | `core/views.py` (`connection.cursor()`, `transaction.atomic()`) |
| **2. Testes de Restrições e Rejeição** | Validação de restrições de `UNIQUE` e `FOREIGN KEY` com retornos HTTP adequados. | **Concluído** | `core/tests.py` (Bateria de 84 testes integrados) |
| **3. Índices de Filtro Mapeados** | Aplicação de índices B-Tree nas colunas utilizadas em buscas/filtros das rotas. | **Concluído** | `01-schema.sql` e `core/tests.py` (`CREATE INDEX`) |

---

## 1. Módulo de Acesso ao Banco de Dados pelas Rotas

O sistema utiliza o **PostgreSQL** como banco de dados relacional. O acesso às tabelas através das rotas da API foi implementado utilizando a API de cursores do Django (`django.db.connection.cursor`), garantindo consultas de alta performance e controle sobre a execução das instruções SQL.

### Boas Práticas de Banco de Dados Aplicadas:
* **Prevenção contra SQL Injection:** Todas as consultas utilizam parâmetros posicionais (`%s`), delegando ao driver de banco a sanitização dos valores.
* **Garantia de Propriedades ACID:** Operações que envolvem múltiplas tabelas ou mutações financeiras (como o registro de vendas ou liquidação de parcelas) são encapsuladas no bloco `@transaction.atomic()` ou `with transaction.atomic():`.
* **Controle de Concorrência:** Para evitar *race conditions* em cadastros duplicados ou vendas simultâneas acima do limite de crédito, foram utilizados bloqueios de linha (`FOR UPDATE`) e travas consultivas (`pg_advisory_xact_lock`).

---

## 2. Restrições de Chave Estrangeira e Unicidade Testadas

A integridade referencial e as regras de unicidade do modelo relacional foram configuradas fisicamente no schema e são estritamente validadas. Quando um dado inválido tenta ser inserido, o banco ou a camada de serviço rejeita a operação e a API retorna o status HTTP apropriado.

### Mapeamento dos Testes de Validação e Rejeição:

| Tipo de Restrição | Regra de Negócio / Banco | Código do Teste (`core/tests.py`) | Retorno da API |
| :--- | :--- | :--- | :---: |
| **Unicidade (`UNIQUE`)** | Impossível cadastrar cliente com CPF já existente. | `test_cadastro_cpf_duplicado` / `test_cadastros_simultaneos_mesmo_cpf` | **409 Conflict** |
| **Unicidade (`UNIQUE`)** | Impossível cadastrar usuário com e-mail duplicado. | `test_usuario_email_duplicado` | **409 Conflict** |
| **Chave Estrangeira (`FK`)** | Impossível registrar venda para `id_cliente` inexistente. | `test_cliente_inexistente` | **404 Not Found** |
| **Chave Estrangeira (`FK`)** | Impossível registrar pagamento para `id_parcela` inexistente. | `test_parcela_inexistente` | **404 Not Found** |
| **Integridade / Regra** | Tentativa de pagamento superior ao saldo devido da parcela. | `test_valor_acima_do_devido` | **422 Unprocessable** |
| **Integridade / Regra** | Tentativa de pagamento para parcela já quitada. | `test_parcela_ja_paga` | **422 Unprocessable** |
| **Integridade / Regra** | Registro de venda que excede o limite de crédito do cliente. | `test_limite_excedido_devolve_rejeitada` | **422 Unprocessable** |

A suíte de 84 testes automatizados abrange também a validação completa do fluxo de clientes, vendas (bloqueio por limite e atrasos), pagamentos (baixas parciais e totais) e testes de regressão e concorrência (transações simultâneas).
---

## 3. Mapeamento de Índices nas Colunas de Filtro

Para assegurar resposta rápida da API conforme o volume de dados cresce, foram criados índices **B-Tree** nas colunas que recebem parâmetros de busca e filtragem nas rotas HTTP `GET`.

### Mapeamento Rota vs. Índice Criado:

```sql
-- 1. Filtros de Cliente (GET /api/clientes?cpf=...&nome=...)
CREATE INDEX IF NOT EXISTS cliente_cpf_idx ON cliente (cpf);
CREATE INDEX IF NOT EXISTS cliente_nome_idx ON cliente (nome);

-- 2. Filtros de Vendas (GET /api/vendas?status=...&modalidade=...&data_inicio=...)
CREATE INDEX IF NOT EXISTS venda_status_idx ON venda (status);
CREATE INDEX IF NOT EXISTS venda_modalidade_idx ON venda (modalidade);
CREATE INDEX IF NOT EXISTS venda_data_venda_idx ON venda (data_venda);

-- 3. Índices Chave Estrangeira / Junções (JOINs de Saldo e Extrato)
CREATE INDEX IF NOT EXISTS venda_cliente_idx ON venda (id_cliente);
CREATE INDEX IF NOT EXISTS pagamento_venda_idx ON pagamento (id_venda);
CREATE INDEX IF NOT EXISTS recebimento_pagamento_idx ON recebimento (id_pagamento);
```

---

##  Como Executar os Testes Automatizados

A suíte de testes integrados roda em um ambiente conteinerizado via Docker, garantindo o isolamento da base de dados de teste.

### Comando de Execução:
Execute o seguinte comando na raiz do projeto:

```bash
docker compose exec -e DB_HOST=db -e DB_PORT=5432 backend python manage.py test --noinput
```

### Resultado Esperado:
```text
Found 84 test(s).
Creating test database for alias 'default'...
System check identified no issues (0 silenced).
....................................................................................
----------------------------------------------------------------------
Ran 84 tests in 11.732s

OK
Destroying test database for alias 'default'...
```
