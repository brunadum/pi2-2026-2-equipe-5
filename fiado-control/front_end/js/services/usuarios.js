// Serviço de usuários da equipe (namespace global FC.usuarios) — rotas /usuarios do back-end.
//
// API primeiro:
//   GET  /usuarios              -> { usuarios: [{ id_usuario, nome, email, perfil, ativo }] }
//   POST /usuarios              -> cria (perfil ADMIN | COMUM; 409 email_duplicado)
//   PUT  /usuarios/{id}         -> altera nome, e-mail, perfil, senha e "ativo" (inativar/reativar)
// Se o back-end for uma versão antiga, sem essas rotas (404 sem corpo / 405), os dados ficam neste
// navegador (localStorage) e a tela avisa o usuário.
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;

  const CHAVE = "fiadoControl.usuarios.v1";
  const state = { local: false, motivo: "" };

  // O back-end só conhece dois perfis: ADMIN (gerente) e COMUM (funcionário).
  const PERFIS = {
    administrador: {
      rotulo: "Administrador", perfil: "ADMIN",
      descricao: "Acesso total: vendas, pagamentos, cancelamentos, relatórios, configurações e usuários.",
    },
    funcionario: {
      rotulo: "Funcionário(a)", perfil: "COMUM",
      descricao: "Cadastra clientes, registra vendas e pagamentos. Ações restritas pedem o código do gerente.",
    },
  };

  const chavePerfil = (u) => (["ADMIN", "GERENTE", "gerente"].includes(String(u.perfil)) ? "administrador" : "funcionario");

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
      lista: [{ id_usuario: "L1", nome: "Administrador", email: "admin@teste.com", perfil: "ADMIN", ativo: true }],
    };
  }
  function salvarLocal(s) { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* indisponível */ } }

  const usaLocal = (e) => e instanceof ApiError && e.naoImplementado;
  function marcarLocal() {
    state.local = true;
    state.motivo = "O back-end ainda não possui as rotas de usuários (/usuarios). Os usuários estão sendo guardados apenas neste navegador até a integração.";
  }

  const emailEmUso = (lista, email, ignorarId) =>
    lista.some((u) => String(u.id_usuario) !== String(ignorarId) && u.email.toLowerCase() === email.toLowerCase());
  const erroEmail = () => new ApiError({ status: 409, codigo: "email_duplicado", mensagem: "Já existe um usuário cadastrado com este e-mail." });
  const erroNaoEncontrado = () => new ApiError({ status: 404, codigo: "usuario_nao_encontrado", mensagem: "Usuário não encontrado." });

  function corpo(dados) {
    const c = {
      nome: dados.nome.trim(),
      email: dados.email.trim().toLowerCase(),
      perfil: PERFIS[dados.chavePerfil].perfil,
    };
    if (dados.senha) c.senha = dados.senha;
    // Ainda não são gravados pelo back-end; seguem no pedido para quando ele passar a aceitá-los.
    if (dados.cpf) c.cpf = dados.cpf.replace(/\D/g, "");
    if (dados.nomeUsuario) c.nome_usuario = dados.nomeUsuario.trim();
    return c;
  }

  // ------------------------------------------------------------------ API
  async function listar() {
    try {
      const r = await request("/usuarios");
      state.local = false;
      const lista = Array.isArray(r) ? r : r?.usuarios;
      return (Array.isArray(lista) ? lista : []).map(normalizar);
    } catch (e) {
      if (!usaLocal(e)) throw e;
      marcarLocal();
      return lerLocal().lista.map(normalizar);
    }
  }

  async function salvar(id, dados, { autorizacao } = {}) {
    const body = corpo(dados);
    if (!state.local) {
      try {
        const r = await request(id ? `/usuarios/${encodeURIComponent(id)}` : "/usuarios", {
          method: id ? "PUT" : "POST", body,
          headers: autorizacao ? { "X-Autorizacao-Gerente": autorizacao } : undefined,
        });
        return normalizar(r);
      } catch (e) {
        if (!usaLocal(e)) throw e;
        marcarLocal();
      }
    }
    const s = lerLocal();
    if (emailEmUso(s.lista, body.email, id)) throw erroEmail();
    if (id) {
      const u = s.lista.find((x) => String(x.id_usuario) === String(id));
      if (!u) throw erroNaoEncontrado();
      Object.assign(u, { nome: body.nome, email: body.email, perfil: body.perfil });
      salvarLocal(s);
      return normalizar(u);
    }
    const novo = { id_usuario: `L${s.seq++}`, nome: body.nome, cpf: body.cpf, nome_usuario: body.nome_usuario, email: body.email, perfil: body.perfil, ativo: true };
    s.lista.push(novo);
    salvarLocal(s);
    return normalizar(novo);
  }

  // Inativar e reativar usam a mesma rota de edição (PUT /usuarios/{id} com { ativo }).
  async function alterarSituacao(id, ativo) {
    if (!state.local) {
      try {
        await request(`/usuarios/${encodeURIComponent(id)}`, { method: "PUT", body: { ativo } });
        return;
      } catch (e) {
        if (!usaLocal(e)) throw e;
        marcarLocal();
      }
    }
    const s = lerLocal();
    const u = s.lista.find((x) => String(x.id_usuario) === String(id));
    if (!u) throw erroNaoEncontrado();
    u.ativo = ativo;
    salvarLocal(s);
  }

  FC.usuarios = {
    PERFIS, listar, salvar,
    inativar: (id) => alterarSituacao(id, false),
    reativar: (id) => alterarSituacao(id, true),
    aviso: () => (state.local ? state.motivo : ""),
  };
})();
