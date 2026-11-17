const isLocal =
  ["localhost", "127.0.0.1", ""].includes(location.hostname) ||
  location.hostname.startsWith("192.168.");

window.FC_CONFIG = {
  API_BASE_URL: isLocal
    ? `http://${location.hostname || "localhost"}:8001/api`
    : "https://fiado-control-api.onrender.com/api",

  ENDERECO: { cidade: "Crateús", uf: "CE" },
};