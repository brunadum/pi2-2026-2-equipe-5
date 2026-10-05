// Modal "Cadastro Rápido de Cliente" (namespace global FC.cadastroCliente).
//
// Uso: FC.cadastroCliente.init({ obterCpfs: () => Set<string>, aoCadastrar: (cliente) => void });
//      FC.cadastroCliente.abrir();
(function () {
  const FC = (window.FC = window.FC || {});
  const { apenasDigitos, escapeHtml } = FC.format;
  const { validarCpf, validarTelefone, validarNome } = FC.validators;
  const masks = FC.masks;

  const OBRIGATORIOS = ["nome", "cpf", "telefone"];
  const CAMPOS = ["nome", "cpf", "telefone", "limite", "rua", "numero"];

  let opcoes = { obterCpfs: () => new Set(), aoCadastrar: () => {} };
  let modal, form, alerta, enviar, entradas, erros, rua;
  let tocados = new Set();
  let enviando = false;
  const autocomplete = {};

  // ------------------------------------------------------------- validação

  const regras = {
    nome(v) {
      if (!v.trim()) return "Informe o nome completo.";
      return validarNome(v) ? "" : "Informe um nome válido (use apenas letras).";
    },
    cpf(v) {
      const d = apenasDigitos(v);
      if (!d) return "Informe o CPF.";
      if (d.length < 11) return "CPF incompleto.";
      if (!validarCpf(d)) return "CPF inválido. Confira os números digitados.";
      if (opcoes.obterCpfs().has(d)) return "Já existe um cliente cadastrado com este CPF.";
      return "";
    },
    telefone(v) {
      const d = apenasDigitos(v);
      if (!d) return "Informe o telefone.";
      return validarTelefone(d) ? "" : "Telefone inválido. Use DDD + número, ex.: (88) 99999-9999.";
    },
    limite: () => "",
    rua(v) {
      const texto = v.trim();
      if (!texto && entradas.numero.value.trim()) return "Informe a rua e o bairro deste número.";
      if (texto && texto.length < 3) return "Endereço muito curto.";
      return "";
    },
    numero(v) {
      if (!v.trim() && entradas.rua.value.trim()) return "Informe o número (ou S/N).";
      return "";
    },
  };

  const validarTudo = () => Object.fromEntries(CAMPOS.map((c) => [c, regras[c](entradas[c].value)]));

  function mostrarErro(campo, mensagem) {
    const caixa = erros[campo];
    if (!caixa) return;
    caixa.textContent = mensagem;
    caixa.hidden = !mensagem;
    entradas[campo].closest(".form-field").classList.toggle("has-error", !!mensagem);
    entradas[campo].setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  // Mostra erros só dos campos já visitados; habilita o botão só se tudo estiver válido.
  function atualizar() {
    const todos = validarTudo();
    for (const campo of CAMPOS) mostrarErro(campo, tocados.has(campo) ? todos[campo] : "");
    const valido = CAMPOS.every((c) => !todos[c]);
    enviar.disabled = !valido || enviando;
    return todos;
  }

  function aoDigitar() {
    atualizar();
    alerta.hidden = true; // limpa o alerta geral assim que o usuário corrige algo
  }

  // ---------------------------------------------------- autocomplete de rua

  function fecharLista() {
    autocomplete.lista.hidden = true;
    autocomplete.ativo = -1;
    rua.setAttribute("aria-expanded", "false");
    rua.removeAttribute("aria-activedescendant");
  }

  function pintarLista(html) {
    autocomplete.lista.innerHTML = html;
    autocomplete.lista.hidden = false;
    rua.setAttribute("aria-expanded", "true");
  }

  function marcarAtivo(indice) {
    const itens = [...autocomplete.lista.querySelectorAll('[role="option"]')];
    if (!itens.length) return;
    autocomplete.ativo = (indice + itens.length) % itens.length;
    itens.forEach((li, i) => {
      const ativo = i === autocomplete.ativo;
      li.setAttribute("aria-selected", String(ativo));
      if (ativo) {
        rua.setAttribute("aria-activedescendant", li.id);
        li.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function escolherSugestao(item) {
    rua.value = item.texto;
    fecharLista();
    tocados.add("rua");
    atualizar();
    entradas.numero.focus();
  }

  async function buscarRuas(termo) {
    if (autocomplete.controle) autocomplete.controle.abort();
    const controle = new AbortController();
    autocomplete.controle = controle;

    pintarLista('<li class="combo-msg">Buscando ruas…</li>');
    try {
      const itens = await FC.enderecos.sugerirRuas(termo, { signal: controle.signal });
      if (controle.signal.aborted) return;
      autocomplete.itens = itens;
      if (!itens.length) {
        pintarLista('<li class="combo-msg">Nenhuma rua encontrada. Você pode digitar o endereço manualmente.</li>');
        return;
      }
      const opcoesHtml = itens
        .map((it, i) => `<li role="option" id="cli-rua-op-${i}" data-i="${i}" aria-selected="false">${escapeHtml(it.logradouro)}${it.bairro ? `<small>${escapeHtml(it.bairro)}</small>` : ""}</li>`)
        .join("");
      const credito = itens.some((i) => i.origem === "osm")
        ? '<li class="combo-credito" aria-hidden="true">Dados © colaboradores do OpenStreetMap</li>'
        : "";
      pintarLista(opcoesHtml + credito);
      autocomplete.ativo = -1;
    } catch (e) {
      if (e.name === "AbortError") return;
      pintarLista('<li class="combo-msg">Não foi possível buscar sugestões agora. Digite o endereço manualmente.</li>');
    }
  }

  function iniciarAutocomplete() {
    autocomplete.lista = document.getElementById("cli-rua-lista");
    autocomplete.itens = [];
    autocomplete.ativo = -1;

    rua.addEventListener("input", () => {
      window.clearTimeout(autocomplete.timer);
      const termo = rua.value.trim();
      if (termo.length < 3) {
        if (autocomplete.controle) autocomplete.controle.abort();
        fecharLista();
        return;
      }
      autocomplete.timer = window.setTimeout(() => buscarRuas(termo), 350);
    });

    rua.addEventListener("keydown", (e) => {
      const aberta = !autocomplete.lista.hidden;
      if (e.key === "ArrowDown" && aberta) { e.preventDefault(); marcarAtivo(autocomplete.ativo + 1); }
      else if (e.key === "ArrowUp" && aberta) { e.preventDefault(); marcarAtivo(autocomplete.ativo - 1); }
      else if (e.key === "Enter" && aberta && autocomplete.ativo >= 0) {
        e.preventDefault();
        escolherSugestao(autocomplete.itens[autocomplete.ativo]);
      } else if (e.key === "Escape" && aberta) {
        e.stopPropagation(); // fecha só a lista, não o modal
        fecharLista();
      }
    });

    // mousedown (e não click) para disparar antes do blur do campo
    autocomplete.lista.addEventListener("mousedown", (e) => {
      const li = e.target.closest('[role="option"]');
      if (!li) return;
      e.preventDefault();
      escolherSugestao(autocomplete.itens[Number(li.dataset.i)]);
    });

    rua.addEventListener("blur", () => window.setTimeout(fecharLista, 120));
  }

  // ---------------------------------------------------------------- envio

  function definirEnviando(valor) {
    enviando = valor;
    enviar.classList.toggle("is-loading", valor);
    enviar.disabled = valor || !CAMPOS.every((c) => !regras[c](entradas[c].value));
    CAMPOS.forEach((c) => { entradas[c].disabled = valor; });
    modal.travar(valor);
  }

  function aplicarErroServidor(e) {
    if (e.rede) { alerta.textContent = e.mensagem; alerta.hidden = false; return; }

    if (e.codigo === "campo_obrigatorio" && Array.isArray(e.dados?.campos)) {
      e.dados.campos.forEach((c) => { if (erros[c]) { tocados.add(c); mostrarErro(c, "Campo obrigatório."); } });
      alerta.textContent = "Preencha os campos obrigatórios destacados.";
    } else if (e.codigo === "cpf_invalido") {
      tocados.add("cpf");
      mostrarErro("cpf", e.mensagem || "CPF já cadastrado para outro cliente.");
      entradas.cpf.focus();
      return;
    } else {
      alerta.textContent = e.mensagem || "Não foi possível cadastrar o cliente. Tente novamente.";
    }
    alerta.hidden = false;
  }

  async function submeter(evento) {
    evento.preventDefault();
    if (enviando) return;

    const todos = validarTudo();
    if (CAMPOS.some((c) => todos[c])) {
      CAMPOS.forEach((c) => tocados.add(c));
      atualizar();
      const primeiro = CAMPOS.find((c) => todos[c]);
      entradas[primeiro].focus();
      return;
    }

    alerta.hidden = true;
    definirEnviando(true);
    try {
      const ruaTexto = entradas.rua.value.trim();
      const cliente = await FC.clientes.cadastrarCliente({
        nome: entradas.nome.value,
        cpf: entradas.cpf.value,
        telefone: entradas.telefone.value,
        limite: masks.valorMoeda(entradas.limite) || 0,
        endereco: ruaTexto ? { logradouro_bairro: ruaTexto, numero: entradas.numero.value.trim() } : null,
      });
      definirEnviando(false);
      modal.fechar();
      FC.ui.toast(`Cliente ${cliente.nome} cadastrado com sucesso.`);
      opcoes.aoCadastrar(cliente);
    } catch (e) {
      definirEnviando(false);
      aplicarErroServidor(e);
    }
  }

  // ------------------------------------------------------------- ciclo

  function limpar() {
    form.reset();
    tocados = new Set();
    alerta.hidden = true;
    fecharLista();
    CAMPOS.forEach((c) => mostrarErro(c, ""));
    enviar.disabled = true;
  }

  function init(config = {}) {
    opcoes = { ...opcoes, ...config };
    modal = FC.ui.criarModal(document.getElementById("modal-cliente"), { aoFechar: limpar });
    form = document.getElementById("form-cliente");
    alerta = document.getElementById("cli-alerta");
    enviar = document.getElementById("cli-enviar");
    entradas = {
      nome: document.getElementById("cli-nome"),
      cpf: document.getElementById("cli-cpf"),
      telefone: document.getElementById("cli-telefone"),
      limite: document.getElementById("cli-limite"),
      rua: document.getElementById("cli-rua"),
      numero: document.getElementById("cli-numero"),
    };
    rua = entradas.rua;
    erros = Object.fromEntries(CAMPOS.map((c) => [c, document.getElementById(`cli-${c}-erro`)]));

    masks.mascaraCpf(entradas.cpf);
    masks.mascaraTelefone(entradas.telefone);
    masks.mascaraMoeda(entradas.limite);
    masks.mascaraNumero(entradas.numero);
    iniciarAutocomplete();

    for (const campo of CAMPOS) {
      entradas[campo].addEventListener("input", aoDigitar);
      entradas[campo].addEventListener("blur", () => {
        if (enviando || !modal.estaAberto()) return;
        tocados.add(campo);
        // Rua e número andam juntos: se um deles foi preenchido, o outro também precisa aparecer validado.
        if ((campo === "rua" || campo === "numero") && (entradas.rua.value.trim() || entradas.numero.value.trim())) {
          tocados.add("rua");
          tocados.add("numero");
        }
        atualizar();
      });
    }
    // Rua e número dependem um do outro.
    entradas.rua.addEventListener("input", () => { if (tocados.has("numero")) atualizar(); });
    entradas.numero.addEventListener("input", () => { if (tocados.has("rua")) atualizar(); });

    form.addEventListener("submit", submeter);
  }

  function abrir() {
    limpar();
    modal.abrir();
  }

  FC.cadastroCliente = { init, abrir, OBRIGATORIOS };
})();
