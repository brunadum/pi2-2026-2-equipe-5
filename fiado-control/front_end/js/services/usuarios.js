// Serviço de usuários da equipe (namespace global FC.usuarios) — rotas 25 a 28 do contrato.
//
// API primeiro: GET/POST /usuarios, PUT /usuarios/{id}, PUT /usuarios/{id}/inativar.
// Se o back-end ainda não tiver essas rotas (404 sem corpo / 405) ou exigir login (401),
// os dados ficam guardados neste navegador (localStorage) e a tela avisa o usuário.
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;

  const CHAVE = "fiadoControl.usuarios.v1";
  const state = { local: false, motivo: "" };

  // Perfis exibidos na tela -> perfil + permissões do contrato (perfil: gerente | funcionario).
  const PERFIS = {
    administrador: {
      rotulo: "Administrador", perfil: "gerente",
      descricao: "Acesso total: vendas, pagamentos, relatórios, configurações e usuários.",
      permissoes: { cancelar_vendas: true, estornar_pagamentos: true, conceder_descontos: true },
    },
    financeiro: {
      rotulo: "Operador Financeiro", perfil: "funcionario",
      descricao: "Registra pagamentos e baixas, pode estornar pagamentos. Não altera configurações.",
      permissoes: { cancelar_vendas: false, estornar_pagamentos: true, conceder_descontos: false },
    },
    vendedor: {
      rotulo: "Vendedor(a)", perfil: "funcionario",
      descricao: "Cadastra clientes e registra vendas. Sem cancelamentos, estornos ou descontos.",
      permissoes: { cancelar_vendas: false, estornar_pagamentos: false, conceder_descontos: false },
    },
  };

  function chavePerfil(u) {
    if (u.perfil === "gerente" || u.perfil === "ADMIN") return "administrador";
    return u.permissoes?.estornar_pagamentos ? "financeiro" : "vendedor";
  }

  function normalizar(u) {
    const chave = chavePerfil(u);
    return {
      id: u.id_usuario ?? u.id,
      nome: u.nome || "",
      email: u.email || "",
      ativo: u.ativo !== false,
      chavePerfil: chave,
      rotuloPerfil: PERFIS[chave].rotulo,
    };
  }

  // ---------------------------------------------------------------- local
  function lerLocal() {
    try {
      const l = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (Array.isArray(l?.lista)) return l;
    } catch { /* ignora */ }
    return {
      seq: 2,
      lista: [{ id_usuario: "L1", nome: "Edmilson Filho", email: "gerente@loja.com", perfil: "gerente", ativo: true, permissoes: PERFIS.administrador.permissoes }],
    };
  }
  function salvarLocal(s) { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* indisponível */ } }

  const usaLocal = (e) => e instanceof ApiError && (e.naoImplementado || e.status === 401);
  function marcarLocal(e) {
    state.local = true;
    state.motivo = e.status === 401
      ? "O back-end exige login para listar usuários e o front ainda não envia o token. Os usuários estão sendo guardados apenas neste navegador."
      : "O back-end ainda não possui as rotas de usuários (/usuarios). Os usuários estão sendo guardados apenas neste navegador até a integração.";
  }

  function emailEmUso(lista, email, ignorarId) {
    return lista.some((u) => String(u.id_usuario) !== String(ignorarId) && u.email.toLowerCase() === email.toLowerCase());
  }
  const erroEmail = () => new ApiError({ status: 422, codigo: "email_ja_cadastrado", mensagem: "Já existe um usuário com este e-mail." });
  const erroNaoEncontrado = () => new ApiError({ status: 404, codigo: "usuario_nao_encontrado", mensagem: "Usuário não encontrado." });

  function corpo(dados) {
    const p = PERFIS[dados.chavePerfil];
    const c = { nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), perfil: p.perfil, permissoes: { ...p.permissoes } };
    if (dados.senha) c.senha = dados.senha;
    if (dados.cpf) c.cpf = dados.cpf.replace(/\D/g, "");
    if (dados.nomeUsuario) c.nome_usuario = dados.nomeUsuario.trim();
    return c;
  }

  // ------------------------------------------------------------------ API
  async function listar() {
    try {
      const lista = await request("/usuarios");
      state.local = false;
      return (Array.isArray(lista) ? lista : []).map(normalizar);
    } catch (e) {
      if (!usaLocal(e)) throw e;
      marcarLocal(e);
      return lerLocal().lista.map(normalizar);
    }
  }

  async function salvar(id, dados) {
    const body = corpo(dados);
    if (!state.local) {
      try {
        const r = await request(id ? `/usuarios/${encodeURIComponent(id)}` : "/usuarios", { method: id ? "PUT" : "POST", body });
        return normalizar(r);
      } catch (e) {
        if (!usaLocal(e)) throw e;
        marcarLocal(e);
      }
    }
    const s = lerLocal();
    if (emailEmUso(s.lista, body.email, id)) throw erroEmail();
    if (id) {
      const u = s.lista.find((x) => String(x.id_usuario) === String(id));
      if (!u) throw erroNaoEncontrado();
      Object.assign(u, { nome: body.nome, email: body.email, perfil: body.perfil, permissoes: body.permissoes });
      salvarLocal(s);
      return normalizar(u);
    }
    const novo = { id_usuario: `L${s.seq++}`, nome: body.nome, cpf: body.cpf, nome_usuario: body.nome_usuario, email: body.email, perfil: body.perfil, ativo: true, permissoes: body.permissoes };
    s.lista.push(novo);
    salvarLocal(s);
    return normalizar(novo);
  }

  async function inativar(id) {
    if (!state.local) {
      try {
        await request(`/usuarios/${encodeURIComponent(id)}/inativar`, { method: "PUT" });
        return;
      } catch (e) {
        if (!usaLocal(e)) throw e;
        marcarLocal(e);
      }
    }
    const s = lerLocal();
    const u = s.lista.find((x) => String(x.id_usuario) === String(id));
    if (!u) throw erroNaoEncontrado();
    u.ativo = false;
    salvarLocal(s);
  }

  FC.usuarios = { PERFIS, listar, salvar, inativar, aviso: () => (state.local ? state.motivo : "") };
})();
