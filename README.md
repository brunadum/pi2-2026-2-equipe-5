# Fiado Control

Sistema desenvolvido em arquitetura monorepo para gerenciamento de vendas a prazo, clientes, parcelas e pagamentos.

O projeto foi dividido em duas camadas principais:

* `front_end` — interface da aplicação.
* `back_end` — API e regras de negócio.

A execução dos serviços é orquestrada pelo Docker Compose na raiz do projeto.

## Estrutura do projeto

```text
fiado-control/
│
├── README.md
├── docker-compose.yml
│
├── front_end/
│   ├── README.md
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── index.html
│   ├── css/
│   └── js/
│
└── back_end/
    ├── README.md
    ├── Dockerfile
    ├── .dockerignore
    ├── requirements.txt
    ├── manage.py
    ├── config/
    └── core/
```

## Arquitetura

A aplicação utiliza dois containers independentes:

```text
                    Docker Compose
                          │
                 fiado-control-network
                    /             \
                   /               \
                  ▼                 ▼
          ┌─────────────┐   ┌─────────────┐
          │  FRONTEND   │   │   BACKEND   │
          │ HTML/CSS/JS │──▶│   Django    │
          │   :80       │   │    :8000    │
          └─────────────┘   └─────────────┘
```

O Docker Compose cria uma rede interna que permitir a comunicação entre os serviços.

## Camada Frontend

Responsável pela interface utilizada pelo usuário.

Tecnologias:

* HTML
* CSS
* JavaScript

O frontend é executado em seu próprio container.

## Camada Backend

Responsável pela API, processamento das requisições e regras de negócio.

Tecnologias:

* Python 3.14
* Django 6.1.1
* PostgreSQL

O backend é executado em seu próprio container.

## Executar o projeto

Na raiz do projeto:

```bash
docker compose up --build
```

Para executar em segundo plano usa-se:

```bash
docker compose up --build -d
```

Para ocorre as parar os containers usa-se:

```bash
docker compose down
```

## Serviços

| Serviço  | Tecnologia  | Porta |
| -------- | ----------- | ----: |
| frontend | HTML/CSS/JS |    80 |
| backend  | Django      |  8000 |

## Acesso

Para acessar o frontend:

```text
http://localhost
```

Para acessar o backend:

```text
http://localhost:8000
```

## Comunicação

A comunicação entre os containers ocorre através da rede criada pelo Docker Compose.

O frontend não deve utilizar `localhost` para acessar o backend dentro da rede Docker. Para ocorrer comunicação entre containers, deve ser utilizado o nome do serviço definido no `docker-compose.yml`.

## Status

Projeto em desenvolvimento.
