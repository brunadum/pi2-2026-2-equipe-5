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

Frontend preparado para execução em container e integração com o backend.\n
## Dashboard

A tela inicial do painel está em `pages/dashboard.html`, com estilos em
`css/pages/dashboard.css` e interações em `js/pages/dashboard.js`.
Os indicadores e registros atuais são demonstrativos; a integração com a API
deve ser feita posteriormente na camada `js/services/`.

Para testar com Docker, execute os comandos na pasta `front_end`:
```bash
docker build -t fiado-control-frontend .
docker run --rm -p 8080:80 fiado-control-frontend
```
Depois, acesse `http://localhost:8080/pages/dashboard.html`.

## Telas de clientes

| Tela | Página | JS | CSS |
|---|---|---|---|
| Lista de clientes (busca, filtro, cadastro rápido) | `pages/clientes.html` | `js/pages/clientes.js`, `js/components/cadastro-cliente.js` | `css/pages/clientes.css` |
| Detalhes do cliente (resumo, histórico, pagamento, limite) | `pages/cliente-detalhes.html?id=<id>` | `js/pages/cliente-detalhes.js` | `css/pages/cliente-detalhes.css` |

Arquivos compartilhados criados junto com elas:

```text
js/config.js              URL da API e cidade/UF usadas na sugestão de ruas
js/utils/format.js        moeda, CPF, telefone, data
js/utils/validators.js    validação de CPF (dígitos verificadores), telefone (DDD) e nome
js/utils/masks.js         máscaras de CPF, telefone, moeda e número
js/shared/ui.js           toast, menu mobile e modal acessível
js/services/api.js        cliente HTTP (erros no formato { erro, mensagem })
js/services/clientes.js   clientes, saldo, histórico, parcelas, limite e pagamentos
js/services/enderecos.js  sugestão de ruas (ViaCEP, com Nominatim/OpenStreetMap como reserva)
css/layout.css            sidebar e área principal
css/components.css        botões, tabelas, badges, formulários, modal, estados
```

### Integração com a API

`js/services/clientes.js` segue o contrato de `docs/api/contratoAPI.md`. Hoje o Django só tem
`GET/POST /clientes`, `GET/POST /vendas` e `POST /pagamentos`. Para as rotas que ainda não existem
(`/clientes/{id}`, `/saldo`, `/historico`, `/parcelas`, `PUT /limite`), o serviço usa um
**fallback no navegador** (localStorage) e a tela mostra um aviso amarelo. Quando a rota for
implementada no back-end, ela passa a ser usada automaticamente, sem alterar as telas.

Observações para o back-end:

* `CORS_ALLOWED_ORIGINS` precisa incluir a origem do front (ex.: `http://localhost` ou `:8080` no Docker).
* `POST /clientes` ainda não grava; o front guarda o cliente criado localmente até a gravação existir.
* O cadastro não envia `limite_credito` no POST (contrato): o limite inicial é aplicado depois pela rota de limite.


## Telas de vendas e pagamentos

| Tela | Página | Script | Estilo |
| --- | --- | --- | --- |
| Nova Venda (cliente, produtos, fiado / a prazo, parcelas, desconto) | `pages/nova-venda.html` (aceita `?cliente=<id>`) | `js/pages/nova-venda.js` | `css/pages/nova-venda.css` |
| Registrar Pagamento / Baixa (parcelas em aberto, baixa parcial, forma de pagamento) | `pages/registrar-pagamento.html` (aceita `?cliente=<id>`) | `js/pages/registrar-pagamento.js` | `css/pages/registrar-pagamento.css` |
| Editar / excluir cliente | botões na linha de `pages/clientes.html` | `js/pages/clientes.js` + `js/components/cadastro-cliente.js` | — |

Arquivos novos compartilhados:

```text
js/services/produtos.js          catálogo de produtos (localStorage)
js/components/cliente-busca.js   campo de busca de cliente (nome, CPF ou telefone) com sugestões
js/components/produto-modal.js   modal "Adicionar produto" (máscara de R$, quantidade, catálogo)
```

`FC.ui.confirmar()` (em `js/shared/ui.js`) abre um diálogo de confirmação reutilizável.

### O que ainda é guardado só no navegador

O back-end atual não tem estas rotas/tabelas, então o front usa o fallback local (com aviso amarelo):

* **Produtos e itens da venda** – `POST /vendas` só recebe o valor total (já com desconto).
* **Desconto** e **forma de pagamento** da baixa – não existem no contrato.
* **Editar cliente** (`PUT /clientes/{id}`) e **excluir cliente** (`DELETE /clientes/{id}`).
* **Histórico** (`GET /clientes/{id}/historico`).

Assim que as rotas existirem, o front passa a usá-las sozinho (404/405 = usa o fallback; qualquer outra resposta = usa a API).
Excluir cliente é bloqueado enquanto houver valor em aberto.
