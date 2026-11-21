// Catálogo de produtos (namespace global FC.produtos).
//
// Os produtos ficam no servidor (GET/POST/PUT /produtos), compartilhados por todos os usuários.
//   • Leitura (listar/buscar/porNome) é síncrona e usa uma cópia em memória; chame `carregar()` para atualizá-la.
//   • `salvar()` cria (POST) ou atualiza o preço (PUT, somente gerente) e atualiza a cópia em memória.
//   • "Mais usados primeiro" é uma preferência deste navegador (o servidor não guarda contagem de uso).
//   • Se a rota /produtos não existir no servidor (`naoImplementado`), o catálogo volta a ficar só neste
//     navegador (localStorage) — `modoLocal()` avisa a tela.
(function () {
  const FC = (window.FC = window.FC || {});
  const { normalizar, arredondar } = FC.format;

  const CHAVE = "fiadoControl.produtos.v1";      // catálogo local (modo de reserva)
  const CHAVE_USOS = "fiadoControl.produtos.usos.v1"; // contagem de uso por nome (preferência local)

  let cache = [];      // produtos do servidor: { id, nome, preco, quantidade_estoque }
  let local = false;   // true quando o servidor não possui /produtos
  let carregando = null;

  // ------------------------------------------------------------ armazenamento local

  function lerJson(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
  }
  function gravarJson(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível */ }
  }
  const lerLocal = () => {
    const s = lerJson(CHAVE, {});
    return { itens: Array.isArray(s.itens) ? s.itens : [], seq: s.seq || 0 };
  };
  const usos = () => lerJson(CHAVE_USOS, {});

  // ------------------------------------------------------------ leitura (síncrona)

  const base = () => (local ? lerLocal().itens : cache);

  // Mais usados primeiro; depois ordem alfabética.
  function listar() {
    const u = usos();
    const n = (p) => u[normalizar(p.nome)] || p.usos || 0;
    return base().slice().sort((a, b) => n(b) - n(a) || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function buscar(termo) {
    const t = normalizar(termo);
    const todos = listar();
    return t ? todos.filter((p) => normalizar(p.nome).includes(t)) : todos;
  }

  const porNome = (nome) => listar().find((p) => normalizar(p.nome) === normalizar(nome)) || null;
  const modoLocal = () => local;

  // ------------------------------------------------------------ servidor

  const normalizarItem = (p) => ({
    id: p.id,
    nome: String(p.nome || ""),
    preco: Number(p.preco ?? p.preco_venda ?? 0),
    quantidade_estoque: p.quantidade_estoque ?? null,
  });

  // Busca o catálogo no servidor. Nunca lança: em erro mantém a cópia anterior.
  function carregar() {
    if (carregando) return carregando;
    carregando = (async () => {
      try {
        const r = await FC.api.request("/produtos");
        const lista = Array.isArray(r) ? r : r?.produtos;
        cache = (Array.isArray(lista) ? lista : []).map(normalizarItem);
        local = false;
      } catch (e) {
        if (e && e.naoImplementado) local = true;
        // Outros erros (rede, sessão): mantém o que já se tinha; a venda continua possível.
      } finally {
        carregando = null;
      }
      return listar();
    })();
    return carregando;
  }

  // Cria ou atualiza (mesmo nome = mesmo produto) e devolve o registro.
  // Falhas não interrompem a venda: o chamador decide se mostra aviso.
  async function salvar({ nome, preco }) {
    nome = nome.trim();
    preco = arredondar(preco);

    if (local) return salvarLocal(nome, preco);

    const existente = porNome(nome);
    try {
      if (existente) {
        if (arredondar(existente.preco) === preco) return existente;
        const r = await FC.api.request(`/produtos/${existente.id}`, { method: "PUT", body: { nome, preco } });
        const item = normalizarItem(r);
        cache = cache.map((p) => (p.id === item.id ? item : p));
        return item;
      }
      const r = await FC.api.request("/produtos", { method: "POST", body: { nome, preco } });
      const item = normalizarItem(r);
      cache = [...cache.filter((p) => p.id !== item.id), item];
      return item;
    } catch (e) {
      if (e && e.naoImplementado) { local = true; return salvarLocal(nome, preco); }
      // Outro usuário já cadastrou o mesmo nome: apenas atualiza a cópia.
      if (e && e.codigo === "produto_duplicado") { await carregar(); return porNome(nome); }
      throw e;
    }
  }

  function salvarLocal(nome, preco) {
    const dados = lerLocal();
    const existente = dados.itens.find((p) => normalizar(p.nome) === normalizar(nome));
    if (existente) {
      existente.nome = nome;
      existente.preco = preco;
      gravarJson(CHAVE, dados);
      return existente;
    }
    const novo = { id: ++dados.seq, nome, preco, usos: 0 };
    dados.itens.push(novo);
    gravarJson(CHAVE, dados);
    return novo;
  }

  function registrarUso(nome) {
    const u = usos();
    const k = normalizar(nome);
    u[k] = (u[k] || 0) + 1;
    gravarJson(CHAVE_USOS, u);
  }

  // O servidor não oferece exclusão; no modo local apaga do navegador.
  function remover(id) {
    if (!local) return;
    const dados = lerLocal();
    dados.itens = dados.itens.filter((p) => p.id !== id);
    gravarJson(CHAVE, dados);
  }

  FC.produtos = { carregar, listar, buscar, porNome, salvar, registrarUso, remover, modoLocal };
})();
