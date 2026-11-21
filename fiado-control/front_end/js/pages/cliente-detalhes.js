// Tela de detalhes do cliente: resumo financeiro, histórico, registrar pagamento e alterar limite.
(function () {
  const FC = window.FC;
  const { moeda, cpf: formatarCpf, telefone: formatarTelefone, dataBR, escapeHtml } = FC.format;
  const masks = FC.masks;

  const $ = (id) => document.getElementById(id);
  const el = {
    estado: $("estado"),
    conteudo: $("conteudo"),
    resumo: $("resumo"),
    nome: $("cli-nome"),
    meta: $("cli-meta"),
    limite: $("st-limite"),
    aberto: $("st-aberto"),
    disponivel: $("st-disponivel"),
    historico: $("historico-body"),
    historicoVazio: $("historico-vazio"),
    aviso: $("aviso-local"),
    avisoTexto: $("aviso-local-texto"),
    btnPagamento: $("btn-pagamento"),
    btnLimite: $("btn-limite"),
    // pagamento
    formPag: $("form-pagamento"),
    pagAlerta: $("pag-alerta"),
    pagCarregando: $("pag-carregando"),
    pagSem: $("pag-sem-parcelas"),
    pagCampos: $("pag-campos"),
    pagParcela: $("pag-parcela"),
    pagSaldo: $("pag-saldo"),
    pagValor: $("pag-valor"),
    pagErro: $("pag-valor-erro"),
    pagEnviar: $("pag-enviar"),
    // limite
    formLim: $("form-limite"),
    limAlerta: $("lim-alerta"),
    limValor: $("lim-valor"),
    limErro: $("lim-valor-erro"),
    limDica: $("lim-dica"),
    limEnviar: $("lim-enviar"),
  };

  const state = { cliente: null, resumo: null, parcelas: [], historico: [], autorizacaoLimite: "" };
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) document.getElementById("btn-limite-aprovacao").href = `cliente-limite.html?id=${encodeURIComponent(id)}`;
  if (id) document.getElementById("btn-nova-venda").href = `nova-venda.html?cliente=${encodeURIComponent(id)}`;

  FC.ui.initSidebar();

  // --------------------------------------------------------------- estados

  const ICONE_ERRO = '<svg viewBox="0 0 24 24"><path d="M10.3 4.4 2.8 17.5a1.8 1.8 0 0 0 1.6 2.7h15.2a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.2M12 16.5h.01"/></svg>';

  function mostrarFalha(titulo, texto, { tentarNovamente = true } = {}) {
    el.conteudo.hidden = true;
    el.estado.innerHTML = `<span class="state-icon" aria-hidden="true">${ICONE_ERRO}</span><h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(texto)}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        ${tentarNovamente ? '<button class="btn btn-outline" type="button" id="estado-retry">Tentar novamente</button>' : ""}
        <a class="btn btn-primary" href="clientes.html">Voltar para clientes</a>
      </div>`;
    el.estado.hidden = false;
    if (tentarNovamente) $("estado-retry").addEventListener("click", carregar);
  }

  function atualizarAviso() {
    const texto = FC.clientes.avisoLocal();
    el.aviso.hidden = !texto;
    el.avisoTexto.textContent = texto;
  }

  // ------------------------------------------------------------ renderização

  function renderResumo() {
    const { cliente, resumo } = state;
    const bloqueado = resumo?.credito_bloqueado ?? cliente.credito_bloqueado;

    el.resumo.classList.remove("is-loading");
    el.nome.innerHTML = `${escapeHtml(cliente.nome)}${bloqueado ? ' <span class="badge badge-late">Crédito bloqueado</span>' : ""}`;
    el.meta.textContent = `CPF: ${formatarCpf(cliente.cpf)} • ${formatarTelefone(cliente.telefone[0])}`;
    document.title = `${cliente.nome} | Fiado Control`;

    el.limite.textContent = moeda(resumo.limite_credito);
    el.aberto.textContent = moeda(resumo.saldo_devedor);
    el.disponivel.textContent = moeda(resumo.limite_disponivel);
    el.btnPagamento.disabled = false;
    el.btnLimite.disabled = false;
    $("btn-desconto").disabled = !!cliente.local; // desconto só existe com o back-end (grava auditoria)
    $("btn-bloqueio").disabled = !!cliente.local; // bloqueio grava auditoria no banco
    $("btn-bloqueio-texto").textContent = bloqueado ? "Desbloquear crédito" : "Bloquear crédito";
  }

  const OPERACOES = {
    venda: { rotulo: (h) => `Venda #${h.id}`, status: { texto: "Confirmado", classe: "badge-ok" } },
    pagamento: { rotulo: (h) => `Pagamento #${h.id}`, status: { texto: "Recebido", classe: "badge-ok" } },
    estorno: { rotulo: (h) => `Estorno #${h.id}`, status: { texto: "Estornado", classe: "badge-muted" } },
    cancelamento: { rotulo: (h) => `Cancelamento #${h.id}`, status: { texto: "Cancelado", classe: "badge-muted" } },
  };

  // RF13: vendas ainda não canceladas podem ser canceladas; pagamentos podem ser estornados.
  // Só com dados reais do servidor (no modo local os números de venda/pagamento não existem no banco).
  function acoesDaLinha(h, cancelados, local) {
    if (local) return "—";
    if (h.tipo === "venda" && !cancelados.has(String(h.id))) {
      return `<span class="row-actions"><button type="button" data-op="cancelar" data-id="${escapeHtml(h.id)}" aria-label="Cancelar venda ${escapeHtml(h.id)}">Cancelar venda</button></span>`;
    }
    if (h.tipo === "pagamento") {
      return `<span class="row-actions"><button type="button" data-op="estornar" data-id="${escapeHtml(h.id)}" aria-label="Estornar pagamento ${escapeHtml(h.id)}">Estornar</button></span>`;
    }
    return "—";
  }

  function renderHistorico(itens) {
    state.historico = itens;
    const cancelados = new Set(itens.filter((h) => h.tipo === "cancelamento").map((h) => String(h.id)));
    const local = !!state.cliente?.local || !!FC.clientes.avisoLocal();
    el.historico.innerHTML = itens.map((h) => {
      const op = OPERACOES[h.tipo] || { rotulo: () => h.tipo, status: { texto: "—", classe: "badge-muted" } };
      let status = h.situacao === "pendente" ? { texto: "Pendente", classe: "badge-pending" } : op.status;
      if (h.tipo === "venda" && cancelados.has(String(h.id))) status = { texto: "Cancelada", classe: "badge-muted" };
      return `<tr>
        <td>${dataBR(h.data)}</td>
        <td class="op-name">${escapeHtml(op.rotulo(h))}</td>
        <td class="cell-strong">${moeda(h.valor)}</td>
        <td><span class="badge ${status.classe}">${status.texto}</span></td>
        <td class="cell-right">${acoesDaLinha(h, cancelados, local)}</td>
      </tr>`;
    }).join("");
    el.historicoVazio.hidden = itens.length > 0;
    el.historico.closest(".table-wrap").hidden = itens.length === 0;
  }

  function esqueletoHistorico() {
    el.historico.innerHTML = Array.from({ length: 3 }, () =>
      '<tr class="skeleton-row"><td><span class="skeleton w-90"></span></td><td><span class="skeleton"></span></td><td><span class="skeleton w-40"></span></td><td><span class="skeleton w-40"></span></td><td></td></tr>'
    ).join("");
    el.historicoVazio.hidden = true;
    el.historico.closest(".table-wrap").hidden = false;
  }

  // ----------------------------------------------------------------- dados

  async function carregarFinanceiro() {
    const [resumo, historico] = await Promise.all([
      FC.clientes.obterResumo(state.cliente),
      FC.clientes.obterHistorico(state.cliente),
    ]);
    state.resumo = resumo;
    renderResumo();
    renderHistorico(historico);
    atualizarAviso();
  }

  async function carregar() {
    if (!id) {
      mostrarFalha("Cliente não informado", "Abra um cliente a partir da lista de clientes.", { tentarNovamente: false });
      return;
    }

    el.estado.hidden = true;
    el.conteudo.hidden = false;
    el.resumo.classList.add("is-loading");
    esqueletoHistorico();

    try {
      state.cliente = await FC.clientes.obterCliente(id);
      await carregarFinanceiro();
    } catch (e) {
      if (e.codigo === "cliente_nao_encontrado") {
        mostrarFalha("Cliente não encontrado", "Este cliente não existe ou foi removido.", { tentarNovamente: false });
      } else {
        mostrarFalha("Não foi possível carregar o cliente", e.mensagem || "Ocorreu um erro inesperado.");
      }
    }
  }

  // ------------------------------------------------------ modal: pagamento

  const modalPag = FC.ui.criarModal($("modal-pagamento"), { aoFechar: () => { el.formPag.reset(); mostrarErroPag(""); el.pagAlerta.hidden = true; } });
  masks.mascaraMoeda(el.pagValor);

  function mostrarErroPag(mensagem) {
    el.pagErro.textContent = mensagem;
    el.pagErro.hidden = !mensagem;
    el.pagValor.closest(".form-field").classList.toggle("has-error", !!mensagem);
    el.pagValor.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  const parcelaSelecionada = () => state.parcelas.find((p) => String(p.id_parcela) === el.pagParcela.value);

  function rotuloParcela(p) {
    const venc = p.data_vencimento ? ` · vence ${dataBR(p.data_vencimento)}` : "";
    const atraso = p.status === "atrasado" ? " · em atraso" : "";
    return `Venda #${p.id_venda} · parcela ${p.numero}${venc}${atraso} · ${moeda(p.devido)}`;
  }

  function sincronizarParcela() {
    const p = parcelaSelecionada();
    if (!p) return;
    el.pagSaldo.innerHTML = `Valor devido nesta parcela: <strong>${moeda(p.devido)}</strong>`;
    masks.definirMoeda(el.pagValor, p.devido);
    mostrarErroPag("");
    atualizarBotaoPag();
  }

  function validarPag() {
    const p = parcelaSelecionada();
    const valor = masks.valorMoeda(el.pagValor);
    if (!p) return "Selecione uma parcela.";
    if (!valor) return "Informe o valor recebido.";
    if (valor > p.devido + 0.001) return `O valor excede o devido nesta parcela (${moeda(p.devido)}).`;
    return "";
  }

  function atualizarBotaoPag() {
    el.pagEnviar.disabled = !!validarPag();
  }

  async function abrirPagamento() {
    el.pagAlerta.hidden = true;
    mostrarErroPag("");
    el.pagCampos.hidden = true;
    el.pagSem.hidden = true;
    el.pagCarregando.hidden = false;
    el.pagEnviar.disabled = true;
    modalPag.abrir();

    try {
      state.parcelas = await FC.clientes.obterParcelasAbertas(state.cliente);
      el.pagCarregando.hidden = true;
      atualizarAviso();

      if (!state.parcelas.length) {
        el.pagSem.hidden = false; // RF04: sem valores em aberto
        return;
      }
      el.pagParcela.innerHTML = state.parcelas
        .map((p) => `<option value="${escapeHtml(p.id_parcela)}">${escapeHtml(rotuloParcela(p))}</option>`)
        .join("");
      el.pagCampos.hidden = false;
      sincronizarParcela();
      el.pagValor.focus();
    } catch (e) {
      el.pagCarregando.hidden = true;
      el.pagAlerta.textContent = e.mensagem || "Não foi possível carregar as parcelas.";
      el.pagAlerta.hidden = false;
    }
  }

  const MENSAGENS_PAGAMENTO = {
    valor_excede_devido: "O valor informado excede o valor devido da parcela.",
    parcela_ja_paga: "Esta parcela já foi paga.",
    parcela_nao_encontrada: "Parcela não encontrada. Feche e abra o pagamento novamente.",
  };

  async function enviarPagamento(evento) {
    evento.preventDefault();
    const erro = validarPag();
    if (erro) { mostrarErroPag(erro); return; }

    const parcela = parcelaSelecionada();
    const valor = masks.valorMoeda(el.pagValor);

    el.pagAlerta.hidden = true;
    el.pagEnviar.classList.add("is-loading");
    el.pagEnviar.disabled = true;
    modalPag.travar(true);

    try {
      const r = await FC.clientes.registrarPagamento(state.cliente, parcela, valor);
      modalPag.travar(false);
      el.pagEnviar.classList.remove("is-loading");
      modalPag.fechar();

      const quitou = r.status_parcela === "pago";
      FC.ui.toast(`Pagamento de ${moeda(valor)} registrado${quitou ? "" : " (baixa parcial)"}.`);
      await carregarFinanceiro();
    } catch (e) {
      modalPag.travar(false);
      el.pagEnviar.classList.remove("is-loading");
      atualizarBotaoPag();
      el.pagAlerta.textContent = MENSAGENS_PAGAMENTO[e.codigo] || e.mensagem || "Não foi possível registrar o pagamento.";
      el.pagAlerta.hidden = false;
    }
  }

  el.pagParcela.addEventListener("change", sincronizarParcela);
  el.pagValor.addEventListener("input", () => {
    // O erro só aparece quando há algo digitado; o botão acompanha a validade em tempo real.
    mostrarErroPag(el.pagValor.value ? validarPag() : "");
    atualizarBotaoPag();
  });
  el.formPag.addEventListener("submit", enviarPagamento);
  el.btnPagamento.addEventListener("click", abrirPagamento);

  // ---------------------------------------------------------- modal: limite

  const modalLim = FC.ui.criarModal($("modal-limite"), { aoFechar: () => { mostrarErroLim(""); el.limAlerta.hidden = true; } });
  masks.mascaraMoeda(el.limValor);

  function mostrarErroLim(mensagem) {
    el.limErro.textContent = mensagem;
    el.limErro.hidden = !mensagem;
    el.limValor.closest(".form-field").classList.toggle("has-error", !!mensagem);
    el.limValor.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  function atualizarDicaLimite() {
    const valor = masks.valorMoeda(el.limValor);
    const aberto = state.resumo?.saldo_devedor || 0;
    el.limDica.textContent = valor !== null && valor < aberto
      ? `Atenção: o novo limite é menor que o valor em aberto (${moeda(aberto)}). O cliente ficará sem limite disponível.`
      : `Valor em aberto atual: ${moeda(aberto)}.`;
  }

  async function abrirLimite() {
    // Quem não é gerente precisa do código do gerente para alterar o limite.
    const auth = await FC.autorizacao.exigir();
    if (!auth.ok) return;
    state.autorizacaoLimite = auth.autorizacao;
    el.limAlerta.hidden = true;
    mostrarErroLim("");
    masks.definirMoeda(el.limValor, state.resumo.limite_credito);
    atualizarDicaLimite();
    modalLim.abrir();
  }

  async function enviarLimite(evento) {
    evento.preventDefault();
    const valor = masks.valorMoeda(el.limValor);
    if (valor === null) { mostrarErroLim("Informe o novo limite (use R$ 0,00 para zerar)."); el.limValor.focus(); return; }

    el.limAlerta.hidden = true;
    el.limEnviar.classList.add("is-loading");
    el.limEnviar.disabled = true;
    modalLim.travar(true);

    try {
      await FC.clientes.alterarLimite(state.cliente, valor, undefined, { autorizacao: state.autorizacaoLimite });
      modalLim.travar(false);
      el.limEnviar.classList.remove("is-loading");
      el.limEnviar.disabled = false;
      modalLim.fechar();

      // Recarrega o cliente para refletir o limite salvo (API ou fallback local).
      state.cliente = await FC.clientes.obterCliente(id);
      await carregarFinanceiro();
      FC.ui.toast(`Limite de crédito atualizado para ${moeda(valor)}.`);
    } catch (e) {
      modalLim.travar(false);
      el.limEnviar.classList.remove("is-loading");
      el.limEnviar.disabled = false;
      if (e.codigo === "limite_invalido") mostrarErroLim(e.mensagem);
      else if (e.codigo === "acesso_negado") { el.limAlerta.textContent = "Apenas o gerente pode alterar o limite de crédito."; el.limAlerta.hidden = false; }
      else { el.limAlerta.textContent = e.mensagem || "Não foi possível alterar o limite."; el.limAlerta.hidden = false; }
    }
  }

  el.limValor.addEventListener("input", () => { mostrarErroLim(""); atualizarDicaLimite(); });
  el.formLim.addEventListener("submit", enviarLimite);
  el.btnLimite.addEventListener("click", abrirLimite);

  // ------------------------------------------------ RF10: desconto em parcela

  const dsc = {
    form: $("form-desconto"), alerta: $("dsc-alerta"), carregando: $("dsc-carregando"), sem: $("dsc-sem-parcelas"),
    campos: $("dsc-campos"), parcela: $("dsc-parcela"), saldo: $("dsc-saldo"), valor: $("dsc-valor"), valorErro: $("dsc-valor-erro"),
    motivo: $("dsc-motivo"), motivoErro: $("dsc-motivo-erro"), enviar: $("dsc-enviar"),
  };
  let descontoAuth = { autorizacao: "", viaCodigo: false };
  const modalDsc = FC.ui.criarModal($("modal-desconto"), {
    aoFechar: () => { dsc.form.reset(); erroDsc("valor", ""); erroDsc("motivo", ""); dsc.alerta.hidden = true; },
  });
  masks.mascaraMoeda(dsc.valor);

  function erroDsc(campo, mensagem) {
    const alvo = campo === "valor" ? dsc.valorErro : dsc.motivoErro;
    const input = campo === "valor" ? dsc.valor : dsc.motivo;
    alvo.textContent = mensagem;
    alvo.hidden = !mensagem;
    input.closest(".form-field").classList.toggle("has-error", !!mensagem);
    input.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }
  const parcelaDsc = () => state.parcelas.find((p) => String(p.id_parcela) === dsc.parcela.value);

  function validarDesconto() {
    const p = parcelaDsc();
    const valor = masks.valorMoeda(dsc.valor);
    if (!p) return "Selecione uma parcela.";
    if (!valor) return "Informe o valor do desconto.";
    if (valor > p.devido + 0.001) return `O desconto excede o valor devido da parcela (${moeda(p.devido)}).`;
    return "";
  }
  function atualizarBotaoDsc() { dsc.enviar.disabled = !!validarDesconto() || !dsc.motivo.value.trim(); }

  function sincronizarDsc() {
    const p = parcelaDsc();
    if (!p) return;
    dsc.saldo.innerHTML = `Valor devido nesta parcela: <strong>${moeda(p.devido)}</strong>. O desconto não pode passar do percentual máximo definido em Configurações.`;
    atualizarBotaoDsc();
  }

  async function abrirDesconto() {
    const auth = await FC.autorizacao.exigir();
    if (!auth.ok) return;
    descontoAuth = { autorizacao: auth.autorizacao, viaCodigo: auth.viaCodigo };
    dsc.alerta.hidden = true;
    dsc.campos.hidden = true;
    dsc.sem.hidden = true;
    dsc.carregando.hidden = false;
    dsc.enviar.disabled = true;
    modalDsc.abrir();
    try {
      state.parcelas = await FC.clientes.obterParcelasAbertas(state.cliente);
      dsc.carregando.hidden = true;
      if (!state.parcelas.length) { dsc.sem.hidden = false; return; }
      dsc.parcela.innerHTML = state.parcelas.map((p) => `<option value="${escapeHtml(p.id_parcela)}">${escapeHtml(rotuloParcela(p))}</option>`).join("");
      dsc.campos.hidden = false;
      sincronizarDsc();
      dsc.valor.focus();
    } catch (e) {
      dsc.carregando.hidden = true;
      dsc.alerta.textContent = e.mensagem || "Não foi possível carregar as parcelas.";
      dsc.alerta.hidden = false;
    }
  }

  dsc.parcela.addEventListener("change", sincronizarDsc);
  dsc.valor.addEventListener("input", () => { erroDsc("valor", dsc.valor.value ? validarDesconto() : ""); atualizarBotaoDsc(); });
  dsc.motivo.addEventListener("input", () => { if (dsc.motivo.value.trim()) erroDsc("motivo", ""); atualizarBotaoDsc(); });
  $("btn-desconto").addEventListener("click", abrirDesconto);

  dsc.form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erro = validarDesconto();
    if (erro) { erroDsc("valor", erro); return; }
    if (!dsc.motivo.value.trim()) { erroDsc("motivo", "Informe o motivo."); dsc.motivo.focus(); return; }
    const valor = masks.valorMoeda(dsc.valor);
    dsc.alerta.hidden = true;
    dsc.enviar.classList.add("is-loading");
    dsc.enviar.disabled = true;
    modalDsc.travar(true);
    try {
      await FC.operacoes.concederDesconto(dsc.parcela.value, valor, dsc.motivo.value, descontoAuth);
      modalDsc.travar(false);
      dsc.enviar.classList.remove("is-loading");
      modalDsc.fechar();
      FC.ui.toast(`Desconto de ${moeda(valor)} concedido.`);
      await carregarFinanceiro();
    } catch (e) {
      modalDsc.travar(false);
      dsc.enviar.classList.remove("is-loading");
      atualizarBotaoDsc();
      dsc.alerta.textContent = e.mensagem || "Não foi possível conceder o desconto.";
      dsc.alerta.hidden = false;
    }
  });

  // ------------------------------------------- RF13: cancelar venda / estornar pagamento

  const op = {
    form: $("form-operacao"), titulo: $("op-titulo"), alerta: $("op-alerta"), resumo: $("op-resumo"),
    motivo: $("op-motivo"), erro: $("op-motivo-erro"), contador: $("op-contador"), enviar: $("op-enviar"),
  };
  let operacaoAtual = null;

  function mostrarErroOp(mensagem) {
    op.erro.textContent = mensagem;
    op.erro.hidden = !mensagem;
    op.motivo.closest(".form-field").classList.toggle("has-error", !!mensagem);
    op.motivo.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }
  const modalOp = FC.ui.criarModal($("modal-operacao"), {
    aoFechar: () => { op.form.reset(); mostrarErroOp(""); op.alerta.hidden = true; op.contador.textContent = "0/200 caracteres"; operacaoAtual = null; },
  });

  const TEXTOS_OP = {
    cancelar: {
      titulo: "Cancelar venda", botao: "Cancelar venda", tipo: "venda",
      resumo: (h) => `Venda <strong>#${escapeHtml(h.id)}</strong> de <strong>${moeda(h.valor)}</strong>. O valor sai do saldo devedor do cliente. Só é possível cancelar vendas sem pagamentos; a ação fica registrada na auditoria.`,
      sucesso: (h) => `Venda #${h.id} cancelada.`,
    },
    bloquear: {
      titulo: "Bloquear crédito", botao: "Bloquear crédito", tipo: "cliente",
      resumo: () => "Enquanto o crédito estiver bloqueado, novas vendas a prazo para este cliente são recusadas. Pagamentos continuam sendo aceitos. A ação fica registrada na auditoria.",
      sucesso: () => "Crédito do cliente bloqueado.",
    },
    desbloquear: {
      titulo: "Desbloquear crédito", botao: "Desbloquear crédito", tipo: "cliente", neutro: true,
      resumo: () => "O cliente volta a poder comprar a prazo, respeitando o limite e as parcelas em dia. A ação fica registrada na auditoria.",
      sucesso: () => "Crédito do cliente desbloqueado.",
    },
    estornar: {
      titulo: "Estornar pagamento", botao: "Estornar pagamento", tipo: "pagamento",
      resumo: (h) => `Pagamento <strong>#${escapeHtml(h.id)}</strong> de <strong>${moeda(h.valor)}</strong>. O valor volta para o saldo devedor e a parcela é reaberta; a ação fica registrada na auditoria.`,
      sucesso: (h) => `Pagamento #${h.id} estornado.`,
    },
  };

  async function iniciarOperacao(tipo, id) {
    const t = TEXTOS_OP[tipo];
    const item = t.tipo === "cliente"
      ? { id: state.cliente.id }
      : state.historico.find((h) => h.tipo === t.tipo && String(h.id) === String(id));
    if (!item) return;
    // Funcionário passa pelas telas "sem permissão" e "código do gerente"; gerente segue direto.
    const auth = await FC.autorizacao.exigir();
    if (!auth.ok) return;
    operacaoAtual = { tipo, item, autorizacao: auth.autorizacao, viaCodigo: auth.viaCodigo };
    op.titulo.textContent = t.titulo;
    op.enviar.textContent = t.botao;
    op.enviar.classList.toggle("btn-danger", !t.neutro);
    op.enviar.classList.toggle("btn-primary", !!t.neutro);
    op.resumo.innerHTML = t.resumo(item);
    op.alerta.hidden = true;
    mostrarErroOp("");
    modalOp.abrir();
  }

  $("btn-bloqueio").addEventListener("click", () => {
    const bloqueado = state.resumo?.credito_bloqueado ?? state.cliente.credito_bloqueado;
    iniciarOperacao(bloqueado ? "desbloquear" : "bloquear");
  });

  el.historico.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-op]");
    if (b) iniciarOperacao(b.dataset.op, b.dataset.id);
  });

  op.motivo.addEventListener("input", () => {
    op.contador.textContent = `${op.motivo.value.length}/200 caracteres`;
    if (op.motivo.value.trim()) mostrarErroOp("");
  });

  op.form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!operacaoAtual) return;
    const motivo = op.motivo.value.trim();
    if (!motivo) { mostrarErroOp("Informe o motivo."); op.motivo.focus(); return; }

    const { tipo, item, autorizacao, viaCodigo } = operacaoAtual;
    op.alerta.hidden = true;
    op.enviar.classList.add("is-loading");
    op.enviar.disabled = true;
    modalOp.travar(true);
    try {
      if (tipo === "cancelar") await FC.operacoes.cancelarVenda(item.id, motivo, { autorizacao, viaCodigo });
      else if (tipo === "bloquear" || tipo === "desbloquear") await FC.operacoes.definirBloqueio(item.id, tipo === "bloquear", motivo, { autorizacao, viaCodigo });
      else await FC.operacoes.estornarPagamento(item.id, motivo, { autorizacao, viaCodigo });
      modalOp.travar(false);
      op.enviar.classList.remove("is-loading");
      op.enviar.disabled = false;
      modalOp.fechar();
      FC.ui.toast(TEXTOS_OP[tipo].sucesso(item));
      await carregarFinanceiro();
    } catch (e) {
      modalOp.travar(false);
      op.enviar.classList.remove("is-loading");
      op.enviar.disabled = false;
      op.alerta.textContent = e.mensagem || "Não foi possível concluir a operação.";
      op.alerta.hidden = false;
    }
  });

  carregar();
})();
