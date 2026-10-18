(() => {
  const api = window.FC?.api;
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  const periodo = $("periodo");

  let dashboard = null;
  let vendas = null;
  let pagamentos = null;
  let erroDashboard = null;
  let erroPagamentos = null;

  const moeda = (valor) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));

  // Aceita números da API e strings numéricas em formatos brasileiro ou internacional.
  function numero(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    if (typeof valor !== "string" || !valor.trim()) return 0;

    const limpo = valor.trim().replace(/R\$\s?/g, "");
    const normalizado = limpo.includes(",")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;
    const resultado = Number(normalizado);
    return Number.isFinite(resultado) ? resultado : 0;
  }

  function primeiroValor(objeto, chaves) {
    for (const chave of chaves) {
      if (objeto?.[chave] !== undefined && objeto[chave] !== null && objeto[chave] !== "") {
        return objeto[chave];
      }
    }
    return undefined;
  }

  // A API pode responder uma lista diretamente ou dentro de uma chave de coleção.
  function listaDaResposta(resposta, chaves) {
    if (Array.isArray(resposta)) return resposta;
    for (const chave of chaves) {
      if (Array.isArray(resposta?.[chave])) return resposta[chave];
    }
    if (Array.isArray(resposta?.results)) return resposta.results;
    return null;
  }

  function mostrarStatus(mensagem, erro = false) {
    status.textContent = mensagem;
    status.hidden = !mensagem;
    status.classList.toggle("error", erro);
  }

  function valorParcela(parcela) {
    return numero(primeiroValor(parcela, [
      "valor_em_aberto",
      "saldo_devedor",
      "valor_parcela",
      "valor_total",
      "valor",
    ]));
  }

  function parcelasVencidas() {
    return listaDaResposta(dashboard, ["parcelas_vencidas", "parcelas_em_atraso", "vencidas"]) || [];
  }

  function dataVenda(venda) {
    return primeiroValor(venda, ["data", "data_venda", "criado_em", "created_at"]);
  }

  function valorVenda(venda) {
    return numero(primeiroValor(venda, ["valor_total", "faturamento", "total", "valor"]));
  }

  function dataValida(valor) {
    if (!valor) return null;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  function dentroDoPeriodo(data, periodoSelecionado) {
    if (!data) return false;
    const agora = new Date();
    const inicio = new Date(agora);

    if (periodoSelecionado === "dia") {
      inicio.setHours(0, 0, 0, 0);
    } else if (periodoSelecionado === "semana") {
      inicio.setDate(inicio.getDate() - 6);
      inicio.setHours(0, 0, 0, 0);
    } else {
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
    }

    return data >= inicio && data <= agora;
  }

  function vendasDoPeriodo() {
    if (!Array.isArray(vendas)) return [];
    return vendas.filter((venda) => dentroDoPeriodo(dataValida(dataVenda(venda)), periodo.value));
  }

  function faturamentoDasVendas() {
    return vendasDoPeriodo().reduce((total, venda) => total + valorVenda(venda), 0);
  }

  function faturamentoVencido() {
    const valorDireto = primeiroValor(dashboard, [
      "total_vencido",
      "valor_vencido",
      "total_inadimplencia",
      "valor_inadimplencia",
    ]);
    if (valorDireto !== undefined) return numero(valorDireto);

    const lista = listaDaResposta(dashboard, ["parcelas_vencidas", "parcelas_em_atraso", "vencidas"]);
    if (lista) return lista.reduce((total, parcela) => total + valorParcela(parcela), 0);
    return null;
  }

  function totalRecebido() {
    const valorDireto = primeiroValor(dashboard, [
      "total_recebido",
      "valor_recebido",
      "recebido_total",
      "total_pago",
      "pagamentos_no_periodo",
    ]);
    if (valorDireto !== undefined) return numero(valorDireto);

    if (Array.isArray(pagamentos)) {
      return pagamentos.reduce((total, pagamento) => total + numero(primeiroValor(pagamento, [
        "valor_recebido",
        "valor_pagamento",
        "valor_pago",
        "valor",
      ])), 0);
    }
    return null;
  }

  function taxaDeAtraso(totalVencido) {
    const valorDireto = primeiroValor(dashboard, [
      "taxa_atraso",
      "taxa_inadimplencia",
      "percentual_inadimplencia",
    ]);
    if (valorDireto !== undefined) return `${numero(valorDireto).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

    const totalAReceber = numero(primeiroValor(dashboard, ["total_a_receber", "valor_a_receber"]));
    if (totalVencido !== null && totalAReceber > 0) {
      const taxa = totalVencido / totalAReceber * 100;
      return `${taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    }
    return "Indisponível";
  }

  function moedaOuIndisponivel(valor) {
    return valor === null || valor === undefined ? "Indisponível" : moeda(valor);
  }

  function desenharGrafico(semanas) {
    const area = $("grafico");
    area.replaceChildren();

    if (!semanas.length) {
      const mensagem = document.createElement("p");
      mensagem.className = "empty-state";
      mensagem.textContent = "A API ainda não fornece dados para o gráfico semanal.";
      area.appendChild(mensagem);
      return;
    }

    const valores = semanas.map((semana) => numero(primeiroValor(semana, ["valor", "faturamento", "total"])));
    const maiorValor = Math.max(...valores, 1);

    semanas.forEach((semana, indice) => {
      const coluna = document.createElement("div");
      coluna.className = "week-column";

      const areaBarra = document.createElement("div");
      areaBarra.className = "week-bar-area";

      const barra = document.createElement("div");
      barra.className = "week-bar";
      barra.style.height = `${Math.max(0, valores[indice] / maiorValor * 100)}%`;
      barra.title = moeda(valores[indice]);

      const rotulo = document.createElement("small");
      rotulo.textContent = primeiroValor(semana, ["rotulo", "semana", "label"]) || `Semana ${indice + 1}`;

      areaBarra.appendChild(barra);
      coluna.append(areaBarra, rotulo);
      area.appendChild(coluna);
    });
  }

  // Se a API não enviar `faturamento_semanal`, o gráfico usa a data e o valor das vendas listadas.
  function semanasDerivadasDasVendas() {
    if (!Array.isArray(vendas)) return [];

    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - 27);
    inicio.setHours(0, 0, 0, 0);
    const valores = [0, 0, 0, 0];

    vendas.forEach((venda) => {
      const data = dataValida(dataVenda(venda));
      if (!data || data < inicio || data > agora) return;
      const dias = Math.floor((data.getTime() - inicio.getTime()) / 86400000);
      const indice = Math.min(3, Math.max(0, Math.floor(dias / 7)));
      valores[indice] += valorVenda(venda);
    });

    return valores.map((valor, indice) => ({ rotulo: `Semana ${indice + 1}`, valor }));
  }

  function desenharIndicadores() {
    const totalVencido = faturamentoVencido();
    const faturamentoApi = primeiroValor(dashboard, [
      "faturamento_total",
      "faturamento",
      "total_vendido",
      "valor_total_vendas",
    ]);
    const totalFaturado = faturamentoApi !== undefined ? numero(faturamentoApi) : (Array.isArray(vendas) ? faturamentoDasVendas() : null);
    const recebido = totalRecebido();

    $("faturamento").textContent = moedaOuIndisponivel(totalFaturado);
    $("recebido").textContent = moedaOuIndisponivel(recebido);
    $("inadimplencia").textContent = moedaOuIndisponivel(totalVencido);
    $("taxa-atraso").textContent = taxaDeAtraso(totalVencido);

    const semanasApi = listaDaResposta(dashboard, ["faturamento_semanal", "vendas_semanais", "semanas"]);
    desenharGrafico(semanasApi?.length ? semanasApi : semanasDerivadasDasVendas());

    const avisos = [];
    if (erroDashboard) avisos.push("Não foi possível consultar todos os indicadores de /api/dashboard/.");
    if (recebido === null) avisos.push("O total recebido depende de um campo no dashboard ou da rota GET /api/pagamentos.");
    if (!semanasApi && !Array.isArray(vendas)) avisos.push("O gráfico semanal depende de faturamento_semanal ou da listagem de vendas.");
    mostrarStatus(avisos.join(" "), Boolean(erroDashboard));
  }

  async function carregar() {
    if (!api) {
      mostrarStatus("Cliente da API não foi carregado. Confira os scripts no HTML.", true);
      return;
    }

    mostrarStatus("Carregando dados financeiros…");
    const [resultadoDashboard, resultadoVendas, resultadoPagamentos] = await Promise.allSettled([
      // CONTRATO BACKEND: GET /api/dashboard/?periodo=dia|semana|mes.
      api.request(`/dashboard/?periodo=${encodeURIComponent(periodo.value)}`),
      // A rota GET /api/vendas já consta no contrato atual e permite completar o gráfico.
      api.request("/vendas"),
      // Rota opcional para exportação: no contrato atual, POST /api/pagamentos existe; GET deve ser confirmado.
      api.request("/pagamentos"),
    ]);

    if (resultadoDashboard.status === "fulfilled") {
      dashboard = resultadoDashboard.value || {};
      erroDashboard = null;
    } else {
      erroDashboard = resultadoDashboard.reason;
      dashboard = null;
    }

    if (resultadoVendas.status === "fulfilled") {
      vendas = listaDaResposta(resultadoVendas.value, ["vendas", "data"]);
    } else {
      vendas = null;
    }

    if (resultadoPagamentos.status === "fulfilled") {
      pagamentos = listaDaResposta(resultadoPagamentos.value, ["pagamentos", "data"]);
      erroPagamentos = null;
    } else {
      pagamentos = null;
      erroPagamentos = resultadoPagamentos.reason;
    }

    desenharIndicadores();
  }

  function valorCsv(valor) {
    const texto = valor === undefined || valor === null
      ? ""
      : (typeof valor === "object" ? JSON.stringify(valor) : String(valor));
    return `"${texto.replace(/"/g, '""')}"`;
  }

  function baixarCsv(nomeArquivo, linhas) {
    if (!Array.isArray(linhas) || linhas.length === 0) {
      mostrarStatus("Não há registros disponíveis para exportar.", true);
      return;
    }

    const colunas = [...new Set(linhas.flatMap((linha) => Object.keys(linha)))];
    const csv = [
      colunas.map(valorCsv).join(";"),
      ...linhas.map((linha) => colunas.map((coluna) => valorCsv(linha[coluna])).join(";")),
    ].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportar(tipo) {
    if (!api) {
      mostrarStatus("Cliente da API não foi carregado.", true);
      return;
    }

    try {
      let dados;
      if (tipo === "vendas") {
        const resposta = vendas || await api.request("/vendas");
        dados = listaDaResposta(resposta, ["vendas", "data"]);
      } else if (tipo === "clientes") {
        const resposta = await api.request("/clientes");
        dados = listaDaResposta(resposta, ["clientes", "data"]);
      } else if (tipo === "pagamentos") {
        const resposta = pagamentos || await api.request("/pagamentos");
        dados = listaDaResposta(resposta, ["pagamentos", "data"]);
        if (!dados) {
          mostrarStatus("A rota GET /api/pagamentos não está disponível para exportação. O contrato atual contempla apenas POST /api/pagamentos.", true);
          return;
        }
      } else if (tipo === "inadimplencia") {
        dados = parcelasVencidas();
        if (!listaDaResposta(dashboard, ["parcelas_vencidas", "parcelas_em_atraso", "vencidas"])) {
          mostrarStatus("O dashboard não retornou a lista de parcelas vencidas.", true);
          return;
        }
      }

      if (!Array.isArray(dados)) {
        mostrarStatus("A API não retornou uma lista válida para este relatório.", true);
        return;
      }
      baixarCsv(`relatorio-${tipo}.csv`, dados);
    } catch (erro) {
      mostrarStatus(erro?.mensagem || `Não foi possível exportar o relatório de ${tipo}.`, true);
    }
  }

  function exportarResumo() {
    const linhas = [
      { indicador: "Faturamento total", valor: $("faturamento").textContent },
      { indicador: "Total recebido", valor: $("recebido").textContent },
      { indicador: "Total inadimplência", valor: $("inadimplencia").textContent },
      { indicador: "Taxa de atraso", valor: $("taxa-atraso").textContent },
      { indicador: "Período selecionado", valor: periodo.options[periodo.selectedIndex].text },
      { indicador: "Gerado em", valor: new Date().toLocaleString("pt-BR") },
    ];
    baixarCsv("resumo-financeiro.csv", linhas);
  }

  $("exportar").addEventListener("click", exportarResumo);
  document.querySelectorAll("[data-export]").forEach((botao) => {
    botao.addEventListener("click", () => exportar(botao.dataset.export));
  });
  periodo.addEventListener("change", carregar);

  // Navegação responsiva no celular, seguindo o mesmo padrão das telas existentes.
  const sidebar = $("sidebar");
  const menu = $("mobile-menu");
  const backdrop = $("sidebar-backdrop");
  if (sidebar && menu && backdrop) {
    const fecharMenu = () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
      menu.setAttribute("aria-expanded", "false");
    };

    menu.addEventListener("click", () => {
      const aberto = sidebar.classList.toggle("open");
      backdrop.classList.toggle("show", aberto);
      menu.setAttribute("aria-expanded", String(aberto));
    });
    backdrop.addEventListener("click", fecharMenu);
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") fecharMenu();
    });
  }

  carregar();
})();
