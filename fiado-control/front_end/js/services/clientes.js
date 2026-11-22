
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;
  const { apenasDigitos, arredondar, hojeISO } = FC.format;

  const CHAVE_ITENS = "fiadoControl.itensVendasTemporarios.v1";
  const CHAVE_ANTIGA = "fiadoControl.local.v1";

  const MOTIVOS_EXCECAO = {
    limite_credito_excedido: "Limite excedido",
    parcelas_em_atraso: "Parcela atrasada"
  };

  const MOTIVOS_VENDA = {
    credito_bloqueado: "O crédito deste cliente está bloqueado.",
    parcelas_em_atraso: "O cliente possui parcelas em atraso.",
    limite_credito_excedido: "O valor da venda excede o limite disponível do cliente."
  };

  function erro(codigo, mensagem, status = 422) {
    return new ApiError({ status, codigo, mensagem });
  }

  function numero(valor, nome) {
    const n = Number(valor);

    if (
      valor === null ||
      valor === undefined ||
      valor === "" ||
      !Number.isFinite(n)
    ) {
      throw erro(
        "resposta_invalida",
        `Valor inválido para ${nome}.`,
        502
      );
    }

    return n;
  }

  function lista(dados, recurso) {
    if (!Array.isArray(dados)) {
      throw erro(
        "resposta_invalida",
        `Resposta inválida da API de ${recurso}.`,
        502
      );
    }

    return dados;
  }

  function normalizarCliente(c) {
    if (!c || c.id_cliente == null) {
      throw erro(
        "resposta_invalida",
        "Cliente inválido retornado pela API.",
        502
      );
    }

    return {
      id: c.id_cliente,
      nome: c.nome,
      cpf: apenasDigitos(c.cpf || ""),
      telefone: (
        Array.isArray(c.telefone)
          ? c.telefone
          : [c.telefone]
      ).filter(Boolean).map(apenasDigitos),
      endereco: c.endereco ?? null,
      limite_credito: numero(
        c.limite_credito,
        "limite_credito"
      ),
      credito_bloqueado: !!c.credito_bloqueado,
      ativo: c.ativo !== false,
      local: false
    };
  }

  async function listarClientes() {
    return lista(
      await request("/clientes"),
      "clientes"
    )
      .map(normalizarCliente)
      .filter(c => c.ativo);
  }

  async function obterCliente(id) {
    const resposta = await request(
      `/clientes/${encodeURIComponent(id)}`
    );

    return normalizarCliente(resposta);
  }

  function normalizarParcelaApi(p) {
    const saldo = numero(
      p.saldo_parcela ?? p.valor_parcela,
      "saldo_parcela"
    );

    return {
      id_parcela: p.id_parcela,
      id_venda: p.id_venda,
      numero: p.numero ?? 1,
      valor_parcela: numero(
        p.valor_parcela,
        "valor_parcela"
      ),
      saldo_parcela: saldo,
      devido: numero(
        p.valor_atualizado ?? saldo,
        "valor_atualizado"
      ),
      data_vencimento: p.data_vencimento ?? null,
      status: p.status,
      dias_atraso: p.dias_atraso ?? 0,
      origem: "api"
    };
  }

  async function obterParcelasAbertas(cliente) {
    const dados = lista(
      await request(
        `/clientes/${encodeURIComponent(cliente.id)}/parcelas`
      ),
      "parcelas"
    );

    const todas = dados.map(normalizarParcelaApi);
    const quantidades = {};

    for (const p of todas) {
      quantidades[p.id_venda] = Math.max(
        quantidades[p.id_venda] || 0,
        p.numero
      );
    }

    return todas
      .filter(p => p.status !== "pago" && p.devido > 0)
      .map(p => ({
        ...p,
        total_parcelas: quantidades[p.id_venda] || 1
      }));
  }

  async function obterResumo(cliente) {
    const r = await request(
      `/clientes/${encodeURIComponent(cliente.id)}/saldo`
    );

    return {
      ...r,
      saldo_devedor: numero(
        r.saldo_devedor,
        "saldo_devedor"
      ),
      limite_credito: numero(
        r.limite_credito,
        "limite_credito"
      ),
      limite_disponivel: numero(
        r.limite_disponivel,
        "limite_disponivel"
      ),
      origem: "api"
    };
  }

  async function obterResumos(clientes) {
    const resultados = await Promise.allSettled(
      clientes.map(c => obterResumo(c))
    );

    const mapa = new Map();

    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        mapa.set(clientes[i].id, r.value);
      } else {
        console.error(
          `Falha ao consultar saldo do cliente ${clientes[i].id}:`,
          r.reason
        );
      }
    });

    return mapa;
  }

  async function obterHistorico(cliente) {
    const dados = lista(
      await request(
        `/clientes/${encodeURIComponent(cliente.id)}/historico`
      ),
      "histórico"
    );

    return dados.map(h => ({
      tipo: h.tipo,
      id: h.id,
      data: h.data,
      valor: numero(
        h.valor,
        "valor do histórico"
      ),
      situacao: h.situacao ?? null
    }));
  }

  async function registrarPagamento(
    cliente,
    parcela,
    valor,
    forma
  ) {
    if (parcela.origem !== "api") {
      throw erro(
        "parcela_nao_persistida",
        "A parcela precisa existir no PostgreSQL para receber pagamentos."
      );
    }

    const recebido = arredondar(valor);

    if (
      !Number.isFinite(recebido) ||
      recebido <= 0
    ) {
      throw erro(
        "valor_invalido",
        "Informe um pagamento maior que zero."
      );
    }

    const formas = [
      "dinheiro",
      "pix",
      "cartao_credito",
      "cartao_debito",
      "outro"
    ];

    if (
      forma != null &&
      forma !== "" &&
      !formas.includes(forma)
    ) {
      throw erro(
        "forma_pagamento_invalida",
        "A forma de pagamento informada é inválida."
      );
    }

    return request("/pagamentos", {
      method: "POST",
      body: {
        id_parcela: parcela.id_parcela,
        valor_recebido: recebido,
        ...(forma ? { forma_pagamento: forma } : {})
      }
    });
  }

  async function alterarLimite(
    cliente,
    valor,
    motivo = ""
  ) {
    const novo = arredondar(valor);

    if (
      !Number.isFinite(novo) ||
      novo < 0
    ) {
      throw erro(
        "limite_invalido",
        "O limite de crédito deve ser um número igual ou maior que zero."
      );
    }

    const justificativa = String(
      motivo || ""
    ).trim();

    if (justificativa.length > 200) {
      throw erro(
        "motivo_invalido",
        "O motivo deve ter no máximo 200 caracteres."
      );
    }

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}/limite`,
      {
        method: "PUT",
        body: {
          limite_credito: novo,
          motivo: justificativa
        }
      }
    );

    return novo;
  }

  function listarAlteracoesLimite() {
    return [];
  }

  async function listarExcecoes() {
    throw erro(
      "excecoes_nao_implementadas",
      "As rotas de exceções de crédito ainda não foram implementadas no backend.",
      501
    );
  }

  async function decidirExcecao() {
    throw erro(
      "excecoes_nao_implementadas",
      "Não é possível aprovar ou negar exceções sem registro no backend.",
      501
    );
  }

  function listarDecisoesExcecao() {
    return [];
  }

  async function cadastrarCliente({
    nome,
    cpf,
    telefone,
    limite,
    endereco
  }) {
    const resposta = await request("/clientes", {
      method: "POST",
      body: {
        nome: nome.trim(),
        cpf: apenasDigitos(cpf),
        telefone: [apenasDigitos(telefone)],
        ...(endereco ? { endereco } : {})
      }
    });

    const cliente = normalizarCliente(resposta);

    if (
      limite != null &&
      Number(limite) > 0
    ) {
      await alterarLimite(cliente, limite);
    }

    return cliente;
  }

  async function editarCliente(
    cliente,
    {
      nome,
      cpf,
      telefone,
      limite,
      endereco
    }
  ) {
    await request(
      `/clientes/${encodeURIComponent(cliente.id)}`,
      {
        method: "PUT",
        body: {
          nome: nome.trim(),
          cpf: apenasDigitos(cpf),
          telefone: [apenasDigitos(telefone)],
          ...(endereco ? { endereco } : {})
        }
      }
    );

    if (
      limite != null &&
      arredondar(limite) !==
      arredondar(cliente.limite_credito)
    ) {
      await alterarLimite(
        cliente,
        limite
      );
    }
  }

  async function excluirCliente(cliente) {
    const resumo = await obterResumo(cliente);

    if (resumo.saldo_devedor > 0) {
      throw erro(
        "cliente_com_saldo",
        `${cliente.nome} possui ${FC.format.moeda(resumo.saldo_devedor)} em aberto. Quite as parcelas antes de excluir o cliente.`
      );
    }

    return request(
      `/clientes/${encodeURIComponent(cliente.id)}`,
      {
        method: "DELETE"
      }
    );
  }

  function somarMeses(iso, n) {
    const [anoInicial, mesInicial, dia] =
      iso.split("-").map(Number);

    const total = mesInicial - 1 + n;
    const ano = anoInicial + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;

    const ultimo = new Date(
      ano,
      mes + 1,
      0
    ).getDate();

    const dois = x =>
      String(x).padStart(2, "0");

    return `${ano}-${dois(mes + 1)}-${dois(
      Math.min(dia, ultimo)
    )}`;
  }

  function lerItensTemporarios() {
    try {
      const dados = JSON.parse(
        localStorage.getItem(CHAVE_ITENS) || "{}"
      );

      return dados &&
        typeof dados === "object" &&
        !Array.isArray(dados)
        ? dados
        : {};
    } catch {
      return {};
    }
  }

  function guardarItensTemporarios(
    id,
    venda
  ) {
    const dados = lerItensTemporarios();

    dados[String(id)] = {
      itens: venda.itens || [],
      valor_total: arredondar(venda.total),
      data: hojeISO()
    };

    try {
      localStorage.setItem(
        CHAVE_ITENS,
        JSON.stringify(dados)
      );
    } catch {
      throw erro(
        "itens_nao_armazenados",
        "A venda foi registrada no backend, mas não foi possível guardar seus itens temporários neste navegador.",
        507
      );
    }
  }

  function FC_CONFIG_ITENS_PERSISTIDOS() {
    return window.FC_CONFIG?.ITENS_VENDA_PERSISTIDOS === true;
  }

  async function registrarVenda(
    cliente,
    venda
  ) {
    const total = arredondar(venda.total);

    const parcelas =
      venda.modalidade === "fiado"
        ? 1
        : venda.parcelas;

    const body = {
      id_cliente: cliente.id,
      modalidade: venda.modalidade,
      valor_total: total,
      data_primeiro_vencimento: venda.primeiroVencimento,
      quantidade_parcelas: parcelas,
      ...(FC_CONFIG_ITENS_PERSISTIDOS()
        ? { itens: venda.itens || [] }
        : {})
    };

    let resposta;

    try {
      resposta = await request("/vendas", {
        method: "POST",
        body
      });
    } catch (e) {
      const motivo = e.dados?.motivo;

      if (
        e.status === 422 &&
        motivo
      ) {
        throw new ApiError({
          status: 422,
          codigo: motivo,
          mensagem:
            MOTIVOS_VENDA[motivo] ||
            "Venda rejeitada pelo sistema.",
          dados: e.dados
        });
      }

      throw e;
    }

    if (
      resposta.status === "aprovada" ||
      !resposta.status
    ) {
      if (
        Array.isArray(venda.itens) &&
        venda.itens.length
      ) {
        if (!FC_CONFIG_ITENS_PERSISTIDOS()) {
          try {
            guardarItensTemporarios(
              resposta.id_venda,
              venda
            );
          } catch (e) {
            console.warn(e.mensagem);
          }
        }
      }
    }

    return {
      id_venda: resposta.id_venda,
      numero: resposta.id_venda,
      status: resposta.status || "aprovada",
      parcelas: resposta.parcelas || []
    };
  }

  async function registrarBaixa(
    cliente,
    parcelas,
    valor,
    forma
  ) {
    const total = arredondar(valor);

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      throw erro(
        "valor_invalido",
        "Informe um valor maior que zero."
      );
    }

    const ordenadas = [...parcelas].sort(
      (a, b) =>
        String(a.data_vencimento || "")
          .localeCompare(
            String(b.data_vencimento || "")
          ) ||
        a.numero - b.numero
    );

    const capacidade = arredondar(
      ordenadas.reduce(
        (s, p) => s + p.devido,
        0
      )
    );

    if (total > capacidade) {
      throw erro(
        "valor_excede_devido",
        "O valor informado excede a soma das parcelas selecionadas."
      );
    }

    let restante = total;
    const feitos = [];

    for (const parcela of ordenadas) {
      if (restante <= 0) break;

      const parte = arredondar(
        Math.min(
          restante,
          parcela.devido
        )
      );

      if (parte <= 0) continue;

      try {
        const resposta =
          await registrarPagamento(
            cliente,
            parcela,
            parte,
            forma
          );

        feitos.push({
          parcela,
          valor: parte,
          resposta
        });

        restante = arredondar(
          restante - parte
        );
      } catch (e) {
        e.concluidos = feitos;
        throw e;
      }
    }

    return {
      pagamentos: feitos
    };
  }

  function avisoLocal() {
    return FC_CONFIG_ITENS_PERSISTIDOS()
      ? ""
      : "Os itens das vendas ainda não são persistidos no PostgreSQL. Os detalhes ficam disponíveis somente neste navegador até a integração do banco.";
  }

  async function itensDaVenda(idVenda) {
    const id = String(idVenda);

    if (FC_CONFIG_ITENS_PERSISTIDOS()) {
      return request(
        `/vendas/${encodeURIComponent(id)}/itens`
      );
    }

    const atual = lerItensTemporarios()[id];

    if (atual) return atual;

    try {
      const antigo = JSON.parse(
        localStorage.getItem(CHAVE_ANTIGA) || "{}"
      );

      const venda = Array.isArray(antigo.vendas)
        ? antigo.vendas.find(
            v => String(v.id_venda) === id
          )
        : null;

      return venda
        ? {
            itens: venda.itens || [],
            valor_total: venda.valor_total,
            data: venda.data
          }
        : null;
    } catch {
      return null;
    }
  }

  FC.clientes = {
    itensDaVenda,
    listarClientes,
    obterCliente,
    obterResumo,
    obterResumos,
    obterHistorico,
    obterParcelasAbertas,
    registrarPagamento,
    alterarLimite,
    cadastrarCliente,
    avisoLocal,
    editarCliente,
    excluirCliente,
    registrarVenda,
    registrarBaixa,
    somarMeses,
    listarAlteracoesLimite,
    listarExcecoes,
    decidirExcecao,
    listarDecisoesExcecao,
    MOTIVOS_EXCECAO
  };
})();
