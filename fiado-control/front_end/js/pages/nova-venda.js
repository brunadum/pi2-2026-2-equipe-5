// Tela "Nova Venda": cliente, produtos, condições de pagamento, cálculo e registro da venda.
(function () {
  const FC = window.FC;
  const { moeda, arredondar, cpf: formatarCpf, dataBR, hojeISO, escapeHtml } = FC.format;
  const masks = FC.masks;
  const $ = (id) => document.getElementById(id);

  const MAX_PARCELAS = 12;
  const DIAS_PADRAO_VENCIMENTO = 30;

  const el = {
    grid: $("venda-grid"),
    titulo: $("titulo-pagina"),
    subtitulo: $("subtitulo-pagina"),
    aviso: $("aviso-local"),
    avisoTexto: $("aviso-local-texto"),
    busca: $("cli-busca"),
    buscaLista: $("cli-busca-lista"),
    buscaBtn: $("btn-buscar"),
    buscaErro: $("cli-busca-erro"),
    infoCpf: $("info-cpf"),
    infoLimite: $("info-limite"),
    infoDisp: $("info-disponivel"),
    alertaCredito: $("alerta-credito"),
    itens: $("itens-body"),
    itensVazio: $("itens-vazio"),
    form: $("form-venda"),
    parcelas: $("parcelas"),
    vencimento: $("vencimento"),
    vencDica: $("vencimento-dica"),
    vencErro: $("vencimento-erro"),
    previstas: $("parcelas-previstas"),
    descValor: $("desc-valor"),
    descPct: $("desc-pct"),
    descErro: $("desc-erro"),
    descTipos: document.querySelectorAll("[data-desc-tipo]"),
    subtotal: $("tot-subtotal"),
    desconto: $("tot-desconto"),
    total: $("tot-total"),
    alerta: $("venda-alerta"),
    requisito: $("requisito"),
    cancelar: $("btn-cancelar"),
    registrar: $("btn-registrar"),
    opcoes: $("painel-opcoes"),
    resultado: $("painel-resultado"),
  };

  const state = {
    cliente: null,
    resumo: null,
    itens: [],
    modalidade: "fiado",
    nParcelas: 1,
    descTipo: "valor",
    enviando: false,
    fase: "edicao", // edicao | sucesso | rejeitada
    tocouVenc: false,
  };

  FC.ui.initSidebar();

  // --------------------------------------------------------------- cálculo

  const somaItens = () => arredondar(state.itens.reduce((s, i) => s + arredondar(i.preco * i.qtd), 0));

  function lerPct() {
    const t = el.descPct.value.replace(/[^\d,]/g, "").replace(",", ".");
    return t ? Number(t) : 0;
  }

  function valorDesconto() {
    const sub = somaItens();
    if (state.descTipo === "pct") return arredondar(sub * (lerPct() / 100));
    return masks.valorMoeda(el.descValor) || 0;
  }

  function totais() {
    const subtotal = somaItens();
    const desconto = valorDesconto();
    return { subtotal, desconto, total: arredondar(subtotal - desconto) };
  }

  function erroDesconto() {
    const { subtotal, desconto } = totais();
    if (state.descTipo === "pct" && lerPct() > 100) return "O desconto não pode passar de 100%.";
    if (desconto > 0 && subtotal === 0) return "Adicione produtos antes de aplicar desconto.";
    if (desconto >= subtotal && desconto > 0) return "O desconto deve ser menor que o subtotal da venda.";
    return "";
  }

  // Motivo pelo qual a venda não será aprovada automaticamente (null = tudo certo).
  function bloqueio() {
    if (!state.cliente || !state.resumo) return null;
    const r = state.resumo;
    if (r.credito_bloqueado) return { codigo: "credito_bloqueado", texto: "O crédito deste cliente está bloqueado." };
    if (r.possui_parcelas_atrasadas) return { codigo: "parcelas_em_atraso", texto: "Este cliente possui parcelas em atraso." };
    const { total } = totais();
    if (total > r.limite_disponivel + 0.001) {
      return {
        codigo: "limite_credito_excedido",
        texto: `O total da venda (${moeda(total)}) excede o limite disponível do cliente (${moeda(r.limite_disponivel)}).`,
      };
    }
    return null;
  }

  function numeroDeParcelas() {
    return state.modalidade === "fiado" ? 1 : state.nParcelas;
  }

  function dataMinima() { return hojeISO(); }

  function erroVencimento() {
    const v = el.vencimento.value;
    if (!v) return "Informe a data do primeiro vencimento.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return "Data inválida.";
    if (v < dataMinima()) return "O vencimento não pode ser anterior a hoje.";
    return "";
  }

  // --------------------------------------------------------- renderização

  function renderItens() {
    el.itensVazio.hidden = state.itens.length > 0;
    el.itens.closest(".table-wrap").hidden = state.itens.length === 0;
    el.itens.innerHTML = state.itens.map((it, i) => `
      <tr data-i="${i}">
        <td class="cell-ink">${escapeHtml(it.nome)}</td>
        <td class="cell-center">
          <div class="stepper stepper-sm" data-edicao>
            <button type="button" data-qtd="-1" aria-label="Diminuir quantidade de ${escapeHtml(it.nome)}"${it.qtd <= 1 ? " disabled" : ""}>−</button>
            <input type="text" inputmode="numeric" value="${it.qtd}" maxlength="4" aria-label="Quantidade de ${escapeHtml(it.nome)}">
            <button type="button" data-qtd="1" aria-label="Aumentar quantidade de ${escapeHtml(it.nome)}">+</button>
          </div>
          <span class="qtd-fixa">${it.qtd}</span>
        </td>
        <td class="cell-right cell-ink">${moeda(it.preco)}</td>
        <td class="cell-right cell-strong">${moeda(arredondar(it.preco * it.qtd))}</td>
        <td class="cell-right col-acoes" data-edicao><div class="row-actions">
          <button class="icon-btn" type="button" data-acao="editar" title="Editar item" aria-label="Editar ${escapeHtml(it.nome)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 7 3 3"/></svg></button>
          <button class="icon-btn danger" type="button" data-acao="remover" title="Remover item" aria-label="Remover ${escapeHtml(it.nome)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>
        </div></td>
      </tr>`).join("");
  }

  function renderParcelasSelect() {
    const total = totais().total;
    const centavos = Math.round(Math.max(0, total) * 100);
    const fiado = state.modalidade === "fiado";
    let html = "";
    for (let n = 1; n <= MAX_PARCELAS; n++) {
      const rotulo = n === 1 ? "1x (Única)" : `${n}x de ${moeda(Math.floor(centavos / n) / 100)}`;
      html += `<option value="${n}"${n === (fiado ? 1 : state.nParcelas) ? " selected" : ""}>${rotulo}</option>`;
    }
    el.parcelas.innerHTML = html;
    el.parcelas.disabled = fiado;
  }

  function renderPrevistas() {
    const n = numeroDeParcelas();
    const total = totais().total;
    if (n < 2 || total <= 0 || erroVencimento()) { el.previstas.hidden = true; return; }
    const centavos = Math.round(total * 100);
    const base = Math.floor(centavos / n);
    el.previstas.innerHTML = Array.from({ length: n }, (_, i) => {
      const valor = (i < n - 1 ? base : centavos - base * (n - 1)) / 100;
      return `<li><span>${i + 1}/${n} · ${dataBR(FC.clientes.somarMeses(el.vencimento.value, i))}</span><strong>${moeda(valor)}</strong></li>`;
    }).join("");
    el.previstas.hidden = false;
  }

  function renderTotais() {
    const { subtotal, desconto, total } = totais();
    el.subtotal.textContent = moeda(subtotal);
    el.desconto.textContent = moeda(desconto);
    el.total.textContent = moeda(Math.max(0, total));
    const b = bloqueio();
    el.total.classList.toggle("is-alerta", !!b);
    $("painel-produtos").classList.toggle("is-alerta", !!b);
    el.infoDisp.classList.toggle("is-alerta", !!b && b.codigo === "limite_credito_excedido");
  }

  function renderCliente() {
    const c = state.cliente;
    const r = state.resumo;
    el.infoCpf.textContent = c ? formatarCpf(c.cpf) : "—";
    el.infoLimite.textContent = r ? moeda(r.limite_credito) : "—";
    el.infoDisp.textContent = r ? moeda(r.limite_disponivel) : "—";
    el.infoDisp.classList.toggle("is-ok", !!r && !bloqueio());
    const b = bloqueio();
    el.alertaCredito.hidden = !b;
    el.alertaCredito.textContent = b ? `${b.texto} A venda será enviada para aprovação.` : "";
  }

  // Lista o que ainda falta e habilita/desabilita o botão de registrar.
  function atualizarFormulario() {
    renderTotais();
    renderCliente();

    const falta = [];
    if (!state.cliente) falta.push("Selecione um cliente");
    else if (!state.resumo) falta.push("Carregando dados do cliente…");
    if (!state.itens.length) falta.push("Adicione ao menos um produto");
    const eDesc = erroDesconto();
    el.descErro.textContent = eDesc;
    el.descErro.hidden = !eDesc;
    el.descErro.closest(".form-field").classList.toggle("has-error", !!eDesc);
    if (eDesc) falta.push("Corrija o desconto");
    if (state.itens.length && !eDesc && totais().total <= 0) falta.push("O total da venda deve ser maior que zero");

    const eVenc = erroVencimento();
    el.vencErro.textContent = state.tocouVenc ? eVenc : "";
    el.vencErro.hidden = !(state.tocouVenc && eVenc);
    el.vencimento.closest(".form-field").classList.toggle("has-error", state.tocouVenc && !!eVenc);
    if (eVenc) falta.push("Informe um vencimento válido");

    const b = bloqueio();
    el.registrar.disabled = state.enviando || falta.length > 0;
    el.registrar.textContent = b ? "Enviar para aprovação" : "Registrar venda";
    el.registrar.classList.toggle("btn-success", !b);
    el.registrar.classList.toggle("btn-danger", !!b);
    el.requisito.textContent = falta.length ? falta[0] + "." : "";
    el.requisito.hidden = !falta.length;

    renderPrevistas();
  }

  function atualizarTudo() {
    renderItens();
    renderParcelasSelect();
    atualizarFormulario();
  }

  function dicaVencimento() {
    el.vencDica.textContent = numeroDeParcelas() > 1
      ? "As demais parcelas vencem a cada mês, no mesmo dia."
      : "Data em que o cliente deve pagar.";
    $("lbl-vencimento").textContent = numeroDeParcelas() > 1 ? "Vencimento da 1ª parcela" : "Vencimento";
  }

  function vencimentoPadrao() {
    const d = new Date();
    d.setDate(d.getDate() + DIAS_PADRAO_VENCIMENTO);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ---------------------------------------------------------------- cliente

  async function selecionarCliente(cliente) {
    state.cliente = cliente;
    state.resumo = null;
    el.buscaErro.hidden = true;
    atualizarFormulario();
    try {
      state.resumo = await FC.clientes.obterResumo(cliente);
      const aviso = FC.clientes.avisoLocal();
      el.aviso.hidden = !aviso;
      el.avisoTexto.textContent = aviso;
    } catch (e) {
      state.cliente = null;
      el.buscaErro.textContent = e.mensagem || "Não foi possível carregar os dados do cliente.";
      el.buscaErro.hidden = false;
    }
    atualizarTudo();
  }

  const busca = FC.clienteBusca.criar({
    input: el.busca,
    botao: el.buscaBtn,
    lista: el.buscaLista,
    aoSelecionar: selecionarCliente,
    aoLimpar: () => { state.cliente = null; state.resumo = null; atualizarTudo(); },
    aoCadastrar: () => FC.cadastroCliente.abrir(),
  });

  FC.cadastroCliente.init({
    obterCpfs: () => new Set(busca.obterClientes().map((c) => c.cpf)),
    aoCadastrar: async (cliente) => { await busca.recarregar(); busca.selecionar(cliente); },
    aoEditar: () => {},
  });
  $("btn-cadastro-rapido").addEventListener("click", () => FC.cadastroCliente.abrir());

  // --------------------------------------------------------------- produtos

  FC.produtoModal.init({
    aoSalvar(item, indice) {
      if (indice != null) {
        state.itens[indice] = item;
      } else {
        const igual = state.itens.find((i) => i.nome.toLowerCase() === item.nome.toLowerCase() && i.preco === item.preco);
        if (igual) igual.qtd = Math.min(9999, igual.qtd + item.qtd);
        else state.itens.push(item);
      }
      atualizarTudo();
      FC.ui.toast(indice != null ? "Item atualizado." : `${item.nome} adicionado à venda.`);
    },
  });
  $("btn-add-produto").addEventListener("click", () => FC.produtoModal.abrir());

  el.itens.addEventListener("click", (e) => {
    const linha = e.target.closest("tr");
    if (!linha) return;
    const i = Number(linha.dataset.i);
    const it = state.itens[i];
    const botao = e.target.closest("button");
    if (!botao || !it) return;
    if (botao.dataset.qtd) {
      it.qtd = Math.min(9999, Math.max(1, it.qtd + Number(botao.dataset.qtd)));
      atualizarTudo();
    } else if (botao.dataset.acao === "editar") {
      FC.produtoModal.abrir(it, i);
    } else if (botao.dataset.acao === "remover") {
      state.itens.splice(i, 1);
      atualizarTudo();
      FC.ui.toast(`${it.nome} removido da venda.`);
    }
  });
  el.itens.addEventListener("change", (e) => {
    if (e.target.tagName !== "INPUT") return;
    const i = Number(e.target.closest("tr").dataset.i);
    const n = Number(e.target.value.replace(/\D/g, ""));
    state.itens[i].qtd = n >= 1 ? Math.min(9999, n) : 1;
    atualizarTudo();
  });

  // ---------------------------------------------------- opções de pagamento

  el.form.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener("change", () => {
    state.modalidade = r.value;
    if (r.checked && r.value === "a_prazo" && state.nParcelas < 2) state.nParcelas = 2;
    dicaVencimento();
    atualizarTudo();
  }));
  el.parcelas.addEventListener("change", () => { state.nParcelas = Number(el.parcelas.value); dicaVencimento(); atualizarFormulario(); });
  el.vencimento.addEventListener("input", () => { state.tocouVenc = true; atualizarFormulario(); });
  el.vencimento.addEventListener("blur", () => { state.tocouVenc = true; atualizarFormulario(); });

  masks.mascaraMoeda(el.descValor);
  el.descValor.addEventListener("input", () => { renderParcelasSelect(); atualizarFormulario(); });
  el.descPct.addEventListener("input", () => {
    // Aceita dígitos e uma vírgula, até 2 casas.
    let t = el.descPct.value.replace(/[^\d,]/g, "");
    const [inteiro, ...resto] = t.split(",");
    t = resto.length ? `${inteiro.slice(0, 3)},${resto.join("").slice(0, 2)}` : inteiro.slice(0, 3);
    el.descPct.value = t ? `${t}%` : "";
    el.descPct.setSelectionRange(el.descPct.value.length - (t ? 1 : 0), el.descPct.value.length - (t ? 1 : 0));
    renderParcelasSelect();
    atualizarFormulario();
  });
  el.descTipos.forEach((b) => b.addEventListener("click", () => {
    state.descTipo = b.dataset.descTipo;
    el.descTipos.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    el.descValor.hidden = state.descTipo !== "valor";
    el.descPct.hidden = state.descTipo !== "pct";
    (state.descTipo === "valor" ? el.descValor : el.descPct).focus();
    renderParcelasSelect();
    atualizarFormulario();
  }));

  // ------------------------------------------------------------------ envio

  function pad(n, tam = 6) { return String(n).padStart(tam, "0"); }

  function resumoVenda(extra = {}) {
    const { total } = totais();
    const n = numeroDeParcelas();
    return {
      cliente: state.cliente.nome,
      tipo: state.modalidade === "fiado" ? "Fiado" : "A prazo",
      parcelas: n === 1 ? "1x (Única)" : `${n}x`,
      total, ...extra,
    };
  }

  function travarEdicao(travado) {
    el.grid.classList.toggle("travado", travado);
    el.busca.disabled = travado;
    el.buscaBtn.disabled = travado;
    el.itens.querySelectorAll("input").forEach((i) => { i.disabled = travado; });
  }

  function mostrarSucesso(venda, dados) {
    state.fase = "sucesso";
    const agora = new Date();
    const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    el.titulo.textContent = "Venda registrada";
    el.subtitulo.textContent = "A venda foi confirmada com sucesso e já está disponível para acompanhamento.";
    el.opcoes.hidden = true;
    el.resultado.hidden = false;
    el.resultado.innerHTML = `
      <h2>Confirmação da venda</h2>
      <div class="cartao-resultado ok">
        <div class="cartao-topo">
          <span class="cartao-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
          <div><strong>Venda registrada com sucesso</strong><small>Nº ${pad(venda.numero)} • ${dataBR(hojeISO())} • ${hora}</small></div>
        </div>
        <dl>
          <div><dt>Cliente</dt><dd>${escapeHtml(dados.cliente)}</dd></div>
          <div><dt>Tipo de venda</dt><dd>${escapeHtml(dados.tipo)}</dd></div>
          <div><dt>Parcelas</dt><dd>${escapeHtml(dados.parcelas)}</dd></div>
          <div><dt>Total geral</dt><dd class="verde">${moeda(dados.total)}</dd></div>
        </dl>
      </div>
      <h3 class="proximos">Próximos passos</h3>
      <ol class="passos">
        <li><span>1</span>Verifique o histórico da venda na página do cliente.</li>
        <li><span>2</span>Emita o comprovante para o cliente, se necessário.</li>
        <li><span>3</span>Acompanhe o status do pagamento e o limite disponível do cliente.</li>
      </ol>
      <div class="acoes-form">
        <a class="btn btn-outline" href="cliente-detalhes.html?id=${encodeURIComponent(state.cliente.id)}">Voltar</a>
        <button class="btn btn-primary" id="btn-nova" type="button">Nova venda</button>
      </div>`;
    $("btn-nova").addEventListener("click", reiniciar);
    travarEdicao(true);
    el.resultado.scrollIntoView({ block: "nearest" });
  }

  function mostrarRejeicao(e, dados) {
    state.fase = "rejeitada";
    el.titulo.textContent = "Venda não aprovada";
    el.subtitulo.textContent = "O sistema não autorizou esta venda. Revise as condições e tente novamente.";
    el.opcoes.hidden = true;
    el.resultado.hidden = false;
    el.resultado.innerHTML = `
      <h2>Resultado da venda</h2>
      <div class="cartao-resultado erro">
        <div class="cartao-topo">
          <span class="cartao-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></span>
          <div><strong>Venda rejeitada</strong><small>${e.dados?.id_venda ? `Registro Nº ${pad(e.dados.id_venda)}` : "Nenhum valor foi lançado na conta"}</small></div>
        </div>
        <p class="motivo">${escapeHtml(e.mensagem)}</p>
        <dl>
          <div><dt>Cliente</dt><dd>${escapeHtml(dados.cliente)}</dd></div>
          <div><dt>Total da venda</dt><dd class="vermelho">${moeda(dados.total)}</dd></div>
        </dl>
      </div>
      <div class="acoes-form">
        <button class="btn btn-outline" id="btn-editar" type="button">Voltar e editar</button>
        <button class="btn btn-primary" id="btn-nova" type="button">Nova venda</button>
      </div>`;
    $("btn-editar").addEventListener("click", voltarEdicao);
    $("btn-nova").addEventListener("click", reiniciar);
    travarEdicao(true);
  }

  async function voltarEdicao() {
    state.fase = "edicao";
    el.titulo.textContent = "Nova Venda";
    el.subtitulo.textContent = "Registre uma nova venda rápida ou parcelada na conta do cliente.";
    el.resultado.hidden = true;
    el.opcoes.hidden = false;
    travarEdicao(false);
    // Recarrega o limite: uma venda rejeitada não altera o saldo, mas o cenário pode ter mudado.
    if (state.cliente) await selecionarCliente(state.cliente);
  }

  function reiniciar() {
    state.cliente = null; state.resumo = null; state.itens = [];
    state.modalidade = "fiado"; state.nParcelas = 1; state.descTipo = "valor"; state.tocouVenc = false;
    busca.limpar();
    el.form.reset();
    el.descValor.value = ""; el.descPct.value = "";
    el.descValor.hidden = false; el.descPct.hidden = true;
    el.descTipos.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.descTipo === "valor")));
    el.vencimento.value = vencimentoPadrao();
    el.alerta.hidden = true;
    dicaVencimento();
    voltarEdicao();
    atualizarTudo();
    el.busca.focus();
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (state.enviando || el.registrar.disabled) return;

    state.tocouVenc = true;
    el.alerta.hidden = true;
    state.enviando = true;
    el.registrar.classList.add("is-loading");
    el.registrar.disabled = true;

    const dados = resumoVenda();
    const { total, subtotal, desconto } = totais();
    try {
      const venda = await FC.clientes.registrarVenda(state.cliente, {
        modalidade: state.modalidade,
        parcelas: numeroDeParcelas(),
        total,
        subtotal,
        desconto,
        primeiroVencimento: el.vencimento.value,
        itens: state.itens.map((i) => ({ ...i })),
      });
      state.enviando = false;
      el.registrar.classList.remove("is-loading");
      mostrarSucesso(venda, dados);
    } catch (e) {
      state.enviando = false;
      el.registrar.classList.remove("is-loading");
      const motivos = ["credito_bloqueado", "parcelas_em_atraso", "limite_credito_excedido"];
      if (motivos.includes(e.codigo)) mostrarRejeicao(e, dados);
      else {
        el.alerta.textContent = e.mensagem || "Não foi possível registrar a venda. Tente novamente.";
        el.alerta.hidden = false;
        atualizarFormulario();
      }
    }
  }
  el.form.addEventListener("submit", enviar);

  el.cancelar.addEventListener("click", async () => {
    const algo = state.cliente || state.itens.length;
    if (!algo) { location.href = "dashboard.html"; return; }
    const ok = await FC.ui.confirmar({
      titulo: "Cancelar esta venda?",
      mensagem: "Os dados informados até agora serão descartados.",
      rotuloConfirmar: "Descartar venda",
      perigo: true,
    });
    if (ok) reiniciar();
  });

  // ------------------------------------------------------------------ início

  el.vencimento.min = dataMinima();
  el.vencimento.value = vencimentoPadrao();
  dicaVencimento();
  atualizarTudo();

  busca.carregar().then(() => {
    const id = new URLSearchParams(location.search).get("cliente");
    if (!id) return;
    return FC.clientes.obterCliente(id).then((c) => busca.selecionar(c)).catch(() => {
      el.buscaErro.textContent = "Não foi possível carregar o cliente informado. Busque-o pelo nome.";
      el.buscaErro.hidden = false;
    });
  }).catch((e) => {
    el.buscaErro.textContent = e.mensagem || "Não foi possível carregar os clientes.";
    el.buscaErro.hidden = false;
  });
})();
