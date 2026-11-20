
(function () {
  const FC = (window.FC = window.FC || {});
  const { semAcento, normalizar } = FC.format;

  const cache = new Map();
  const MAX = 8;

  const contexto = () => window.FC_CONFIG?.ENDERECO || { cidade: "", uf: "" };

  function extrairRua(termo) {
    return String(termo || "")
      .split(",")[0]
      .replace(/\s+\d+[A-Za-z]?\s*$/, "")
      .trim();
  }

  function unicos(lista) {
    const vistos = new Set();
    const saida = [];

    for (const item of lista) {
      if (!item.logradouro) continue;
      const chave = normalizar(item.logradouro) + "|" + normalizar(item.bairro || "");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({
        ...item,
        texto: item.bairro ? `${item.logradouro}, ${item.bairro}` : item.logradouro,
      });
      if (saida.length >= MAX) break;
    }

    return saida;
  }

  async function viaCep(rua, signal) {
    const { cidade, uf } = contexto();
    if (!cidade || !uf || rua.length < 3) return [];

    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(semAcento(cidade))}/${encodeURIComponent(rua)}/json/`;
    const resposta = await fetch(url, { signal });
    if (!resposta.ok) throw new Error("viacep");

    const dados = await resposta.json();
    if (!Array.isArray(dados)) return [];

    return unicos(dados.map((item) => ({
      logradouro: item.logradouro,
      bairro: item.bairro,
      origem: "viacep",
    })));
  }

  async function nominatim(rua, signal) {
    const { cidade, uf } = contexto();
    const consulta = [rua, cidade, uf, "Brasil"].filter(Boolean).join(", ");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=15&accept-language=pt-BR&q=${encodeURIComponent(consulta)}`;
    const resposta = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!resposta.ok) throw new Error("nominatim");

    const dados = await resposta.json();
    if (!Array.isArray(dados)) return [];

    return unicos(dados.map((item) => ({
      logradouro: item.address?.road || item.address?.pedestrian || item.address?.residential,
      bairro: item.address?.suburb || item.address?.neighbourhood || item.address?.city_district || "",
      origem: "osm",
    })));
  }

  async function sugerirRuas(termo, { signal } = {}) {
    const rua = extrairRua(termo);
    if (rua.length < 3) return [];

    const { cidade, uf } = contexto();
    const chave = [normalizar(uf), normalizar(cidade), normalizar(rua)].join("|");
    if (cache.has(chave)) return cache.get(chave);

    let falhas = 0;
    for (const fonte of [viaCep, nominatim]) {
      try {
        const resultado = await fonte(rua, signal);
        if (resultado.length) {
          cache.set(chave, resultado);
          return resultado;
        }
      } catch (erro) {
        if (erro.name === "AbortError") throw erro;
        falhas++;
      }
    }

    if (falhas === 2) throw new Error("Serviço de endereços indisponível");
    cache.set(chave, []);
    return [];
  }

  FC.enderecos = { sugerirRuas };
})();
