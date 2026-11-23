// Serviço da tela "Consulta de Relatórios" — RF12 (namespace global FC.relatorios).
//
// Rotas do back-end (somente gerente; funcionário recebe 403):
//   GET /relatorios/{tipo}?periodo=&data_inicio=&data_fim=&id_cliente=          → dados em JSON
//   GET /relatorios/{tipo}/exportar?periodo=&data_inicio=&data_fim=&id_cliente= → arquivo CSV
// tipo = vendas | pagamentos | clientes | inadimplencia | financeiro
// Todas as chamadas passam por FC.api (envia o token e trata 401/403).
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, baixar } = FC.api;

  const TIPOS = ["vendas", "pagamentos", "clientes", "inadimplencia", "financeiro"];

  // Monta a query só com os filtros preenchidos. "periodo" e datas não são enviados juntos.
  function montarQuery({ periodo, data_inicio, data_fim, id_cliente } = {}) {
    const q = new URLSearchParams();
    if (data_inicio || data_fim) {
      if (data_inicio) q.set("data_inicio", data_inicio);
      if (data_fim) q.set("data_fim", data_fim);
    } else if (periodo) {
      q.set("periodo", periodo);
    }
    if (id_cliente) q.set("id_cliente", id_cliente);
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  function validarTipo(tipo) {
    if (!TIPOS.includes(tipo)) throw new Error(`Tipo de relatório inválido: ${tipo}`);
    return encodeURIComponent(tipo);
  }

  // Retorna lista (vendas, pagamentos, clientes, inadimplencia) ou objeto (financeiro).
  function consultar(tipo, filtros, { signal } = {}) {
    return request(`/relatorios/${validarTipo(tipo)}${montarQuery(filtros)}`, { signal });
  }

  // Baixa o CSV gerado pelo servidor com os mesmos filtros da consulta.
  function exportar(tipo, filtros) {
    const hoje = new Date().toISOString().slice(0, 10);
    return baixar(`/relatorios/${validarTipo(tipo)}/exportar${montarQuery(filtros)}`, `relatorio-${tipo}-${hoje}.csv`);
  }

  FC.relatorios = { TIPOS, consultar, exportar, montarQuery };
})();
