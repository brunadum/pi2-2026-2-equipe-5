# Mapeamento de Índices e Otimização de Filtros — Fiado Control

Este documento descreve os índices criados no banco de dados relacional PostgreSQL para garantir a performance, a integridade e a otimização das consultas e filtros exigidos pelos Requisitos Funcionais (RFs).

## 1. Índices Criados no Banco de Dados (`01-schema.sql`)

| Nome do Índice | Tabela | Coluna(s) Indexada(s) | Requisito / Motivo da Otimização |
| :--- | :--- | :--- | :--- |
| `venda_cliente_idx` | `venda` | `id_cliente` | Otimiza as buscas de histórico de vendas e listagens associadas a um cliente específico (RF01, RF04). |
| `pagamento_venda_idx` | `pagamento` | `id_venda` | Acelera a consulta e o rastreio de parcelas vinculadas a uma determinada venda. |
| `recebimento_parcela_idx` | `recebimento` | `id_pagamento` | Melhora a performance ao rastrear o histórico de baixas e recebimentos de uma parcela (RF05). |

## 2. Índices Implícitos (Restrições de Unicidade - Unique Constraints)
As restrições de unicidade implementadas no banco de dados atuam nativamente como índices de alta performance para buscas exatas e validações de regras de negócio:
- **`cliente.cpf`**: Utilizado diretamente nas rotas de busca e filtros de clientes por CPF (RF02).
- **`usuario.email`**: Utilizado para agilizar a autenticação e validação de login (UC01 / RNF01).
