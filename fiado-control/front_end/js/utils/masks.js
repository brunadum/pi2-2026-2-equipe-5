// Máscaras de input (namespace global FC.masks).
(function () {
  const FC = (window.FC = window.FC || {});
  const { apenasDigitos } = FC.format;

  function formatarCpf(d) {
    let o = d.slice(0, 3);
    if (d.length > 3) o += "." + d.slice(3, 6);
    if (d.length > 6) o += "." + d.slice(6, 9);
    if (d.length > 9) o += "-" + d.slice(9, 11);
    return o;
  }

  function formatarTelefone(d) {
    if (!d) return "";
    const corte = d.length > 10 ? 7 : 6; // 11 dígitos: 5+4 | até 10: 4+4
    let o = "(" + d.slice(0, 2);
    if (d.length > 2) o += ") " + d.slice(2, corte);
    if (d.length > corte) o += "-" + d.slice(corte);
    return o;
  }

  // Aplica uma máscara numérica preservando a posição do cursor e o backspace sobre símbolos.
  function mascaraDigitos(input, formatar, maxDigitos) {
    let anterior = input.value;

    input.addEventListener("input", (e) => {
      const bruto = input.value;
      const cursor = input.selectionStart ?? bruto.length;
      let digitos = apenasDigitos(bruto);
      let antes = apenasDigitos(bruto.slice(0, cursor)).length;

      // Apagou só um símbolo (ex.: o "-"): remove o dígito anterior ao cursor.
      const apagando = e.inputType && e.inputType.startsWith("delete");
      if (apagando && digitos === apenasDigitos(anterior) && antes > 0) {
        digitos = digitos.slice(0, antes - 1) + digitos.slice(antes);
        antes -= 1;
      }

      digitos = digitos.slice(0, maxDigitos);
      antes = Math.min(antes, digitos.length);
      const formatado = formatar(digitos);
      input.value = formatado;

      let pos = 0;
      let contados = 0;
      while (pos < formatado.length && contados < antes) {
        if (/\d/.test(formatado[pos])) contados++;
        pos++;
      }
      input.setSelectionRange(pos, pos);
      anterior = formatado;
    });
  }

  const mascaraCpf = (input) => mascaraDigitos(input, formatarCpf, 11);
  const mascaraTelefone = (input) => mascaraDigitos(input, formatarTelefone, 11);

  const formatarMoedaDigitos = (d) =>
    (Number(d) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Máscara de dinheiro: os dígitos "entram pela direita" (5 → R$ 0,05 → 50 → R$ 0,50).
  function mascaraMoeda(input) {
    input.addEventListener("input", () => {
      const d = apenasDigitos(input.value).replace(/^0+(?=\d)/, "").slice(0, 11);
      input.value = d ? formatarMoedaDigitos(d) : "";
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  // Número do imóvel: dígitos, letras, "/" e "-" (ex.: 120, 45A, S/N).
  function mascaraNumero(input) {
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9/\-]/g, "").slice(0, 8);
    });
  }

  // Valor numérico do campo de moeda, ou null se estiver vazio.
  function valorMoeda(input) {
    const d = apenasDigitos(input.value);
    return d ? Number(d) / 100 : null;
  }

  function definirMoeda(input, numero) {
    input.value = numero == null ? "" : formatarMoedaDigitos(String(Math.round(numero * 100)));
  }

  FC.masks = {
    formatarCpf, formatarTelefone, mascaraCpf, mascaraTelefone, mascaraMoeda, mascaraNumero,
    valorMoeda, definirMoeda,
  };
})();
