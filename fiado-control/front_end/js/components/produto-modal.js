// Modal "Adicionar produto" da venda (namespace global FC.produtoModal).
//
// FC.produtoModal.init({ aoSalvar(item, indiceEditado|null) })
// FC.produtoModal.abrir()          → novo item
// FC.produtoModal.abrir(item, i)   → editar item
//
// Produtos salvos ficam disponíveis no catálogo.

(function () {
  const FC = (window.FC = window.FC || {});
  const { moeda, arredondar, escapeHtml } = FC.format;
  const masks = FC.masks;

  const QTD_MAX = 9999;

  let opcoes = { aoSalvar: () => {} };
  let modal, form, el, tocados, editando, sugestoes, ativo, timerBlur;

  // Impede requisições duplicadas.
  let salvando = false;

  // --------------------------------------------------------------- estado

  const lerQtd = () => {
    const n = Number(String(el.qtd.value).replace(/\D/g, ""));
    return Number.isInteger(n) ? n : 0;
  };

  function erros() {
    const nome = el.nome.value.trim();
    const preco = masks.valorMoeda(el.preco);
    const qtd = lerQtd();

    return {
      nome: !nome
        ? "Informe o nome do produto."
        : nome.length < 2
          ? "Nome muito curto."
          : "",
      preco: !preco ? "Informe o preço unitário." : "",
      qtd:
        qtd < 1
          ? "A quantidade mínima é 1."
          : qtd > QTD_MAX
            ? `A quantidade máxima é ${QTD_MAX}.`
            : "",
    };
  }

  function mostrarErro(campo, texto) {
    const caixa = document.getElementById(`prod-${campo}-erro`);
    caixa.textContent = texto;
    caixa.hidden = !texto;

    const entrada = campo === "qtd" ? el.qtd : el[campo];

    entrada.closest(".form-field").classList.toggle("has-error", !!texto);

    entrada.setAttribute("aria-invalid", texto ? "true" : "false");
  }

  function atualizar() {
    const e = erros();

    for (const c of ["nome", "preco", "qtd"]) {
      mostrarErro(c, tocados.has(c) ? e[c] : "");
    }

    // Não permite novos envios enquanto estiver salvando.
    el.enviar.disabled = salvando || !!(e.nome || e.preco || e.qtd);

    const total = arredondar(
      (masks.valorMoeda(el.preco) || 0) * Math.max(0, lerQtd()),
    );

    el.total.textContent = moeda(total);
    el.menos.disabled = lerQtd() <= 1;
    el.mais.disabled = lerQtd() >= QTD_MAX;

    atualizarDica();
  }

  function atualizarDica() {
    const nome = el.nome.value.trim();
    const existente = nome ? FC.produtos.porNome(nome) : null;

    el.linhaSalvar.hidden = !!editando && !!existente;

    if (!nome) {
      el.dica.textContent = "";
    } else if (existente) {
      el.dica.textContent =
        "Produto já salvo no catálogo — o preço foi preenchido.";
    } else {
      el.dica.textContent =
        "Produto novo. Marque a opção abaixo para salvá-lo no catálogo.";
    }
  }

  // ---------------------------------------------------------- sugestões

  function fecharLista() {
    el.lista.hidden = true;
    ativo = -1;

    el.nome.setAttribute("aria-expanded", "false");
    el.nome.removeAttribute("aria-activedescendant");
  }

  function pintarLista() {
    sugestoes = FC.produtos.buscar(el.nome.value).slice(0, 6);

    if (!sugestoes.length) {
      fecharLista();
      return;
    }

    el.lista.innerHTML = sugestoes
      .map(
        (p, i) =>
          `<li role="option" id="prod-op-${i}" data-i="${i}" aria-selected="false">${escapeHtml(p.nome)}<small>${moeda(p.preco)}</small></li>`,
      )
      .join("");

    el.lista.hidden = false;
    ativo = -1;
    el.nome.setAttribute("aria-expanded", "true");
  }

  function marcar(i) {
    const itens = [...el.lista.querySelectorAll('[role="option"]')];

    if (!itens.length) return;

    ativo = (i + itens.length) % itens.length;

    itens.forEach((li, k) => {
      li.setAttribute("aria-selected", String(k === ativo));

      if (k === ativo) {
        el.nome.setAttribute("aria-activedescendant", li.id);
      }
    });
  }

  function escolher(produto) {
    el.nome.value = produto.nome;
    masks.definirMoeda(el.preco, produto.preco);

    tocados.add("nome");
    tocados.add("preco");

    fecharLista();
    atualizar();

    el.qtd.focus();
    el.qtd.select();
  }

  function pintarChips() {
    const todos = FC.produtos.listar().slice(0, 8);

    el.chipsBloco.hidden = !todos.length || !!editando;

    el.chips.innerHTML = todos
      .map(
        (p) =>
          `<button type="button" class="chip" data-id="${p.id}">${escapeHtml(p.nome)} <small>${moeda(p.preco)}</small></button>`,
      )
      .join("");
  }

  // --------------------------------------------------------------- ações

  function ajustarQtd(delta) {
    el.qtd.value = String(
      Math.min(QTD_MAX, Math.max(1, (lerQtd() || 0) + delta)),
    );

    tocados.add("qtd");
    atualizar();
  }

  // Foi feito essa função para impedirque produto tenha envios duplicados.
  async function enviar(evento) {
    evento.preventDefault();

    if (salvando) return;

    const e = erros();

    if (e.nome || e.preco || e.qtd) {
      ["nome", "preco", "qtd"].forEach((c) => tocados.add(c));
      atualizar();

      const primeiro = ["nome", "preco", "qtd"].find((c) => e[c]);

      (primeiro === "qtd" ? el.qtd : el[primeiro]).focus();

      return;
    }

    const item = {
      nome: el.nome.value.trim(),
      preco: masks.valorMoeda(el.preco),
      qtd: lerQtd(),
    };

    salvando = true;
    el.enviar.disabled = true;
    el.alerta.hidden = true;

    try {
      const jaSalvo = FC.produtos.porNome(item.nome);

      // Salva ou atualiza somente quando a opção estiver marcada.
      if (el.salvar.checked) {
        await FC.produtos.salvar({
          nome: item.nome,
          preco: item.preco,
        });
      }

      if (el.salvar.checked || jaSalvo) {
        FC.produtos.registrarUso(item.nome);
      }

      const indice = editando ? editando.indice : null;

      modal.fechar();
      opcoes.aoSalvar(item, indice);
    } catch (erro) {
      el.alerta.textContent =
        erro.mensagem || erro.message || "Não foi possível salvar o produto.";

      el.alerta.hidden = false;

      console.error("Erro ao salvar produto:", erro);
    } finally {
      salvando = false;
      atualizar();
    }
  }

  function limpar() {
    form.reset();

    el.qtd.value = "1";
    el.preco.value = "";

    tocados = new Set();
    editando = null;

    fecharLista();

    ["nome", "preco", "qtd"].forEach((c) => mostrarErro(c, ""));

    el.alerta.hidden = true;
    el.enviar.disabled = true;
    el.salvar.checked = true;
  }

  function abrir(item, indice) {
    limpar();

    if (item) {
      editando = { indice };
      el.nome.value = item.nome;
      masks.definirMoeda(el.preco, item.preco);
      el.qtd.value = String(item.qtd);
      el.salvar.checked = false;
    }

    document.getElementById("prod-titulo").textContent = item
      ? "Editar produto"
      : "Adicionar produto";

    el.enviar.textContent = item ? "Salvar item" : "Adicionar à venda";

    pintarChips();
    atualizar();
    modal.abrir();
  }

  function init(config = {}) {
    opcoes = { ...opcoes, ...config };

    form = document.getElementById("form-produto");

    el = {
      nome: document.getElementById("prod-nome"),
      preco: document.getElementById("prod-preco"),
      qtd: document.getElementById("prod-qtd"),
      menos: document.getElementById("prod-menos"),
      mais: document.getElementById("prod-mais"),
      total: document.getElementById("prod-total"),
      dica: document.getElementById("prod-dica"),
      lista: document.getElementById("prod-nome-lista"),
      salvar: document.getElementById("prod-salvar"),
      linhaSalvar: document.getElementById("linha-salvar"),
      chips: document.getElementById("prod-chips"),
      chipsBloco: document.getElementById("chips-bloco"),
      alerta: document.getElementById("prod-alerta"),
      enviar: document.getElementById("prod-enviar"),
    };

    modal = FC.ui.criarModal(document.getElementById("modal-produto"), {
      aoFechar: limpar,
    });

    tocados = new Set();
    sugestoes = [];
    ativo = -1;

    masks.mascaraMoeda(el.preco);

    el.qtd.addEventListener("input", () => {
      el.qtd.value = el.qtd.value.replace(/\D/g, "").slice(0, 4);
      tocados.add("qtd");
      atualizar();
    });

    el.qtd.addEventListener("blur", () => {
      if (!lerQtd()) {
        el.qtd.value = "1";
        atualizar();
      }
    });

    el.menos.addEventListener("click", () => ajustarQtd(-1));
    el.mais.addEventListener("click", () => ajustarQtd(1));

    el.nome.addEventListener("input", () => {
      tocados.add("nome");
      pintarLista();

      const salvo = FC.produtos.porNome(el.nome.value);

      if (salvo && !masks.valorMoeda(el.preco)) {
        masks.definirMoeda(el.preco, salvo.preco);
        tocados.add("preco");
      }

      atualizar();
    });

    el.nome.addEventListener("focus", () => {
      if (!el.nome.value.trim()) pintarLista();
    });

    el.nome.addEventListener("keydown", (e) => {
      const aberta = !el.lista.hidden;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!aberta) pintarLista();
        else marcar(ativo + 1);
      } else if (e.key === "ArrowUp" && aberta) {
        e.preventDefault();
        marcar(ativo - 1);
      } else if (e.key === "Enter" && aberta && ativo >= 0) {
        e.preventDefault();
        escolher(sugestoes[ativo]);
      } else if (e.key === "Escape" && aberta) {
        e.stopPropagation();
        fecharLista();
      }
    });

    el.nome.addEventListener("blur", () => {
      timerBlur = window.setTimeout(fecharLista, 150);
    });

    el.nome.addEventListener("focus", () => {
      window.clearTimeout(timerBlur);
    });

    el.nome.addEventListener("input", () => {
      window.clearTimeout(timerBlur);
    });

    el.lista.addEventListener("mousedown", (e) => {
      const li = e.target.closest('[role="option"]');
      if (!li) return;

      e.preventDefault();
      escolher(sugestoes[Number(li.dataset.i)]);
    });

    el.chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;

      const p = FC.produtos.listar().find((x) => String(x.id) === b.dataset.id);

      if (p) escolher(p);
    });

    el.preco.addEventListener("input", () => {
      tocados.add("preco");
      atualizar();
    });

    for (const c of ["nome", "preco"]) {
      el[c].addEventListener("blur", () => {
        tocados.add(c);
        atualizar();
      });
    }

    form.addEventListener("submit", enviar);
  }

  FC.produtoModal = { init, abrir };
})();
