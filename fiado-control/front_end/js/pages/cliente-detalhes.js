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

  const state = { cliente: null, resumo: null, parcelas: [] };
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

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
  }

  const OPERACOES = {
    venda: { rotulo: (h) => `Venda #${h.id}`, status: { texto: "Confirmado", classe: "badge-ok" } },
    pagamento: { rotulo: (h) => `Pagamento #${h.id}`, status: { texto: "Recebido", classe: "badge-ok" } },
    estorno: { rotulo: (h) => `Estorno #${h.id}`, status: { texto: "Estornado", classe: "badge-muted" } },
    cancelamento: { rotulo: (h) => `Cancelamento #${h.id}`, status: { texto: "Cancelado", classe: "badge-muted" } },
  };

  function renderHistorico(itens) {
    el.historico.innerHTML = itens.map((h) => {
      const op = OPERACOES[h.tipo] || { rotulo: () => h.tipo, status: { texto: "—", classe: "badge-muted" } };
      const status = h.situacao === "pendente" ? { texto: "Pendente", classe: "badge-pending" } : op.status;
      return `<tr>
        <td>${dataBR(h.data)}</td>
        <td class="op-name">${escapeHtml(op.rotulo(h))}</td>
        <td class="cell-strong">${moeda(h.valor)}</td>
        <td><span class="badge ${status.classe}">${status.texto}</span></td>
      </tr>`;
    }).join("");
    el.historicoVazio.hidden = itens.length > 0;
    el.historico.closest(".table-wrap").hidden = itens.length === 0;
  }

  function esqueletoHistorico() {
    el.historico.innerHTML = Array.from({ length: 3 }, () =>
      '<tr class="skeleton-row"><td><span class="skeleton w-90"></span></td><td><span class="skeleton"></span></td><td><span class="skeleton w-40"></span></td><td><span class="skeleton w-40"></span></td></tr>'
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

  function abrirLimite() {
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
      await FC.clientes.alterarLimite(state.cliente, valor);
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

  carregar();
})();
