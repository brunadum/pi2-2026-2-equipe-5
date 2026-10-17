// Tela de listagem de clientes.
(function () {
  const FC = window.FC;
  const { moeda, telefone: formatarTelefone, normalizar, apenasDigitos, escapeHtml } = FC.format;

  const el = {
    corpo: document.getElementById("clientes-body"),
    estado: document.getElementById("estado"),
    busca: document.getElementById("busca"),
    filtros: document.querySelectorAll("[data-filtro]"),
    contagem: document.getElementById("contagem"),
    aviso: document.getElementById("aviso-local"),
    avisoTexto: document.getElementById("aviso-local-texto"),
    novo: document.getElementById("btn-novo-cliente"),
  };

  const state = { clientes: [], resumos: new Map(), busca: "", filtro: "todos", destacar: null };

  FC.ui.initSidebar();

  // ------------------------------------------------------------ renderização

  const emAtraso = (c) => !!state.resumos.get(c.id)?.possui_parcelas_atrasadas;

  function filtrados() {
    const termo = normalizar(state.busca);
    const digitos = apenasDigitos(state.busca);
    return state.clientes.filter((c) => {
      if (state.filtro === "atraso" && !emAtraso(c)) return false;
      if (state.filtro === "dia" && emAtraso(c)) return false;
      if (!termo) return true;
      if (normalizar(c.nome).includes(termo)) return true;
      if (!digitos) return false;
      return c.cpf.includes(digitos) || c.telefone.some((t) => t.includes(digitos));
    });
  }

  const ICONE_EDITAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 7 3 3"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

  function linha(c) {
    const r = state.resumos.get(c.id);
    const atraso = emAtraso(c);
    const limite = r?.limite_credito ?? c.limite_credito;
    return `<tr data-id="${escapeHtml(c.id)}"${state.destacar === c.id ? ' class="row-new"' : ""}>
      <td class="cell-strong">${escapeHtml(c.nome)}</td>
      <td>${escapeHtml(formatarTelefone(c.telefone[0]))}</td>
      <td class="cell-ink">${moeda(limite)}</td>
      <td class="${atraso ? "cell-late" : "cell-strong"}">${r ? moeda(r.saldo_devedor) : "—"}</td>
      <td><span class="badge ${atraso ? "badge-late" : "badge-ok"}">${atraso ? "Em atraso" : "Em dia"}</span></td>
      <td class="cell-right"><div class="row-actions">
        <a class="link" href="cliente-detalhes.html?id=${encodeURIComponent(c.id)}" aria-label="Ver detalhes de ${escapeHtml(c.nome)}">Ver detalhes</a>
        <button class="icon-btn" type="button" data-acao="editar" title="Editar cliente" aria-label="Editar ${escapeHtml(c.nome)}">${ICONE_EDITAR}</button>
        <button class="icon-btn danger" type="button" data-acao="excluir" title="Excluir cliente" aria-label="Excluir ${escapeHtml(c.nome)}">${ICONE_LIXEIRA}</button>
      </div></td>
    </tr>`;
  }

  function esqueleto() {
    const celula = (w) => `<td><span class="skeleton ${w}"></span></td>`;
    el.corpo.innerHTML = Array.from({ length: 4 }, () =>
      `<tr class="skeleton-row">${celula("w-90")}${celula("")}${celula("w-40")}${celula("w-40")}${celula("w-40")}${celula("w-40")}</tr>`
    ).join("");
    el.estado.hidden = true;
  }

  function mostrarEstado({ icone, titulo, texto, erro, acao }) {
    el.estado.className = "state-box" + (erro ? " is-error" : "");
    el.estado.innerHTML = `<span class="state-icon" aria-hidden="true">${icone}</span><h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(texto)}</p>${
      acao ? `<button class="btn btn-outline" type="button" id="estado-acao">${escapeHtml(acao.rotulo)}</button>` : ""
    }`;
    el.estado.hidden = false;
    if (acao) document.getElementById("estado-acao").addEventListener("click", acao.executar);
  }

  const ICONE_BUSCA = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>';
  const ICONE_ERRO = '<svg viewBox="0 0 24 24"><path d="M10.3 4.4 2.8 17.5a1.8 1.8 0 0 0 1.6 2.7h15.2a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.2M12 16.5h.01"/></svg>';

  function renderizar() {
    const lista = filtrados();
    el.corpo.innerHTML = lista.map(linha).join("");
    el.contagem.textContent = `${lista.length} ${lista.length === 1 ? "cliente encontrado" : "clientes encontrados"}`;

    if (lista.length) { el.estado.hidden = true; return; }

    const semCadastro = state.clientes.length === 0;
    mostrarEstado({
      icone: ICONE_BUSCA,
      titulo: semCadastro ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado",
      texto: semCadastro
        ? "Cadastre o primeiro cliente para começar a registrar vendas."
        : "Nenhum resultado para a busca ou filtro atual. Que tal cadastrar um novo cliente?",
      acao: { rotulo: "Cadastrar cliente", executar: () => FC.cadastroCliente.abrir() },
    });
  }

  function atualizarAviso() {
    const texto = FC.clientes.avisoLocal();
    el.aviso.hidden = !texto;
    el.avisoTexto.textContent = texto;
  }

  // ----------------------------------------------------------------- dados

  async function carregar() {
    esqueleto();
    try {
      const clientes = await FC.clientes.listarClientes();
      clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      state.resumos = await FC.clientes.obterResumos(clientes);
      state.clientes = clientes;

      atualizarAviso();
      renderizar();
      state.destacar = null;
    } catch (e) {
      el.corpo.innerHTML = "";
      mostrarEstado({
        icone: ICONE_ERRO,
        erro: true,
        titulo: "Não foi possível carregar os clientes",
        texto: e.mensagem || "Ocorreu um erro inesperado.",
        acao: { rotulo: "Tentar novamente", executar: carregar },
      });
    }
  }

  // ---------------------------------------------------------------- eventos

  el.busca.addEventListener("input", () => { state.busca = el.busca.value; renderizar(); });

  el.filtros.forEach((botao) => {
    botao.addEventListener("click", () => {
      state.filtro = botao.dataset.filtro;
      el.filtros.forEach((b) => b.setAttribute("aria-pressed", String(b === botao)));
      renderizar();
    });
  });

  FC.cadastroCliente.init({
    obterCpfs: () => new Set(state.clientes.map((c) => c.cpf)),
    aoEditar: async (cliente) => { state.destacar = cliente.id; await carregar(); },
    aoCadastrar: async (cliente) => {
      state.busca = "";
      el.busca.value = "";
      state.filtro = "todos";
      el.filtros.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === "todos")));
      state.destacar = cliente.id;
      await carregar();
    },
  });

  el.novo.addEventListener("click", () => FC.cadastroCliente.abrir());

  async function excluir(cliente) {
    const confirmado = await FC.ui.confirmar({
      titulo: "Excluir cliente?",
      mensagem: `${cliente.nome} será removido da lista de clientes. Esta ação não pode ser desfeita.`,
      rotuloConfirmar: "Excluir cliente",
      perigo: true,
    });
    if (!confirmado) return;
    try {
      await FC.clientes.excluirCliente(cliente);
      FC.ui.toast(`Cliente ${cliente.nome} excluído.`);
      await carregar();
    } catch (e) {
      FC.ui.toast(e.mensagem || "Não foi possível excluir o cliente.", "erro");
    }
  }

  el.corpo.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-acao]");
    if (!botao) return;
    const cliente = state.clientes.find((c) => String(c.id) === botao.closest("tr").dataset.id);
    if (!cliente) return;
    const r = state.resumos.get(cliente.id);
    if (botao.dataset.acao === "editar") FC.cadastroCliente.abrir({ ...cliente, limite_credito: r?.limite_credito ?? cliente.limite_credito });
    else excluir(cliente);
  });

  carregar().then(() => {
    // Atalho vindo do dashboard: clientes.html?novo=1 abre o cadastro direto.
    const params = new URLSearchParams(location.search);
    if (params.get("novo") === "1") {
      history.replaceState(null, "", location.pathname);
      FC.cadastroCliente.abrir();
    }
  });
})();
