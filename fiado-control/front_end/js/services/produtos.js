// Catálogo de produtos (namespace global FC.produtos).
//
// Produtos armazenados exclusivamente no backend.
// GET  /produtos
// POST /produtos
// PUT  /produtos/{id}
//
// O armazenamento local é utilizado somente para
// a preferência de ordenação dos produtos mais usados.

(function () {
  const FC = (window.FC = window.FC || {});
  const { normalizar, arredondar } = FC.format;

  const CHAVE_USOS = "fiadoControl.produtos.usos.v1";

  let cache = [];
  let carregando = null;

  // Preferência local de utilização dos produtos.
  function usos() {
    try {
      return JSON.parse(
        localStorage.getItem(CHAVE_USOS)
      ) || {};
    } catch {
      return {};
    }
  }

  // Lista os produtos mais utilizados primeiro.
  function listar() {
    const u = usos();

    const n = (p) => u[normalizar(p.nome)] || 0;

    return cache.slice().sort(
      (a, b) =>
        n(b) - n(a) ||
        a.nome.localeCompare(b.nome, "pt-BR")
    );
  }

  // Pesquisa produtos pelo nome.
  function buscar(termo) {
    const t = normalizar(termo);
    const todos = listar();

    return t
      ? todos.filter((p) =>
          normalizar(p.nome).includes(t)
        )
      : todos;
  }

  // Localiza um produto pelo nome completo.
  function porNome(nome) {
    return listar().find(
      (p) => normalizar(p.nome) === normalizar(nome)
    ) || null;
  }

  // Padroniza os dados retornados pela API.
  function normalizarItem(p) {
    return {
      id: p.id_produto ?? p.id,
      nome: String(p.nome || ""),
      preco: Number(p.preco ?? p.preco_venda ?? 0),
      quantidade_estoque: p.quantidade_estoque ?? null,
    };
  }

  // Carrega os produtos do backend.
  function carregar() {
    if (carregando) return carregando;

    carregando = (async () => {
      try {
        const r = await FC.api.request("/produtos");

        const lista = Array.isArray(r)
          ? r
          : r?.produtos;

        if (!Array.isArray(lista)) {
          throw new Error(
            "Resposta inválida ao consultar produtos."
          );
        }

        cache = lista.map(normalizarItem);

        return listar();

      } finally {
        carregando = null;
      }
    })();

    return carregando;
  }

  // Cadastra ou atualiza um produto no backend.
  async function salvar({ nome, preco }) {
    nome = nome.trim();
    preco = arredondar(preco);

    const existente = porNome(nome);

    try {
      if (existente) {

        if (arredondar(existente.preco) === preco) {
          return existente;
        }

        const r = await FC.api.request(
          `/produtos/${encodeURIComponent(existente.id)}`,
          {
            method: "PUT",
            body: { nome, preco },
          }
        );

        const item = normalizarItem(r);

        cache = cache.map(
          (p) => p.id === item.id ? item : p
        );

        return item;
      }

      const r = await FC.api.request("/produtos", {
        method: "POST",
        body: { nome, preco },
      });

      const item = normalizarItem(r);

      cache = [
        ...cache.filter((p) => p.id !== item.id),
        item,
      ];

      return item;

    } catch (e) {

      if (e && e.codigo === "produto_duplicado") {
        await carregar();

        const produto = porNome(nome);

        if (produto) return produto;
      }

      throw e;
    }
  }

  // Registra somente a preferência de uso no navegador.
  function registrarUso(nome) {
    const u = usos();
    const k = normalizar(nome);

    u[k] = (u[k] || 0) + 1;

    try {
      localStorage.setItem(
        CHAVE_USOS,
        JSON.stringify(u)
      );
    } catch {
      // Preferência indisponível.
    }
  }

  FC.produtos = {
    carregar,
    listar,
    buscar,
    porNome,
    salvar,
    registrarUso,

    // Mantidos para compatibilidade com a interface.
    remover: () => {},
    modoLocal: () => false,
  };

})();
