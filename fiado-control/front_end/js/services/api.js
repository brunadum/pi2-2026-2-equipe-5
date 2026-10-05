// Cliente HTTP da API Fiado Control (namespace global FC.api).
(function () {
  const FC = (window.FC = window.FC || {});

  const baseUrl = () => (window.FC_CONFIG?.API_BASE_URL || "http://localhost:8001/api").replace(/\/$/, "");

  class ApiError extends Error {
    constructor({ status = 0, codigo = null, mensagem = "Erro inesperado.", dados = null, rede = false } = {}) {
      super(mensagem);
      this.name = "ApiError";
      this.status = status;
      this.codigo = codigo;
      this.mensagem = mensagem;
      this.dados = dados;
      this.rede = rede;
    }

    // Rota que o Django ainda não possui: 404 sem corpo { erro } (página HTML) ou 405.
    // Um 404 "cliente_nao_encontrado" tem `erro` e NÃO conta como rota inexistente.
    get naoImplementado() {
      return !this.rede && ((this.status === 404 && !this.codigo) || this.status === 405);
    }
  }

  async function request(caminho, { method = "GET", body, signal } = {}) {
    let resposta;
    try {
      resposta = await fetch(baseUrl() + caminho, {
        method,
        headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new ApiError({
        rede: true,
        mensagem: "Não foi possível conectar ao servidor. Verifique se o back-end está em execução.",
      });
    }

    const texto = await resposta.text();
    let dados = null;
    if (texto) {
      try { dados = JSON.parse(texto); } catch { /* corpo não-JSON (ex.: 404 HTML do Django) */ }
    }

    if (!resposta.ok) {
      throw new ApiError({
        status: resposta.status,
        codigo: dados?.erro ?? null,
        mensagem: dados?.mensagem ?? `O servidor respondeu com erro ${resposta.status}.`,
        dados,
      });
    }
    return dados;
  }

  FC.api = { request, ApiError };
})();
