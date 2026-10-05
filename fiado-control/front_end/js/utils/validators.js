// Validações de formulário (namespace global FC.validators).
(function () {
  const FC = (window.FC = window.FC || {});
  const { apenasDigitos } = FC.format;

  // Algoritmo oficial dos dois dígitos verificadores do CPF.
  function validarCpf(valor) {
    const d = apenasDigitos(valor);
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false; // 111.111.111-11 etc.

    const digito = (base) => {
      let soma = 0;
      for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(d.slice(0, 9)) === Number(d[9]) && digito(d.slice(0, 10)) === Number(d[10]);
  }

  const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  ]);

  // Celular: DDD + 9 + 8 dígitos (11). Fixo: DDD + 2..5 + 7 dígitos (10).
  function validarTelefone(valor) {
    const d = apenasDigitos(valor);
    if (d.length !== 10 && d.length !== 11) return false;
    if (!DDDS.has(Number(d.slice(0, 2)))) return false;
    return d.length === 11 ? d[2] === "9" : /[2-5]/.test(d[2]);
  }

  function validarNome(valor) {
    const nome = String(valor ?? "").trim();
    const letras = nome.replace(/[^\p{L}]/gu, "");
    return letras.length >= 3 && /^[\p{L}][\p{L} '.\-]*$/u.test(nome);
  }

  FC.validators = { validarCpf, validarTelefone, validarNome };
})();
