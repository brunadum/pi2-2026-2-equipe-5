# Regras de negócio — RN01, RN02 e RN03

Mapeamento da [issue #47](https://github.com/brunadum/pi2-2026-2-equipe-5/issues/47),
com base no [contrato da API](contratoAPI.md). Os caminhos abaixo incluem a base
`/api`. As três regras já são executadas pelas rotas implementadas na issue #46;
este documento identifica o código e os testes que comprovam cada comportamento.

## Regra → rota → implementação

| Regra | Comportamento | Rota | Arquivo / função |
|---|---|---|---|
| RN01 | Rejeitar venda acima do limite disponível com HTTP 422 e `motivo: limite_credito_excedido` | `POST /api/vendas` | [views.py](../../fiado-control/back_end/core/views.py), `_registrar_venda` |
| RN02 | Rejeitar venda para cliente com parcela vencida ainda em aberto com HTTP 422 e `motivo: parcelas_em_atraso` | `POST /api/vendas` | [financeiro.py](../../fiado-control/back_end/core/financeiro.py), `consultar_parcelas`; [views.py](../../fiado-control/back_end/core/views.py), `_registrar_venda` |
| RN03 | Acrescentar a dívida pelas parcelas da venda aprovada e reduzir a dívida pelos recebimentos, na transação da operação | `POST /api/vendas`, `POST /api/pagamentos` | [views.py](../../fiado-control/back_end/core/views.py), `_registrar_venda`, `_registrar_pagamento`; [financeiro.py](../../fiado-control/back_end/core/financeiro.py), `consultar_parcelas` |
| RN03 — consulta | Expor saldo devedor e limite disponível calculados dos dados persistidos | `GET /api/clientes/{id}/saldo` | [views.py](../../fiado-control/back_end/core/views.py), `cliente_saldo`, `_parcelas_do_cliente` |

## RN01 — limite disponível

Em `_registrar_venda`, o saldo é a soma dos valores atualizados das parcelas de
vendas aprovadas. O limite disponível é o limite cadastrado menos esse saldo,
limitado a zero. A comparação usa `Decimal`, preservando os centavos:

```python
saldo_devedor = round(sum((p["valor_atualizado"] for p in parcelas), ZERO), 2)
limite_disponivel = max(ZERO, cliente["limite_credito"] - saldo_devedor)
```

No bloco de decisão da mesma função:

```python
elif valor_total > limite_disponivel:
    motivo = "limite_credito_excedido"
```

Uma venda exatamente igual ao limite disponível é permitida, desde que não
exista outro impedimento. A rejeição é persistida em `venda`, sem gerar parcelas
ou aumentar o saldo, e retorna:

```json
{"id_venda": 12, "status": "rejeitada", "motivo": "limite_credito_excedido"}
```

O identificador acima é ilustrativo. A resposta real usa o ID gerado no banco.

## RN02 — parcelas vencidas

`consultar_parcelas` determina o atraso pela data real, mesmo se a coluna
`pagamento.status` ainda estiver como `pendente`:

```python
atrasada = vencimento < hoje
status = ('pago' if atualizado == ZERO else 'atrasado' if atrasada
          else 'parcial' if recebido > ZERO else 'pendente')
```

Parcela que vence hoje não está atrasada. Parcela vencida parcialmente paga
continua impedindo nova venda até a quitação dos valores devidos, incluindo os
encargos. Parcela já quitada não impede novas vendas.

Em `_registrar_venda`:

```python
possui_atrasadas = any(p["status"] == "atrasado" for p in parcelas)
```

No bloco de decisão:

```python
elif possui_atrasadas:
    motivo = "parcelas_em_atraso"
```

O retorno é HTTP 422, com `id_venda`, `status: rejeitada` e o motivo acima. A
venda rejeitada não gera parcelas e não altera a dívida.

Se houver mais de um impedimento, a ordem atual de decisão é: bloqueio explícito
de crédito (RF06), parcelas em atraso (RN02) e limite excedido (RN01). Portanto,
um cliente em atraso e sem limite recebe `parcelas_em_atraso`.

## RN03 — atualização automática e transações

Não há coluna de saldo acumulado no cliente. O saldo é derivado de `venda`,
`pagamento` (parcelas), `recebimento` (baixas) e `configuracao` (encargos).
Assim, os registros da operação são a própria atualização do saldo.

- **Venda aprovada:** `_registrar_venda` insere a venda e todas as parcelas no
  mesmo `with transaction.atomic()`. Uma falha desfaz toda a operação.
- **Pagamento:** `_registrar_pagamento` insere o recebimento, atualiza a parcela
  e calcula `saldo_devedor_cliente` antes de sair da transação.
- **Concorrência:** ambas as operações bloqueiam o cliente com
  `_buscar_cliente(id_cliente, bloquear=True)`, que executa `SELECT ... FOR UPDATE`.
  No pagamento, a parcela também é bloqueada, sempre depois do cliente.
- **Visibilidade:** a própria transação já consulta o saldo atualizado; outras
  conexões só veem a operação completa após o commit.

Trecho de `_registrar_pagamento`, ainda dentro de `transaction.atomic()`:

```python
cursor.execute('UPDATE pagamento SET status = %s, data_pagamento = %s WHERE id_pagamento = %s',
               [estado_banco, hoje if restante == ZERO else None, id_parcela])
saldo_cliente = sum((p['valor_atualizado'] for p in consultar_parcelas(id_cliente)), ZERO)
```

Exemplo sem encargos: saldo inicial R$ 0; venda de R$ 300 eleva o saldo a R$ 300;
pagamento de R$ 50 reduz o saldo a R$ 250. Com limite de R$ 1.000, o disponível
passa de R$ 1.000 para R$ 700 e depois para R$ 750.

`consultar_parcelas` desconta as baixas e os encargos já recebidos. O saldo e o
dashboard usam `valor_atualizado`, que inclui principal e encargos ainda abertos.
Cancelamento, estorno, exceções, auditoria (RN04) e autorização por perfil (RN05)
não são implementados por esta issue.

## Verificação automatizada

Os testes estão em [core/tests.py](../../fiado-control/back_end/core/tests.py), na
classe `RegrasNegocioTests`:

| Regra | Testes específicos |
|---|---|
| RN01 | `test_rn01_compara_valor_com_limite_disponivel_apos_venda`; `test_rn01_permite_venda_exatamente_no_limite_disponivel` |
| RN02 | `test_rn02_usa_vencimento_real_mesmo_com_status_pendente`; `test_rn02_parcela_que_vence_hoje_nao_bloqueia_venda`; `test_rn02_parcial_vencida_bloqueia_ate_quitacao` |
| RN03 | `test_rn03_saldo_e_limite_mudam_apos_venda_parcial_e_quitacao`; `test_rn03_venda_atualiza_saldo_dentro_da_mesma_transacao`; `test_rn03_pagamento_atualiza_saldo_dentro_da_mesma_transacao` |

Os testes de RN03 verificam a visibilidade antes e depois do commit usando duas
conexões PostgreSQL. Os testes de concorrência e rollback da classe
`Issue46RegressaoTests` continuam cobrindo falhas intermediárias e operações
simultâneas. Cada teste usa banco de teste e recarrega schema e seed.

No diretório `fiado-control/back_end`, com PostgreSQL acessível e as variáveis
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD` configuradas:

```powershell
.\.venv\Scripts\python.exe manage.py test core.tests.RegrasNegocioTests --noinput
.\.venv\Scripts\python.exe manage.py test core --noinput
```

## Evidências manuais para os comentários da issue

Use uma base de desenvolvimento e uma data futura no cadastro das vendas.
Consulte os saldos antes de operar, pois o banco pode ter sido usado em outros
testes. No seed original, o cliente 4 não tem limite, o cliente 3 tem parcela
vencida e o cliente 5 tem limite de R$ 1.000 e suas parcelas anteriores quitadas.

1. **RN01:** consultar o saldo de um cliente sem limite suficiente e tentar uma
   venda acima do disponível. Capturar o HTTP 422 e `limite_credito_excedido`.
2. **RN02:** consultar parcelas de um cliente em atraso e tentar uma venda com
   valor dentro do limite disponível. Capturar o HTTP 422 e `parcelas_em_atraso`.
3. **RN03:** consultar saldo de um cliente sem impedimentos, registrar uma venda,
   consultar novamente, registrar uma baixa em uma parcela retornada e consultar
   o saldo final. Capturar os valores antes/depois e as respostas HTTP 201.

Os prints devem mostrar método, URL, corpo enviado quando houver, status HTTP e
JSON de resposta. A publicação dos prints e o commit deste documento são etapas
de entrega do responsável pela issue; a execução dos testes não os substitui.
