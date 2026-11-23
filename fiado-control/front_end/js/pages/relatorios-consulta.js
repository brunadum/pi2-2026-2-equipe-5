// Tela "Consulta de Relatórios" — RF12 (requisito Importante).
//
// O gerente escolhe o tipo (vendas, pagamentos, clientes, inadimplência ou situação financeira),
// filtra por período e cliente, confere os dados na tela e exporta o CSV com os mesmos filtros.
// Rotas: GET /relatorios/{tipo} e GET /relatorios/{tipo}/exportar (via FC.relatorios).
(function () {
  const FC = window.FC;
  const { escapeHtml, moeda, dataBR, cpf: formatarCpf, telefone: formatarTelefone, hojeISO } = FC.format;
  const $ = (id) => document.getElementById(id);
  const POR_PAGINA = 50;

  const el = {
    tipos: $("tipos"), form: $("filtros"), periodo: $("f-periodo"), inicio: $("f-inicio"), fim: $("f-fim"),
    cliente: $("f-cliente"), filtrar: $("btn-filtrar"), limpar: $("btn-limpar"), erroFiltro: $("f-erro"), dica: $("f-dica"),
    exportar: $("btn-exportar"), titulo: $("res-titulo"), sub: $("res-sub"), resumo: $("resumo"),
    carregando: $("estado-carregando"), erro: $("estado-erro"), erroTitulo: $("erro-titulo"), erroTexto: $("erro-texto"),
    tentar: $("btn-tentar"), vazio: $("estado-vazio"), vazioTexto: $("vazio-texto"),
    wrap: $("tabela-wrap"), cabecalho: $("tabela-cabecalho"), corpo: $("tabela-corpo"), mais: $("rel-mais"), btnMais: $("btn-mais"),
  };

  // ------------------------------------------------------------------ formatação
  const num = (v) => Number(v) || 0;
  const MODALIDADES = { fiado: "Fiado", a_prazo: "A prazo" };
  const FORMAS = { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito", transferencia: "Transferência" };
  const rotulo = (mapa, v) => mapa[v] || (v ? String(v).replace(/_/g, " ") : "—");
  const badge = (texto, classe) => `<span class="badge ${classe}">${escapeHtml(texto)}</span>`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  // ------------------------------------------------------------------ definição de cada relatório
  // colunas: [titulo, (linha) => html, classe?]  |  resumo: (lista) => [[rótulo, valor, classe?]]
  const RELATORIOS = {
    vendas: {
      titulo: "Relatório de vendas",
      usaDatas: true,
      dica: "Lista as vendas aprovadas no período. Vendas rejeitadas ou canceladas não entram no faturamento.",
      colunas: [
        ["Nº", (v) => `#${escapeHtml(v.id_venda)}`, "cell-ink"],
        ["Data", (v) => dataBR(v.data_venda)],
        ["Cliente", (v) => escapeHtml(v.nome_cliente || `Cliente #${v.id_cliente}`), "cell-strong"],
        ["Modalidade", (v) => escapeHtml(rotulo(MODALIDADES, v.modalidade))],
        ["Valor", (v) => moeda(v.valor_total), "cell-right cell-ink"],
      ],
      resumo: (l) => {
        const total = l.reduce((s, v) => s + num(v.valor_total), 0);
        return [["Vendas", l.length], ["Faturamento", moeda(total), "verde"], ["Ticket médio", moeda(l.length ? total / l.length : 0)]];
      },
    },
    pagamentos: {
      titulo: "Relatório de pagamentos",
      usaDatas: true,
      dica: "Lista os recebimentos efetivamente registrados (baixas), com juros e multa pagos.",
      colunas: [
        ["Data", (p) => dataBR(p.data_pagamento)],
        ["Cliente", (p) => escapeHtml(p.nome_cliente || `Cliente #${p.id_cliente}`), "cell-strong"],
        ["Venda / parcela", (p) => `Venda #${escapeHtml(p.id_venda)} · parcela #${escapeHtml(p.id_parcela)}`],
        ["Forma", (p) => escapeHtml(rotulo(FORMAS, p.forma_pagamento))],
        ["Juros + multa", (p) => { const e = num(p.valor_juros) + num(p.valor_multa); return e ? moeda(e) : "—"; }, "cell-right"],
        ["Valor recebido", (p) => moeda(p.valor_recebido), "cell-right cell-ink"],
      ],
      resumo: (l) => {
        const total = l.reduce((s, p) => s + num(p.valor_recebido), 0);
        const encargos = l.reduce((s, p) => s + num(p.valor_juros) + num(p.valor_multa), 0);
        return [["Recebimentos", l.length], ["Total recebido", moeda(total), "verde"], ["Juros + multa recebidos", moeda(encargos)]];
      },
    },
    clientes: {
      titulo: "Relatório de clientes",
      usaDatas: false,
      dica: "Mostra a situação atual do cadastro. O período não se aplica a este relatório.",
      colunas: [
        ["Cliente", (c) => escapeHtml(c.nome), "cell-strong"],
        ["CPF", (c) => escapeHtml(formatarCpf(c.cpf))],
        ["Telefone", (c) => escapeHtml((Array.isArray(c.telefone) ? c.telefone : [c.telefone]).filter(Boolean).map(formatarTelefone).join(", ") || "—")],
        ["Limite de crédito", (c) => moeda(c.limite_credito), "cell-right cell-ink"],
        ["Crédito", (c) => (c.credito_bloqueado ? badge("Bloqueado", "badge-late") : badge("Liberado", "badge-ok"))],
      ],
      resumo: (l) => [
        ["Clientes", l.length],
        ["Limite total concedido", moeda(l.reduce((s, c) => s + num(c.limite_credito), 0))],
        ["Com crédito bloqueado", l.filter((c) => c.credito_bloqueado).length, l.some((c) => c.credito_bloqueado) ? "vermelho" : ""],
      ],
    },
    inadimplencia: {
      titulo: "Relatório de inadimplência",
      usaDatas: false,
      dica: "Mostra as parcelas vencidas hoje, com o valor já atualizado com juros e multa. O período não se aplica.",
      colunas: [
        ["Cliente", (p) => escapeHtml(p.nome || `Cliente #${p.id_cliente}`), "cell-strong"],
        ["Parcela", (p) => `#${escapeHtml(p.id_parcela)}`],
        ["Vencimento", (p) => dataBR(p.data_vencimento), "cell-late"],
        ["Dias em atraso", (p) => plural(num(p.dias_atraso), "dia", "dias")],
        ["Valor devido", (p) => moeda(p.valor_parcela), "cell-right cell-ink"],
      ],
      resumo: (l) => [
        ["Parcelas em atraso", l.length, l.length ? "vermelho" : ""],
        ["Total vencido", moeda(l.reduce((s, p) => s + num(p.valor_parcela), 0)), l.length ? "vermelho" : ""],
        ["Clientes inadimplentes", new Set(l.map((p) => p.id_cliente)).size],
      ],
    },
    financeiro: {
      titulo: "Situação financeira",
      usaDatas: true,
      dica: "Faturamento e recebimentos respeitam o período. Saldo a receber e valor vencido mostram a posição de hoje.",
      // Este relatório é um objeto de indicadores: vira uma tabela "Indicador | Valor".
      colunas: [
        ["Indicador", (i) => escapeHtml(i.rotulo), "cell-strong"],
        ["Valor", (i) => i.valor, "cell-right cell-ink"],
      ],
      resumo: () => [],
    },
  };

  function linhasFinanceiro(d) {
    const pct = (v) => `${num(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    return [
      { rotulo: "Faturamento (vendas aprovadas)", valor: moeda(d.faturamento_total) },
      { rotulo: "Total recebido", valor: moeda(d.total_recebido) },
      { rotulo: "Total a receber", valor: moeda(d.total_a_receber) },
      { rotulo: "Total vencido", valor: moeda(d.total_vencido) },
      { rotulo: "Taxa de atraso", valor: d.taxa_atraso !== undefined ? pct(d.taxa_atraso) : pct(num(d.taxa_inadimplencia) * 100) },
      { rotulo: "Clientes inadimplentes", valor: String(num(d.clientes_inadimplentes)) },
      { rotulo: "Parcelas vencidas", valor: String((d.parcelas_vencidas || []).length) },
      { rotulo: "Parcelas a vencer (próximos 7 dias)", valor: String((d.parcelas_a_vencer || []).length) },
    ];
  }

  // ------------------------------------------------------------------ estado da tela
  const state = { tipo: "vendas", linhas: [], mostradas: 0, pedido: 0, filtrosAplicados: null };

  function mostrar(nome, { titulo, texto } = {}) {
    el.carregando.hidden = nome !== "carregando";
    el.erro.hidden = nome !== "erro";
    el.vazio.hidden = nome !== "vazio";
    el.wrap.hidden = nome !== "tabela";
    el.mais.hidden = true;
    el.resumo.hidden = nome !== "tabela" && nome !== "vazio";
    if (nome === "erro") { el.erroTitulo.textContent = titulo; el.erroTexto.textContent = texto; }
    el.exportar.disabled = nome !== "tabela";
  }

  // ------------------------------------------------------------------ filtros
  function filtrosDaTela() {
    const def = RELATORIOS[state.tipo];
    const f = { id_cliente: el.cliente.value || "" };
    if (!def.usaDatas) return f;
    if (el.periodo.value === "personalizado") {
      f.data_inicio = el.inicio.value || "";
      f.data_fim = el.fim.value || "";
    } else {
      f.periodo = el.periodo.value || "";
    }
    return f;
  }

  function validarFiltros() {
    let msg = "";
    if (RELATORIOS[state.tipo].usaDatas && el.periodo.value === "personalizado") {
      if (!el.inicio.value && !el.fim.value) msg = "Escolha pelo menos uma data (De ou Até).";
      else if (el.inicio.value && el.fim.value && el.inicio.value > el.fim.value) msg = "A data inicial não pode ser depois da data final.";
    }
    el.erroFiltro.textContent = msg;
    el.erroFiltro.hidden = !msg;
    [el.inicio, el.fim].forEach((i) => i.closest(".form-field").classList.toggle("has-error", !!msg));
    return !msg;
  }

  function atualizarCamposDeData() {
    const usaDatas = RELATORIOS[state.tipo].usaDatas;
    const personalizado = el.periodo.value === "personalizado";
    el.periodo.disabled = !usaDatas;
    el.inicio.disabled = !usaDatas || !personalizado;
    el.fim.disabled = !usaDatas || !personalizado;
    if (!personalizado) { el.inicio.value = ""; el.fim.value = ""; }
    el.dica.textContent = RELATORIOS[state.tipo].dica;
  }

  function descreverFiltros(f) {
    const partes = [];
    const nomes = { dia: "hoje", semana: "últimos 7 dias", mes: "este mês" };
    if (f.data_inicio || f.data_fim) partes.push(`de ${f.data_inicio ? dataBR(f.data_inicio) : "início"} até ${f.data_fim ? dataBR(f.data_fim) : "hoje"}`);
    else if (f.periodo) partes.push(nomes[f.periodo]);
    else if (RELATORIOS[state.tipo].usaDatas) partes.push("todo o período");
    if (f.id_cliente) partes.push(`cliente: ${el.cliente.selectedOptions[0]?.textContent || "#" + f.id_cliente}`);
    return partes.join(" · ");
  }

  // ------------------------------------------------------------------ renderização
  function pintarResumo(lista) {
    const itens = RELATORIOS[state.tipo].resumo(lista);
    el.resumo.innerHTML = itens.map(([r, v, c]) =>
      `<div class="rel-card"><span>${escapeHtml(r)}</span><strong class="${c || ""}">${escapeHtml(String(v))}</strong></div>`).join("");
    el.resumo.hidden = !itens.length;
  }

  function pintarCabecalho() {
    el.cabecalho.innerHTML = `<tr>${RELATORIOS[state.tipo].colunas.map(([t, , c]) =>
      `<th class="${(c || "").includes("cell-right") ? "cell-right" : ""}">${escapeHtml(t)}</th>`).join("")}</tr>`;
  }

  function pintarMais() {
    const fim = Math.min(state.linhas.length, state.mostradas + POR_PAGINA);
    const cols = RELATORIOS[state.tipo].colunas;
    el.corpo.insertAdjacentHTML("beforeend", state.linhas.slice(state.mostradas, fim).map((linha) =>
      `<tr>${cols.map(([, fn, c]) => `<td class="${c || ""}">${fn(linha)}</td>`).join("")}</tr>`).join(""));
    state.mostradas = fim;
    el.mais.hidden = state.mostradas >= state.linhas.length;
  }

  function pintar(dados) {
    const def = RELATORIOS[state.tipo];
    const lista = state.tipo === "financeiro" ? linhasFinanceiro(dados || {}) : (Array.isArray(dados) ? dados : []);
    state.linhas = lista;
    state.mostradas = 0;
    el.titulo.textContent = def.titulo;
    pintarResumo(state.tipo === "financeiro" ? [] : lista);

    const desc = descreverFiltros(state.filtrosAplicados || {});
    if (!lista.length) {
      el.sub.textContent = desc ? `Filtros: ${desc}` : "";
      el.vazioTexto.textContent = state.tipo === "inadimplencia"
        ? "Nenhuma parcela em atraso. Todos os clientes estão em dia!"
        : "Não há registros para os filtros escolhidos. Tente outro período ou outro cliente.";
      mostrar("vazio");
      return;
    }
    const contagem = state.tipo === "financeiro" ? plural(lista.length, "indicador", "indicadores") : plural(lista.length, "registro", "registros");
    el.sub.textContent = `${contagem}${desc ? ` · ${desc}` : ""}`;
    pintarCabecalho();
    el.corpo.innerHTML = "";
    mostrar("tabela");
    pintarMais();
  }

  // ------------------------------------------------------------------ carregamento
  async function gerar() {
    if (!validarFiltros()) {
      state.pedido++; // descarta uma consulta que ainda estava em andamento
      el.titulo.textContent = RELATORIOS[state.tipo].titulo;
      el.sub.textContent = "Corrija as datas do filtro para gerar o relatório.";
      el.filtrar.classList.remove("is-loading");
      el.filtrar.disabled = false;
      mostrar("nenhum");
      return;
    }
    const pedido = ++state.pedido; // ignora respostas antigas se o usuário trocar de relatório no meio
    const filtros = filtrosDaTela();
    state.filtrosAplicados = filtros;
    salvarNaUrl(filtros);

    el.titulo.textContent = RELATORIOS[state.tipo].titulo;
    el.sub.textContent = "";
    el.filtrar.classList.add("is-loading");
    el.filtrar.disabled = true;
    mostrar("carregando");
    try {
      const dados = await FC.relatorios.consultar(state.tipo, filtros);
      if (pedido !== state.pedido) return;
      pintar(dados);
    } catch (erro) {
      if (pedido !== state.pedido) return;
      if (erro.status === 403) {
        mostrar("erro", { titulo: "Acesso não permitido", texto: "Os relatórios financeiros são exclusivos do gerente." });
        el.tentar.hidden = true;
      } else {
        el.tentar.hidden = false;
        mostrar("erro", {
          titulo: erro.rede ? "Sem conexão com o servidor" : "Não foi possível gerar o relatório",
          texto: erro.mensagem || "Ocorreu um erro inesperado. Tente novamente.",
        });
      }
    } finally {
      if (pedido === state.pedido) { el.filtrar.classList.remove("is-loading"); el.filtrar.disabled = false; }
    }
  }

  // RF12 FA03: falha na exportação → mensagem + opção de tentar de novo.
  async function exportar() {
    if (el.exportar.disabled) return;
    el.exportar.classList.add("is-loading");
    el.exportar.disabled = true;
    try {
      await FC.relatorios.exportar(state.tipo, state.filtrosAplicados || filtrosDaTela());
      FC.ui.toast("Arquivo CSV gerado. Confira a pasta de downloads.");
    } catch (erro) {
      FC.ui.toast(erro.status === 403
        ? "Você não tem permissão para exportar este relatório."
        : `Não foi possível exportar o relatório. ${erro.rede ? "Verifique a conexão e " : ""}tente novamente.`, "erro");
    } finally {
      el.exportar.classList.remove("is-loading");
      el.exportar.disabled = false;
    }
  }

  // ------------------------------------------------------------------ URL (permite voltar/compartilhar o mesmo filtro)
  function salvarNaUrl(f) {
    const q = new URLSearchParams({ tipo: state.tipo });
    Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); });
    if (RELATORIOS[state.tipo].usaDatas && !f.periodo && !f.data_inicio && !f.data_fim) q.set("periodo", "todos");
    history.replaceState(null, "", `?${q}`);
  }

  function lerDaUrl() {
    const q = new URLSearchParams(location.search);
    if (RELATORIOS[q.get("tipo")]) state.tipo = q.get("tipo");
    if (q.get("data_inicio") || q.get("data_fim")) {
      el.periodo.value = "personalizado";
      el.inicio.value = q.get("data_inicio") || "";
      el.fim.value = q.get("data_fim") || "";
    } else if (q.get("periodo") === "todos") {
      el.periodo.value = "";
    } else if (["dia", "semana", "mes"].includes(q.get("periodo"))) {
      el.periodo.value = q.get("periodo");
    }
    return q.get("id_cliente") || "";
  }

  function marcarTipo() {
    el.tipos.querySelectorAll("[data-tipo]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tipo === state.tipo)));
    atualizarCamposDeData();
  }

  // Lista de clientes para o filtro. Se falhar, o filtro fica só com "Todos os clientes".
  async function carregarClientes(selecionado) {
    try {
      const lista = await FC.api.request("/clientes");
      const ordenada = (Array.isArray(lista) ? lista : []).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      el.cliente.insertAdjacentHTML("beforeend", ordenada.map((c) =>
        `<option value="${escapeHtml(c.id_cliente)}">${escapeHtml(c.nome)}</option>`).join(""));
      if (selecionado) el.cliente.value = selecionado;
    } catch { /* filtro de cliente opcional */ }
  }

  // ------------------------------------------------------------------ eventos
  el.tipos.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-tipo]");
    if (!botao || botao.dataset.tipo === state.tipo) return;
    state.tipo = botao.dataset.tipo;
    marcarTipo();
    gerar();
  });
  // Setas do teclado entre as abas (padrão de acessibilidade de tablist).
  el.tipos.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const abas = [...el.tipos.querySelectorAll("[data-tipo]")];
    const i = abas.findIndex((b) => b.dataset.tipo === state.tipo);
    const prox = abas[(i + (e.key === "ArrowRight" ? 1 : -1) + abas.length) % abas.length];
    prox.focus();
    prox.click();
  });

  el.periodo.addEventListener("change", () => {
    atualizarCamposDeData();
    if (el.periodo.value === "personalizado") { el.inicio.value ||= hojeISO().slice(0, 8) + "01"; el.fim.value ||= hojeISO(); el.inicio.focus(); }
    else gerar();
  });
  el.cliente.addEventListener("change", gerar);
  [el.inicio, el.fim].forEach((i) => i.addEventListener("change", validarFiltros));
  el.form.addEventListener("submit", (e) => { e.preventDefault(); gerar(); });
  el.limpar.addEventListener("click", () => {
    el.periodo.value = "mes";
    el.cliente.value = "";
    atualizarCamposDeData();
    validarFiltros();
    gerar();
  });
  el.tentar.addEventListener("click", gerar);
  el.btnMais.addEventListener("click", pintarMais);
  el.exportar.addEventListener("click", exportar);

  // ------------------------------------------------------------------ início
  FC.ui.initSidebar();
  const clienteInicial = lerDaUrl();
  marcarTipo();
  carregarClientes(clienteInicial).then(gerar);
})();
