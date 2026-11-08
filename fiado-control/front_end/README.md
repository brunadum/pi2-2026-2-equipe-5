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

## Relatórios e Configurações

As telas novas estão ligadas à navegação principal e mantêm os arquivos separados por responsabilidade:

| Tela | HTML | CSS | JavaScript |
| --- | --- | --- | --- |
| Relatórios e Dashboard Financeiro | `pages/relatorios-dashboard.html` | `css/pages/relatorios-dashboard.css` | `js/pages/relatorios-dashboard.js` |
| Configurações do Sistema | `pages/configuracoes.html` | `css/pages/configuracoes.css` | `js/pages/configuracoes.js` |

### Contrato necessário no backend

- **Dashboard/relatórios:** `GET /api/dashboard/?periodo=dia|semana|mes`. Para preencher todos os indicadores, é recomendado retornar `faturamento_total`, `total_recebido`, `total_vencido`, `taxa_atraso` (ou `taxa_inadimplencia`), `total_a_receber`, `parcelas_vencidas` e `faturamento_semanal`. A lista `parcelas_vencidas` pode conter `nome`, `data_vencimento`, `dias_atraso` e `valor_parcela`; `faturamento_semanal` deve conter itens com `rotulo` e `valor`.
- **Configurações:** implementar `GET /api/configuracoes/` e `PUT /api/configuracoes/`. O `GET` deve retornar os valores atuais persistidos no banco. O `PUT` recebe um objeto JSON com `multa_diaria_percentual`, `juros_mensais_percentual`, `desconto_maximo_percentual`, `limite_padrao_cliente`, `bloquear_vendas_atraso`, `permitir_cliente_sem_cpf`, `exigir_senha_venda`, `permitir_venda_parcial`, `operador_cadastrar_cliente`, `operador_registrar_pagamento` e `restringir_relatorios_admin`.
- **Exportação de pagamentos:** o frontend tenta `GET /api/pagamentos` quando o usuário solicita esse relatório. O contrato descrito acima documenta `POST /api/pagamentos`, mas não garante a listagem; por isso a exportação mostra um aviso se a rota `GET` não existir.

Os nomes e chamadas usados no frontend estão comentados em `js/pages/relatorios-dashboard.js` e `js/pages/configuracoes.js` para facilitar a localização pela equipe de backend. Enquanto `GET/PUT /api/configuracoes/` não existirem, a tela de configurações usa valores demonstrativos e pode guardar as alterações em `localStorage`, identificando explicitamente que elas **não foram gravadas no banco**. Nenhum dos endpoints do backend é alterado por este pacote de frontend.


## Controle de Limite / Aprovação

| Tela | Página | Script | Estilo |
| --- | --- | --- | --- |
| Controle de Limite / Aprovação (dentro de Clientes) | `pages/cliente-limite.html` (aceita `?id=<id>`) | `js/pages/cliente-limite.js` | `css/pages/cliente-limite.css` |

Acesso: ícone de medidor na linha do cliente em **Clientes** e botão **Limite e aprovações** em **Detalhes do cliente**.

* **Alterar limite:** `PUT /clientes/{id}/limite` (rota 19 do contrato). O motivo da alteração e o histórico ficam só neste navegador, porque o contrato recebe apenas o valor.
* **Solicitações de exceção:** `GET /excecoes?status=pendente` e `PUT /excecoes/{id}/aprovar|negar` (rotas 22 a 24). Enquanto essas rotas não existem no Django, a lista mostra as vendas rejeitadas nos últimos 30 dias por limite excedido ou parcela em atraso (crédito bloqueado não admite exceção) que ainda não tiveram decisão, e **Aprovar/Recusar fica registrado só neste navegador** (aviso amarelo na tela). A venda no banco continua rejeitada até o back-end implementar as rotas.
* Enquanto `PUT /clientes/{id}/limite` não existe, o limite alterado aparece nas telas do front, mas o back-end continua usando o limite do banco para aprovar ou rejeitar vendas.

## Usuários e comprovantes

| Tela | Arquivos | Como chega |
| --- | --- | --- |
| Usuários | `pages/usuarios.html`, `js/pages/usuarios.js`, `js/services/usuarios.js`, `css/pages/usuarios.css` | Configurações → aba **Usuários** |
| Comprovante de venda | `pages/comprovante-venda.html` | Ao registrar uma venda aparece "Imprimir comprovante?"; também há o botão **Ver comprovante** |
| Comprovante de pagamento | `pages/comprovante-pagamento.html` | Ao confirmar uma baixa aparece "Imprimir comprovante?"; também há o botão **Ver / imprimir comprovante** |

Os dois comprovantes usam `js/pages/comprovante.js` e `js/services/comprovantes.js`. A impressão usa o diálogo do navegador
(A4, sem menu e botões); nele também dá para "Salvar como PDF".

### Integração com a API

- **Usuários**: `GET/POST /usuarios`, `PUT /usuarios/{id}` e `PUT /usuarios/{id}/inativar` (rotas 25 a 28 do contrato).
  Perfis da tela → contrato: Administrador = `gerente`; Operador Financeiro e Vendedor(a) = `funcionario`
  (com `permissoes` diferentes). A senha é enviada em `senha` (obrigatória no cadastro, opcional na edição).
  Se o back-end responder 404/405 (rota inexistente) ou 401 (exige login), a tela usa o navegador e mostra um aviso amarelo.
- **Comprovantes**: são montados com o que o back-end devolve (`POST /vendas` → id e parcelas; `POST /pagamentos` → status e saldos)
  mais os dados da tela (produtos, desconto, forma de pagamento). Ficam guardados no navegador (`fiadoControl.comprovantes.v1`,
  últimos 80). O back-end ainda não guarda itens da venda nem a forma de pagamento; quando guardar, basta ler esses dados em
  `comprovante.js` no lugar do que está salvo localmente.

## Autenticação, sessão e perfis (Sprint 4)

- **Login** (`pages/login.html`, `js/login.js`): `POST /api/login/` devolve `token`, `nome` e `perfil`; o front guarda os três
  em `sessionStorage` (a sessão acaba ao fechar a aba) e abre o Dashboard (gerente) ou Nova Venda (funcionário).
  Credencial inválida mostra sempre "Usuário ou senha inválidos.", sem dizer qual dos dois está errado.
- **Proteção das páginas** (`js/shared/auth.js`, carregado no `<head>` de todas as páginas internas): sem token ou com token
  vencido (lido do `exp` do JWT) vai para `login.html?motivo=login|expirada`; página que o perfil não pode abrir vai para
  `sem-permissao.html`.
- **Token em todas as requisições** (`js/services/api.js`): cabeçalho `Authorization: Bearer <token>`.
  **401** com token enviado = sessão expirada → limpa a sessão e volta ao login com aviso.
  **403** → "Você não tem permissão para realizar esta ação."
- **Perfis**: `ADMIN`/`GERENTE` = gerente; qualquer outro = funcionário. Nome e perfil reais aparecem no menu de todas as páginas,
  com botão **Sair do sistema**.

| Recurso | Gerente | Funcionário |
| --- | --- | --- |
| Nova Venda, Clientes (ver, cadastrar, editar), Pagamentos, Comprovantes | sim | sim |
| Excluir cliente | sim | não (botão some) |
| Limite e aprovações (`cliente-limite.html`), Dashboard, Relatórios, Configurações, Usuários | sim | não (menu some; abrir direto mostra "sem permissão") |

A matriz segue a coluna *Perfil* do `docs/api/contratoAPI.md`. Esconder telas aqui é só conforto: quem decide é o back-end (403).
Para mudar quem vê o quê, edite `PAGINAS_GERENTE` e `ACOES_GERENTE` em `js/shared/auth.js`.
