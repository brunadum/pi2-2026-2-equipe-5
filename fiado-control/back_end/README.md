# Fiado Control — Backend

Backend responsável pela API e pelas regras de negócio do sistema Fiado Control.

## Escopo

Esta camada é responsável por:

* Receber requisições do frontend;
* Processar as regras de negócio;
* Disponibilizar endpoints da API;
* Realizar operações com o banco de dados;
* Retornar respostas para o frontend.

## Tecnologias

* Python 3.14
* Django 6.1.1
* PostgreSQL
* psycopg2-binary
* Docker

## Estrutura

```text
back_end/
│
├── README.md
├── Dockerfile
├── .dockerignore
├── requirements.txt
├── requirements-test.txt
├── manage.py
│
├── config/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
│
└── core/
    ├── migrations/
    ├── templates/
    ├── admin.py
    ├── apps.py
    ├── credito.py
    ├── documentacao.py
    ├── models.py
    ├── openapi.py
    ├── test_credito.py
    ├── test_documentacao.py
    ├── tests.py
    └── views.py
```

## Execução local

Antes de iniciar, tenha o PostgreSQL disponível e configure as variáveis
`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` e `DB_PORT` no ambiente do
terminal. Os nomes das variáveis estão em [`../.env.example`](../.env.example).
O `runserver` não carrega esse arquivo automaticamente.

Exemplo de configuração no PowerShell, ajustando os valores para seu banco:

```powershell
$env:DB_NAME = "fiadocontrol"
$env:DB_USER = "seu_usuario"
$env:DB_PASSWORD = "sua_senha"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
```

Se estiver usando o PostgreSQL do Docker Compose a partir do computador,
utilize `DB_PORT=5433`.

A partir da raiz do repositório, entre na pasta:

```bash
cd fiado-control/back_end
```

Crie o ambiente virtual (uma vez, dentro de `back_end`):

```bash
python -m venv .venv
```

Ative o ambiente (a cada terminal novo):

```bash
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# Linux/macOS
source .venv/bin/activate
```

Instale as dependências e execute:

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

O backend ficará disponível em:

```text
http://127.0.0.1:8000/
```

## Docker

Construção da imagem:

```bash
docker build -t fiado-control-backend .
```

Execução do container:

```bash
docker run --rm -p 8000:8000 fiado-control-backend
```

## Docker Compose

O arquivo `docker-compose.yml` está na pasta `fiado-control`. A partir dela,
suba os serviços e aplique as migrações:

```bash
docker compose up --build -d
docker compose exec backend python manage.py migrate
```

Se utilizar `fiado-control/.env`, configure `DB_HOST=db` e `DB_PORT=5432`
para o backend dentro do container. A porta `5433` é usada para acessar
esse banco a partir do computador.

O backend utiliza a rede compartilhada do Compose e fica disponível em
[http://localhost:8001/](http://localhost:8001/).

O serviço do backend é identificado pelo nome:

```text
backend
```

Esse nome pode ser utilizado pelos outros containers para comunicação interna.

## Documentação da API

O Swagger permite consultar as rotas, seus parâmetros, exemplos de entrada,
respostas e códigos de erro. O OpenAPI disponibiliza o mesmo contrato em JSON
para ferramentas como o Postman.

| Ambiente | Swagger UI | OpenAPI JSON |
|---|---|---|
| Execução local | [Abrir Swagger](http://127.0.0.1:8000/api/docs/) | [Abrir OpenAPI](http://127.0.0.1:8000/api/openapi.json) |
| Docker Compose | [Abrir Swagger](http://localhost:8001/api/docs/) | [Abrir OpenAPI](http://localhost:8001/api/openapi.json) |

As duas rotas de documentação são públicas. Para operações protegidas, use
o botão **Authorize** e informe o token Bearer emitido pela autenticação.
As descrições das operações indicam permissões e dependências de integração.

O login atual `/api/login/` ainda não emite token. As operações de crédito
exigem que a camada de autenticação valide o token e disponibilize a identidade
em `request.usuario`; enquanto essa integração estiver pendente, retornam 401.

A interface carrega o CSS e o JavaScript do **Swagger UI 5.30.2** pelo CDN
`cdn.jsdelivr.net`, que precisa estar acessível no navegador. A especificação
JSON é servida pelo próprio backend e pode ser consultada sem acesso ao CDN.
O Swagger não persiste o token entre recarregamentos nem envia a especificação
para um validador externo.

O contrato detalhado e o formato dos erros estão em
[`contratoAPI.md`](../../docs/api/contratoAPI.md) e
[`formato-de-erros.md`](../../docs/api/formato-de-erros.md).

## Migrações do banco

Após obter alterações que acrescentem migrações, execute no diretório do backend:

```bash
python manage.py migrate
```

No Docker Compose, use `docker compose exec backend python manage.py migrate`.
Os scripts de inicialização do PostgreSQL só executam na criação de uma base
vazia; uma base existente precisa receber as migrações para atualizar a estrutura.

## Testes automatizados

Com o ambiente virtual ativo e as variáveis `DB_*` configuradas, instale as
dependências de teste e execute a suíte:

```bash
pip install -r requirements-test.txt
python manage.py test core --noinput
```

Para conferir os cenários da documentação e a compatibilidade das respostas
com o OpenAPI, exibindo o nome e o resultado de cada teste:

```bash
python manage.py test core.test_documentacao core.test_credito.ContratoRespostasTests --noinput --verbosity 2
```

Os testes de integração criam e removem um banco separado chamado
`test_<DB_NAME>`. O usuário PostgreSQL precisa de permissão para criá-lo.
A preparação dos testes recria tabelas e dados somente nesse banco de teste.

Os cenários de crédito simulam a identidade em um middleware exclusivo de
teste; isso verifica as regras das rotas, mas não comprova a integração do
login com tokens válidos, inválidos ou expirados.

## Rota de teste

Destaca-se que o backend possui uma rota inicial para verificar seu funcionamento:

```text
GET /
```

Com a resposta esperada:

```json
{
    "mensagem": "Sistema funcionando"
}
```

## Porta

O Django utiliza a porta:

```text
8000
```

Sendo o acesso externo:

```text
http://localhost:8000
```

No Docker Compose, a porta interna continua sendo `8000`, mas o acesso pelo
computador utiliza `http://localhost:8001`.

## Status

Backend inicializado e preparado para desenvolvimento da API.
