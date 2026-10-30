# Backup e Restauração do PostgreSQL — Fiado Control

## 1. Objetivo

Documentar os procedimentos de backup e restauração do banco de dados PostgreSQL do sistema Fiado Control, realizados durante a Sprint 4, com o objetivo de verificar a possibilidade de recuperação dos dados em caso de falhas.

## 2. Ambiente utilizado

- **Sistema:** Fiado Control
- **Banco de dados:** PostgreSQL 15
- **Ambiente:** Docker Compose
- **Contêiner:** `fiadocontrol-db`
- **Serviço:** `db`
- **Banco principal:** `fiadocontrol`
- **Banco de restauração:** `fiadocontrol_restore_teste`
- **Usuário:** `admin`
- **Formato do backup:** Custom (`-Fc`)

## 3. Geração do backup

O backup foi gerado dentro do contêiner PostgreSQL utilizando o comando:

```powershell
docker compose exec db pg_dump -U admin -d fiadocontrol -Fc -f /tmp/backup.dump
```

O comando `pg_dump` realiza a exportação do banco de dados. A opção `-Fc` determina o formato customizado, permitindo sua restauração com `pg_restore`.

## 4. Cópia do arquivo de backup

O arquivo gerado foi copiado do contêiner para o computador:

```powershell
docker cp fiadocontrol-db:/tmp/backup.dump ./backups/backup.dump
```

A pasta `backups/` foi adicionada ao `.gitignore`, evitando o envio de arquivos de backup ao repositório Git.

## 5. Verificação do backup

Para inspecionar o conteúdo do arquivo, foi executado:

```powershell
docker compose exec db pg_restore -l /tmp/backup.dump
```

A listagem apresentou 131 entradas no catálogo do backup, incluindo tabelas, dados, sequências e restrições.

## 6. Criação do banco de testes

Para realizar a restauração sem modificar o banco principal, foi criado um banco separado:

```powershell
docker compose exec db createdb -U admin fiadocontrol_restore_teste
```

## 7. Restauração do banco

A restauração foi executada utilizando:

```powershell
docker compose exec db pg_restore -U admin -d fiadocontrol_restore_teste --no-owner --exit-on-error /tmp/backup.dump
```

O comando foi concluído sem apresentar erros.

## 8. Validação dos dados restaurados

Foram realizadas consultas SQL para comparar a quantidade de registros entre o banco original e o banco restaurado.

**Banco original:**

```powershell
docker compose exec db psql -U admin -d fiadocontrol -c "SELECT (SELECT COUNT(*) FROM cliente) AS clientes, (SELECT COUNT(*) FROM usuario) AS usuarios, (SELECT COUNT(*) FROM venda) AS vendas, (SELECT COUNT(*) FROM pagamento) AS pagamentos;"
```

**Banco restaurado:**

```powershell
docker compose exec db psql -U admin -d fiadocontrol_restore_teste -c "SELECT (SELECT COUNT(*) FROM cliente) AS clientes, (SELECT COUNT(*) FROM usuario) AS usuarios, (SELECT COUNT(*) FROM venda) AS vendas, (SELECT COUNT(*) FROM pagamento) AS pagamentos;"
```

### Resultados

| Tabela    | Banco original | Banco restaurado |
| --------- | -------------: | ---------------: |
| cliente   |             10 |               10 |
| usuario   |              3 |                3 |
| venda     |             10 |               10 |
| pagamento |             11 |               11 |

Os resultados demonstraram que as quantidades de registros das quatro tabelas verificadas foram preservadas durante o processo de restauração.

## 9. Evidências

As evidências dos testes foram registradas por meio de capturas de tela do terminal PowerShell, incluindo a geração do backup, a restauração e as consultas SQL.

Essas evidências devem ser anexadas à issue correspondente no GitHub.

## 10. Conclusão

O procedimento de backup e restauração do banco de dados PostgreSQL foi executado com sucesso no ambiente de desenvolvimento do Fiado Control.

A restauração ocorreu em um banco separado, sem modificar o banco principal. A comparação das quantidades de registros confirmou a recuperação dos dados nas tabelas verificadas.

A validação realizada comprova o funcionamento básico do procedimento, mas não constitui uma verificação integral de todos os registros e objetos do banco de dados.
