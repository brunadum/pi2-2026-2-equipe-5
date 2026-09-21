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
    ├── admin.py
    ├── apps.py
    ├── models.py
    ├── tests.py
    └── views.py
```

## Execução local

Entre na pasta:

```bash
cd back_end
```

Execute:

```bash
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

Quando executado pelo Docker Compose, o backend utiliza a rede compartilhada definida na raiz do projeto.

O serviço do backend é identificado pelo nome:

```text
backend
```

Esse nome pode ser utilizado pelos outros containers para comunicação interna.

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

## Status

Backend inicializado e preparado para desenvolvimento da API.
