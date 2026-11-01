// Comprovantes de venda e de pagamento (namespace global FC.comprovantes).
//
// O comprovante é montado no momento da operação, com os dados que o back-end devolveu
// (id da venda, parcelas, saldos) somados aos dados da tela (itens, forma de pagamento),
// e fica guardado neste navegador para poder ser impresso agora ou reimpresso depois.
(function () {
  const FC = (window.FC = window.FC || {});
  const CHAVE = "fiadoControl.comprovantes.v1";
  const LIMITE = 80; // guarda só os comprovantes mais recentes

  function ler() {
    try { const o = JSON.parse(localStorage.getItem(CHAVE) || "{}"); return o && typeof o === "object" ? o : {}; }
    catch { return {}; }
  }
  function gravar(o) {
    const ids = Object.keys(o);
    if (ids.length > LIMITE) {
      ids.sort((a, b) => String(o[a].emitidoEm).localeCompare(String(o[b].emitidoEm)))
        .slice(0, ids.length - LIMITE).forEach((k) => delete o[k]);
    }
    try { localStorage.setItem(CHAVE, JSON.stringify(o)); return true; } catch { return false; }
  }

  function operador() {
    return document.querySelector(".account-copy strong")?.textContent?.trim() || "";
  }

  // Salva e devolve { id, url } — url relativa à pasta pages/.
  function salvar(comprovante) {
    const dados = { ...comprovante, emitidoEm: new Date().toISOString(), operador: comprovante.operador || operador() };
    const todos = ler();
    todos[dados.id] = dados;
    gravar(todos);
    const pagina = dados.tipo === "venda" ? "comprovante-venda.html" : "comprovante-pagamento.html";
    return { id: dados.id, url: `${pagina}?id=${encodeURIComponent(dados.id)}` };
  }

  const obter = (id) => ler()[id] || null;

  // Abre o comprovante em nova aba (com a janela de impressão) ou, se o navegador bloquear, nesta aba.
  function abrir(url, { imprimir = false } = {}) {
    const destino = url + (imprimir ? "&imprimir=1" : "");
    const w = window.open(destino, "_blank");
    if (!w) location.href = destino;
  }

  // Pergunta se o usuário quer imprimir; devolve true se escolheu imprimir.
  function perguntarImpressao({ titulo, mensagem, url }) {
    return FC.ui.confirmar({ titulo, mensagem, rotuloConfirmar: "Imprimir comprovante", rotuloCancelar: "Agora não" })
      .then((sim) => { if (sim) abrir(url, { imprimir: true }); return sim; });
  }

  FC.comprovantes = { salvar, obter, abrir, perguntarImpressao };
})();
