// Sugestões de rua/bairro enquanto o usuário digita (namespace global FC.enderecos).
// Fonte principal: ViaCEP (busca por UF + cidade + logradouro). Se não houver resultado,
// tenta o Nominatim (OpenStreetMap).
(function () {
  const FC = (window.FC = window.FC || {});
  const { semAcento, normalizar } = FC.format;

  const cache = new Map();
  const MAX = 8;

  const contexto = () => window.FC_CONFIG?.ENDERECO || { cidade: "", uf: "" };

  function unicos(lista) {
    const vistos = new Set();
    const saida = [];
    for (const item of lista) {
      if (!item.logradouro) continue;
      const chave = normalizar(item.logradouro) + "|" + normalizar(item.bairro);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ ...item, texto: item.bairro ? `${item.logradouro}, ${item.bairro}` : item.logradouro });
      if (saida.length >= MAX) break;
    }
    return saida;
  }

  async function viaCep(termo, signal) {
    const { cidade, uf } = contexto();
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(semAcento(cidade))}/${encodeURIComponent(termo)}/json/`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error("viacep");
    const dados = await r.json();
    if (!Array.isArray(dados)) return [];
    return unicos(dados.map((d) => ({ logradouro: d.logradouro, bairro: d.bairro, origem: "viacep" })));
  }

  async function nominatim(termo, signal) {
    const { cidade, uf } = contexto();
    const q = [termo, cidade, uf, "Brasil"].filter(Boolean).join(", ");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=15&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("nominatim");
    const dados = await r.json();
    return unicos(
      dados.map((d) => ({
        logradouro: d.address?.road,
        bairro: d.address?.suburb || d.address?.neighbourhood || d.address?.city_district || "",
        origem: "osm",
      }))
    );
  }

  // Retorna [{ logradouro, bairro, texto, origem }]. Lança erro se nenhuma fonte responder.
  async function sugerirRuas(termo, { signal } = {}) {
    const chave = normalizar(termo);
    if (cache.has(chave)) return cache.get(chave);

    let resultado = [];
    let falhas = 0;
    for (const fonte of [viaCep, nominatim]) {
      try {
        resultado = await fonte(termo, signal);
        if (resultado.length) break;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        falhas++;
      }
    }
    if (!resultado.length && falhas === 2) throw new Error("Serviço de endereços indisponível");

    cache.set(chave, resultado);
    return resultado;
  }

  FC.enderecos = { sugerirRuas };
})();
