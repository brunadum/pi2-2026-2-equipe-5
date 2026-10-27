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

### Complemento Sprint 4 — RF06

Gestão de crédito dá suporte à validação de crédito do UC03:

| Método | Rota | Perfil | Regra |
|---|---|---|---|
| GET | `/api/clientes/{id}/limite` | Gerente e Funcionário | RN01: saldo e disponibilidade |
| PUT | `/api/clientes/{id}/limite` | Gerente | RN01, RN04, RN05: alterar limite com auditoria |
| PUT | `/api/clientes/{id}/credito/bloqueio` | Gerente | RN01, RN04, RN05: bloquear/desbloquear com auditoria |

Identidade autenticada depende de Backend 1/3; enquanto não integrada, essas
rotas retornam 401. Critérios, testes e limitações em
[testes-sprint4-backend2.md](testes-sprint4-backend2.md).

- [x] Todos os casos de uso (UC01–UC05) têm ao menos uma rota mapeada
- [x] Cada rota indica o método HTTP correto (GET/POST/PATCH/PUT)
- [x] Arquivo `docs/api/mapeamento-casos-de-uso-rotas.md` commitado
