# Mapeamento de Casos de Uso → Rotas da API — Fiado Control

> Issue: `[BACK] Research: mapear casos de uso para rotas da API #8`
> Base: `docs/casos_de_uso.md` (UC01–UC05)

## UC01 — Realizar Login no Sistema

| Método | Rota |
|---|---|
| `POST` | `/api/auth/login` |

## UC02 — Gerenciar Clientes (Buscar e Cadastrar)

| Método | Rota |
|---|---|
| `GET` | `/api/clientes?nome=&cpf=&telefone=` |
| `POST` | `/api/clientes` |

## UC03 — Registrar Venda (Fiado ou A Prazo)

| Método | Rota |
|---|---|
| `GET` | `/api/clientes/{id}/saldo` |
| `POST` | `/api/vendas` (retorna `422` com `motivo` quando o limite for excedido ou houver parcelas atrasadas) |
| `PATCH` | `/api/vendas/{id}/autorizar` (gerente autoriza venda rejeitada) |

## UC04 — Registrar Pagamentos e Baixas

| Método | Rota |
|---|---|
| `GET` | `/api/clientes/{id}/parcelas` |
| `PATCH` | `/api/parcelas/{id}/pagamento` |
| `GET` | `/api/parcelas/{id}/comprovante` |
| `GET` / `PUT` | `/api/configuracoes/juros` (restrito ao gerente) |

## UC05 — Visualizar Dashboard Financeiro

| Método | Rota |
|---|---|
| `GET` | `/api/dashboard/faturamento?periodo=` (restrito ao gerente) |
| `GET` | `/api/dashboard/metricas-risco` (restrito ao gerente) |
| `GET` | `/api/dashboard/parcelas?status=vencidas\|proximas` (restrito ao gerente) |

## Critérios de aceitação

- [ ] Todos os casos de uso (UC01–UC05) têm ao menos uma rota mapeada
- [ ] Cada rota indica o método HTTP correto (GET/POST/PATCH/PUT)
- [ ] Arquivo `docs/api/mapeamento-casos-de-uso-rotas.md` commitado
