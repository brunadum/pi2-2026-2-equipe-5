# Fiado Control — Frontend

Frontend responsável pela interface de interação do usuário com o sistema Fiado Control.

## Escopo

A camada a seguir é responsável por:

* Apresentar a interface do sistema;
* Receber dados do usuário;
* Enviar requisições para o backend;
* Apresentar as respostas da API;
* Organizar a experiência de utilização do sistema.

## Tecnologias

* HTML
* CSS
* JavaScript
* Docker

## Estrutura

```text
front_end/
│
├── README.md
├── Dockerfile
├── .dockerignore
├── index.html
│
├── css/
│   └── style.css
│
└── js/
    └── script.js
```

## Docker

Construção da imagem:

```bash
docker build -t fiado-control-frontend .
```

Execução do container:

```bash
docker run --rm -p 80:80 fiado-control-frontend
```

O frontend ficará disponível em:

```text
http://localhost
```

## Comunicação com o Backend

Quando executado através do Docker Compose, o frontend e o backend estarão conectados à mesma rede Docker.

```text
Frontend
   │
   │ HTTP
   ▼
Backend
```

O frontend será responsável por realizar as requisições HTTP para a API disponibilizada pelo backend.

## Porta

O servidor web do frontend utiliza:

```text
80
```

Acesso externo:

```text
http://localhost
```

## Status

Frontend preparado para execução em container e integração com o backend.
