// Serviço de clientes, saldo, histórico, parcelas, limite e pagamentos (namespace global FC.clientes).
//
// Regra geral: usa a API real (contrato em docs/api/contratoAPI.md). Quando uma rota do contrato
// ainda não existe no Django (404 sem corpo JSON / 405), o serviço cai para um fallback guardado
// no navegador (localStorage) e registra isso em `usoLocal`, para a tela avisar o usuário.
// Assim que a rota for implementada no back-end, ela passa a ser usada automaticamente.
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;
  const { apenasDigitos, arredondar, hojeISO } = FC.format;

  const CHAVE_STORE = "fiadoControl.local.v1";

  // Recursos que estão usando o fallback local nesta sessão.
  const usoLocal = new Set();
  // Rotas já identificadas como inexistentes (evita repetir requisições que darão 404).
  // Lembrado por 2 minutos na sessão; depois disso o front volta a testar a rota.
  const CHAVE_ROTAS = "fiadoControl.rotasIndisponiveis";
  const VALIDADE_MS = 2 * 60 * 1000;
  const indisponivel = new Proxy({}, {
    get(_, rota) {
      try {
        const t = Number(JSON.parse(sessionStorage.getItem(CHAVE_ROTAS) || "{}")[rota]);
        return Number.isFinite(t) && Date.now() - t < VALIDADE_MS;
      } catch { return false; }
    },
    set(_, rota, valor) {
      try {
        const mapa = JSON.parse(sessionStorage.getItem(CHAVE_ROTAS) || "{}");
        if (valor) mapa[rota] = Date.now(); else delete mapa[rota];
        sessionStorage.setItem(CHAVE_ROTAS, JSON.stringify(mapa));
      } catch { /* sessionStorage indisponível: apenas não memoriza */ }
      return true;
    },
  });

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
  };

  // ------------------------------------------------------------ store local

  function lerStore() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_STORE) || "{}");
      return {
        clientes: s.clientes || [], limites: s.limites || {}, pagamentos: s.pagamentos || [], seq: s.seq || 0,
        edicoes: s.edicoes || {}, excluidos: s.excluidos || [], vendas: s.vendas || [],
      };
    } catch {
      return { clientes: [], limites: {}, pagamentos: [], seq: 0, edicoes: {}, excluidos: [], vendas: [] };
    }
  }

  function salvarStore(store) {
    try { localStorage.setItem(CHAVE_STORE, JSON.stringify(store)); } catch { /* armazenamento indisponível */ }
  }

  const ehLocal = (id) => String(id).startsWith("L");

  const naoEncontrado = () =>
    new ApiError({ status: 404, codigo: "cliente_nao_encontrado", mensagem: "Cliente não encontrado." });

  // ----------------------------------------------------------- normalização

  function normalizarCliente(c, store) {
    // Edições feitas na tela enquanto PUT /clientes/{id} não existe no back-end.
    const ed = store.edicoes[c.id_cliente] || {};
    const telefones = (Array.isArray(c.telefone) ? c.telefone : [c.telefone]).filter(Boolean).map(apenasDigitos);
    return {
      id: c.id_cliente,
      nome: ed.nome ?? c.nome,
      cpf: apenasDigitos(ed.cpf ?? c.cpf),
      telefone: ed.telefone ? [apenasDigitos(ed.telefone)] : telefones,
      endereco: ed.endereco ?? c.endereco ?? null,
      // Override local só existe enquanto PUT /clientes/{id}/limite não estiver implementado.
      limite_credito: Number(store.limites[c.id_cliente] ?? c.limite_credito) || 0,
      credito_bloqueado: !!c.credito_bloqueado,
      ativo: c.ativo !== false,
      local: false,
    };
  }

  // ---------------------------------------------------------------- clientes

  async function listarClientes() {
    const dados = await request("/clientes");
    const store = lerStore();
    const excluidos = new Set(store.excluidos.map(String));
    const doServidor = dados.filter((c) => !excluidos.has(String(c.id_cliente))).map((c) => normalizarCliente(c, store));

    // Clientes criados só localmente deixam de existir aqui quando o servidor passa a tê-los.
    const cpfsServidor = new Set(doServidor.map((c) => c.cpf));
    const locais = store.clientes.filter((c) => !cpfsServidor.has(c.cpf));
    if (locais.length !== store.clientes.length) {
      store.clientes = locais;
      salvarStore(store);
    }

    return [...doServidor, ...locais.map((c) => ({ ...c, local: true }))].filter((c) => c.ativo);
  }

  async function obterCliente(id) {
    const store = lerStore();

    if (ehLocal(id)) {
      const c = store.clientes.find((x) => x.id === id);
      if (!c) throw naoEncontrado();
      return { ...c, local: true };
    }

    if (!indisponivel.detalhe) {
      try {
        return normalizarCliente(await request(`/clientes/${encodeURIComponent(id)}`), store);
      } catch (e) {
        if (!e.naoImplementado) throw e;
        indisponivel.detalhe = true;
      }
    }

    const cliente = (await listarClientes()).find((c) => String(c.id) === String(id));
    if (!cliente) throw naoEncontrado();
    return cliente;
  }

  // ------------------------------------------------------------------ vendas

  let cacheVendas = null;
  function obterVendas() {
    if (!cacheVendas || Date.now() - cacheVendas.t > 15000) {
      cacheVendas = { t: Date.now(), p: request("/vendas") };
      cacheVendas.p.catch(() => { cacheVendas = null; });
    }
    return cacheVendas.p;
  }

  // ------------------------------------------------------- parcelas (fallback)

  // Fallback: cada venda aprovada vira uma parcela única; pagamentos locais abatem o saldo.
  async function parcelasLocais(cliente) {
    const store = lerStore();

    if (cliente.local) {
      const lista = [];
      for (const v of store.vendas.filter((x) => x.id_cliente === cliente.id)) {
        for (const p of v.parcelas) {
          const pago = store.pagamentos.filter((x) => x.ref === p.id_parcela).reduce((t, x) => t + x.valor, 0);
          const saldo = Math.max(0, arredondar(p.valor_parcela - pago));
          lista.push({
            id_parcela: p.id_parcela, id_venda: v.id_venda, numero: p.numero, valor_parcela: p.valor_parcela,
            saldo_parcela: saldo, devido: saldo, data_vencimento: p.data_vencimento, total_parcelas: v.parcelas.length,
            status: saldo > 0 ? "pendente" : "pago", dias_atraso: 0, origem: "local",
          });
        }
      }
      return lista;
    }

    const vendas = (await obterVendas()).filter((v) => v.id_cliente === cliente.id && v.status === "aprovada");

    return vendas.map((v) => {
      const id = `v${v.id_venda}`;
      const pago = store.pagamentos.filter((p) => p.ref === id).reduce((s, p) => s + p.valor, 0);
      const saldo = Math.max(0, arredondar(v.valor_total - pago));
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

  function normalizarParcelaApi(p) {
    const saldo = Number(p.saldo_parcela ?? p.valor_parcela) || 0;
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

  // Parcelas ainda em aberto (pendente, parcial ou atrasada).
  async function obterParcelasAbertas(cliente) {
    if (!cliente.local && !indisponivel.parcelas) {
      try {
        const dados = await request(`/clientes/${encodeURIComponent(cliente.id)}/parcelas`);
        const todas = dados.map(normalizarParcelaApi);
        // Quantas parcelas cada venda tem (para exibir "01/03"), contando também as já pagas.
        const quantidade = {};
        todas.forEach((p) => { quantidade[p.id_venda] = Math.max(quantidade[p.id_venda] || 0, p.numero); });
        return todas
          .filter((p) => p.status !== "pago" && p.saldo_parcela > 0)
          .map((p) => ({ ...p, total_parcelas: quantidade[p.id_venda] || 1 }));
      } catch (e) {
        if (!e.naoImplementado) throw e;
        indisponivel.parcelas = true;
      }
    }
    if (!cliente.local) usoLocal.add("parcelas");
    return (await parcelasLocais(cliente)).filter((p) => p.saldo_parcela > 0);
  }

  // ------------------------------------------------------------------- saldo

  async function obterResumo(cliente) {
    if (!cliente.local && !indisponivel.saldo) {
      try {
        const r = await request(`/clientes/${encodeURIComponent(cliente.id)}/saldo`);
        return { ...r, origem: "api" };
      } catch (e) {
        if (!e.naoImplementado) throw e;
        indisponivel.saldo = true;
      }
    }

    if (!cliente.local) usoLocal.add("saldo");
    const saldo = arredondar((await parcelasLocais(cliente)).reduce((s, p) => s + p.saldo_parcela, 0));
    return {
      id_cliente: cliente.id,
      saldo_devedor: saldo,
      limite_credito: cliente.limite_credito,
      limite_disponivel: Math.max(0, arredondar(cliente.limite_credito - saldo)),
      possui_parcelas_atrasadas: false, // sem vencimentos no fallback, não há como saber
      credito_bloqueado: cliente.credito_bloqueado,
      origem: "local",
    };
  }

  // Resumos de vários clientes. O primeiro vai sozinho para descobrir se a rota /saldo existe;
  // assim não disparamos N requisições que dariam 404. Retorna Map(id -> resumo); falhas ficam de fora.
  async function obterResumos(clientes) {
    const mapa = new Map();
    const guardar = (cliente) => obterResumo(cliente).then((r) => mapa.set(cliente.id, r), () => {});
    if (!clientes.length) return mapa;
    await guardar(clientes[0]);
    await Promise.all(clientes.slice(1).map(guardar));
    return mapa;
  }

  // --------------------------------------------------------------- histórico

  async function obterHistorico(cliente) {
    if (!cliente.local && !indisponivel.historico) {
      try {
        const dados = await request(`/clientes/${encodeURIComponent(cliente.id)}/historico`);
        return dados.map((h) => ({ tipo: h.tipo, id: h.id, data: h.data, valor: Number(h.valor) || 0, situacao: null }));
      } catch (e) {
        if (!e.naoImplementado) throw e;
        indisponivel.historico = true;
      }
    }

    if (!cliente.local) usoLocal.add("historico");
    const store = lerStore();
    const itens = [];

    if (cliente.local) {
      for (const v of store.vendas.filter((x) => x.id_cliente === cliente.id)) {
        itens.push({ tipo: "venda", id: v.id_venda, data: v.data, valor: v.valor_total, situacao: null });
      }
    } else {
      const vendas = (await obterVendas()).filter((v) => v.id_cliente === cliente.id && v.status !== "rejeitada");
      for (const v of vendas) {
        itens.push({
          tipo: "venda",
          id: v.id_venda,
          data: v.data_venda,
          valor: v.valor_total,
          situacao: v.status === "aprovada" ? null : "pendente",
        });
      }
    }
    for (const p of store.pagamentos.filter((x) => x.id_cliente === cliente.id)) {
      itens.push({ tipo: "pagamento", id: p.id, data: p.data, valor: p.valor, situacao: null });
    }

    // Do mais recente para o mais antigo (mesmo critério do contrato).
    return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  }

  // --------------------------------------------------------------- pagamento

  async function registrarPagamento(cliente, parcela, valor) {
    valor = arredondar(valor);

    if (parcela.origem === "api") {
      return request("/pagamentos", { method: "POST", body: { id_parcela: parcela.id_parcela, valor_recebido: valor } });
    }

    usoLocal.add("pagamento");
    if (valor > parcela.saldo_parcela + 0.001) {
      throw new ApiError({
        status: 422,
        codigo: "valor_excede_devido",
        mensagem: "O valor do pagamento excede o valor devido da parcela",
      });
    }

    const store = lerStore();
    const id = ++store.seq;
    store.pagamentos.push({ id, id_cliente: cliente.id, ref: parcela.id_parcela, valor, data: hojeISO() });
    salvarStore(store);

    const saldoParcela = arredondar(parcela.saldo_parcela - valor);
    return {
      id_pagamento: id,
      id_parcela: parcela.id_parcela,
      valor_recebido: valor,
      data_pagamento: hojeISO(),
      status_parcela: saldoParcela <= 0 ? "pago" : "parcial",
      saldo_parcela: saldoParcela,
    };
  }

  // ------------------------------------------------------------------ limite

  async function alterarLimite(cliente, valor) {
    valor = arredondar(valor);
    if (!(valor >= 0)) {
      throw new ApiError({ status: 422, codigo: "limite_invalido", mensagem: "O limite de crédito deve ser zero ou maior." });
    }

    const store = lerStore();

    if (cliente.local) {
      const alvo = store.clientes.find((c) => c.id === cliente.id);
      if (alvo) alvo.limite_credito = valor;
      salvarStore(store);
      return valor;
    }

    try {
      await request(`/clientes/${encodeURIComponent(cliente.id)}/limite`, {
        method: "PUT",
        body: { limite_credito: valor },
      });
      delete store.limites[cliente.id];
    } catch (e) {
      if (!e.naoImplementado) throw e;
      usoLocal.add("limite");
      store.limites[cliente.id] = valor;
    }
    salvarStore(store);
    return valor;
  }

  // ---------------------------------------------------------------- cadastro

  // dados: { nome, cpf, telefone, limite?, endereco? } — cpf e telefone com ou sem máscara.
  async function cadastrarCliente({ nome, cpf, telefone, limite, endereco }) {
    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);

    // Contrato (rota 5): nome, cpf e telefone (lista). O limite é definido depois (rota 19).
    await request("/clientes", {
      method: "POST",
      body: { nome: nome.trim(), cpf: cpfDigitos, telefone: [telDigitos], ...(endereco ? { endereco } : {}) },
    });

    // O POST atual do back-end responde 201 mas ainda não grava. Se o cliente não aparecer na
    // listagem, guardamos localmente para ele existir nas telas.
    let criado = (await listarClientes()).find((c) => c.cpf === cpfDigitos && !c.local);
    if (!criado) {
      usoLocal.add("cadastro");
      const store = lerStore();
      criado = {
        id: `L${++store.seq}`,
        nome: nome.trim(),
        cpf: cpfDigitos,
        telefone: [telDigitos],
        limite_credito: 0,
        credito_bloqueado: false,
        ativo: true,
        endereco: endereco || null,
        local: true,
      };
      store.clientes.push(criado);
      salvarStore(store);
    }

    if (limite > 0) await alterarLimite(criado, limite);
    return criado;
  }

  // ----------------------------------------------------- editar / excluir

  // dados: { nome, cpf, telefone, limite?, endereco? }
  async function editarCliente(cliente, { nome, cpf, telefone, limite, endereco }) {
    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);
    const store = lerStore();

    if (cliente.local) {
      const alvo = store.clientes.find((c) => c.id === cliente.id);
      if (!alvo) throw naoEncontrado();
      Object.assign(alvo, { nome: nome.trim(), cpf: cpfDigitos, telefone: [telDigitos], endereco: endereco || alvo.endereco || null });
      salvarStore(store);
    } else {
      try {
        await request(`/clientes/${encodeURIComponent(cliente.id)}`, {
          method: "PUT",
          body: { nome: nome.trim(), cpf: cpfDigitos, telefone: [telDigitos], ...(endereco ? { endereco } : {}) },
        });
        delete store.edicoes[cliente.id];
      } catch (e) {
        if (!e.naoImplementado) throw e;
        usoLocal.add("edicao");
        store.edicoes[cliente.id] = { nome: nome.trim(), cpf: cpfDigitos, telefone: telDigitos, endereco: endereco || null };
      }
      salvarStore(store);
    }

    if (limite != null && arredondar(limite) !== arredondar(cliente.limite_credito)) {
      await alterarLimite(cliente, limite);
    }
  }

  // Só exclui cliente sem valores em aberto.
  async function excluirCliente(cliente) {
    const resumo = await obterResumo(cliente);
    if (resumo.saldo_devedor > 0) {
      throw new ApiError({
        status: 422,
        codigo: "cliente_com_saldo",
        mensagem: `${cliente.nome} possui ${FC.format.moeda(resumo.saldo_devedor)} em aberto. Quite as parcelas antes de excluir o cliente.`,
      });
    }

    const store = lerStore();
    if (cliente.local) {
      store.clientes = store.clientes.filter((c) => c.id !== cliente.id);
    } else {
      try {
        await request(`/clientes/${encodeURIComponent(cliente.id)}`, { method: "DELETE" });
        store.excluidos = store.excluidos.filter((i) => String(i) !== String(cliente.id));
      } catch (e) {
        if (!e.naoImplementado) throw e;
        usoLocal.add("exclusao");
        if (!store.excluidos.some((i) => String(i) === String(cliente.id))) store.excluidos.push(cliente.id);
      }
    }
    salvarStore(store);
  }

  // ------------------------------------------------------------------ vendas

  function somarMeses(iso, n) {
    const [a, m, d] = iso.split("-").map(Number);
    const total = (m - 1) + n;
    const ano = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    const p = (x) => String(x).padStart(2, "0");
    return `${ano}-${p(mes + 1)}-${p(Math.min(d, ultimo))}`;
  }

  const MOTIVOS_VENDA = {
    credito_bloqueado: "O crédito deste cliente está bloqueado.",
    parcelas_em_atraso: "O cliente possui parcelas em atraso.",
    limite_credito_excedido: "O valor da venda excede o limite disponível do cliente.",
  };

  // venda: { modalidade, parcelas, total, primeiroVencimento, itens, subtotal, desconto }
  // Retorna { id_venda, status, parcelas:[{numero, valor_parcela, data_vencimento}] }.
  // Venda rejeitada pelo back-end vira ApiError com codigo = motivo.
  async function registrarVenda(cliente, venda) {
    const total = arredondar(venda.total);
    const parcelas = venda.modalidade === "fiado" ? 1 : venda.parcelas;
    const store = lerStore();

    if (cliente.local) {
      usoLocal.add("venda");
      const resumo = await obterResumo(cliente);
      const motivo = resumo.credito_bloqueado ? "credito_bloqueado" : total > resumo.limite_disponivel ? "limite_credito_excedido" : null;
      if (motivo) throw new ApiError({ status: 422, codigo: motivo, mensagem: MOTIVOS_VENDA[motivo] });

      const id = ++store.seq;
      const idVenda = `L${id}`;
      const centavos = Math.round(total * 100);
      const base = Math.floor(centavos / parcelas);
      const lista = Array.from({ length: parcelas }, (_, i) => ({
        id_parcela: `${idVenda}-${i + 1}`,
        numero: i + 1,
        valor_parcela: (i < parcelas - 1 ? base : centavos - base * (parcelas - 1)) / 100,
        data_vencimento: somarMeses(venda.primeiroVencimento, i),
      }));
      store.vendas.push({ id_venda: idVenda, id_cliente: cliente.id, data: hojeISO(), valor_total: total, modalidade: venda.modalidade, parcelas: lista, itens: venda.itens });
      salvarStore(store);
      return { id_venda: idVenda, numero: id, status: "aprovada", parcelas: lista };
    }

    let resposta;
    try {
      resposta = await request("/vendas", {
        method: "POST",
        body: {
          id_cliente: cliente.id,
          modalidade: venda.modalidade,
          valor_total: total,
          data_primeiro_vencimento: venda.primeiroVencimento,
          quantidade_parcelas: parcelas,
        },
      });
    } catch (e) {
      const motivo = e.dados?.motivo;
      if (e.status === 422 && motivo) {
        throw new ApiError({ status: 422, codigo: motivo, mensagem: MOTIVOS_VENDA[motivo] || "Venda rejeitada pelo sistema.", dados: e.dados });
      }
      throw e;
    }

    // Guarda os itens da venda (o back-end só recebe o total) para exibir depois, neste navegador.
    store.vendas = store.vendas.filter((v) => v.id_venda !== resposta.id_venda || v.api !== true);
    store.vendas.push({ id_venda: resposta.id_venda, api: true, id_cliente: cliente.id, data: hojeISO(), valor_total: total, itens: venda.itens, parcelas: [] });
    salvarStore(store);

    return {
      id_venda: resposta.id_venda,
      numero: resposta.id_venda,
      status: resposta.status || "aprovada",
      parcelas: resposta.parcelas || [],
    };
  }

  // ------------------------------------------------------------- baixa (vários)

  // Distribui `valor` pelas parcelas escolhidas (mais antigas primeiro), uma requisição por parcela.
  // Retorna { pagamentos:[{parcela, valor, resposta}], saldo_devedor_cliente? }.
  async function registrarBaixa(cliente, parcelas, valor, forma) {
    valor = arredondar(valor);
    const ordenadas = [...parcelas].sort((a, b) =>
      String(a.data_vencimento || "").localeCompare(String(b.data_vencimento || "")) || a.numero - b.numero);

    let restante = valor;
    const feitos = [];
    for (const parcela of ordenadas) {
      if (restante <= 0) break;
      const parte = arredondar(Math.min(restante, parcela.devido));
      if (parte <= 0) continue;
      try {
        const resposta = await registrarPagamento(cliente, parcela, parte);
        feitos.push({ parcela, valor: parte, resposta });
        restante = arredondar(restante - parte);

        // Guarda forma de pagamento (o back-end ainda não recebe esse dado) para o histórico local.
        if (parcela.origem === "api") {
          const store = lerStore();
          const id = ++store.seq;
          store.pagamentos.push({ id: resposta.id_pagamento ?? id, id_cliente: cliente.id, ref: `api:${parcela.id_parcela}`, valor: parte, data: hojeISO(), forma });
          salvarStore(store);
        } else {
          const store = lerStore();
          const reg = store.pagamentos.find((x) => x.id === resposta.id_pagamento);
          if (reg) { reg.forma = forma; salvarStore(store); }
        }
      } catch (e) {
        e.concluidos = feitos; // pagamentos que já passaram antes do erro
        throw e;
      }
    }
    return { pagamentos: feitos };
  }

  // Texto para o aviso das telas quando algum dado está vindo do fallback local.
  function avisoLocal() {
    const itens = [...usoLocal].map((k) => ROTULOS_LOCAIS[k]).filter(Boolean);
    if (!itens.length) return "";
    return `O back-end ainda não possui estas rotas: ${itens.join(", ")}. Esses dados estão sendo calculados e guardados neste navegador até a integração ser concluída.`;
  }

  FC.clientes = {
    listarClientes, obterCliente, obterResumo, obterResumos, obterHistorico, obterParcelasAbertas,
    registrarPagamento, alterarLimite, cadastrarCliente, avisoLocal,
    editarCliente, excluirCliente, registrarVenda, registrarBaixa, somarMeses,
  };
})();
