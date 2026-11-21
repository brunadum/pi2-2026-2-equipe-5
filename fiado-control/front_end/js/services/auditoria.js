// Serviço de auditoria (namespace global FC.auditoria) — RF11, rota GET /auditoria do contrato.
//
// Sem fallback local de propósito: um histórico de auditoria só vale se vier do servidor.
// Se o back-end ainda não tiver a rota (404 sem corpo / 405), a tela mostra "indisponível".
(function () {
  const FC = (window.FC = window.FC || {});

  const OPERACOES = {
    cancelamento_venda: "Cancelamento de venda",
    estorno_pagamento: "Estorno de pagamento",
    desconto: "Desconto em parcela",
    desconto_pagamento: "Desconto em parcela",
    alteracao_limite: "Alteração de limite",
    bloqueio_credito: "Bloqueio de crédito",
    alteracao_manual: "Alteração manual",
    configuracao_cobranca: "Alteração de cobrança",
    criacao_usuario: "Cadastro de usuário",
    edicao_usuario: "Edição de usuário",
  };

  const rotuloOperacao = (op) =>
    OPERACOES[op] || String(op || "—").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

  const ROTULOS_CAMPO = {
    valor_total: "valor", valor_devido: "valor devido", limite_credito: "limite", credito_bloqueado: "crédito bloqueado",
    status: "status", nome: "nome", email: "e-mail", perfil: "perfil", ativo: "ativo", taxa_juros: "juros", taxa_multa: "multa",
    valor_recebido: "valor recebido", saldo_parcela: "saldo da parcela", status_parcela: "status da parcela",
  };

  // Tipo do recurso quando o servidor só manda o id (ex.: id_recurso).
  const TIPO_POR_OPERACAO = {
    cancelamento_venda: "venda", estorno_pagamento: "pagamento", desconto: "parcela", desconto_pagamento: "parcela",
    criacao_usuario: "usuario", edicao_usuario: "usuario", alteracao_limite: "cliente", bloqueio_credito: "cliente",
  };

  // Normaliza um registro (contrato: valor_anterior/valor_novo/referencia; banco: valores_anteriores/valores_novos).
  function normalizar(r) {
    const ref = r.referencia || (r.id_recurso != null ? { tipo: TIPO_POR_OPERACAO[r.operacao] || "", id: r.id_recurso } : r.id_cliente != null ? { tipo: "cliente", id: r.id_cliente } : null);
    return {
      id: r.id_auditoria ?? r.id,
      dataHora: r.data_hora || r.data || "",
      idUsuario: r.id_usuario ?? null,
      usuario: r.nome_usuario || (r.id_usuario != null ? `Usuário #${r.id_usuario}` : "—"),
      operacao: r.operacao || "",
      rotulo: rotuloOperacao(r.operacao),
      referencia: ref,
      anterior: r.valor_anterior ?? r.valores_anteriores ?? null,
      novo: r.valor_novo ?? r.valores_novos ?? null,
      motivo: r.motivo || "",
    };
  }

  function formatarValor(chave, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "sim" : "não";
    if (typeof v === "number" && /valor|saldo|limite|devido|recebid/.test(chave || "")) return FC.format.moeda(v);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  // Texto curto "antes → depois" para a coluna Alteração.
  function resumirAlteracao(anterior, novo) {
    const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
    if (obj(anterior) || obj(novo)) {
      const a = obj(anterior) ? anterior : {};
      const n = obj(novo) ? novo : {};
      const todas = [...new Set([...Object.keys(a), ...Object.keys(n)])].filter((k) => typeof (n[k] ?? a[k]) !== "object");
      // Primeiro o que mudou de verdade (existe antes e depois); só se não houver, o que foi gravado de novo.
      const mudou = todas.filter((k) => k in a && k in n && JSON.stringify(a[k]) !== JSON.stringify(n[k]));
      const novos = todas.filter((k) => !(k in a) && n[k] != null);
      const itens = (mudou.length ? mudou : novos).slice(0, 3);
      if (!itens.length) return "—";
      if (!mudou.length) return itens.map((k) => `${ROTULOS_CAMPO[k] || k.replace(/_/g, " ")}: ${formatarValor(k, n[k])}`).join(" · ");
      return itens.map((k) => `${ROTULOS_CAMPO[k] || k.replace(/_/g, " ")}: ${formatarValor(k, a[k])} → ${formatarValor(k, n[k])}`).join(" · ");
    }
    if (anterior == null && novo == null) return "—";
    const v = (x) => (typeof x === "number" ? FC.format.moeda(x) : formatarValor("", x));
    return `${v(anterior)} → ${v(novo)}`;
  }

  async function listar({ operacao, idUsuario, dataInicio, dataFim } = {}) {
    const q = new URLSearchParams();
    if (operacao) q.set("operacao", operacao);
    if (idUsuario) q.set("id_usuario", idUsuario);
    if (dataInicio) q.set("data_inicio", dataInicio);
    if (dataFim) q.set("data_fim", dataFim);
    const r = await FC.api.request(`/auditoria${q.toString() ? `?${q}` : ""}`);
    const lista = Array.isArray(r) ? r : (r?.auditoria || r?.registros || r?.itens || []);
    return lista.map(normalizar).sort((x, y) => String(y.dataHora).localeCompare(String(x.dataHora)));
  }

  FC.auditoria = { OPERACOES, rotuloOperacao, resumirAlteracao, listar };
})();
