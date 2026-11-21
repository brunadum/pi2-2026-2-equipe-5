// Tela Histórico de Auditoria (RF11): lista e filtra as operações registradas pelo servidor.
(function () {
  const FC = window.FC;
  const { escapeHtml } = FC.format;
  const $ = (id) => document.getElementById(id);
  const PAGINA = 50;

  const el = {
    form: $("filtros"), operacao: $("f-operacao"), usuario: $("f-usuario"), inicio: $("f-inicio"), fim: $("f-fim"),
    limpar: $("f-limpar"), erroFiltro: $("f-erro"), contagem: $("audit-contagem"),
    carregando: $("estado-carregando"), erro: $("estado-erro"), erroTitulo: $("erro-titulo"), erroTexto: $("erro-texto"),
    tentar: $("btn-tentar"), vazio: $("estado-vazio"), wrap: $("tabela-wrap"), corpo: $("audit-corpo"),
    mais: $("audit-mais"), btnMais: $("btn-mais"),
  };
  const state = { itens: [], mostrados: 0 };
  FC.ui.initSidebar();

  const unicas = Object.entries(FC.auditoria.OPERACOES).filter(([k]) => k !== "desconto_pagamento");
  el.operacao.innerHTML = '<option value="">Todas</option>' +
    unicas.map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join("");

  // Lista de usuários para o filtro (se a rota falhar, o filtro de usuário simplesmente fica só com "Todos").
  FC.usuarios.listar().then((lista) => {
    el.usuario.innerHTML = '<option value="">Todos</option>' +
      lista.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.nome)}</option>`).join("");
  }).catch(() => {});

  const dataHoraBR = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || "—";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  function rotuloReferencia(ref) {
    if (!ref) return "—";
    const tipos = { cliente: "Cliente", venda: "Venda", pagamento: "Pagamento", parcela: "Parcela", usuario: "Usuário" };
    return ref.tipo ? `${tipos[ref.tipo] || ref.tipo} #${ref.id}` : `#${ref.id}`;
  }

  function estado(nome, { titulo, texto } = {}) {
    el.carregando.hidden = nome !== "carregando";
    el.erro.hidden = nome !== "erro";
    el.vazio.hidden = nome !== "vazio";
    el.wrap.hidden = nome !== "tabela";
    el.mais.hidden = true;
    if (nome === "erro") { el.erroTitulo.textContent = titulo; el.erroTexto.textContent = texto; }
  }

  function renderPagina() {
    const fim = Math.min(state.itens.length, state.mostrados + PAGINA);
    const novas = state.itens.slice(state.mostrados, fim);
    el.corpo.insertAdjacentHTML("beforeend", novas.map((r) => `<tr>
      <td>${escapeHtml(dataHoraBR(r.dataHora))}</td>
      <td class="cell-ink">${escapeHtml(r.usuario)}</td>
      <td><span class="badge badge-muted">${escapeHtml(r.rotulo)}</span></td>
      <td>${escapeHtml(rotuloReferencia(r.referencia))}</td>
      <td class="audit-alteracao">${escapeHtml(FC.auditoria.resumirAlteracao(r.anterior, r.novo))}</td>
      <td class="audit-motivo">${escapeHtml(r.motivo || "—")}</td>
    </tr>`).join(""));
    state.mostrados = fim;
    el.mais.hidden = state.mostrados >= state.itens.length;
    el.contagem.textContent = `Exibindo ${state.mostrados} de ${state.itens.length} registro${state.itens.length === 1 ? "" : "s"}.`;
  }

  function filtros() {
    return { operacao: el.operacao.value, idUsuario: el.usuario.value, dataInicio: el.inicio.value, dataFim: el.fim.value };
  }

  async function carregar() {
    el.erroFiltro.hidden = true;
    if (el.inicio.value && el.fim.value && el.inicio.value > el.fim.value) {
      el.erroFiltro.textContent = "A data inicial não pode ser depois da data final.";
      el.erroFiltro.hidden = false;
      return;
    }
    estado("carregando");
    el.contagem.textContent = "";
    try {
      state.itens = await FC.auditoria.listar(filtros());
      state.mostrados = 0;
      el.corpo.innerHTML = "";
      if (!state.itens.length) { estado("vazio"); el.contagem.textContent = "Nenhum registro."; return; }
      estado("tabela");
      renderPagina();
    } catch (e) {
      if (e.naoImplementado) {
        estado("erro", {
          titulo: "Histórico ainda não disponível no servidor",
          texto: "O back-end ainda não oferece a consulta de auditoria (GET /auditoria). Os registros já estão sendo gravados e aparecerão aqui quando a rota for publicada.",
        });
        el.tentar.hidden = true;
      } else if (e.status === 403) {
        estado("erro", { titulo: "Sem permissão", texto: "Somente o gerente pode consultar a auditoria." });
        el.tentar.hidden = true;
      } else {
        estado("erro", { titulo: "Não foi possível carregar a auditoria", texto: e.mensagem || "Ocorreu um erro inesperado." });
        el.tentar.hidden = false;
      }
    }
  }

  el.form.addEventListener("submit", (ev) => { ev.preventDefault(); carregar(); });
  el.limpar.addEventListener("click", () => { el.form.reset(); carregar(); });
  el.btnMais.addEventListener("click", renderPagina);
  el.tentar.addEventListener("click", carregar);

  carregar();
})();
