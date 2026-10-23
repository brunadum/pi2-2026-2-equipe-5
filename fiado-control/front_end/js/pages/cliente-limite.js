// Tela "Controle de Limite / Aprovação": limite do cliente, alteração com motivo e solicitações de exceção.
(function () {
  const FC = window.FC;
  const { moeda, arredondar, cpf: formatarCpf, telefone: formatarTelefone, dataBR, escapeHtml } = FC.format;
  const masks = FC.masks;
  const $ = (id) => document.getElementById(id);

  const MOTIVO_MIN = 5;

  const el = {
    aviso: $("aviso-local"),
    avisoTexto: $("aviso-local-texto"),
    busca: $("cli-busca"),
    buscaLista: $("cli-busca-lista"),
    buscaBtn: $("btn-buscar"),
    vazio: $("estado-vazio"),
    conteudo: $("conteudo-cliente"),
    crumb: $("crumb-cliente"),
    iniciais: $("cli-iniciais"),
    nome: $("cli-nome"),
    meta: $("cli-meta"),
    detalhes: $("link-detalhes"),
    stLimite: $("st-limite"),
    stAberto: $("st-aberto"),
    stSituacao: $("st-situacao"),
    form: $("form-limite"),
    alerta: $("lim-alerta"),
    valor: $("lim-valor"),
    valorErro: $("lim-valor-erro"),
    dica: $("lim-dica"),
    motivo: $("lim-motivo"),
    motivoErro: $("lim-motivo-erro"),
    contador: $("lim-contador"),
    enviar: $("lim-enviar"),
    histLista: $("hist-lista"),
    histVazio: $("hist-vazio"),
    excLista: $("exc-lista"),
    excContagem: $("exc-contagem"),
  };

  const state = { cliente: null, resumo: null, excecoes: [], resumosExc: new Map(), tocados: new Set(), enviando: false };

  FC.ui.initSidebar();
  masks.mascaraMoeda(el.valor);

  const iniciais = (nome) => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "--";

  function atualizarAviso() {
    const texto = FC.clientes.avisoLocal();
    el.aviso.hidden = !texto;
    el.avisoTexto.textContent = texto;
  }

  // ---------------------------------------------------------------- cliente

  function situacao(r) {
    if (r.credito_bloqueado) return { texto: "Crédito bloqueado", classe: "badge-late" };
    if (r.possui_parcelas_atrasadas) return { texto: "Parcelas em atraso", classe: "badge-late" };
    if (r.saldo_devedor > r.limite_credito + 0.001) return { texto: "Limite excedido", classe: "badge-late" };
    return { texto: "Em dia", classe: "badge-ok" };
  }

  function renderCliente() {
    const c = state.cliente;
    const r = state.resumo;
    el.vazio.hidden = !!c;
    el.conteudo.hidden = !c;
    el.crumb.textContent = c ? c.nome : "Controle de limite";
    if (!c || !r) return;

    const s = situacao(r);
    el.iniciais.textContent = iniciais(c.nome);
    el.iniciais.classList.toggle("ok", s.classe === "badge-ok");
    el.nome.textContent = c.nome;
    el.meta.textContent = `CPF: ${formatarCpf(c.cpf)} • Telefone: ${formatarTelefone(c.telefone[0])}`;
    el.detalhes.href = `cliente-detalhes.html?id=${encodeURIComponent(c.id)}`;
    el.stLimite.textContent = moeda(r.limite_credito);
    el.stAberto.textContent = moeda(r.saldo_devedor);
    el.stAberto.className = r.saldo_devedor > 0 ? "vermelho" : "";
    el.stSituacao.textContent = s.texto;
    el.stSituacao.className = `badge ${s.classe}`;
    renderHistorico();
    atualizarFormulario();
  }

  function renderHistorico() {
    const itens = state.cliente ? FC.clientes.listarAlteracoesLimite(state.cliente).slice(0, 6) : [];
    el.histVazio.hidden = itens.length > 0;
    el.histLista.innerHTML = itens.map((a) => `
      <li>
        <div class="hist-topo">
          <span class="hist-valores">${moeda(a.de)}<span class="seta" aria-hidden="true">→</span><span class="sr-only"> para </span>${moeda(a.para)}</span>
          <span class="hist-data">${dataBR(a.data)} ${new Date(a.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <p class="hist-motivo">${escapeHtml(a.motivo)}</p>
      </li>`).join("");
  }

  async function carregarCliente(cliente) {
    state.cliente = cliente;
    state.resumo = null;
    state.tocados = new Set();
    el.form.reset();
    el.valor.value = "";
    el.contador.textContent = `0/${el.motivo.maxLength}`;
    el.alerta.hidden = true;
    history.replaceState(null, "", `?id=${encodeURIComponent(cliente.id)}`);
    destacarCards();
    try {
      state.resumo = await FC.clientes.obterResumo(cliente);
      atualizarAviso();
      masks.definirMoeda(el.valor, state.resumo.limite_credito);
      renderCliente();
    } catch (e) {
      state.cliente = null;
      FC.ui.toast(e.mensagem || "Não foi possível carregar o cliente.", "erro");
      renderCliente();
    }
  }

  const busca = FC.clienteBusca.criar({
    input: el.busca,
    botao: el.buscaBtn,
    lista: el.buscaLista,
    aoSelecionar: carregarCliente,
    aoLimpar: () => {},
  });

  // ------------------------------------------------------------- formulário

  function erros() {
    const r = state.resumo;
    const novo = masks.valorMoeda(el.valor);
    const motivo = el.motivo.value.trim();
    return {
      valor: novo === null ? "Informe o novo limite (use R$ 0,00 para zerar)."
        : r && arredondar(novo) === arredondar(r.limite_credito) ? "Informe um valor diferente do limite atual." : "",
      motivo: !motivo ? "Informe o motivo da alteração."
        : motivo.length < MOTIVO_MIN ? "Descreva um pouco melhor o motivo." : "",
    };
  }

  function mostrarErro(campo, texto) {
    const caixa = campo === "valor" ? el.valorErro : el.motivoErro;
    const entrada = campo === "valor" ? el.valor : el.motivo;
    caixa.textContent = texto;
    caixa.hidden = !texto;
    entrada.closest(".form-field").classList.toggle("has-error", !!texto);
    entrada.setAttribute("aria-invalid", texto ? "true" : "false");
  }

  function atualizarFormulario() {
    const e = erros();
    for (const c of ["valor", "motivo"]) mostrarErro(c, state.tocados.has(c) ? e[c] : "");
    el.enviar.disabled = !!(e.valor || e.motivo) || state.enviando || !state.resumo;
    el.contador.textContent = `${el.motivo.value.length}/${el.motivo.maxLength}`;

    const novo = masks.valorMoeda(el.valor);
    const aberto = state.resumo?.saldo_devedor || 0;
    el.dica.textContent = novo !== null && novo < aberto
      ? `Atenção: o novo limite é menor que o valor em aberto (${moeda(aberto)}). O cliente ficará sem limite disponível até pagar.`
      : state.resumo ? `Limite atual: ${moeda(state.resumo.limite_credito)} • Em aberto: ${moeda(aberto)}.` : "";
  }

  el.valor.addEventListener("input", () => { state.tocados.add("valor"); atualizarFormulario(); });
  el.motivo.addEventListener("input", () => { state.tocados.add("motivo"); atualizarFormulario(); });
  el.valor.addEventListener("blur", () => { state.tocados.add("valor"); atualizarFormulario(); });
  el.motivo.addEventListener("blur", () => { state.tocados.add("motivo"); atualizarFormulario(); });

  el.form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (state.enviando) return;
    const e = erros();
    if (e.valor || e.motivo) {
      state.tocados = new Set(["valor", "motivo"]);
      atualizarFormulario();
      (e.valor ? el.valor : el.motivo).focus();
      return;
    }

    const novo = masks.valorMoeda(el.valor);
    state.enviando = true;
    el.alerta.hidden = true;
    el.enviar.classList.add("is-loading");
    el.enviar.disabled = true;
    try {
      await FC.clientes.alterarLimite(state.cliente, novo, el.motivo.value.trim());
      state.enviando = false;
      el.enviar.classList.remove("is-loading");
      const cliente = await FC.clientes.obterCliente(state.cliente.id);
      await carregarCliente(cliente);
      FC.ui.toast(`Limite de ${cliente.nome} atualizado para ${moeda(novo)}.`);
      carregarExcecoes();
    } catch (err) {
      state.enviando = false;
      el.enviar.classList.remove("is-loading");
      if (err.codigo === "limite_invalido") { state.tocados.add("valor"); mostrarErro("valor", err.mensagem); }
      else {
        el.alerta.textContent = err.codigo === "acesso_negado"
          ? "Apenas o gerente pode alterar o limite de crédito."
          : err.mensagem || "Não foi possível alterar o limite.";
        el.alerta.hidden = false;
      }
      atualizarFormulario();
    }
  });

  // ------------------------------------------------------- solicitações

  const ICONE_OK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function destacarCards() {
    el.excLista.querySelectorAll(".exc-card").forEach((card) => {
      card.classList.toggle("is-atual", !!state.cliente && String(card.dataset.cliente) === String(state.cliente.id));
    });
  }

  function cardExcecao(x) {
    const r = x.id_cliente != null ? state.resumosExc.get(x.id_cliente) : null;
    const motivo = FC.clientes.MOTIVOS_EXCECAO[x.motivo] || "Exceção";
    const badge = x.motivo === "parcelas_em_atraso" ? "badge-pending" : "badge-late";
    const meta = [x.data ? dataBR(x.data) : null, r ? `Disponível: ${moeda(r.limite_disponivel)}` : null].filter(Boolean).join(" · ");
    return `<article class="exc-card" data-id="${escapeHtml(x.id)}" data-cliente="${escapeHtml(x.id_cliente ?? "")}">
      <div class="exc-topo">
        <button class="exc-nome" type="button" data-acao="abrir" title="Abrir este cliente">${escapeHtml(x.nome)}</button>
        <span class="exc-id">#${escapeHtml(x.id_venda)}</span>
      </div>
      <div class="exc-meio"><span class="badge ${badge}">${escapeHtml(motivo)}</span><strong>${moeda(x.valor)}</strong></div>
      <p class="exc-meta">${escapeHtml(meta)}</p>
      <div class="exc-acoes">
        <button class="btn btn-success" type="button" data-acao="aprovar">Aprovar</button>
        <button class="btn btn-outline" type="button" data-acao="negar">Recusar</button>
      </div>
    </article>`;
  }

  function renderExcecoes() {
    const n = state.excecoes.length;
    el.excContagem.hidden = !n;
    el.excContagem.textContent = String(n);
    el.excLista.innerHTML = n
      ? state.excecoes.map(cardExcecao).join("")
      : `<div class="exc-vazio"><span class="state-icon" aria-hidden="true">${ICONE_OK}</span><strong>Nenhuma solicitação pendente</strong><span>As vendas recusadas por limite ou atraso aparecem aqui para decisão do gerente.</span></div>`;
    destacarCards();
  }

  async function carregarExcecoes() {
    el.excLista.innerHTML = '<div class="exc-skel"></div><div class="exc-skel"></div>';
    try {
      state.excecoes = await FC.clientes.listarExcecoes();
      const ids = [...new Set(state.excecoes.map((x) => x.id_cliente).filter((i) => i != null))];
      const todos = await busca.carregar().catch(() => []);
      state.resumosExc = await FC.clientes.obterResumos(todos.filter((c) => ids.includes(c.id)));
      atualizarAviso();
      renderExcecoes();
    } catch (e) {
      el.excContagem.hidden = true;
      el.excLista.innerHTML = `<div class="exc-vazio"><strong>Não foi possível carregar</strong><span>${escapeHtml(e.mensagem || "Ocorreu um erro inesperado.")}</span><button class="btn btn-outline btn-sm" type="button" data-acao="recarregar">Tentar novamente</button></div>`;
    }
  }

  async function decidir(x, decisao) {
    const aprovar = decisao === "aprovar";
    const ok = await FC.ui.confirmar({
      titulo: aprovar ? "Aprovar exceção?" : "Recusar solicitação?",
      mensagem: aprovar
        ? `A venda #${x.id_venda} de ${moeda(x.valor)} para ${x.nome} será autorizada, mesmo fora das regras de crédito.`
        : `A venda #${x.id_venda} de ${moeda(x.valor)} para ${x.nome} continuará rejeitada.`,
      rotuloConfirmar: aprovar ? "Aprovar" : "Recusar",
      perigo: !aprovar,
    });
    if (!ok) return;

    const card = el.excLista.querySelector(`[data-id="${CSS.escape(String(x.id))}"]`);
    card?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      const r = await FC.clientes.decidirExcecao(x, decisao);
      FC.ui.toast(aprovar ? `Venda #${x.id_venda} aprovada.` : `Venda #${x.id_venda} recusada.`);
      atualizarAviso();
      if (!r.local && state.cliente && String(state.cliente.id) === String(x.id_cliente)) await carregarCliente(await FC.clientes.obterCliente(state.cliente.id));
      await carregarExcecoes();
    } catch (e) {
      card?.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      const mensagens = { excecao_ja_decidida: "Esta solicitação já foi decidida.", acesso_negado: "Apenas o gerente pode decidir exceções." };
      FC.ui.toast(mensagens[e.codigo] || e.mensagem || "Não foi possível registrar a decisão.", "erro");
      if (e.codigo === "excecao_ja_decidida") carregarExcecoes();
    }
  }

  el.excLista.addEventListener("click", async (e) => {
    const botao = e.target.closest("[data-acao]");
    if (!botao) return;
    if (botao.dataset.acao === "recarregar") { carregarExcecoes(); return; }
    const card = botao.closest(".exc-card");
    const x = state.excecoes.find((i) => String(i.id) === card.dataset.id);
    if (!x) return;
    if (botao.dataset.acao === "abrir") {
      if (x.id_cliente == null) { FC.ui.toast("Não foi possível identificar o cliente desta venda.", "erro"); return; }
      busca.selecionar(await FC.clientes.obterCliente(x.id_cliente));
      el.conteudo.scrollIntoView({ behavior: "smooth", block: "start" });
    } else decidir(x, botao.dataset.acao);
  });

  // ----------------------------------------------------------------- início

  renderCliente();
  carregarExcecoes();
  busca.carregar().then(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return;
    return FC.clientes.obterCliente(id).then((c) => busca.selecionar(c)).catch(() => {
      FC.ui.toast("Cliente não encontrado. Pesquise pelo nome.", "erro");
    });
  }).catch(() => { /* a própria busca mostra o erro ao abrir a lista */ });
})();
