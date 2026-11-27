(function () {
  const FC = window.FC;

  const {
    moeda,
    arredondar,
    cpf: formatarCpf,
    telefone: formatarTelefone,
    dataBR,
    escapeHtml,
  } = FC.format;

  const masks = FC.masks;
  const $ = (id) => document.getElementById(id);

  const MOTIVO_MIN = 5;
  const MOTIVO_MAX = 200;

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

  const state = {
    cliente: null,
    resumo: null,
    excecoes: [],
    resumosExc: new Map(),
    tocados: new Set(),
    enviando: false,
  };

  let consultaCliente = 0;
  let consultaHistorico = 0;
  let carregandoExcecoes = false;

  FC.ui.initSidebar();

  masks.mascaraMoeda(el.valor);

  el.motivo.maxLength = MOTIVO_MAX;

  const iniciais = (nome) =>
    nome
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "--";

  function atualizarAviso() {
    const texto = FC.clientes.avisoLocal();

    el.aviso.hidden = !texto;
    el.avisoTexto.textContent = texto;
  }

  // Dados do cliente

  function situacao(r) {
    if (r.credito_bloqueado) {
      return {
        texto: "Crédito bloqueado",
        classe: "badge-late",
      };
    }

    if (r.possui_parcelas_atrasadas) {
      return {
        texto: "Parcelas em atraso",
        classe: "badge-late",
      };
    }

    if (r.saldo_devedor > r.limite_credito + 0.001) {
      return {
        texto: "Limite excedido",
        classe: "badge-late",
      };
    }

    return {
      texto: "Em dia",
      classe: "badge-ok",
    };
  }

  function renderCliente() {
    const c = state.cliente;
    const r = state.resumo;

    el.vazio.hidden = !!c;
    el.conteudo.hidden = !c || !r;

    el.crumb.textContent = c
      ? c.nome
      : "Controle de limite";

    if (!c || !r) {
      el.histLista.innerHTML = "";
      el.histVazio.hidden = true;
      atualizarFormulario();
      return;
    }

    const s = situacao(r);

    el.iniciais.textContent = iniciais(c.nome);

    el.iniciais.classList.toggle(
      "ok",
      s.classe === "badge-ok"
    );

    el.nome.textContent = c.nome;

    el.meta.textContent =
      `CPF: ${formatarCpf(c.cpf)} • ` +
      `Telefone: ${formatarTelefone(c.telefone[0])}`;

    el.detalhes.href =
      `cliente-detalhes.html?id=${encodeURIComponent(c.id)}`;

    el.stLimite.textContent = moeda(r.limite_credito);

    el.stAberto.textContent = moeda(r.saldo_devedor);

    el.stAberto.className =
      r.saldo_devedor > 0 ? "vermelho" : "";

    el.stSituacao.textContent = s.texto;
    el.stSituacao.className = `badge ${s.classe}`;

    atualizarFormulario();
  }

  // Histórico de alterações pela API de auditoria

  async function renderHistorico() {
    const consulta = ++consultaHistorico;
    const cliente = state.cliente;

    el.histLista.innerHTML = "";
    el.histVazio.hidden = true;

    if (!cliente) return;

    el.histLista.innerHTML =
      "<li>Carregando histórico...</li>";

    try {
      const dados =
        await FC.clientes.listarAlteracoesLimite(cliente);

      if (
        consulta !== consultaHistorico ||
        String(state.cliente?.id) !== String(cliente.id)
      ) {
        return;
      }

      const itens = dados.slice(0, 6);

      el.histVazio.hidden = itens.length > 0;

      el.histLista.innerHTML = itens
        .map((a) => {
          const data = new Date(a.data);

          const hora = Number.isNaN(data.getTime())
            ? ""
            : data.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              });

          return `
            <li>
              <div class="hist-topo">

                <span class="hist-valores">
                  ${moeda(a.de)}
                  <span class="seta" aria-hidden="true">→</span>
                  <span class="sr-only"> para </span>
                  ${moeda(a.para)}
                </span>

                <span class="hist-data">
                  ${dataBR(a.data)} ${hora}
                </span>

              </div>

              <p class="hist-motivo">
                ${escapeHtml(a.motivo || "Motivo não informado.")}
              </p>

              ${
                a.nome_usuario
                  ? `<small>Responsável: ${escapeHtml(a.nome_usuario)}</small>`
                  : ""
              }
            </li>
          `;
        })
        .join("");

    } catch (e) {
      if (consulta !== consultaHistorico) return;

      console.error(
        "Erro ao consultar histórico de limite:",
        e
      );

      el.histVazio.hidden = true;

      const mensagem =
        e.status === 403
          ? "Somente o gerente pode consultar o histórico de auditoria."
          : e.mensagem ||
            "Não foi possível carregar o histórico de alterações.";

      el.histLista.innerHTML = `
        <li class="hist-motivo">
          ${escapeHtml(mensagem)}
        </li>
      `;
    }
  }

  async function carregarCliente(cliente, duranteEnvio = false) {
    if (state.enviando && !duranteEnvio) return;

    const consulta = ++consultaCliente;

    consultaHistorico++;

    state.cliente = cliente;
    state.resumo = null;
    state.tocados = new Set();

    el.form.reset();
    el.valor.value = "";
    el.contador.textContent = `0/${MOTIVO_MAX}`;
    el.alerta.hidden = true;
    el.enviar.disabled = true;

    el.histLista.innerHTML = "";
    el.histVazio.hidden = true;

    renderCliente();

    history.replaceState(
      null,
      "",
      `?id=${encodeURIComponent(cliente.id)}`
    );

    destacarCards();

    try {
      const resumo =
        await FC.clientes.obterResumo(cliente);

      if (consulta !== consultaCliente) return;

      state.resumo = resumo;

      atualizarAviso();

      masks.definirMoeda(
        el.valor,
        resumo.limite_credito
      );

      renderCliente();

      await renderHistorico();

    } catch (e) {
      if (consulta !== consultaCliente) return;

      state.cliente = null;
      state.resumo = null;

      FC.ui.toast(
        e.mensagem ||
          "Não foi possível carregar o cliente.",
        "erro"
      );

      renderCliente();
    }
  }

  const busca = FC.clienteBusca.criar({
    input: el.busca,
    botao: el.buscaBtn,
    lista: el.buscaLista,

    aoSelecionar: (cliente) =>
      carregarCliente(cliente),

    aoLimpar: () => {
      if (state.enviando) return;

      consultaCliente++;
      consultaHistorico++;

      state.cliente = null;
      state.resumo = null;

      renderCliente();
      destacarCards();
    },
  });

  // Formulário de alteração de limite

  function erros() {
    const r = state.resumo;
    const novo = masks.valorMoeda(el.valor);
    const motivo = el.motivo.value.trim();

    return {
      valor:
        novo === null
          ? "Informe o novo limite (use R$ 0,00 para zerar)."

          : !Number.isFinite(novo) || novo < 0
            ? "Informe um limite válido."

            : novo > 99999999.99
              ? "O limite ultrapassa o valor máximo permitido."

              : r &&
                arredondar(novo) ===
                  arredondar(r.limite_credito)
                ? "Informe um valor diferente do limite atual."
                : "",

      motivo:
        !motivo
          ? "Informe o motivo da alteração."

          : motivo.length < MOTIVO_MIN
            ? "Descreva um pouco melhor o motivo."

            : motivo.length > MOTIVO_MAX
              ? `O motivo deve possuir até ${MOTIVO_MAX} caracteres.`
              : "",
    };
  }

  function mostrarErro(campo, texto) {
    const caixa =
      campo === "valor"
        ? el.valorErro
        : el.motivoErro;

    const entrada =
      campo === "valor"
        ? el.valor
        : el.motivo;

    caixa.textContent = texto;
    caixa.hidden = !texto;

    entrada.closest(".form-field").classList.toggle(
      "has-error",
      !!texto
    );

    entrada.setAttribute(
      "aria-invalid",
      texto ? "true" : "false"
    );
  }

  function atualizarFormulario() {
    const e = erros();

    for (const c of ["valor", "motivo"]) {
      mostrarErro(
        c,
        state.tocados.has(c) ? e[c] : ""
      );
    }

    el.enviar.disabled =
      !!(e.valor || e.motivo) ||
      state.enviando ||
      !state.cliente ||
      !state.resumo;

    el.contador.textContent =
      `${el.motivo.value.length}/${MOTIVO_MAX}`;

    const novo = masks.valorMoeda(el.valor);
    const aberto = state.resumo?.saldo_devedor || 0;

    el.dica.textContent =
      novo !== null && novo < aberto

        ? `Atenção: o novo limite é menor que o valor em aberto (${moeda(aberto)}). O cliente ficará sem limite disponível até pagar.`

        : state.resumo

          ? `Limite atual: ${moeda(state.resumo.limite_credito)} • Em aberto: ${moeda(aberto)}.`

          : "";
  }

  function travarFormulario(travado) {
    el.busca.disabled = travado;
    el.buscaBtn.disabled = travado;
    el.valor.disabled = travado;
    el.motivo.disabled = travado;
    el.enviar.disabled = travado;

    el.enviar.classList.toggle(
      "is-loading",
      travado
    );
  }

  for (const campo of ["valor", "motivo"]) {
    for (const evento of ["input", "blur"]) {
      el[campo].addEventListener(evento, () => {
        state.tocados.add(campo);
        atualizarFormulario();
      });
    }
  }

  el.form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (
      state.enviando ||
      !state.cliente ||
      !state.resumo
    ) {
      return;
    }

    const e = erros();

    if (e.valor || e.motivo) {
      state.tocados = new Set([
        "valor",
        "motivo",
      ]);

      atualizarFormulario();

      (e.valor ? el.valor : el.motivo).focus();

      return;
    }

    const cliente = state.cliente;
    const novo = masks.valorMoeda(el.valor);
    const motivo = el.motivo.value.trim();

    state.enviando = true;

    el.alerta.hidden = true;

    travarFormulario(true);

    let atualizado = false;

    try {
      await FC.clientes.alterarLimite(
        cliente,
        novo,
        motivo
      );

      atualizado = true;

      FC.ui.toast(
        `Limite de ${cliente.nome} atualizado para ${moeda(novo)}.`
      );

      const clienteAtualizado =
        await FC.clientes.obterCliente(cliente.id);

      await carregarCliente(
        clienteAtualizado,
        true
      );

      await carregarExcecoes();

    } catch (err) {
      if (atualizado) {
        state.resumo = null;

        el.alerta.textContent =
          "O limite foi alterado, mas não foi possível atualizar os dados da página. Consulte o cliente novamente.";

        el.alerta.hidden = false;

      } else if (err.codigo === "limite_invalido") {
        state.tocados.add("valor");

        mostrarErro(
          "valor",
          err.mensagem || "Limite inválido."
        );

        el.alerta.textContent =
          err.mensagem || "Limite inválido.";

        el.alerta.hidden = false;

      } else {
        el.alerta.textContent =
          err.codigo === "acesso_negado"

            ? "Apenas o gerente ou um usuário devidamente autorizado pode alterar o limite de crédito."

            : err.mensagem ||
              "Não foi possível alterar o limite.";

        el.alerta.hidden = false;
      }

    } finally {
      state.enviando = false;

      travarFormulario(false);

      atualizarFormulario();
    }
  });

  // Exceções de crédito

  const ICONE_OK =
    '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function destacarCards() {
    el.excLista
      .querySelectorAll(".exc-card")
      .forEach((card) => {
        card.classList.toggle(
          "is-atual",

          !!state.cliente &&
            String(card.dataset.cliente) ===
              String(state.cliente.id)
        );
      });
  }

  function cardExcecao(x) {
    const r =
      x.id_cliente != null
        ? state.resumosExc.get(String(x.id_cliente))
        : null;

    const motivo =
      FC.clientes.MOTIVOS_EXCECAO[x.motivo] ||
      "Exceção";

    const badge =
      x.motivo === "parcelas_em_atraso"
        ? "badge-pending"
        : "badge-late";

    const meta = [
      x.data ? dataBR(x.data) : null,

      r
        ? `Disponível: ${moeda(r.limite_disponivel)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return `
      <article
        class="exc-card"
        data-id="${escapeHtml(String(x.id))}"
        data-cliente="${escapeHtml(String(x.id_cliente ?? ""))}"
      >

        <div class="exc-topo">

          <button
            class="exc-nome"
            type="button"
            data-acao="abrir"
            title="Abrir este cliente"
          >
            ${escapeHtml(x.nome)}
          </button>

          <span class="exc-id">
            #${escapeHtml(String(x.id_venda))}
          </span>

        </div>

        <div class="exc-meio">

          <span class="badge ${badge}">
            ${escapeHtml(motivo)}
          </span>

          <strong>${moeda(x.valor)}</strong>

        </div>

        <p class="exc-meta">
          ${escapeHtml(meta)}
        </p>

        <div class="exc-acoes">

          <button
            class="btn btn-success"
            type="button"
            data-acao="aprovar"
          >
            Aprovar
          </button>

          <button
            class="btn btn-outline"
            type="button"
            data-acao="negar"
          >
            Recusar
          </button>

        </div>

      </article>
    `;
  }

  function renderExcecoes() {
    const n = state.excecoes.length;

    el.excContagem.hidden = !n;
    el.excContagem.textContent = String(n);

    el.excLista.innerHTML = n

      ? state.excecoes.map(cardExcecao).join("")

      : `
        <div class="exc-vazio">

          <span class="state-icon" aria-hidden="true">
            ${ICONE_OK}
          </span>

          <strong>Nenhuma solicitação pendente</strong>

          <span>
            As solicitações de exceção aparecem aqui
            para decisão do gerente.
          </span>

        </div>
      `;

    destacarCards();
  }

  async function carregarExcecoes() {
    if (carregandoExcecoes) return;

    carregandoExcecoes = true;

    el.excContagem.hidden = true;

    el.excLista.innerHTML =
      '<div class="exc-skel"></div>' +
      '<div class="exc-skel"></div>';

    try {
      state.excecoes =
        await FC.clientes.listarExcecoes();

      state.resumosExc = new Map();

      const ids = [
        ...new Set(
          state.excecoes
            .map((x) => x.id_cliente)
            .filter((id) => id != null)
            .map(String)
        ),
      ];

      await Promise.all(
        ids.map(async (id) => {
          try {
            const resumo =
              await FC.clientes.obterResumo({
                id,
              });

            state.resumosExc.set(id, resumo);

          } catch (e) {
            console.error(
              `Erro ao consultar saldo do cliente ${id}:`,
              e
            );
          }
        })
      );

      atualizarAviso();

      renderExcecoes();

    } catch (e) {
      state.excecoes = [];
      state.resumosExc = new Map();

      el.excContagem.hidden = true;

      const indisponivel =
        e.status === 404 ||
        e.status === 405 ||
        e.naoImplementado;

      if (indisponivel) {
        el.excLista.innerHTML = `
          <div class="exc-vazio">

            <strong>
              Exceções de crédito indisponíveis
            </strong>

            <span>
              O backend ainda não disponibiliza
              as rotas de consulta e decisão
              de exceções de crédito.
            </span>

          </div>
        `;

      } else {
        el.excLista.innerHTML = `
          <div class="exc-vazio">

            <strong>
              Não foi possível carregar as solicitações
            </strong>

            <span>
              ${escapeHtml(
                e.mensagem ||
                  "Ocorreu um erro ao consultar as exceções."
              )}
            </span>

            <button
              class="btn btn-outline btn-sm"
              type="button"
              data-acao="recarregar"
            >
              Tentar novamente
            </button>

          </div>
        `;
      }

      console.error(
        "Erro ao carregar exceções:",
        e
      );

    } finally {
      carregandoExcecoes = false;
    }
  }

  async function decidir(x, decisao) {
    if (
      state.enviando ||
      carregandoExcecoes ||
      !["aprovar", "negar"].includes(decisao)
    ) {
      return;
    }

    const aprovar = decisao === "aprovar";

    const card = el.excLista.querySelector(
      `[data-id="${CSS.escape(String(x.id))}"]`
    );

    if (!card) return;

    const botoes = card.querySelectorAll("button");

    botoes.forEach((b) => {
      b.disabled = true;
    });

    let registrado = false;

    try {
      const ok = await FC.ui.confirmar({
        titulo: aprovar
          ? "Aprovar exceção?"
          : "Recusar solicitação?",

        mensagem: aprovar

          ? `A venda #${x.id_venda} de ${moeda(x.valor)} para ${x.nome} será autorizada, mesmo fora das regras de crédito.`

          : `A venda #${x.id_venda} de ${moeda(x.valor)} para ${x.nome} continuará rejeitada.`,

        rotuloConfirmar: aprovar
          ? "Aprovar"
          : "Recusar",

        perigo: !aprovar,
      });

      if (!ok || state.enviando) return;

      await FC.clientes.decidirExcecao(
        x,
        decisao
      );

      registrado = true;

      FC.ui.toast(
        aprovar
          ? `Venda #${x.id_venda} aprovada.`
          : `Venda #${x.id_venda} recusada.`
      );

      atualizarAviso();

      if (
        state.cliente &&
        String(state.cliente.id) ===
          String(x.id_cliente)
      ) {
        const cliente =
          await FC.clientes.obterCliente(
            state.cliente.id
          );

        await carregarCliente(cliente);
      }

      await carregarExcecoes();

    } catch (e) {
      const mensagens = {
        excecao_ja_decidida:
          "Esta solicitação já foi decidida.",

        acesso_negado:
          "Apenas o gerente pode decidir exceções.",
      };

      const mensagem = registrado

        ? "A decisão foi registrada, mas não foi possível atualizar a página."

        : e.status === 404 ||
          e.status === 405 ||
          e.naoImplementado

          ? "A operação de exceção ainda não está disponível no backend."

          : mensagens[e.codigo] ||
            e.mensagem ||
            "Não foi possível registrar a decisão.";

      FC.ui.toast(mensagem, "erro");

      if (
        registrado ||
        e.codigo === "excecao_ja_decidida" ||
        e.status === 404 ||
        e.status === 405
      ) {
        await carregarExcecoes();
      }

    } finally {
      if (!registrado) {
        botoes.forEach((b) => {
          b.disabled = false;
        });
      }
    }
  }

  el.excLista.addEventListener("click", async (e) => {
    if (state.enviando) return;

    const botao = e.target.closest("[data-acao]");

    if (!botao || botao.disabled) return;

    const acao = botao.dataset.acao;

    if (acao === "recarregar") {
      await carregarExcecoes();
      return;
    }

    const card = botao.closest(".exc-card");

    if (!card) return;

    const x = state.excecoes.find(
      (i) => String(i.id) === card.dataset.id
    );

    if (!x) return;

    if (acao === "abrir") {
      if (x.id_cliente == null) {
        FC.ui.toast(
          "Não foi possível identificar o cliente desta venda.",
          "erro"
        );

        return;
      }

      try {
        const cliente =
          await FC.clientes.obterCliente(
            x.id_cliente
          );

        busca.selecionar(cliente);

        el.conteudo.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

      } catch (e) {
        FC.ui.toast(
          e.mensagem ||
            "Não foi possível carregar o cliente.",
          "erro"
        );
      }

    } else {
      await decidir(x, acao);
    }
  });

  // Inicialização

  const idVoltar = new URLSearchParams(
    location.search
  ).get("id");

  if (idVoltar) {
    const voltar = $("voltar-limite");

    if (voltar) {
      voltar.href =
        `cliente-detalhes.html?id=${encodeURIComponent(idVoltar)}`;

      voltar.setAttribute(
        "aria-label",
        "Voltar para o cliente"
      );

      voltar.title = "Voltar para o cliente";
    }
  }

  renderCliente();

  atualizarAviso();

  carregarExcecoes();

  busca.carregar()
    .then(async () => {
      if (!idVoltar || consultaCliente !== 0) return;

      const cliente =
        await FC.clientes.obterCliente(idVoltar);

      if (consultaCliente === 0) {
        busca.selecionar(cliente);
      }
    })
    .catch((e) => {
      console.error(
        "Erro ao carregar cliente:",
        e
      );

      FC.ui.toast(
        e.mensagem ||
          "Não foi possível carregar o cliente. Pesquise pelo nome.",
        "erro"
      );
    });

})();