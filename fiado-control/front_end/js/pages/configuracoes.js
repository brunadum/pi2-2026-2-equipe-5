(() => {
  const api = window.FC?.api;
  const form = document.getElementById("settings-form");
  const status = document.getElementById("settings-status");
  const saveStatus = document.getElementById("save-status");
  const saveButton = document.getElementById("save-settings");
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const STORAGE_KEY = "fiado-control.configuracoes.v1";

  // Valores visuais iniciais iguais ao protótipo. Não são regras persistidas no banco.
  const DEFAULT_SETTINGS = {
    multa_diaria_percentual: 0.33,
    juros_mensais_percentual: 10,
    desconto_maximo_percentual: 15,
    limite_padrao_cliente: 500,
    bloquear_vendas_atraso: true,
    permitir_cliente_sem_cpf: true,
    exigir_senha_venda: false,
    permitir_venda_parcial: true,
    operador_cadastrar_cliente: true,
    operador_registrar_pagamento: true,
    restringir_relatorios_admin: false,
  };

  let origemConfiguracoes = "default";

  function mostrarStatus(elemento, mensagem, erro = false) {
    elemento.textContent = mensagem;
    elemento.hidden = !mensagem;
    elemento.classList.toggle("error", erro);
  }

  function lerConfiguracoesLocais() {
    try {
      const valor = localStorage.getItem(STORAGE_KEY);
      return valor ? JSON.parse(valor) : {};
    } catch {
      return {};
    }
  }

  function salvarConfiguracoesLocais(configuracoes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configuracoes));
      return true;
    } catch {
      return false;
    }
  }

  function normalizarResposta(resposta) {
    // Permite que o backend retorne os campos diretamente ou dentro de `configuracoes`.
    if (resposta && typeof resposta === "object" && resposta.configuracoes) {
      return resposta.configuracoes;
    }
    return resposta && typeof resposta === "object" ? resposta : {};
  }

  function preencherFormulario(configuracoes) {
    for (const elemento of form.elements) {
      if (!elemento.name || !(elemento.name in configuracoes)) continue;

      if (elemento.type === "checkbox") {
        elemento.checked = Boolean(configuracoes[elemento.name]);
      } else {
        elemento.value = configuracoes[elemento.name] ?? "";
      }
    }
  }

  function coletarFormulario() {
    const payload = {};
    for (const elemento of form.elements) {
      if (!elemento.name) continue;
      payload[elemento.name] = elemento.type === "checkbox"
        ? elemento.checked
        : Number(elemento.value);
    }
    return payload;
  }

  async function carregarConfiguracoes() {
    const locais = lerConfiguracoesLocais();
    let configuracoes = { ...DEFAULT_SETTINGS, ...locais };

    if (!api) {
      origemConfiguracoes = "local";
      preencherFormulario(configuracoes);
      mostrarStatus(status, "Cliente da API não foi carregado. Os valores exibidos não foram consultados no banco de dados.", true);
      saveStatus.textContent = "O salvamento ficará disponível apenas neste navegador.";
      return;
    }

    try {
      // CONTRATO BACKEND: implementar GET /api/configuracoes/ lendo as configurações no banco.
      // A resposta deve conter os campos definidos em DEFAULT_SETTINGS (ou { configuracoes: {...} }).
      const resposta = await api.request("/configuracoes/");
      configuracoes = { ...DEFAULT_SETTINGS, ...normalizarResposta(resposta) };
      origemConfiguracoes = "backend";
      preencherFormulario(configuracoes);
      salvarConfiguracoesLocais(configuracoes); // cache local; a fonte oficial continua sendo o backend.
      mostrarStatus(status, "");
      saveStatus.textContent = "Configurações carregadas do backend.";
    } catch (erro) {
      origemConfiguracoes = "local";
      preencherFormulario(configuracoes);

      if (erro?.naoImplementado) {
        mostrarStatus(status, "O backend ainda não implementa GET/PUT /api/configuracoes/. Os valores padrão são demonstrativos; as alterações ficarão apenas neste navegador.", true);
        saveStatus.textContent = locais && Object.keys(locais).length
          ? "Valores locais carregados; ainda não estão sincronizados com o banco."
          : "Ainda não conectado ao banco de dados.";
        return;
      }

      mostrarStatus(status, `${erro?.mensagem || "Não foi possível consultar o backend."} Os valores locais, quando existentes, foram mantidos.`, true);
      saveStatus.textContent = "Confirme a conexão com o backend antes de salvar.";
    }
  }

  function ativarAba(abaSelecionada) {
    tabs.forEach((aba) => {
      const ativa = aba === abaSelecionada;
      aba.classList.toggle("active", ativa);
      aba.setAttribute("aria-selected", String(ativa));
      aba.tabIndex = ativa ? 0 : -1;
    });

    document.querySelectorAll("[data-section]").forEach((secao) => {
      secao.hidden = secao.dataset.section !== abaSelecionada.dataset.tab;
    });
  }

  tabs.forEach((aba) => {
    aba.addEventListener("click", () => ativarAba(aba));
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!form.reportValidity()) return;

    const payload = coletarFormulario();
    saveButton.disabled = true;
    saveStatus.textContent = "Salvando configurações…";

    if (api) {
      try {
        // CONTRATO BACKEND: implementar PUT /api/configuracoes/ para validar e persistir esse JSON.
        // Os nomes das propriedades coincidem com os atributos `name` dos campos deste formulário.
        await api.request("/configuracoes/", { method: "PUT", body: payload });
        salvarConfiguracoesLocais(payload);
        origemConfiguracoes = "backend";
        mostrarStatus(status, "");
        saveStatus.textContent = "Configurações salvas no backend.";
        saveButton.disabled = false;
        return;
      } catch (erro) {
        if (!erro?.naoImplementado && !erro?.rede) {
          saveStatus.textContent = erro?.mensagem || "Não foi possível salvar as configurações no backend.";
          mostrarStatus(status, "O backend recusou o salvamento. Nenhuma confirmação de gravação no banco foi apresentada.", true);
          saveButton.disabled = false;
          return;
        }

        // Fallback explícito: até o endpoint existir ou o servidor voltar, salva só neste navegador.
        const salvo = salvarConfiguracoesLocais(payload);
        origemConfiguracoes = "local";
        mostrarStatus(status, erro?.naoImplementado
          ? "O backend ainda não implementa PUT /api/configuracoes/. As alterações foram salvas somente neste navegador."
          : "O backend está indisponível. As alterações foram salvas somente neste navegador.", true);
        saveStatus.textContent = salvo
          ? "Salvo localmente, sem sincronização com o banco de dados."
          : "Não foi possível salvar no navegador. Verifique as permissões de armazenamento.";
        saveButton.disabled = false;
        return;
      }
    }

    const salvo = salvarConfiguracoesLocais(payload);
    origemConfiguracoes = "local";
    mostrarStatus(status, "Cliente da API não foi carregado. As alterações não foram enviadas ao backend.", true);
    saveStatus.textContent = salvo
      ? "Salvo localmente, sem sincronização com o banco de dados."
      : "Não foi possível salvar no navegador.";
    saveButton.disabled = false;
  });

  // O menu responsivo segue o comportamento das telas já existentes no projeto.
  const sidebar = document.getElementById("sidebar");
  const menu = document.getElementById("mobile-menu");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (sidebar && menu && backdrop) {
    const fecharMenu = () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
      menu.setAttribute("aria-expanded", "false");
    };

    menu.addEventListener("click", () => {
      const aberto = sidebar.classList.toggle("open");
      backdrop.classList.toggle("show", aberto);
      menu.setAttribute("aria-expanded", String(aberto));
    });
    backdrop.addEventListener("click", fecharMenu);
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") fecharMenu();
    });
  }

  // Mantém `origemConfiguracoes` disponível para diagnóstico no DevTools sem interferir na UI.
  window.FC_CONFIGURACOES = {
    get origem() {
      return origemConfiguracoes;
    },
  };

  carregarConfiguracoes();
})();
