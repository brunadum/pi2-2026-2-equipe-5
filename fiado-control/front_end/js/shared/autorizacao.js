// Telas de autorização do gerente (namespace global FC.autorizacao).
//
//   const r = await FC.autorizacao.exigir();            // ação restrita: gerente passa direto;
//                                                       // funcionário vê "Usuário sem permissão".
//   const r = await FC.autorizacao.exigir({ forcar: true }); // sempre pede o código (ex.: criar usuário).
//   if (!r.ok) return;                                   // cancelou
//   // r.autorizacao = token do servidor (pode ser ""), enviado no cabeçalho X-Autorizacao-Gerente;
//   // r.viaCodigo = true quando a liberação veio do código (e não de um gerente logado).
//
// Depende de FC.auth e FC.codigoGerente. Estilos em css/autorizacao.css.
(function () {
  const FC = (window.FC = window.FC || {});

  const ICONES = {
    chave: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3M14 9l2 2"/></svg>',
    cadeado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.2 7 10 4-1.8 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    usuarios: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.4-3.3 2.6-5 6-5s5.6 1.7 6 5M16.5 5.5a3 3 0 0 1 0 5.6M18 15c2 .5 3.1 2.1 3.4 5"/></svg>',
    confirmar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
  };

  const MAX_TENTATIVAS = 5;
  const ESPERA_S = 30;
  let tentativas = 0;
  let bloqueadoAte = 0;
  let aberta = false;

  function exigir({ forcar = false } = {}) {
    if (!forcar && FC.auth && FC.auth.perfil() === "gerente") return Promise.resolve({ ok: true, autorizacao: "", viaCodigo: false });
    if (aberta) return Promise.resolve({ ok: false });
    aberta = true;

    return new Promise((resolve) => {
      const ultimoFoco = document.activeElement;
      const raiz = document.createElement("div");
      raiz.className = "auth-overlay";
      raiz.setAttribute("role", "dialog");
      raiz.setAttribute("aria-modal", "true");
      raiz.setAttribute("aria-labelledby", "auth-titulo");
      raiz.innerHTML = `
        <header class="auth-topo">
          <div class="auth-marca"><strong>Fiado Control</strong><small>Gestão de vendas</small></div>
          <span class="auth-selo">${ICONES.escudo}Controle de acesso</span>
        </header>
        <main class="auth-centro"><section class="auth-card" id="auth-card"></section></main>
        <footer class="auth-rodape">${ICONES.cadeado}Ambiente protegido • Acesso por permissão</footer>`;
      document.body.appendChild(raiz);
      document.body.classList.add("modal-open");
      const card = raiz.querySelector("#auth-card");

      function encerrar(resultado) {
        document.removeEventListener("keydown", aoTeclar, true);
        raiz.remove();
        document.body.classList.remove("modal-open");
        aberta = false;
        if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
        resolve(resultado);
      }
      const cancelar = () => encerrar({ ok: false });

      function aoTeclar(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancelar(); return; }
        if (e.key !== "Tab") return;
        e.stopImmediatePropagation();
        const itens = [...card.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href]")];
        if (!itens.length) return;
        const [primeiro, ultimo] = [itens[0], itens[itens.length - 1]];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
      document.addEventListener("keydown", aoTeclar, true);

      // ------------------------------------------------ passo 1: sem permissão
      function passoSemPermissao() {
        card.innerHTML = `
          <span class="auth-icone auth-icone-aviso">${ICONES.cadeado}</span>
          <h1 id="auth-titulo">Usuário sem permissão</h1>
          <p class="auth-texto">Seu usuário não tem permissão para realizar esta operação.<br>Peça a autorização de um gerente ou entre com outro usuário.</p>
          <button type="button" class="auth-btn auth-btn-primario" id="auth-inserir">${ICONES.chave}Inserir código do gerente</button>
          <button type="button" class="auth-btn auth-btn-secundario" id="auth-trocar">${ICONES.usuarios}Trocar de usuário</button>
          <button type="button" class="auth-link" id="auth-cancelar">Cancelar operação</button>`;
        card.querySelector("#auth-inserir").addEventListener("click", () => passoCodigo(true));
        card.querySelector("#auth-trocar").addEventListener("click", () => { encerrar({ ok: false }); FC.auth.sair(); });
        card.querySelector("#auth-cancelar").addEventListener("click", cancelar);
        card.querySelector("#auth-inserir").focus();
      }

      // ------------------------------------------------ passo 2: código do gerente
      function passoCodigo(podeVoltarAoAviso) {
        card.innerHTML = `
          <span class="auth-icone">${ICONES.chave}</span>
          <h1 id="auth-titulo">Autorização do gerente</h1>
          <p class="auth-texto">Insira o código do gerente para autorizar esta operação e continuar.</p>
          <form id="auth-form" novalidate>
            <label for="auth-codigo" class="auth-label">Código do gerente</label>
            <div class="auth-campo" id="auth-campo">
              <span class="auth-campo-icone">${ICONES.cadeado}</span>
              <input id="auth-codigo" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="Digite o código do gerente" aria-describedby="auth-erro auth-dica">
              <span class="auth-campo-alerta" hidden>${ICONES.alerta}</span>
            </div>
            <p class="auth-erro" id="auth-erro" role="alert" hidden></p>
            <p class="auth-dica" id="auth-dica">A autorização vale apenas para esta operação.</p>
            <button type="submit" class="auth-btn auth-btn-primario" id="auth-confirmar">${ICONES.confirmar}Confirmar código</button>
            <button type="button" class="auth-btn auth-btn-secundario" id="auth-voltar">${ICONES.voltar}Voltar</button>
          </form>`;
        const form = card.querySelector("#auth-form");
        const campo = card.querySelector("#auth-campo");
        const entrada = card.querySelector("#auth-codigo");
        const msg = card.querySelector("#auth-erro");
        const alerta = card.querySelector(".auth-campo-alerta");
        const botao = card.querySelector("#auth-confirmar");
        let temporizador = null;

        const mostrarErro = (texto) => {
          msg.textContent = texto || "";
          msg.hidden = !texto;
          campo.classList.toggle("tem-erro", !!texto);
          alerta.hidden = !texto;
          entrada.setAttribute("aria-invalid", texto ? "true" : "false");
        };
        function atualizarEspera() {
          const falta = Math.ceil((bloqueadoAte - Date.now()) / 1000);
          if (falta > 0) {
            mostrarErro(`Muitas tentativas. Aguarde ${falta} segundo${falta > 1 ? "s" : ""} para tentar de novo.`);
            botao.disabled = true;
            return true;
          }
          if (temporizador) { clearInterval(temporizador); temporizador = null; }
          if (botao.disabled && !botao.classList.contains("carregando")) { botao.disabled = false; mostrarErro(""); }
          return false;
        }
        if (atualizarEspera()) temporizador = setInterval(atualizarEspera, 1000);

        entrada.addEventListener("input", () => {
          entrada.value = entrada.value.replace(/\D/g, "");
          if (!botao.disabled) mostrarErro("");
        });
        card.querySelector("#auth-voltar").addEventListener("click", () => {
          if (temporizador) clearInterval(temporizador);
          if (podeVoltarAoAviso) passoSemPermissao(); else cancelar();
        });

        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          if (botao.disabled) return;
          if (!entrada.value) { mostrarErro("Informe o código do gerente."); entrada.focus(); return; }
          botao.disabled = true;
          botao.classList.add("carregando");
          try {
            const r = await FC.codigoGerente.validar(entrada.value);
            tentativas = 0;
            if (temporizador) clearInterval(temporizador);
            encerrar({ ok: true, autorizacao: r.autorizacao, viaCodigo: true });
          } catch (e) {
            botao.classList.remove("carregando");
            botao.disabled = false;
            if (e.codigo === "codigo_gerente_invalido") {
              tentativas += 1;
              if (tentativas >= MAX_TENTATIVAS) {
                tentativas = 0;
                bloqueadoAte = Date.now() + ESPERA_S * 1000;
                atualizarEspera();
                temporizador = setInterval(atualizarEspera, 1000);
              } else {
                mostrarErro(e.mensagem);
              }
            } else {
              mostrarErro(e.mensagem || "Não foi possível validar o código. Tente novamente.");
            }
            entrada.focus();
            entrada.select(); // mantém o que foi digitado (como no protótipo) e deixa pronto para corrigir
          }
        });
        entrada.focus();
      }

      if (forcar) passoCodigo(false); else passoSemPermissao();
    });
  }

  FC.autorizacao = { exigir };
})();
