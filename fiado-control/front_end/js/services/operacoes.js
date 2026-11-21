// Operações financeiras do RF13 (namespace global FC.operacoes): cancelar venda e estornar pagamento.
//
// Rotas do back-end (somente gerente; o motivo é obrigatório e vai para a auditoria):
//   POST /vendas/{id_venda}/cancelar        { motivo }
//   POST /pagamentos/{id_pagamento}/estornar { motivo }   (id_pagamento = id do recebimento no histórico)
// Sem fallback local: cancelar/estornar só vale se for gravado no banco.
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;

  const MENSAGENS = {
    venda_ja_cancelada: "Esta venda já foi cancelada.",
    venda_nao_cancelavel: "Apenas vendas aprovadas podem ser canceladas.",
    venda_possui_pagamentos: "Esta venda tem pagamentos registrados. Estorne os pagamentos antes de cancelar a venda.",
    venda_nao_encontrada: "Venda não encontrada. Atualize a página e tente de novo.",
    pagamento_nao_encontrado: "Pagamento não encontrado. Ele pode já ter sido estornado; atualize a página.",
    campo_obrigatorio: "Informe o motivo da operação.",
    campo_invalido: "Verifique o motivo informado (até 200 caracteres).",
  };

  async function executar(caminho, motivo, { autorizacao, viaCodigo, extra, metodo = "POST" } = {}) {
    try {
      return await request(caminho, {
        method: metodo,
        body: { ...(extra || {}), motivo: motivo.trim() },
        headers: autorizacao ? { "X-Autorizacao-Gerente": autorizacao } : undefined,
      });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.naoImplementado) {
        throw new ApiError({ status: e.status, codigo: "nao_implementado", mensagem: "O servidor ainda não oferece esta operação. Atualize o back-end e tente de novo." });
      }
      if (e.status === 403) {
        throw new ApiError({
          status: 403, codigo: "acesso_negado", dados: e.dados,
          mensagem: viaCodigo
            ? "O código está correto, mas o servidor ainda não aceita autorização por código: esta operação só é concluída com um gerente logado."
            : "Somente o gerente pode concluir esta operação.",
        });
      }
      if (MENSAGENS[e.codigo]) throw new ApiError({ status: e.status, codigo: e.codigo, mensagem: MENSAGENS[e.codigo], dados: e.dados });
      throw e;
    }
  }

  // RF10: desconto em uma parcela (somente gerente; valor e motivo obrigatórios; vai para a auditoria).
  //   POST /pagamentos/{id_parcela}/desconto { valor_desconto, motivo }
  async function concederDesconto(idParcela, valor, motivo, opcoes = {}) {
    try {
      return await executar(`/pagamentos/${encodeURIComponent(idParcela)}/desconto`, motivo, { ...opcoes, extra: { valor_desconto: valor } });
    } catch (e) {
      if (e.codigo === "parcela_nao_encontrada") throw new ApiError({ status: e.status, codigo: e.codigo, mensagem: "Parcela não encontrada. Atualize a página e tente de novo." });
      throw e;
    }
  }

  // RF06: bloquear/desbloquear o crédito do cliente (somente gerente; vai para a auditoria).
  //   PUT /clientes/{id}/credito/bloqueio { bloqueado, motivo }  →  { id_cliente, credito_bloqueado }
  async function definirBloqueio(idCliente, bloqueado, motivo, opcoes = {}) {
    try {
      return await executar(`/clientes/${encodeURIComponent(idCliente)}/credito/bloqueio`, motivo, { ...opcoes, metodo: "PUT", extra: { bloqueado: !!bloqueado } });
    } catch (e) {
      if (e.codigo === "cliente_nao_encontrado") throw new ApiError({ status: e.status, codigo: e.codigo, mensagem: "Cliente não encontrado. Atualize a página e tente de novo." });
      throw e;
    }
  }

  FC.operacoes = {
    concederDesconto,
    definirBloqueio,
    cancelarVenda: (idVenda, motivo, opcoes = {}) =>
      executar(`/vendas/${encodeURIComponent(idVenda)}/cancelar`, motivo, opcoes),
    estornarPagamento: (idPagamento, motivo, opcoes = {}) =>
      executar(`/pagamentos/${encodeURIComponent(idPagamento)}/estornar`, motivo, opcoes),
  };
})();
