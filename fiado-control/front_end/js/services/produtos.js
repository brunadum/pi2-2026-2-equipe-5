// Catálogo de produtos (namespace global FC.produtos).
//
// O back-end ainda não possui tabela/rotas de produtos (o contrato de vendas recebe apenas o valor total).
// Por isso o catálogo fica guardado neste navegador (localStorage) e serve para agilizar o cadastro dos
// itens de uma venda. Quando existir uma rota GET/POST /produtos, só este arquivo precisa mudar.
(function () {
  const FC = (window.FC = window.FC || {});
  const { normalizar, arredondar } = FC.format;

  const CHAVE = "fiadoControl.produtos.v1";

  function ler() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE) || "{}");
      return { itens: Array.isArray(s.itens) ? s.itens : [], seq: s.seq || 0 };
    } catch {
      return { itens: [], seq: 0 };
    }
  }

  function gravar(dados) {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* armazenamento indisponível */ }
  }

  // Mais usados primeiro; depois ordem alfabética.
  function listar() {
    return ler().itens.sort((a, b) => (b.usos || 0) - (a.usos || 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function buscar(termo) {
    const t = normalizar(termo);
    const todos = listar();
    return t ? todos.filter((p) => normalizar(p.nome).includes(t)) : todos;
  }

  const porNome = (nome) => listar().find((p) => normalizar(p.nome) === normalizar(nome)) || null;

  // Cria ou atualiza (mesmo nome = mesmo produto) e devolve o registro.
  function salvar({ nome, preco }) {
    const dados = ler();
    const existente = dados.itens.find((p) => normalizar(p.nome) === normalizar(nome));
    if (existente) {
      existente.nome = nome.trim();
      existente.preco = arredondar(preco);
      gravar(dados);
      return existente;
    }
    const novo = { id: ++dados.seq, nome: nome.trim(), preco: arredondar(preco), usos: 0 };
    dados.itens.push(novo);
    gravar(dados);
    return novo;
  }

  function registrarUso(nome) {
    const dados = ler();
    const p = dados.itens.find((x) => normalizar(x.nome) === normalizar(nome));
    if (p) { p.usos = (p.usos || 0) + 1; gravar(dados); }
  }

  function remover(id) {
    const dados = ler();
    dados.itens = dados.itens.filter((p) => p.id !== id);
    gravar(dados);
  }

  FC.produtos = { listar, buscar, porNome, salvar, registrarUso, remover };
})();
