// Dashboard (RF09): indicadores, próximas parcelas e gráfico vêm do back-end (GET /dashboard).
(() => {
  const FC = window.FC;
  const { moeda, dataBR, escapeHtml } = FC.format;
  const $ = (id) => document.getElementById(id);

  const toast = $("toast");
  const sidebar = $("sidebar");
  const menuButton = $("mobile-menu");
  const backdrop = $("sidebar-backdrop");
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  document.querySelectorAll("[data-coming-soon]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      showToast(`${element.dataset.comingSoon}: funcionalidade ainda não implementada.`);
    });
  });

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    backdrop.classList.toggle("show", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });

  backdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });

  // ------------------------------------------------------------------ dados reais

  const el = {
    aReceber: $("total-a-receber"),
    emAtraso: $("total-em-atraso"),
    vendasMes: $("vendas-mes"),
    inadimplentes: $("clientes-inadimplentes"),
    parcelas: $("installment-rows"),
    grafico: $("bar-chart"),
    status: $("dash-status"),
  };
  const DIAS_A_VENCER = 15;

  function mostrarStatus(texto, { tentar = false } = {}) {
    el.status.replaceChildren();
    el.status.hidden = !texto;
    if (!texto) return;
    el.status.appendChild(document.createTextNode(texto + " "));
    if (tentar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dash-retry";
      b.textContent = "Tentar novamente";
      b.addEventListener("click", carregar);
      el.status.appendChild(b);
    }
  }

  function limparIndicadores(texto) {
    [el.aReceber, el.emAtraso, el.vendasMes, el.inadimplentes].forEach((e) => { e.textContent = texto; });
  }

  const diasAte = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    const hoje = new Date();
    const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - base) / 86400000);
  };

  function statusParcela(iso) {
    const d = diasAte(iso);
    if (d === 0) return { texto: "Vence hoje", classe: "status-late" };
    if (d === 1) return { texto: "Vence amanhã", classe: "status-pending" };
    if (d != null && d > 1) return { texto: `Em ${d} dias`, classe: "status-pending" };
    return { texto: "A vencer", classe: "status-pending" };
  }

  function renderParcelas(lista) {
    const ordenadas = [...lista].sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento))).slice(0, 6);
    if (!ordenadas.length) {
      el.parcelas.innerHTML = `<tr><td colspan="4">Nenhuma parcela vence nos próximos ${DIAS_A_VENCER} dias.</td></tr>`;
      return;
    }
    el.parcelas.innerHTML = ordenadas.map((p) => {
      const st = statusParcela(p.data_vencimento);
      return `<tr>
        <td><a class="cliente-link" href="cliente-detalhes.html?id=${encodeURIComponent(p.id_cliente)}">${escapeHtml(p.nome)}</a></td>
        <td>${dataBR(p.data_vencimento)}</td>
        <td class="amount">${moeda(p.valor_parcela)}</td>
        <td><span class="status ${st.classe}">${st.texto}</span></td>
      </tr>`;
    }).join("");
  }

  function renderGrafico(semanas) {
    const dados = (semanas || []).map((s) => ({ rotulo: s.rotulo, vendas: Number(s.valor) || 0, pagos: Number(s.recebido) || 0 }));
    const maximo = Math.max(0, ...dados.flatMap((d) => [d.vendas, d.pagos]));
    if (!dados.length || maximo === 0) {
      el.grafico.setAttribute("aria-label", "Nenhuma venda ou pagamento nas últimas quatro semanas");
      el.grafico.innerHTML = '<p class="chart-msg">Ainda não há vendas ou pagamentos nas últimas 4 semanas.</p>';
      return;
    }
    const altura = (v) => (v <= 0 ? "2px" : `${Math.max(3, (v / maximo) * 100)}%`);
    el.grafico.setAttribute(
      "aria-label",
      "Vendas e pagamentos nas últimas quatro semanas: " +
        dados.map((d) => `${d.rotulo}, vendas ${moeda(d.vendas)}, pagos ${moeda(d.pagos)}`).join("; "),
    );
    el.grafico.innerHTML = dados.map((d) => `
      <div class="bar-group">
        <div class="bars">
          <span class="bar bar-sales" style="height:${altura(d.vendas)}" title="Vendas: ${moeda(d.vendas)}"></span>
          <span class="bar bar-payments" style="height:${altura(d.pagos)}" title="Pagos: ${moeda(d.pagos)}"></span>
        </div>
        <span class="bar-label">${escapeHtml(d.rotulo)}</span>
      </div>`).join("");
  }

  async function carregar() {
    mostrarStatus("");
    limparIndicadores("Carregando...");
    el.parcelas.innerHTML = '<tr><td colspan="4">Carregando parcelas...</td></tr>';
    try {
      const d = await FC.api.request(`/dashboard?periodo=mes&dias=${DIAS_A_VENCER}`);
      el.aReceber.textContent = moeda(d.total_a_receber);
      el.emAtraso.textContent = moeda(d.total_vencido);
      el.vendasMes.textContent = moeda(d.faturamento_total);
      el.inadimplentes.textContent = String(d.clientes_inadimplentes ?? 0);
      renderParcelas(d.parcelas_a_vencer || []);
      renderGrafico(d.faturamento_semanal);
    } catch (e) {
      limparIndicadores("—");
      el.parcelas.innerHTML = '<tr><td colspan="4">Não foi possível carregar as parcelas.</td></tr>';
      el.grafico.innerHTML = '<p class="chart-msg">Não foi possível carregar o gráfico.</p>';
      el.grafico.setAttribute("aria-label", "Gráfico indisponível");
      if (e.status === 403) mostrarStatus("Somente o gerente pode ver o resumo financeiro.");
      else if (e.naoImplementado) mostrarStatus("O servidor ainda não oferece o resumo (GET /dashboard).");
      else mostrarStatus(e.mensagem || "Não foi possível carregar o resumo.", { tentar: true });
    }
  }

  carregar();
})();
