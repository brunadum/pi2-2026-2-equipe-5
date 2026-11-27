(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;
  const { apenasDigitos, arredondar } = FC.format;

  let cacheVendas = null;

  function validarCliente(cliente) {
    if (
      !cliente ||
      cliente.id == null ||
      cliente.local ||
      String(cliente.id).startsWith("L")
    ) {
      throw new ApiError({
        status: 422,
        codigo: "cliente_invalido",
        mensagem: "O cliente precisa estar cadastrado no banco de dados.",
      });
    }
  }

  function validarLista(dados, mensagem) {
    if (!Array.isArray(dados)) {
      throw new Error(mensagem);
    }

    return dados;
  }

  // Clientes

  function normalizarCliente(c) {
    const telefones = (
      Array.isArray(c.telefone)
        ? c.telefone
        : [c.telefone]
    )
      .filter(Boolean)
      .map(apenasDigitos);

    return {
      id: c.id_cliente,
      nome: c.nome,
      cpf: apenasDigitos(c.cpf),
      telefone: telefones,
      endereco: c.endereco ?? null,
      limite_credito: Number(c.limite_credito) || 0,
      credito_bloqueado: !!c.credito_bloqueado,
      ativo: c.ativo !== false,
      local: false,
    };
  }

  async function listarClientes() {
    const dados = await request("/clientes");

    return validarLista(
      dados,
      "Resposta inválida da API de clientes."
    )
      .map(normalizarCliente)
      .filter((c) => c.ativo);
  }

  async function obterCliente(id) {
    validarCliente({ id });

    const dados = await request(
      `/clientes/${encodeURIComponent(id)}`
    );

    return normalizarCliente(dados);
  }

  async function cadastrarCliente({
    nome,
    cpf,
    telefone,
    limite,
    endereco,
  }) {
    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);

    await request("/clientes", {
      method: "POST",
      body: {
        nome: nome.trim(),
        cpf: cpfDigitos,
        telefone: [telDigitos],
        ...(endereco ? { endereco } : {}),
      },
    });

    const criado = (await listarClientes()).find(
      (c) => c.cpf === cpfDigitos
    );

    if (!criado) {
      throw new Error(
        "Não foi possível confirmar o cadastro do cliente."
      );
    }

    if (limite > 0) {
      await alterarLimite(criado, limite);
      return obterCliente(criado.id);
    }

    return criado;
  }

  async function editarCliente(
    cliente,
    { nome, cpf, telefone, limite, endereco }
  ) {
    validarCliente(cliente);

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}`,
      {
        method: "PUT",
        body: {
          nome: nome.trim(),
          cpf: apenasDigitos(cpf),
          telefone: [apenasDigitos(telefone)],
          ...(endereco ? { endereco } : {}),
        },
      }
    );

    if (
      limite != null &&
      arredondar(limite) !==
        arredondar(cliente.limite_credito)
    ) {
      await alterarLimite(cliente, limite);
    }
  }

  async function excluirCliente(cliente) {
    validarCliente(cliente);

    const resumo = await obterResumo(cliente);

    if (resumo.saldo_devedor > 0) {
      throw new ApiError({
        status: 422,
        codigo: "cliente_com_saldo",
        mensagem:
          `${cliente.nome} possui ` +
          `${FC.format.moeda(resumo.saldo_devedor)} ` +
          "em aberto. Quite as parcelas antes de excluir o cliente.",
      });
    }

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}`,
      {
        method: "DELETE",
      }
    );

    cacheVendas = null;
  }

  // Consulta de vendas

  function obterVendas() {
    if (
      !cacheVendas ||
      Date.now() - cacheVendas.t > 15000
    ) {
      const consulta = {
        t: Date.now(),

        p: request("/vendas").then((dados) =>
          validarLista(
            dados,
            "Resposta inválida da API de vendas."
          )
        ),
      };

      cacheVendas = consulta;

      consulta.p.catch(() => {
        if (cacheVendas === consulta) {
          cacheVendas = null;
        }
      });
    }

    return cacheVendas.p;
  }

  // Parcelas

  function normalizarParcelaApi(p) {
    const saldo =
      Number(p.saldo_parcela ?? p.valor_parcela) || 0;

    return {
      id_parcela: p.id_parcela,
      id_venda: p.id_venda,
      numero: p.numero ?? 1,
      valor_parcela: Number(p.valor_parcela) || 0,
      saldo_parcela: saldo,
      devido: Number(p.valor_atualizado ?? saldo) || 0,
      data_vencimento: p.data_vencimento ?? null,
      status: p.status,
      dias_atraso: p.dias_atraso ?? 0,
      total_parcelas: p.total_parcelas ?? null,
      origem: "api",
    };
  }

  async function obterParcelasAbertas(cliente) {
    validarCliente(cliente);

    const dados = await request(
      `/clientes/${encodeURIComponent(cliente.id)}/parcelas`
    );

    const todas = validarLista(
      dados,
      "Resposta inválida da API de parcelas."
    ).map(normalizarParcelaApi);

    const quantidade = {};

    todas.forEach((p) => {
      quantidade[p.id_venda] = Math.max(
        quantidade[p.id_venda] || 0,
        p.numero,
        p.total_parcelas || 0
      );
    });

    return todas
      .filter(
        (p) =>
          p.status !== "pago" &&
          p.saldo_parcela > 0
      )
      .map((p) => ({
        ...p,
        total_parcelas: quantidade[p.id_venda] || 1,
      }));
  }

  // Saldo e limite de crédito

  async function obterResumo(cliente) {
    validarCliente(cliente);

    const r = await request(
      `/clientes/${encodeURIComponent(cliente.id)}/saldo`
    );

    if (
      !r ||
      r.saldo_devedor == null ||
      r.limite_credito == null ||
      r.limite_disponivel == null ||
      !Number.isFinite(Number(r.saldo_devedor)) ||
      !Number.isFinite(Number(r.limite_credito)) ||
      !Number.isFinite(Number(r.limite_disponivel))
    ) {
      throw new Error(
        "Resposta inválida da API de saldo."
      );
    }

    return {
      ...r,
      saldo_devedor: Number(r.saldo_devedor),
      limite_credito: Number(r.limite_credito),
      limite_disponivel: Number(r.limite_disponivel),
      origem: "api",
    };
  }

  async function obterResumos(clientes) {
    const mapa = new Map();

    await Promise.all(
      clientes.map(async (cliente) => {
        const resumo = await obterResumo(cliente);

        mapa.set(cliente.id, resumo);
      })
    );

    return mapa;
  }

  async function alterarLimite(
    cliente,
    valor,
    motivo,
    { autorizacao } = {}
  ) {
    validarCliente(cliente);

    valor = arredondar(valor);

    if (!Number.isFinite(valor) || valor < 0) {
      throw new ApiError({
        status: 422,
        codigo: "limite_invalido",
        mensagem:
          "O limite de crédito deve ser zero ou maior.",
      });
    }

    if (motivo != null) {
      motivo = String(motivo).trim();

      if (motivo.length > 200) {
        throw new ApiError({
          status: 400,
          codigo: "motivo_invalido",
          mensagem:
            "O motivo deve possuir até 200 caracteres.",
        });
      }
    }

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}/limite`,
      {
        method: "PUT",

        body: {
          limite_credito: valor,
          ...(motivo ? { motivo } : {}),
        },

        headers: autorizacao
          ? {
              "X-Autorizacao-Gerente": autorizacao,
            }
          : undefined,
      }
    );

    return valor;
  }

  // Histórico de alterações de limite pela auditoria

  async function listarAlteracoesLimite(cliente) {
    validarCliente(cliente);

    const dados = await request(
      "/auditoria?operacao=alteracao_limite&limite=500"
    );

    return validarLista(
      dados,
      "Resposta inválida da API de auditoria."
    )
      .filter(
        (a) =>
          String(a.id_auditoria).startsWith("c") &&
          String(a.id_recurso) === String(cliente.id)
      )
      .map((a) => ({
        id: a.id_auditoria,
        id_cliente: a.id_recurso,
        data: a.data_hora,
        de: Number(a.valores_anteriores?.limite_credito),
        para: Number(a.valores_novos?.limite_credito),
        motivo: a.motivo || "",
        id_usuario: a.id_usuario,
        nome_usuario: a.nome_usuario,
      }));
  }

  // Histórico do cliente

  async function obterHistorico(cliente) {
    validarCliente(cliente);

    const dados = await request(
      `/clientes/${encodeURIComponent(cliente.id)}/historico`
    );

    return validarLista(
      dados,
      "Resposta inválida da API de histórico."
    ).map((h) => ({
      ...h,
      tipo: h.tipo,
      id: h.id,
      data: h.data,
      valor: Number(h.valor) || 0,
      situacao: h.situacao ?? null,
    }));
  }

  // Pagamentos

  async function registrarPagamento(
    cliente,
    parcela,
    valor
  ) {
    validarCliente(cliente);

    valor = arredondar(valor);

    if (
      !parcela ||
      parcela.origem !== "api" ||
      parcela.id_parcela == null
    ) {
      throw new ApiError({
        status: 422,
        codigo: "parcela_invalida",
        mensagem:
          "A parcela precisa estar registrada no banco de dados.",
      });
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ApiError({
        status: 422,
        codigo: "valor_invalido",
        mensagem:
          "O valor do pagamento deve ser maior que zero.",
      });
    }

    const devido = Number(
      parcela.devido ?? parcela.saldo_parcela
    );

    if (
      !Number.isFinite(devido) ||
      valor > devido + 0.001
    ) {
      throw new ApiError({
        status: 422,
        codigo: "valor_excede_devido",
        mensagem:
          "O valor do pagamento excede o valor devido da parcela.",
      });
    }

    const resposta = await request("/pagamentos", {
      method: "POST",
      body: {
        id_parcela: parcela.id_parcela,
        valor_recebido: valor,
      },
    });

    cacheVendas = null;

    return resposta;
  }

  async function registrarBaixa(
    cliente,
    parcelas,
    valor,
    forma
  ) {
    validarCliente(cliente);

    valor = arredondar(valor);

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ApiError({
        status: 422,
        codigo: "valor_invalido",
        mensagem:
          "Informe um valor de pagamento válido.",
      });
    }

    const ordenadas = [...parcelas].sort(
      (a, b) =>
        String(a.data_vencimento || "").localeCompare(
          String(b.data_vencimento || "")
        ) ||
        a.numero - b.numero
    );

    const totalDevido = arredondar(
      ordenadas.reduce(
        (total, parcela) =>
          total + Number(parcela.devido),
        0
      )
    );

    if (
      !Number.isFinite(totalDevido) ||
      valor > totalDevido + 0.001
    ) {
      throw new ApiError({
        status: 422,
        codigo: "valor_excede_devido",
        mensagem:
          "O pagamento excede o total devido das parcelas.",
      });
    }

    let restante = valor;
    const feitos = [];

    for (const parcela of ordenadas) {
      if (restante <= 0) break;

      const parte = arredondar(
        Math.min(restante, parcela.devido)
      );

      if (parte <= 0) continue;

      try {
        const resposta = await registrarPagamento(
          cliente,
          parcela,
          parte
        );

        feitos.push({
          parcela,
          valor: parte,
          resposta,
        });

        restante = arredondar(restante - parte);

      } catch (e) {
        e.concluidos = feitos;
        throw e;
      }
    }

    return {
      pagamentos: feitos,
      restante,
    };
  }

  // Exceções de crédito

  const MOTIVOS_EXCECAO = {
    limite_credito_excedido: "Limite excedido",
    parcelas_em_atraso: "Parcela atrasada",
  };

  function normalizarExcecao(e, vendaPorId) {
    const venda =
      vendaPorId.get(String(e.id_venda)) || {};

    return {
      id: e.id_excecao ?? `v${e.id_venda}`,
      id_venda: e.id_venda,

      id_cliente:
        e.id_cliente ?? venda.id_cliente ?? null,

      nome:
        e.nome_cliente ??
        venda.nome_cliente ??
        "Cliente",

      valor:
        Number(
          e.valor_total ?? venda.valor_total
        ) || 0,

      motivo:
        e.motivo ?? venda.motivo_rejeicao ?? null,

      data:
        e.data_solicitacao ?? venda.data_venda ?? null,

      origem: "api",
    };
  }

  async function listarExcecoes() {
    const [vendas, dados] = await Promise.all([
      obterVendas(),
      request("/excecoes?status=pendente"),
    ]);

    const vendaPorId = new Map(
      vendas.map((v) => [
        String(v.id_venda),
        v,
      ])
    );

    return validarLista(
      dados,
      "Resposta inválida da API de exceções."
    ).map((e) =>
      normalizarExcecao(e, vendaPorId)
    );
  }

  async function decidirExcecao(excecao, decisao) {
    if (
      !excecao ||
      excecao.origem === "local" ||
      excecao.id == null
    ) {
      throw new ApiError({
        status: 422,
        codigo: "excecao_invalida",
        mensagem:
          "A exceção precisa estar registrada no banco de dados.",
      });
    }

    if (!["aprovar", "negar"].includes(decisao)) {
      throw new ApiError({
        status: 422,
        codigo: "decisao_invalida",
        mensagem:
          "Decisão de exceção inválida.",
      });
    }

    const resposta = await request(
      `/excecoes/${encodeURIComponent(excecao.id)}/${decisao}`,
      {
        method: "PUT",
      }
    );

    cacheVendas = null;

    return {
      decisao,
      local: false,
      resposta,
    };
  }

  function listarDecisoesExcecao() {
    return [];
  }

  // Vencimentos

  function somarMeses(iso, n) {
    const [a, m, d] = iso.split("-").map(Number);

    const total = m - 1 + n;
    const ano = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;

    const ultimo = new Date(
      ano,
      mes + 1,
      0
    ).getDate();

    const p = (x) =>
      String(x).padStart(2, "0");

    return `${ano}-${p(mes + 1)}-${p(
      Math.min(d, ultimo)
    )}`;
  }

  const MOTIVOS_VENDA = {
    credito_bloqueado:
      "O crédito deste cliente está bloqueado.",

    parcelas_em_atraso:
      "O cliente possui parcelas em atraso.",

    limite_credito_excedido:
      "O valor da venda excede o limite disponível do cliente.",
  };

  // Registro de vendas

  async function registrarVenda(cliente, venda) {
    validarCliente(cliente);

    const total = arredondar(venda.total);

    const parcelas =
      venda.modalidade === "fiado"
        ? 1
        : venda.parcelas;

    if (!Number.isFinite(total) || total <= 0) {
      throw new ApiError({
        status: 400,
        codigo: "valor_venda_invalido",
        mensagem:
          "O valor total da venda deve ser maior que zero.",
      });
    }

    if (
      !Array.isArray(venda.itens) ||
      venda.itens.length === 0
    ) {
      throw new ApiError({
        status: 400,
        codigo: "venda_sem_itens",
        mensagem:
          "Adicione pelo menos um produto à venda.",
      });
    }

    const itens = venda.itens.map((item) => ({
      nome_produto:
        item.nome_produto ?? item.nome,

      quantidade:
        Number(item.quantidade ?? item.qtd),

      preco_unitario:
        Number(item.preco_unitario ?? item.preco),
    }));

    for (const item of itens) {
      if (
        typeof item.nome_produto !== "string" ||
        !item.nome_produto.trim() ||
        !Number.isInteger(item.quantidade) ||
        item.quantidade <= 0 ||
        !Number.isFinite(item.preco_unitario) ||
        item.preco_unitario <= 0
      ) {
        throw new ApiError({
          status: 400,
          codigo: "produto_invalido",
          mensagem:
            "Existe um produto com informações inválidas.",
        });
      }
    }

    let resposta;

    try {
      resposta = await request("/vendas", {
        method: "POST",

        body: {
          id_cliente: cliente.id,
          modalidade: venda.modalidade,
          valor_total: total,

          data_primeiro_vencimento:
            venda.primeiroVencimento,

          quantidade_parcelas: parcelas,
          itens,
        },
      });

    } catch (e) {
      cacheVendas = null;

      const motivo = e.dados?.motivo;

      if (e.status === 422 && motivo) {
        throw new ApiError({
          status: 422,
          codigo: motivo,

          mensagem:
            MOTIVOS_VENDA[motivo] ||
            "Venda rejeitada pelo sistema.",

          dados: e.dados,
        });
      }

      throw e;
    }

    cacheVendas = null;

    return {
      id_venda: resposta.id_venda,
      numero: resposta.id_venda,
      status: resposta.status || "aprovada",
      itens: resposta.itens || [],
      parcelas: resposta.parcelas || [],
    };
  }

  async function itensDaVenda(idVenda) {
    const vendas = await obterVendas();

    const v = vendas.find(
      (x) => String(x.id_venda) === String(idVenda)
    );

    if (!v) return null;

    const itens = (v.itens || []).map((item) => ({
      nome: item.nome_produto,
      qtd: Number(item.quantidade),
      preco: Number(item.preco_unitario),
      subtotal: Number(item.subtotal),
    }));

    return {
      itens,
      valor_total: Number(v.valor_total),
      data: v.data_venda,
    };
  }

  function avisoLocal() {
    return "";
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
    MOTIVOS_EXCECAO,
  };
})();