// Serviço de usuários da equipe (namespace global FC.usuarios).
//
// Integração exclusivamente com a API do backend Django.
//
// GET  /usuarios
// POST /usuarios
// PUT  /usuarios/{id}

(function () {
  const FC = (window.FC = window.FC || {});
  const { request } = FC.api;

  // Perfis de acesso reconhecidos pelo backend.
  const PERFIS = {
    administrador: {
      rotulo: "Administrador",
      perfil: "ADMIN",
      descricao:
        "Acesso total: vendas, pagamentos, cancelamentos, relatórios, configurações e usuários.",
    },

    funcionario: {
      rotulo: "Funcionário(a)",
      perfil: "COMUM",
      descricao:
        "Cadastra clientes, registra vendas e pagamentos. Ações restritas pedem o código do gerente.",
    },
  };

  const chavePerfil = (u) =>
    ["ADMIN", "GERENTE", "gerente"].includes(String(u.perfil))
      ? "administrador"
      : "funcionario";

  // Padroniza os dados recebidos do backend.
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

  // Prepara os dados enviados ao backend.
  function corpo(dados) {
    const c = {
      nome: dados.nome.trim(),
      email: dados.email.trim().toLowerCase(),
      perfil: PERFIS[dados.chavePerfil].perfil,
    };

    if (dados.senha) {
      c.senha = dados.senha;
    }

    if (dados.cpf) {
      c.cpf = dados.cpf.replace(/\D/g, "");
    }

    if (dados.nomeUsuario) {
      c.nome_usuario = dados.nomeUsuario.trim();
    }

    return c;
  }

  // Consulta os usuários cadastrados.
  async function listar() {
    const r = await request("/usuarios");

    const lista = Array.isArray(r) ? r : r?.usuarios;

    if (!Array.isArray(lista)) {
      throw new Error("Resposta inválida ao consultar usuários.");
    }

    return lista.map(normalizar);
  }

  // Cadastra ou atualiza um usuário.
  async function salvar(id, dados, { autorizacao } = {}) {
    const body = corpo(dados);

    const r = await request(
      id ? `/usuarios/${encodeURIComponent(id)}` : "/usuarios",
      {
        method: id ? "PUT" : "POST",
        body,

        headers: autorizacao
          ? { "X-Autorizacao-Gerente": autorizacao }
          : undefined,
      }
    );

    return normalizar(r);
  }

  // Atualiza a situação do usuário no backend.
  async function alterarSituacao(id, ativo) {
    await request(`/usuarios/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { ativo },
    });
  }

  // Disponibiliza as funcionalidades para o frontend.
  FC.usuarios = {
    PERFIS,
    listar,
    salvar,

    inativar: (id) => alterarSituacao(id, false),

    reativar: (id) => alterarSituacao(id, true),

    aviso: () => "",
  };
})();
