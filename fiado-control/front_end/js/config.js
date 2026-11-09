// Configurações do front-end. Ajuste aqui sem mexer no restante do código.
window.FC_CONFIG = {
  // URL base da API Django (docker-compose expõe o back-end na porta 8001).
  // Usa o mesmo endereço que abriu a página: no PC vira localhost; no celular,
  // aberto por http://<IP-do-PC>, a API é chamada em http://<IP-do-PC>:8001.
  API_BASE_URL: `${location.protocol === "https:" ? "https:" : "http:"}//${location.hostname || "localhost"}:8001/api`,

  // Cidade/UF usadas para sugerir ruas no cadastro de cliente.
  ENDERECO: { cidade: "Crateús", uf: "CE" },
};
