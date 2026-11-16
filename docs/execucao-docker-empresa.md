# Executar o Fiado Control em um computador com Docker

O frontend, o Django e o PostgreSQL rodam em três containers. O banco fica no volume persistente `fiadocontrol_dados`. A VPS não é necessária para executar no próprio computador.

## Iniciar ou atualizar

Abra o Docker Desktop e aguarde o mecanismo ficar disponível. No PowerShell, a partir da raiz do repositório:

```powershell
cd fiado-control
docker compose up -d --build
docker compose exec backend python manage.py migrate --noinput
docker compose ps
```

Abra `http://localhost` no computador onde o Docker está rodando. A documentação está em `http://localhost:8001/api/docs/`. A API permanece na porta 8001; a interface original aponta para esse endereço local.

O Compose aguarda o PostgreSQL responder ao healthcheck antes de iniciar o backend. Os serviços reiniciam automaticamente, exceto quando forem parados manualmente. O Docker Desktop ainda precisa iniciar com o Windows para isso funcionar depois de ligar o computador.

O arquivo `fiado-control/.env.example` está preparado para conexões entre os containers: `DB_HOST=db` e `DB_PORT=5432`. Se precisar de configuração própria, copie para `.env` e ajuste os valores. Quando o Django roda diretamente no computador, fora do Docker, use `DB_HOST=127.0.0.1` e `DB_PORT=5433` no ambiente daquele terminal.

## Parar preservando os dados

```powershell
docker compose stop
```

Para voltar:

```powershell
docker compose start
```

`docker compose down` também preserva o volume. `docker compose down -v` apaga o volume do banco e não deve ser usado em uma instalação com dados a preservar. Os scripts de `init-scripts` só inicializam uma base vazia; as atualizações de bases existentes são feitas com `manage.py migrate`.

## Conferir a entrega

Confira as operações pelo Swagger ou Postman com um JWT de gerente. Configurações, recebimentos, indicadores e CSVs estão disponíveis na API. O cliente HTTP encaminha o Bearer existente, e o backend recebe os campos originais de configurações. As telas permanecem originais. Ao salvar a configuração, juros mensais simples e multa diária passam a valer; confira os percentuais antes de confirmar. O roteiro e os testes estão em [api/sprint5-backend2.md](api/sprint5-backend2.md).

## Antes de operar com dados reais

As novas rotas financeiras possuem autenticação e autorização, mas ainda existem endpoints legados sem proteção global, conforme a issue #60. A equipe precisa concluir essa proteção e validar as funcionalidades restantes com o cliente antes da liberação operacional. A configuração atual do Compose utiliza o servidor de desenvolvimento Django; uma implantação definitiva também precisa de servidor WSGI/ASGI, `DEBUG=False`, chave própria, contas individuais e rotina de backup/restauração.

Se o acesso for feito por outros computadores, o endereço/IP deve entrar em `ALLOWED_HOSTS` no `.env`. A configuração original do frontend aponta para localhost:8001 e precisa ser ajustada pela equipe responsável se o navegador estiver em outro computador. O escopo desta configuração é execução local; domínio público, TLS e exposição pela internet dependem da forma de hospedagem que a equipe escolher.
