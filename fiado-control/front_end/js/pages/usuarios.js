// Tela Usuários: lista a equipe e permite cadastrar, editar e inativar usuários.
(function () {
  const FC = window.FC;
  const { escapeHtml } = FC.format;
  const $ = (id) => document.getElementById(id);
  const PERFIS = FC.usuarios.PERFIS;

  const el = {
    corpo: $("usuarios-corpo"), wrap: $("tabela-wrap"), carregando: $("estado-carregando"), erro: $("estado-erro"),
    erroTexto: $("erro-texto"), tentar: $("btn-tentar"), aviso: $("aviso-local"), avisoTexto: $("aviso-local-texto"),
    novo: $("btn-novo"), form: $("form-usuario"), titulo: $("form-titulo"), alerta: $("form-alerta"),
    nome: $("u-nome"), email: $("u-email"), senha: $("u-senha"), perfil: $("u-perfil"), perfilDesc: $("perfil-descricao"),
    dicaSenha: $("dica-senha"), reqSenha: $("req-senha"), cancelar: $("btn-cancelar"), salvar: $("btn-salvar"),
  };

  const state = { usuarios: [], editando: null, salvando: false };
  FC.ui.initSidebar();

  el.perfil.innerHTML = Object.entries(PERFIS).map(([k, p]) => `<option value="${k}">${escapeHtml(p.rotulo)}</option>`).join("");

  const iniciais = (nome) => {
    const p = nome.trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
  };

  function mostrarAviso() {
    const t = FC.usuarios.aviso();
    el.aviso.hidden = !t;
    el.avisoTexto.textContent = t;
  }

  function renderLista() {
    el.corpo.innerHTML = state.usuarios.map((u) => `
      <tr class="${u.ativo ? "" : "inativo"} ${String(u.id) === String(state.editando) ? "editando" : ""}">
        <td><div class="usuario-cel"><span class="usuario-avatar" aria-hidden="true">${escapeHtml(iniciais(u.nome))}</span>
          <div><strong>${escapeHtml(u.nome)}</strong><small>${escapeHtml(u.email)}</small></div></div></td>
        <td class="cell-ink">${escapeHtml(u.rotuloPerfil)}</td>
        <td><span class="badge ${u.ativo ? "badge-ok" : "badge-muted"}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
        <td class="cell-right"><span class="acoes-linha">
          <button type="button" data-editar="${escapeHtml(u.id)}">Editar</button>
          ${u.ativo ? `<button type="button" class="perigo" data-inativar="${escapeHtml(u.id)}">Inativar</button>` : ""}
        </span></td>
      </tr>`).join("");
    el.wrap.hidden = false;
  }

  async function carregar() {
    el.carregando.hidden = false; el.erro.hidden = true; el.wrap.hidden = true;
    try {
      state.usuarios = await FC.usuarios.listar();
      el.carregando.hidden = true;
      renderLista();
      mostrarAviso();
    } catch (e) {
      el.carregando.hidden = true;
      el.erro.hidden = false;
      el.erroTexto.textContent = e.mensagem || "Erro inesperado.";
    }
  }

  // ----------------------------------------------------------- formulário
  function erroCampo(campo, msg) {
    const e = $("e-" + campo);
    e.textContent = msg || "";
    e.hidden = !msg;
    el[campo].closest(".form-field").classList.toggle("has-error", !!msg);
  }
  const limparErros = () => { ["nome", "email", "senha"].forEach((c) => erroCampo(c, "")); el.alerta.hidden = true; };

  function atualizarDescricao() { el.perfilDesc.textContent = PERFIS[el.perfil.value].descricao; }
  el.perfil.addEventListener("change", atualizarDescricao);

  function novoFormulario() {
    state.editando = null;
    el.form.reset();
    el.perfil.value = "vendedor";
    el.titulo.textContent = "Cadastro / Edição de usuário";
    el.dicaSenha.hidden = true; el.reqSenha.hidden = false;
    el.senha.placeholder = "Mínimo de 6 caracteres";
    limparErros(); atualizarDescricao(); renderLista();
  }

  function editar(id) {
    const u = state.usuarios.find((x) => String(x.id) === String(id));
    if (!u) return;
    state.editando = u.id;
    el.nome.value = u.nome; el.email.value = u.email; el.senha.value = ""; el.perfil.value = u.chavePerfil;
    el.titulo.innerHTML = 'Editando usuário <span class="modo-edicao">Edição</span>';
    el.dicaSenha.hidden = false; el.reqSenha.hidden = true;
    el.senha.placeholder = "Manter senha atual";
    limparErros(); atualizarDescricao(); renderLista();
    el.nome.focus();
    if (window.matchMedia("(max-width: 1100px)").matches) el.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validar() {
    limparErros();
    let ok = true;
    if (el.nome.value.trim().split(/\s+/).filter(Boolean).length < 2 || el.nome.value.trim().length < 5) {
      erroCampo("nome", "Informe o nome completo."); ok = false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.email.value.trim())) { erroCampo("email", "Informe um e-mail válido."); ok = false; }
    if ((state.editando === null || el.senha.value) && el.senha.value.length < 6) {
      erroCampo("senha", "A senha deve ter ao menos 6 caracteres."); ok = false;
    }
    return ok;
  }

  el.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (state.salvando || !validar()) return;
    state.salvando = true; el.salvar.disabled = true; el.salvar.classList.add("is-loading");
    const edicao = state.editando !== null;
    try {
      await FC.usuarios.salvar(state.editando, {
        nome: el.nome.value, email: el.email.value, senha: el.senha.value, chavePerfil: el.perfil.value,
      });
      FC.ui.toast(edicao ? "Usuário atualizado com sucesso." : "Usuário cadastrado com sucesso.");
      novoFormulario();
      await carregar();
    } catch (e) {
      if (e.codigo === "email_ja_cadastrado") erroCampo("email", e.mensagem);
      else { el.alerta.textContent = e.mensagem || "Não foi possível salvar o usuário."; el.alerta.hidden = false; }
    } finally {
      state.salvando = false; el.salvar.disabled = false; el.salvar.classList.remove("is-loading");
    }
  });

  el.corpo.addEventListener("click", async (ev) => {
    const ed = ev.target.closest("[data-editar]");
    if (ed) return editar(ed.dataset.editar);
    const inat = ev.target.closest("[data-inativar]");
    if (!inat) return;
    const u = state.usuarios.find((x) => String(x.id) === String(inat.dataset.inativar));
    if (!u) return;
    const sim = await FC.ui.confirmar({
      titulo: "Inativar usuário?",
      mensagem: `${u.nome} não poderá mais fazer login no sistema. Esta ação mantém o histórico de vendas e pagamentos.`,
      rotuloConfirmar: "Inativar", perigo: true,
    });
    if (!sim) return;
    try {
      await FC.usuarios.inativar(u.id);
      FC.ui.toast("Usuário inativado.");
      if (String(state.editando) === String(u.id)) novoFormulario();
      await carregar();
    } catch (e) { FC.ui.toast(e.mensagem || "Não foi possível inativar o usuário."); }
  });


  // ----------------------------------------------------- modal "Cadastro de Usuário"
  const m = {
    overlay: $("modal-usuario"), form: $("form-modal"), alerta: $("m-alerta"), salvar: $("m-salvar"),
    nome: $("m-nome"), cpf: $("m-cpf"), usuario: $("m-usuario"), email: $("m-email"), senha: $("m-senha"), senha2: $("m-senha2"),
  };
  FC.masks.mascaraCpf(m.cpf);
  const modal = FC.ui.criarModal(m.overlay);
  const CAMPOS = ["nome", "cpf", "usuario", "email", "senha", "senha2"];
  function erroModal(c, msg) {
    const e = $("m-e-" + c);
    e.textContent = msg || ""; e.hidden = !msg;
    m[c].closest(".form-field").classList.toggle("has-error", !!msg);
  }
  CAMPOS.forEach((c) => m[c].addEventListener("input", () => erroModal(c, "")));
  function abrirModal() {
    m.form.reset(); CAMPOS.forEach((c) => erroModal(c, "")); m.alerta.hidden = true;
    modal.abrir();
  }
  function validarModal() {
    CAMPOS.forEach((c) => erroModal(c, ""));
    let ok = true;
    const falha = (c, t) => { erroModal(c, t); ok = false; };
    if (m.nome.value.trim().split(/\s+/).filter(Boolean).length < 2 || m.nome.value.trim().length < 5) falha("nome", "Informe o nome completo.");
    if (!FC.validators.validarCpf(m.cpf.value)) falha("cpf", m.cpf.value.trim() ? "CPF inválido." : "Informe o CPF.");
    if (m.usuario.value.trim().length < 3) falha("usuario", "Mínimo de 3 caracteres.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.email.value.trim())) falha("email", "Informe um e-mail válido.");
    if (m.senha.value.length < 6) falha("senha", "Mínimo de 6 caracteres.");
    if (m.senha2.value !== m.senha.value) falha("senha2", "As senhas não conferem.");
    return ok;
  }
  m.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (state.salvando || !validarModal()) return;
    state.salvando = true; m.salvar.disabled = true; m.alerta.hidden = true;
    try {
      await FC.usuarios.salvar(null, {
        nome: m.nome.value, email: m.email.value, senha: m.senha.value, chavePerfil: "vendedor",
        cpf: m.cpf.value, nomeUsuario: m.usuario.value,
      });
      modal.fechar();
      FC.ui.toast("Usuário cadastrado com sucesso. Perfil inicial: Vendedor(a); use Editar para alterar.");
      await carregar();
    } catch (e) {
      if (e.codigo === "email_ja_cadastrado") erroModal("email", e.mensagem);
      else { m.alerta.textContent = e.mensagem || "Não foi possível cadastrar o usuário."; m.alerta.hidden = false; }
    } finally { state.salvando = false; m.salvar.disabled = false; }
  });

  el.novo.addEventListener("click", abrirModal);
  el.cancelar.addEventListener("click", novoFormulario);
  el.tentar.addEventListener("click", carregar);

  novoFormulario();
  carregar();
})();
