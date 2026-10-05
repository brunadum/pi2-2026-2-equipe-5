// Configurações do front-end. Ajuste aqui sem mexer no restante do código.
window.FC_CONFIG = {
  // URL base da API Django (docker-compose expõe o back-end na porta 8001).
  API_BASE_URL: "http://localhost:8001/api",

  // Cidade/UF usadas para sugerir ruas no cadastro de cliente.
  ENDERECO: { cidade: "Crateús", uf: "CE" },
};
