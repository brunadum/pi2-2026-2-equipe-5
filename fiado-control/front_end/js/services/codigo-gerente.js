(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;

  const FORMATO = /^\d{6}$/;

  const erro = (codigo, mensagem, status = 422) =>
    new ApiError({ status, codigo, mensagem });

  async function definido() {
    const resposta = await request("/configuracoes/codigo-gerente");
    return !!resposta?.definido;
  }

  async function definir({ codigoNovo, codigoAtual }) {
    if (!FORMATO.test(codigoNovo || "")) {
      throw erro(
        "codigo_invalido",
        "O código deve ter exatamente 6 números.",
        400
      );
    }

    await request("/configuracoes/codigo-gerente", {
      method: "PUT",
      body: {
        codigo_novo: codigoNovo,
        ...(codigoAtual ? { codigo_atual: codigoAtual } : {}),
      },
    });
  }

  async function validar(codigo) {
    if (!FORMATO.test(codigo || "")) {
      throw erro(
        "codigo_gerente_invalido",
        "Código inválido. Verifique o código e tente novamente.",
        422
      );
    }

    try {
      const resposta = await request("/autorizacoes/gerente", {
        method: "POST",
        body: { codigo },
      });

      if (!resposta?.token_autorizacao) {
        throw erro(
          "autorizacao_invalida",
          "Não foi possível autorizar a operação."
        );
      }

      return {
        autorizacao: resposta.token_autorizacao,
      };

    } catch (e) {
      if (e.codigo === "codigo_gerente_invalido") {
        throw erro(
          "codigo_gerente_invalido",
          "Código inválido. Verifique o código e tente novamente.",
          422
        );
      }

      if (e.codigo === "codigo_gerente_nao_definido") {
        throw erro(
          "codigo_gerente_nao_definido",
          e.mensagem || "Nenhum código de gerente foi definido ainda.",
          409
        );
      }

      throw e;
    }
  }

  FC.codigoGerente = {
    FORMATO,
    definido,
    definir,
    validar,
    aviso: () => "",
  };
})();