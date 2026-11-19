/*
 * Catálogo de produtos do Fiado Control.
 *
 * Os produtos são armazenados no PostgreSQL,
 * por meio da API do backend Django.
 *
 * Rotas disponíveis:
 * GET  /api/produtos
 * POST /api/produtos
 * PUT  /api/produtos/{id}
 */

(function () {
  const FC = (window.FC = window.FC || {});

  const { normalizar, arredondar } = FC.format;

  // Lista temporária em memória.
  let itens = [];

  // Indica se os produtos já foram carregados.
  let carregado = false;

  // Organiza os produtos por ordem alfabética.
  function ordenar(lista) {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  // Converte os dados recebidos da API.
  function mapear(produto) {
    return {
      id: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      quantidade_estoque: produto.quantidade_estoque,
    };
  }

  // GET: Busca os produtos no Django.
  async function carregar() {
    const dados = await FC.api.request("/produtos");

    if (!Array.isArray(dados)) {
      throw new Error("Resposta inválida da API de produtos.");
    }

    itens = dados.map(mapear);

    carregado = true;

    return listar();
  }

  // Retorna os produtos carregados.
  function listar() {
    return ordenar(itens);
  }

  // Pesquisa produtos pelo nome.
  function buscar(termo) {
    const t = normalizar(termo);

    const todos = listar();

    return t ? todos.filter((p) => normalizar(p.nome).includes(t)) : todos;
  }

  // Busca um produto pelo nome exato.
  function porNome(nome) {
    const produto = itens.find((p) => normalizar(p.nome) === normalizar(nome));

    return produto || null;
  }

  // POST: Cadastra um produto.
  // PUT: Atualiza um produto existente.
  async function salvar({ nome, preco }) {
    if (!carregado) {
      await carregar();
    }

    const existente = porNome(nome);

    const produto = {
      nome: nome.trim(),
      preco: arredondar(preco),
    };

    const caminho = existente ? `/produtos/${existente.id}` : "/produtos";

    const metodo = existente ? "PUT" : "POST";

    const resposta = await FC.api.request(caminho, {
      method: metodo,
      body: produto,
    });

    const salvo = mapear(resposta);

    // Atualiza a lista temporária.
    itens = itens.filter((p) => String(p.id) !== String(salvo.id));

    itens.push(salvo);

    return salvo;
  }

  // A API ainda não possui registro de usos.
  function registrarUso(nome) {
    // Funcionalidade pendente no backend.
  }

  // A API ainda não possui exclusão de produtos.
  async function remover(id) {
    throw new Error(
      "A exclusão de produtos ainda não está disponível no backend.",
    );
  }

  // Disponibiliza as funções para o frontend.
  FC.produtos = {
    carregar,
    listar,
    buscar,
    porNome,
    salvar,
    registrarUso,
    remover,

    get carregado() {
      return carregado;
    },
  };
})();
