// Formatadores e helpers de texto (namespace global FC.format).
(function () {
  const FC = (window.FC = window.FC || {});

  const apenasDigitos = (t) => String(t ?? "").replace(/\D/g, "");
  const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizar = (t) => semAcento(t).toLowerCase().trim();

  function escapeHtml(t) {
    return String(t ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  const arredondar = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function moeda(valor) {
    const n = Number(valor);
    return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function cpf(valor) {
    const d = apenasDigitos(valor);
    if (d.length !== 11) return valor ? String(valor) : "—";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function telefone(valor) {
    const d = apenasDigitos(valor);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return valor ? String(valor) : "—";
  }

  // Aceita "2026-10-05" ou "2026-10-05T10:00:00": evita o deslocamento de fuso de new Date().
  function dataBR(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
  }

  function hojeISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  FC.format = { apenasDigitos, semAcento, normalizar, escapeHtml, arredondar, moeda, cpf, telefone, dataBR, hojeISO };
})();
