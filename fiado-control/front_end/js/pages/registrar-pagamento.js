// Tela "Registrar Pagamento / Baixa": busca o cliente, lista parcelas em aberto e registra a baixa.
(function () {
  const FC = window.FC;
  const { moeda, arredondar, dataBR, escapeHtml } = FC.format;
  const masks = FC.masks;
  const $ = (id) => document.getElementById(id);

  const FORMAS = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    cartao_credito: "Cartão de Crédito",
    cartao_debito: "Cartão de Débito",
    outro: "Outro abatimento",
  };

  const MENSAGENS = {
    valor_excede_devido: "O valor informado excede o valor devido das parcelas selecionadas.",
    parcela_ja_paga: "Uma das parcelas já foi paga. A lista foi atualizada.",
    parcela_nao_encontrada: "Uma das parcelas não foi encontrada. A lista foi atualizada.",
  };

  const el = {
    titulo: $("titulo-pagina"),
    subtitulo: $("subtitulo-pagina"),
    aviso: $("aviso-local"),
    avisoTexto: $("aviso-local-texto"),
    busca: $("cli-busca"),
    buscaLista: $("cli-busca-lista"),
    buscaBtn: $("btn-buscar"),
    estado: $("parcelas-estado"),
    tabelaWrap: $("parcelas-tabela-wrap"),
    corpo: $("parcelas-body"),
    selTodas: $("sel-todas"),
    totalDevido: $("total-devido"),
    selecionado: $("selecionado"),
    form: $("form-baixa"),
    tituloBaixa: $("t-baixa"),
    valor: $("valor-baixa"),
    valorDica: $("valor-dica"),
    valorErro: $("valor-erro"),
    formas: document.querySelectorAll('input[name="forma"]'),
    alerta: $("baixa-alerta"),
    requisito: $("requisito"),
    cancelar: $("btn-cancelar"),
    confirmar: $("btn-confirmar"),
  };

  const state = { cliente: null, parcelas: [], marcadas: new Set(), enviando: false, concluido: false, carregando: false };

  FC.ui.initSidebar();
  masks.mascaraMoeda(el.valor);

  // ---------------------------------------------------------------- cálculo

  const chave = (p) => String(p.id_parcela);
  const totalAberto = () => arredondar(state.parcelas.reduce((s, p) => s + p.devido, 0));
  const escolhidas = () => state.parcelas.filter((p) => state.marcadas.has(chave(p)));
  const totalEscolhido = () => arredondar(escolhidas().reduce((s, p) => s + p.devido, 0));
  const formaAtual = () => [...el.formas].find((r) => r.checked)?.value || "dinheiro";

  function erroValor() {
    const v = masks.valorMoeda(el.valor);
    const max = totalEscolhido();
    if (!state.marcadas.size) return "Selecione ao menos uma parcela.";
    if (!v) return "Informe o valor da baixa.";
    if (v > max + 0.001) return `O valor não pode ser maior que o total selecionado (${moeda(max)}).`;
    return "";
  }

  // --------------------------------------------------------------- renderização

  function rotuloSituacao(p) {
    if (p.status === "atrasado" || p.dias_atraso > 0) {
      const d = p.dias_atraso > 0 ? ` há ${p.dias_atraso} ${p.dias_atraso === 1 ? "dia" : "dias"}` : "";
      return `<span class="badge badge-late">Em atraso${d}</span>`;
    }
    if (p.status === "parcial" || p.saldo_parcela < p.valor_parcela) return '<span class="badge badge-pending">Parcial</span>';
    return '<span class="badge badge-muted">A vencer</span>';
  }

  function renderTabela() {
    el.corpo.innerHTML = state.parcelas.map((p) => {
      const marcada = state.marcadas.has(chave(p));
      const num = String(p.numero).padStart(2, "0");
      const tot = String(p.total_parcelas || p.numero).padStart(2, "0");
      const extra = p.devido > p.saldo_parcela + 0.001
        ? `<small class="sub">com juros e multa</small>`
        : p.saldo_parcela < p.valor_parcela - 0.001 ? `<small class="sub">de ${moeda(p.valor_parcela)}</small>` : "";
      return `<tr data-id="${escapeHtml(chave(p))}"${marcada ? ' class="is-marcada"' : ""}>
        <td class="cell-strong">${num}/${tot}<small class="sub">Venda #${escapeHtml(p.id_venda)}</small></td>
        <td>${dataBR(p.data_vencimento)}</td>
        <td>${rotuloSituacao(p)}</td>
        <td class="cell-right cell-strong">${moeda(p.devido)}${extra}</td>
        <td class="cell-center"><label class="check-line check-all"><input type="checkbox"${marcada ? " checked" : ""}${state.concluido ? " disabled" : ""} aria-label="Selecionar parcela ${num}/${tot} da venda ${escapeHtml(p.id_venda)}"><span class="mark"></span></label></td>
      </tr>`;
    }).join("");
    el.selTodas.checked = state.parcelas.length > 0 && state.marcadas.size === state.parcelas.length;
    el.selTodas.indeterminate = state.marcadas.size > 0 && state.marcadas.size < state.parcelas.length;
    el.selTodas.disabled = state.concluido;
  }

  function mostrarEstado({ icone, titulo, texto, erro, acao }) {
    el.tabelaWrap.hidden = true;
    el.estado.hidden = false;
    el.estado.className = "state-box" + (erro ? " is-error" : "");
    el.estado.innerHTML = `<span class="state-icon" aria-hidden="true">${icone}</span><h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(texto)}</p>${
      acao ? `<button class="btn btn-outline" type="button" id="estado-acao">${escapeHtml(acao.rotulo)}</button>` : ""}`;
    if (acao) $("estado-acao").addEventListener("click", acao.executar);
  }

  const ICONE_BUSCA = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>';
  const ICONE_OK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const ICONE_ERRO = '<svg viewBox="0 0 24 24"><path d="M10.3 4.4 2.8 17.5a1.8 1.8 0 0 0 1.6 2.7h15.2a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.2M12 16.5h.01"/></svg>';

  function esqueleto() {
    el.estado.hidden = true;
    el.tabelaWrap.hidden = false;
    el.corpo.innerHTML = Array.from({ length: 3 }, () =>
      '<tr class="skeleton-row"><td><span class="skeleton w-40"></span></td><td><span class="skeleton w-90"></span></td><td><span class="skeleton w-40"></span></td><td><span class="skeleton w-40"></span></td><td></td></tr>').join("");
  }

  function renderTudo() {
    const total = totalAberto();
    el.totalDevido.textContent = moeda(total);
    el.totalDevido.classList.toggle("valor-vermelho", total > 0);
    el.totalDevido.classList.toggle("valor-verde", total <= 0 && !!state.cliente);

    const sel = escolhidas();
    el.selecionado.hidden = !sel.length;
    el.selecionado.innerHTML = sel.length
      ? `Selecionado: <strong>${moeda(totalEscolhido())}</strong> em ${sel.length} ${sel.length === 1 ? "parcela" : "parcelas"}`
      : "";

    el.valor.disabled = !sel.length || state.enviando || state.concluido;
    el.formas.forEach((r) => { r.disabled = state.enviando || state.concluido; });

    const erro = erroValor();
    const digitou = !!el.valor.value;
    el.valorErro.textContent = digitou ? erro : "";
    el.valorErro.hidden = !(digitou && erro);
    el.valor.closest(".form-field").classList.toggle("has-error", digitou && !!erro);
    el.valorDica.textContent = sel.length
      ? `Máximo: ${moeda(totalEscolhido())}. Valores menores abatem primeiro a parcela mais antiga (pagamento parcial).`
      : "";

    let falta = "";
    if (!state.cliente) falta = "Pesquise e selecione um cliente.";
    else if (state.carregando) falta = "Carregando parcelas…";
    else if (!state.parcelas.length) falta = "";
    else if (!sel.length) falta = "Selecione ao menos uma parcela.";
    else if (erro) falta = erro;
    el.requisito.textContent = state.concluido ? "" : falta;
    el.requisito.hidden = !el.requisito.textContent;
    el.confirmar.disabled = state.enviando || state.concluido || !!erro || !state.cliente;
    if (state.concluido) el.confirmar.disabled = true;
  }

  function sincronizarValor() {
    masks.definirMoeda(el.valor, state.marcadas.size ? totalEscolhido() : null);
  }

  // ------------------------------------------------------------------ dados

  async function carregarParcelas(cliente) {
    state.cliente = cliente;
    state.parcelas = [];
    state.marcadas = new Set();
    state.carregando = true;
    state.concluido = false;
    el.alerta.hidden = true;
    esqueleto();
    renderTudo();
    try {
      state.parcelas = await FC.clientes.obterParcelasAbertas(cliente);
      state.parcelas.sort((a, b) =>
        String(a.data_vencimento || "9999").localeCompare(String(b.data_vencimento || "9999")) || a.numero - b.numero);
      const aviso = FC.clientes.avisoLocal();
      el.aviso.hidden = !aviso;
      el.avisoTexto.textContent = aviso;
      state.carregando = false;

      if (!state.parcelas.length) {
        mostrarEstado({ icone: ICONE_OK, titulo: "Nenhuma parcela em aberto", texto: `${cliente.nome} não possui valores pendentes.` });
      } else {
        el.estado.hidden = true;
        el.tabelaWrap.hidden = false;
        renderTabela();
      }
    } catch (e) {
      state.carregando = false;
      mostrarEstado({
        icone: ICONE_ERRO, erro: true,
        titulo: "Não foi possível carregar as parcelas", texto: e.mensagem || "Ocorreu um erro inesperado.",
        acao: { rotulo: "Tentar novamente", executar: () => carregarParcelas(cliente) },
      });
    }
    sincronizarValor();
    renderTudo();
  }

  const busca = FC.clienteBusca.criar({
    input: el.busca,
    botao: el.buscaBtn,
    lista: el.buscaLista,
    aoSelecionar: (c) => { limparConclusao(); carregarParcelas(c); },
    aoLimpar: () => {
      state.cliente = null; state.parcelas = []; state.marcadas = new Set(); state.concluido = false;
      limparConclusao();
      mostrarEstado({ icone: ICONE_BUSCA, titulo: "Selecione um cliente", texto: "Pesquise pelo nome, CPF ou telefone para ver as parcelas em aberto." });
      sincronizarValor();
      renderTudo();
    },
  });

  // --------------------------------------------------------------- eventos

  el.corpo.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    const id = e.target.closest("tr").dataset.id;
    if (e.target.checked) state.marcadas.add(id); else state.marcadas.delete(id);
    renderTabela();
    sincronizarValor();
    renderTudo();
  });
  el.selTodas.addEventListener("change", () => {
    state.marcadas = el.selTodas.checked ? new Set(state.parcelas.map(chave)) : new Set();
    renderTabela();
    sincronizarValor();
    renderTudo();
  });
  el.valor.addEventListener("input", renderTudo);
  el.formas.forEach((r) => r.addEventListener("change", renderTudo));

  el.cancelar.addEventListener("click", () => {
    if (state.concluido) { location.href = `cliente-detalhes.html?id=${encodeURIComponent(state.cliente.id)}`; return; }
    if (!state.cliente) { location.href = "dashboard.html"; return; }
    busca.limpar();
    state.cliente = null; state.parcelas = []; state.marcadas = new Set();
    mostrarEstado({ icone: ICONE_BUSCA, titulo: "Selecione um cliente", texto: "Pesquise pelo nome, CPF ou telefone para ver as parcelas em aberto." });
    sincronizarValor();
    renderTudo();
    el.busca.focus();
  });

  function limparConclusao() {
    el.titulo.textContent = "Registrar Pagamento / Baixa";
    el.subtitulo.textContent = "Realize a liquidação ou abatimento parcial de parcelas em aberto.";
    el.tituloBaixa.textContent = "Formalizar pagamento";
    el.confirmar.textContent = "Confirmar pagamento";
    el.confirmar.classList.add("btn-success");
    el.cancelar.textContent = "Cancelar";
    const outra = $("btn-outra-baixa");
    if (outra) outra.remove();
    const recibo = $("recibo");
    if (recibo) recibo.remove();
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (state.enviando || el.confirmar.disabled) return;

    const erro = erroValor();
    if (erro) { renderTudo(); return; }

    const valor = masks.valorMoeda(el.valor);
    const forma = formaAtual();
    const sel = escolhidas();
    const parcial = valor < totalEscolhido() - 0.001;

    const ok = await FC.ui.confirmar({
      titulo: "Confirmar pagamento?",
      mensagem: `Registrar a baixa de ${moeda(valor)} (${FORMAS[forma]}) para ${state.cliente.nome}, em ${sel.length} ${sel.length === 1 ? "parcela" : "parcelas"}${parcial ? ". O valor é menor que o total selecionado: será um pagamento parcial" : ""}.`,
      rotuloConfirmar: "Confirmar pagamento",
    });
    if (!ok) return;

    state.enviando = true;
    el.alerta.hidden = true;
    el.confirmar.classList.add("is-loading");
    renderTudo();

    try {
      const resultado = await FC.clientes.registrarBaixa(state.cliente, sel, valor, forma);
      state.enviando = false;
      el.confirmar.classList.remove("is-loading");
      await concluir(resultado, valor, forma);
    } catch (e) {
      state.enviando = false;
      el.confirmar.classList.remove("is-loading");
      const feitos = e.concluidos || [];
      let texto = MENSAGENS[e.codigo] || e.mensagem || "Não foi possível registrar o pagamento.";
      if (feitos.length) {
        const pago = arredondar(feitos.reduce((s, f) => s + f.valor, 0));
        texto += ` Atenção: ${moeda(pago)} já havia sido baixado em ${feitos.length} ${feitos.length === 1 ? "parcela" : "parcelas"} antes do erro.`;
      }
      el.alerta.textContent = texto;
      el.alerta.hidden = false;
      if (feitos.length || ["parcela_ja_paga", "parcela_nao_encontrada"].includes(e.codigo)) await carregarParcelas(state.cliente);
      else renderTudo();
    }
  }
  el.form.addEventListener("submit", enviar);

  async function concluir(resultado, valor, forma) {
    const cliente = state.cliente;
    const linhas = resultado.pagamentos.map((p) => {
      const num = `${String(p.parcela.numero).padStart(2, "0")}/${String(p.parcela.total_parcelas || p.parcela.numero).padStart(2, "0")}`;
      const quitada = (p.resposta.status_parcela || "") === "pago";
      return `<li><span>Parcela ${num} · Venda #${escapeHtml(p.parcela.id_venda)}</span><strong>${moeda(p.valor)} <em>${quitada ? "quitada" : "parcial"}</em></strong></li>`;
    }).join("");

    await carregarParcelas(cliente);
    state.concluido = true;
    renderTabela();

    el.titulo.textContent = "Pagamento concluído";
    el.subtitulo.textContent = "O comprovante foi gerado e a baixa foi registrada com sucesso.";
    el.tituloBaixa.textContent = "Comprovante de pagamento";
    el.confirmar.textContent = "Baixado com sucesso";
    el.cancelar.textContent = "Voltar";
    sincronizarValor();
    masks.definirMoeda(el.valor, valor);

    const recibo = document.createElement("div");
    recibo.id = "recibo";
    recibo.className = "recibo";
    recibo.innerHTML = `<p><strong>${moeda(valor)}</strong> recebido via ${escapeHtml(FORMAS[forma])}</p><ul>${linhas}</ul>
      <button class="btn btn-outline btn-sm btn-block" id="btn-outra-baixa" type="button">Registrar outra baixa</button>`;
    el.form.insertBefore(recibo, el.alerta);
    $("btn-outra-baixa").addEventListener("click", () => { limparConclusao(); carregarParcelas(cliente); });
    renderTudo();
    el.confirmar.disabled = true;
    FC.ui.toast("Pagamento registrado com sucesso.");
  }

  // ------------------------------------------------------------------ início

  renderTudo();
  busca.carregar().then(() => {
    const id = new URLSearchParams(location.search).get("cliente");
    if (!id) return;
    return FC.clientes.obterCliente(id).then((c) => { busca.selecionar(c); });
  }).catch(() => { /* a própria busca mostra o erro ao abrir a lista */ });
})();
