// Código do gerente (namespace global FC.codigoGerente).
//
// É o código de 6 dígitos que o gerente define em Configurações e que libera operações restritas:
// cadastro de usuário e, para quem não é gerente, cancelar venda, estornar pagamento e alterar limite.
//
// CONTRATO PROPOSTO PARA O BACK-END (ainda não existe — ver docs/front-end/sprint5-front.md):
//   GET  /configuracoes/codigo-gerente   -> { definido: boolean }
//   PUT  /configuracoes/codigo-gerente   <- { codigo_novo, codigo_atual? }        (somente gerente)
//   POST /autorizacoes/gerente           <- { codigo } -> { autorizado: true, token_autorizacao }
//                                           422 { erro: "codigo_gerente_invalido" } | 409 { erro: "codigo_gerente_nao_definido" }
//                                           (não usar 401: o cliente HTTP trata 401 como sessão expirada e desloga)
// Enquanto o back-end não tiver essas rotas, o código fica guardado só neste navegador (hash SHA-256
// com sal, em localStorage). Serve para demonstrar o fluxo; NÃO é segurança de verdade, e o servidor
// continua decidindo se a operação é permitida.
(function () {
  const FC = (window.FC = window.FC || {});
  const { request, ApiError } = FC.api;

  const CHAVE = "fiadoControl.codigoGerente.v1";
  const state = { local: false };
  const FORMATO = /^\d{6}$/;

  const erro = (codigo, mensagem, status = 422) => new ApiError({ status, codigo, mensagem });

  async function hash(codigo, sal) {
    if (!window.crypto?.subtle) throw erro("sem_suporte", "Este navegador não permite proteger o código. Abra o sistema por http://localhost ou https.");
    const dados = new TextEncoder().encode(`${sal}:${codigo}`);
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { return null; } };
  const salvarLocal = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); return true; } catch { return false; } };
  const usaLocal = (e) => e instanceof ApiError && e.naoImplementado;

  async function definido() {
    if (!state.local) {
      try {
        const r = await request("/configuracoes/codigo-gerente");
        return !!r?.definido;
      } catch (e) {
        if (!usaLocal(e)) throw e;
        state.local = true;
      }
    }
    return !!lerLocal()?.hash;
  }

  async function definir({ codigoNovo, codigoAtual }) {
    if (!FORMATO.test(codigoNovo || "")) throw erro("codigo_invalido", "O código deve ter exatamente 6 números.", 400);
    if (!state.local) {
      try {
        await request("/configuracoes/codigo-gerente", {
          method: "PUT",
          body: { codigo_novo: codigoNovo, ...(codigoAtual ? { codigo_atual: codigoAtual } : {}) },
        });
        return;
      } catch (e) {
        if (!usaLocal(e)) throw e;
        state.local = true;
      }
    }
    const atual = lerLocal();
    if (atual?.hash) {
      if (!codigoAtual) throw erro("codigo_atual_obrigatorio", "Informe o código atual para trocá-lo.");
      if ((await hash(codigoAtual, atual.sal)) !== atual.hash) throw erro("codigo_atual_invalido", "O código atual não confere.");
    }
    const sal = crypto.getRandomValues(new Uint32Array(4)).join("-");
    if (!salvarLocal({ sal, hash: await hash(codigoNovo, sal) })) throw erro("armazenamento", "Não foi possível salvar o código neste navegador.");
  }

  // Resolve com { autorizacao } (token do servidor, quando houver) ou lança ApiError.
  async function validar(codigo) {
    if (!FORMATO.test(codigo || "")) throw erro("codigo_gerente_invalido", "Código inválido. Verifique o código e tente novamente.", 422);
    if (!state.local) {
      try {
        const r = await request("/autorizacoes/gerente", { method: "POST", body: { codigo } });
        return { autorizacao: r?.token_autorizacao || "" };
      } catch (e) {
        if (e.codigo === "codigo_gerente_invalido") throw erro("codigo_gerente_invalido", "Código inválido. Verifique o código e tente novamente.", 422);
        if (e.codigo === "codigo_gerente_nao_definido") throw erro("codigo_gerente_nao_definido", e.mensagem || "Nenhum código de gerente foi definido ainda.", 409);
        if (!usaLocal(e)) throw e;
        state.local = true;
      }
    }
    const atual = lerLocal();
    if (!atual?.hash) throw erro("codigo_gerente_nao_definido", "Nenhum código de gerente foi definido ainda. O gerente precisa defini-lo em Configurações → Código do gerente.", 409);
    if ((await hash(codigo, atual.sal)) !== atual.hash) throw erro("codigo_gerente_invalido", "Código inválido. Verifique o código e tente novamente.", 422);
    return { autorizacao: "" };
  }

  FC.codigoGerente = {
    FORMATO, definido, definir, validar,
    aviso: () => (state.local
      ? "O back-end ainda não possui as rotas do código do gerente. O código está guardado apenas neste navegador, só para demonstração."
      : ""),
  };
})();
