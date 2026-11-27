(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;
  const { apenasDigitos, arredondar, hojeISO } = FC.format;

  const CHAVE_STORE = "fiadoControl.local.v1";
  const usoLocal = new Set();
  const CHAVE_ROTAS = "fiadoControl.rotasIndisponiveis";
  const VALIDADE_MS = 2 * 60 * 1000;

  const indisponivel = new Proxy(
    {},
    {
      get(_, rota) {
        try {
          const t = Number(
            JSON.parse(
              sessionStorage.getItem(CHAVE_ROTAS) || "{}"
            )[rota],
          );

          return Number.isFinite(t) &&
            Date.now() - t < VALIDADE_MS;
        } catch {
          return false;
        }
      },

      set(_, rota, valor) {
        try {
          const mapa = JSON.parse(
            sessionStorage.getItem(CHAVE_ROTAS) || "{}"
          );

          if (valor) mapa[rota] = Date.now();
          else delete mapa[rota];

          sessionStorage.setItem(
            CHAVE_ROTAS,
            JSON.stringify(mapa)
          );
        } catch {}

        return true;
      },
    },
  );

  const ROTULOS_LOCAIS = {
    cadastro: "novos clientes",
    saldo: "valores em aberto",
    parcelas: "parcelas",
    historico: "histórico",
    limite: "alterações de limite",
    pagamento: "pagamentos",
    edicao: "edições de clientes",
    exclusao: "exclusões de clientes",
    venda: "vendas",
    excecao: "aprovações e recusas de exceção",
  };

  // ------------------------------------------------------------
  // ARMAZENAMENTO LOCAL
  // ------------------------------------------------------------

  function lerStore() {
    try {
      const s = JSON.parse(
        localStorage.getItem(CHAVE_STORE) || "{}"
      );

      return {
        clientes: s.clientes || [],
        limites: s.limites || {},
        pagamentos: s.pagamentos || [],
        seq: s.seq || 0,
        edicoes: s.edicoes || {},
        excluidos: s.excluidos || [],
        vendas: s.vendas || [],
        excecoes: s.excecoes || {},
        alteracoesLimite: s.alteracoesLimite || [],
      };
    } catch {
      return {
        clientes: [],
        limites: {},
        pagamentos: [],
        seq: 0,
        edicoes: {},
        excluidos: [],
        vendas: [],
        excecoes: {},
        alteracoesLimite: [],
      };
    }
  }

  function salvarStore(store) {
    try {
      localStorage.setItem(
        CHAVE_STORE,
        JSON.stringify(store)
      );
    } catch {}
  }

  const ehLocal = (id) => String(id).startsWith("L");

  const naoEncontrado = () =>
    new ApiError({
      status: 404,
      codigo: "cliente_nao_encontrado",
      mensagem: "Cliente não encontrado.",
    });

  // ------------------------------------------------------------
  // NORMALIZAÇÃO DOS CLIENTES
  // ------------------------------------------------------------

  function normalizarCliente(c, store) {
    const ed = store.edicoes[c.id_cliente] || {};

    const telefones = (
      Array.isArray(c.telefone)
        ? c.telefone
        : [c.telefone]
    )
      .filter(Boolean)
      .map(apenasDigitos);

    return {
      id: c.id_cliente,
      nome: ed.nome ?? c.nome,
      cpf: apenasDigitos(ed.cpf ?? c.cpf),
      telefone: ed.telefone
        ? [apenasDigitos(ed.telefone)]
        : telefones,
      endereco: ed.endereco ?? c.endereco ?? null,
      limite_credito: Number(c.limite_credito) || 0,
      credito_bloqueado: !!c.credito_bloqueado,
      ativo: c.ativo !== false,
      local: false,
    };
  }

  // ------------------------------------------------------------
  // LISTAGEM DE CLIENTES
  // ------------------------------------------------------------

  async function listarClientes() {
    const dados = await request("/clientes");

    if (!Array.isArray(dados)) {
      throw new Error(
        "Resposta inválida da API de clientes"
      );
    }

    return dados
      .map((c) => ({
        id: c.id_cliente,
        nome: c.nome,
        cpf: apenasDigitos(c.cpf),

        telefone: (
          Array.isArray(c.telefone)
            ? c.telefone
            : [c.telefone]
        )
          .filter(Boolean)
          .map(apenasDigitos),

        endereco: c.endereco ?? null,
        limite_credito: Number(c.limite_credito) || 0,
        credito_bloqueado: !!c.credito_bloqueado,
        ativo: c.ativo !== false,
        local: false,
      }))
      .filter((c) => c.ativo);
  }

  // ------------------------------------------------------------
  // CONSULTA INDIVIDUAL DO CLIENTE
  // ------------------------------------------------------------

  async function obterCliente(id) {
    const store = lerStore();

    if (ehLocal(id)) {
      const c = store.clientes.find((x) => x.id === id);

      if (!c) throw naoEncontrado();

      return { ...c, local: true };
    }

    if (!indisponivel.detalhe) {
      try {
        return normalizarCliente(
          await request(
            `/clientes/${encodeURIComponent(id)}`
          ),
          store,
        );
      } catch (e) {
        if (!e.naoImplementado) throw e;

        indisponivel.detalhe = true;
      }
    }

    const cliente = (await listarClientes()).find(
      (c) => String(c.id) === String(id),
    );

    if (!cliente) throw naoEncontrado();

    return cliente;
  }

  // ------------------------------------------------------------
  // CONSULTA DE VENDAS
  // ------------------------------------------------------------

  let cacheVendas = null;

  function obterVendas() {
    if (
      !cacheVendas ||
      Date.now() - cacheVendas.t > 15000
    ) {
      cacheVendas = {
        t: Date.now(),
        p: request("/vendas"),
      };

      cacheVendas.p.catch(() => {
        cacheVendas = null;
      });
    }

    return cacheVendas.p;
  }

  // ------------------------------------------------------------
  // PARCELAS LOCAIS
  // ------------------------------------------------------------

  async function parcelasLocais(cliente) {
    const store = lerStore();

    if (cliente.local) {
      const lista = [];

      for (
        const v of store.vendas.filter(
          (x) => x.id_cliente === cliente.id
        )
      ) {
        for (const p of v.parcelas) {
          const pago = store.pagamentos
            .filter((x) => x.ref === p.id_parcela)
            .reduce((t, x) => t + x.valor, 0);

          const saldo = Math.max(
            0,
            arredondar(p.valor_parcela - pago)
          );

          lista.push({
            id_parcela: p.id_parcela,
            id_venda: v.id_venda,
            numero: p.numero,
            valor_parcela: p.valor_parcela,
            saldo_parcela: saldo,
            devido: saldo,
            data_vencimento: p.data_vencimento,
            total_parcelas: v.parcelas.length,
            status: saldo > 0 ? "pendente" : "pago",
            dias_atraso: 0,
            origem: "local",
          });
        }
      }

      return lista;
    }

    const vendas = (await obterVendas()).filter(
      (v) =>
        v.id_cliente === cliente.id &&
        v.status === "aprovada",
    );

    return vendas.map((v) => {
      const id = `v${v.id_venda}`;

      const pago = store.pagamentos
        .filter((p) => p.ref === id)
        .reduce((s, p) => s + p.valor, 0);

      const saldo = Math.max(
        0,
        arredondar(v.valor_total - pago)
      );

      return {
        id_parcela: id,
        id_venda: v.id_venda,
        numero: 1,
        total_parcelas: 1,
        valor_parcela: v.valor_total,
        saldo_parcela: saldo,
        devido: saldo,
        data_vencimento: null,
        status: saldo > 0 ? "pendente" : "pago",
        origem: "local",
      };
    });
  }

  // ------------------------------------------------------------
  // NORMALIZAÇÃO DAS PARCELAS DA API
  // ------------------------------------------------------------

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
      origem: "api",
    };
  }

  async function obterParcelasAbertas(cliente) {
    if (!cliente.local && !indisponivel.parcelas) {
      try {
        const dados = await request(
          `/clientes/${encodeURIComponent(cliente.id)}/parcelas`,
        );

        const todas = dados.map(normalizarParcelaApi);
        const quantidade = {};

        todas.forEach((p) => {
          quantidade[p.id_venda] = Math.max(
            quantidade[p.id_venda] || 0,
            p.numero,
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
            total_parcelas:
              quantidade[p.id_venda] || 1,
          }));
      } catch (e) {
        if (!e.naoImplementado) throw e;

        indisponivel.parcelas = true;
      }
    }

    if (!cliente.local) {
      usoLocal.add("parcelas");
    }

    return (await parcelasLocais(cliente)).filter(
      (p) => p.saldo_parcela > 0
    );
  }

  // ------------------------------------------------------------
  // SALDO E LIMITE DISPONÍVEL
  // ------------------------------------------------------------

  async function obterResumo(cliente) {
    if (!cliente.local && !indisponivel.saldo) {
      try {
        const r = await request(
          `/clientes/${encodeURIComponent(cliente.id)}/saldo`,
        );

        return { ...r, origem: "api" };
      } catch (e) {
        if (!e.naoImplementado) throw e;

        indisponivel.saldo = true;
      }
    }

    if (!cliente.local) {
      usoLocal.add("saldo");
    }

    const saldo = arredondar(
      (await parcelasLocais(cliente)).reduce(
        (s, p) => s + p.saldo_parcela,
        0
      ),
    );

    return {
      id_cliente: cliente.id,
      saldo_devedor: saldo,
      limite_credito: cliente.limite_credito,

      limite_disponivel: Math.max(
        0,
        arredondar(cliente.limite_credito - saldo),
      ),

      possui_parcelas_atrasadas: false,
      credito_bloqueado: cliente.credito_bloqueado,
      origem: "local",
    };
  }

  async function obterResumos(clientes) {
    const mapa = new Map();

    const guardar = (cliente) =>
      obterResumo(cliente).then(
        (r) => mapa.set(cliente.id, r),
        () => {},
      );

    if (!clientes.length) return mapa;

    await guardar(clientes[0]);

    await Promise.all(
      clientes.slice(1).map(guardar)
    );

    return mapa;
  }

  // ------------------------------------------------------------
  // HISTÓRICO DO CLIENTE
  // ------------------------------------------------------------

  async function obterHistorico(cliente) {
    if (!cliente.local && !indisponivel.historico) {
      try {
        const dados = await request(
          `/clientes/${encodeURIComponent(cliente.id)}/historico`,
        );

        return dados.map((h) => ({
          tipo: h.tipo,
          id: h.id,
          data: h.data,
          valor: Number(h.valor) || 0,
          situacao: null,
        }));
      } catch (e) {
        if (!e.naoImplementado) throw e;

        indisponivel.historico = true;
      }
    }

    if (!cliente.local) {
      usoLocal.add("historico");
    }

    const store = lerStore();
    const itens = [];

    if (cliente.local) {
      for (
        const v of store.vendas.filter(
          (x) => x.id_cliente === cliente.id
        )
      ) {
        itens.push({
          tipo: "venda",
          id: v.id_venda,
          data: v.data,
          valor: v.valor_total,
          situacao: null,
        });
      }
    } else {
      const vendas = (await obterVendas()).filter(
        (v) =>
          v.id_cliente === cliente.id &&
          v.status !== "rejeitada",
      );

      for (const v of vendas) {
        itens.push({
          tipo: "venda",
          id: v.id_venda,
          data: v.data_venda,
          valor: v.valor_total,
          situacao:
            v.status === "aprovada"
              ? null
              : "pendente",
        });
      }
    }

    for (
      const p of store.pagamentos.filter(
        (x) => x.id_cliente === cliente.id
      )
    ) {
      itens.push({
        tipo: "pagamento",
        id: p.id,
        data: p.data,
        valor: p.valor,
        situacao: null,
      });
    }

    return itens.sort(
      (a, b) =>
        String(b.data).localeCompare(String(a.data)) ||
        b.id - a.id,
    );
  }

  // ------------------------------------------------------------
  // REGISTRO DE PAGAMENTOS
  // ------------------------------------------------------------

  async function registrarPagamento(
    cliente,
    parcela,
    valor
  ) {
    valor = arredondar(valor);

    if (parcela.origem === "api") {
      return request("/pagamentos", {
        method: "POST",

        body: {
          id_parcela: parcela.id_parcela,
          valor_recebido: valor,
        },
      });
    }

    usoLocal.add("pagamento");

    if (valor > parcela.saldo_parcela + 0.001) {
      throw new ApiError({
        status: 422,
        codigo: "valor_excede_devido",
        mensagem:
          "O valor do pagamento excede o valor devido da parcela",
      });
    }

    const store = lerStore();
    const id = ++store.seq;

    store.pagamentos.push({
      id,
      id_cliente: cliente.id,
      ref: parcela.id_parcela,
      valor,
      data: hojeISO(),
    });

    salvarStore(store);

    const saldoParcela = arredondar(
      parcela.saldo_parcela - valor
    );

    return {
      id_pagamento: id,
      id_parcela: parcela.id_parcela,
      valor_recebido: valor,
      data_pagamento: hojeISO(),
      status_parcela:
        saldoParcela <= 0 ? "pago" : "parcial",
      saldo_parcela: saldoParcela,
    };
  }

  // ------------------------------------------------------------
  // ALTERAÇÃO DE LIMITE DE CRÉDITO
  // ------------------------------------------------------------

  async function alterarLimite(
    cliente,
    valor,
    motivo,
    { autorizacao } = {}
  ) {
    valor = arredondar(valor);

    const limiteAnterior = arredondar(
      cliente.limite_credito || 0
    );

    if (!(valor >= 0)) {
      throw new ApiError({
        status: 422,
        codigo: "limite_invalido",
        mensagem:
          "O limite de crédito deve ser zero ou maior.",
      });
    }

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}/limite`,
      {
        method: "PUT",

        body: {
          limite_credito: valor,
        },

        headers: autorizacao
          ? {
              "X-Autorizacao-Gerente": autorizacao,
            }
          : undefined,
      }
    );

    const store = lerStore();

    delete store.limites[cliente.id];

    if (motivo) {
      store.alteracoesLimite.unshift({
        id_cliente: cliente.id,
        data: new Date().toISOString(),
        de: limiteAnterior,
        para: valor,
        motivo,
      });

      store.alteracoesLimite =
        store.alteracoesLimite.slice(0, 200);
    }

    salvarStore(store);

    return valor;
  }

  function listarAlteracoesLimite(cliente) {
    return lerStore().alteracoesLimite.filter(
      (a) =>
        String(a.id_cliente) === String(cliente.id),
    );
  }

  // ------------------------------------------------------------
  // EXCEÇÕES DE CRÉDITO
  // ------------------------------------------------------------

  const JANELA_EXCECOES_DIAS = 30;

  const MOTIVOS_EXCECAO = {
    limite_credito_excedido: "Limite excedido",
    parcelas_em_atraso: "Parcela atrasada",
  };

  function normalizarExcecao(e, vendaPorId) {
    const venda = vendaPorId.get(e.id_venda) || {};

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
        Number(e.valor_total ?? venda.valor_total) || 0,

      motivo:
        e.motivo ?? venda.motivo_rejeicao ?? null,

      data:
        e.data_solicitacao ?? venda.data_venda ?? null,

      origem: e.origem || "api",
    };
  }

  async function listarExcecoes() {
    const vendas = await obterVendas();

    const vendaPorId = new Map(
      vendas.map((v) => [v.id_venda, v])
    );

    if (!indisponivel.excecoes) {
      try {
        const dados = await request(
          "/excecoes?status=pendente"
        );

        return dados.map(
          (e) => normalizarExcecao(e, vendaPorId)
        );
      } catch (e) {
        if (!e.naoImplementado) throw e;

        indisponivel.excecoes = true;
      }
    }

    usoLocal.add("excecao");

    const decididas = lerStore().excecoes;
    const corte = new Date();

    corte.setDate(
      corte.getDate() - JANELA_EXCECOES_DIAS
    );

    const limite = corte.toISOString().slice(0, 10);

    return vendas
      .filter(
        (v) =>
          v.status === "rejeitada" &&
          MOTIVOS_EXCECAO[v.motivo_rejeicao] &&
          String(v.data_venda || "").slice(0, 10) >= limite &&
          !decididas[v.id_venda],
      )
      .sort((a, b) => b.id_venda - a.id_venda)
      .map((v) =>
        normalizarExcecao(
          {
            id_venda: v.id_venda,
            origem: "local",
          },
          vendaPorId,
        ),
      );
  }

  async function decidirExcecao(excecao, decisao) {
    if (excecao.origem !== "local") {
      const resposta = await request(
        `/excecoes/${encodeURIComponent(excecao.id)}/${decisao}`,
        {
          method: "PUT",
        },
      );

      cacheVendas = null;

      return {
        decisao,
        local: false,
        resposta,
      };
    }

    usoLocal.add("excecao");

    const store = lerStore();

    store.excecoes[excecao.id_venda] = {
      decisao:
        decisao === "aprovar"
          ? "aprovada"
          : "negada",

      data: new Date().toISOString(),
    };

    salvarStore(store);

    return {
      decisao,
      local: true,
    };
  }

  function listarDecisoesExcecao() {
    return Object.entries(
      lerStore().excecoes
    ).map(([id_venda, d]) => ({
      id_venda: Number(id_venda),
      ...d,
    }));
  }

  // ------------------------------------------------------------
  // CADASTRO DE CLIENTES
  // ------------------------------------------------------------

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
      (c) =>
        c.cpf === cpfDigitos &&
        !c.local,
    );

    if (!criado) {
      throw new Error(
        "Não foi possível confirmar o cadastro do cliente. Tente novamente.",
      );
    }

    if (limite > 0) {
      await alterarLimite(criado, limite);
    }

    return criado;
  }

  // ------------------------------------------------------------
  // EDIÇÃO DE CLIENTES
  // ------------------------------------------------------------

  async function editarCliente(
    cliente,
    { nome, cpf, telefone, limite, endereco },
  ) {
    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);

    await request(
      `/clientes/${encodeURIComponent(cliente.id)}`,
      {
        method: "PUT",

        body: {
          nome: nome.trim(),
          cpf: cpfDigitos,
          telefone: [telDigitos],
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

  // ------------------------------------------------------------
  // EXCLUSÃO DE CLIENTES
  // ------------------------------------------------------------

  async function excluirCliente(cliente) {
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
  }

  // ------------------------------------------------------------
  // CÁLCULO DOS VENCIMENTOS
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // REGISTRO DE VENDAS E PRODUTOS NO POSTGRESQL
  // ------------------------------------------------------------

  async function registrarVenda(cliente, venda) {
    const total = arredondar(venda.total);

    const parcelas =
      venda.modalidade === "fiado"
        ? 1
        : venda.parcelas;

    // Impede vendas para clientes exclusivamente locais.

    if (cliente.local) {
      throw new ApiError({
        status: 422,
        codigo: "cliente_local",
        mensagem:
          "O cliente precisa estar cadastrado no banco de dados.",
      });
    }

    // Verifica se existem produtos na venda.

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

    // Converte os produtos para o formato da API.

    const itens = venda.itens.map((item) => ({
      nome_produto:
        item.nome_produto ?? item.nome,

      quantidade:
        Number(item.quantidade ?? item.qtd),

      preco_unitario:
        Number(item.preco_unitario ?? item.preco),
    }));

    // Validação dos produtos.

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

    // Envia a venda e seus produtos para o Django.

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

          // Produtos comprados pelo cliente.
          itens: itens,
        },
      });
    } catch (e) {
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

    // Compatibilidade temporária com o histórico.
    // A cópia local será removida quando o histórico
    // estiver completamente integrado ao PostgreSQL.

    try {
      const store = lerStore();

      store.vendas = store.vendas.filter(
        (v) =>
          v.id_venda !== resposta.id_venda ||
          v.api !== true,
      );

      store.vendas.push({
        id_venda: resposta.id_venda,
        api: true,
        id_cliente: cliente.id,
        data: hojeISO(),
        valor_total: total,
        itens: venda.itens,
        parcelas: [],
      });

      salvarStore(store);

    } catch (erro) {
      console.warn(
        "Venda registrada na API, mas não foi possível atualizar a cópia local.",
        erro,
      );
    }

    // Retorna os dados registrados pelo backend.

    return {
      id_venda: resposta.id_venda,
      numero: resposta.id_venda,
      status: resposta.status || "aprovada",
      itens: resposta.itens || [],
      parcelas: resposta.parcelas || [],
    };
  }

  // ------------------------------------------------------------
  // BAIXA DE VÁRIAS PARCELAS
  // ------------------------------------------------------------

  async function registrarBaixa(
    cliente,
    parcelas,
    valor,
    forma
  ) {
    valor = arredondar(valor);

    const ordenadas = [...parcelas].sort(
      (a, b) =>
        String(
          a.data_vencimento || ""
        ).localeCompare(
          String(b.data_vencimento || "")
        ) ||
        a.numero - b.numero,
    );

    let restante = valor;
    const feitos = [];

    for (const parcela of ordenadas) {
      if (restante <= 0) break;

      const parte = arredondar(
        Math.min(restante, parcela.devido)
      );

      if (parte <= 0) continue;

      try {
        const resposta =
          await registrarPagamento(
            cliente,
            parcela,
            parte
          );

        feitos.push({
          parcela,
          valor: parte,
          resposta,
        });

        restante = arredondar(
          restante - parte
        );

        if (parcela.origem === "api") {
          const store = lerStore();
          const id = ++store.seq;

          store.pagamentos.push({
            id: resposta.id_pagamento ?? id,
            id_cliente: cliente.id,
            ref: `api:${parcela.id_parcela}`,
            valor: parte,
            data: hojeISO(),
            forma,
          });

          salvarStore(store);

        } else {
          const store = lerStore();

          const reg = store.pagamentos.find(
            (x) => x.id === resposta.id_pagamento,
          );

          if (reg) {
            reg.forma = forma;

            salvarStore(store);
          }
        }

      } catch (e) {
        e.concluidos = feitos;

        throw e;
      }
    }

    return {
      pagamentos: feitos,
    };
  }

  // ------------------------------------------------------------
  // AVISOS DE ARMAZENAMENTO LOCAL
  // ------------------------------------------------------------

  function avisoLocal() {
    const itens = [...usoLocal]
      .map((k) => ROTULOS_LOCAIS[k])
      .filter(Boolean);

    if (!itens.length) return "";

    return (
      `O back-end ainda não possui estas rotas: ` +
      `${itens.join(", ")}. ` +
      "Esses dados estão sendo calculados e guardados " +
      "neste navegador até a integração ser concluída."
    );
  }

  // ------------------------------------------------------------
  // CONSULTA DOS ITENS DA VENDA
  // ------------------------------------------------------------

  async function itensDaVenda(idVenda) {
    
    const vendas = await obterVendas();

    const v = vendas.find(
        (x) => String(x.id_venda) === String(idVenda),
    );

    if (!v) {
        return null;
    }

    const itens = (v.itens || []).map((item) => ({
        nome: item.nome_produto,
        qtd: Number(item.quantidade),
        preco: Number(item.preco_unitario),
        subtotal: Number(item.subtotal),
    }));

    return {
        itens: itens,
        valor_total: Number(v.valor_total),
        data: v.data_venda,
    };
}

  // ------------------------------------------------------------
  // EXPORTAÇÃO DOS SERVIÇOS
  // ------------------------------------------------------------

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