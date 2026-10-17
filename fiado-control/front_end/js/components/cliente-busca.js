// Campo de busca de cliente com lista de sugestões (namespace global FC.clienteBusca).
//
// FC.clienteBusca.criar({ input, botao, lista, aoSelecionar(cliente), aoLimpar(), aoCadastrar() })
//   → { selecionar(cliente), limpar(), recarregar(), obterClientes() }
// Busca por nome, CPF ou telefone entre os clientes cadastrados.
(function () {
  const FC = (window.FC = window.FC || {});
  const { normalizar, apenasDigitos, escapeHtml, cpf: formatarCpf } = FC.format;

  function criar({ input, botao, lista, aoSelecionar, aoLimpar, aoCadastrar }) {
    let clientes = [];
    let carregado = null;
    let resultados = [];
    let ativo = -1;
    let selecionado = null;

    const fechar = () => {
      lista.hidden = true;
      ativo = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };

    function carregar() {
      if (!carregado) {
        carregado = FC.clientes.listarClientes().then((c) => {
          clientes = c.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          return clientes;
        });
        carregado.catch(() => { carregado = null; });
      }
      return carregado;
    }

    function filtrar(termo) {
      const t = normalizar(termo);
      const d = apenasDigitos(termo);
      if (!t) return clientes.slice(0, 8);
      return clientes.filter((c) =>
        normalizar(c.nome).includes(t) || (d && (c.cpf.includes(d) || c.telefone.some((x) => x.includes(d)))),
      ).slice(0, 8);
    }

    function pintar() {
      const termo = input.value.trim();
      resultados = filtrar(termo);
      let html;
      if (resultados.length) {
        html = resultados.map((c, i) =>
          `<li role="option" id="${lista.id}-${i}" data-i="${i}" aria-selected="false">${escapeHtml(c.nome)}<small>CPF ${escapeHtml(formatarCpf(c.cpf))}</small></li>`).join("");
      } else {
        html = `<li class="combo-msg">${clientes.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}</li>`;
      }
      if (aoCadastrar) {
        html += `<li class="combo-acao" role="option" id="${lista.id}-novo" data-novo="1" aria-selected="false">+ Cadastrar cliente rápido</li>`;
      }
      lista.innerHTML = html;
      lista.hidden = false;
      ativo = -1;
      input.setAttribute("aria-expanded", "true");
    }

    function marcar(indice) {
      const itens = [...lista.querySelectorAll('[role="option"]')];
      if (!itens.length) return;
      ativo = (indice + itens.length) % itens.length;
      itens.forEach((li, i) => {
        li.setAttribute("aria-selected", String(i === ativo));
        if (i === ativo) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
      });
    }

    function selecionar(cliente) {
      selecionado = cliente;
      input.value = cliente.nome;
      fechar();
      aoSelecionar(cliente);
    }

    function limpar() {
      selecionado = null;
      input.value = "";
      fechar();
    }

    async function abrirLista() {
      try {
        await carregar();
      } catch (e) {
        lista.innerHTML = `<li class="combo-msg">${escapeHtml(e.mensagem || "Não foi possível carregar os clientes.")}</li>`;
        lista.hidden = false;
        return;
      }
      pintar();
    }

    function escolherAtivo() {
      const itens = [...lista.querySelectorAll('[role="option"]')];
      const li = ativo >= 0 ? itens[ativo] : null;
      if (li?.dataset.novo) { fechar(); aoCadastrar(); return; }
      const alvo = li ? resultados[Number(li.dataset.i)] : resultados[0];
      if (alvo) selecionar(alvo);
      else pintar();
    }

    input.addEventListener("focus", () => { if (!selecionado) abrirLista(); });
    input.addEventListener("input", () => {
      if (selecionado) { selecionado = null; aoLimpar && aoLimpar(); }
      abrirLista();
    });
    input.addEventListener("keydown", (e) => {
      const aberta = !lista.hidden;
      if (e.key === "ArrowDown") { e.preventDefault(); if (!aberta) abrirLista(); else marcar(ativo + 1); }
      else if (e.key === "ArrowUp" && aberta) { e.preventDefault(); marcar(ativo - 1); }
      else if (e.key === "Enter") { e.preventDefault(); if (aberta) escolherAtivo(); else abrirLista(); }
      else if (e.key === "Escape" && aberta) { e.stopPropagation(); fechar(); }
    });
    let timerBlur;
    input.addEventListener("blur", () => { timerBlur = window.setTimeout(fechar, 150); });
    input.addEventListener("focus", () => window.clearTimeout(timerBlur));
    input.addEventListener("input", () => window.clearTimeout(timerBlur));

    lista.addEventListener("mousedown", (e) => {
      const li = e.target.closest('[role="option"]');
      if (!li) return;
      e.preventDefault();
      if (li.dataset.novo) { fechar(); aoCadastrar(); return; }
      selecionar(resultados[Number(li.dataset.i)]);
    });

    if (botao) {
      botao.addEventListener("click", async () => {
        if (!input.value.trim()) { input.focus(); return; }
        try { await carregar(); } catch { return abrirLista(); }
        const achados = filtrar(input.value);
        if (achados.length === 1) selecionar(achados[0]);
        else { input.focus(); pintar(); }
      });
    }

    return {
      selecionar,
      limpar,
      async recarregar() { carregado = null; await carregar(); },
      obterClientes: () => clientes,
      carregar,
    };
  }

  FC.clienteBusca = { criar };
})();
