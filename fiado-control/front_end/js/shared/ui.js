// Comportamentos compartilhados das telas internas (namespace global FC.ui).
(function () {
  const FC = (window.FC = window.FC || {});
  let toastTimer;

  function toast(mensagem, tipo = "info") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = mensagem;
    el.classList.toggle("toast-error", tipo === "erro");
    el.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("show"), 3200);
  }

  // Menu lateral no mobile + links de funcionalidades ainda não implementadas.
  function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const botao = document.getElementById("mobile-menu");
    const fundo = document.getElementById("sidebar-backdrop");

    const fechar = () => {
      sidebar.classList.remove("open");
      fundo.classList.remove("show");
      botao.setAttribute("aria-expanded", "false");
    };

    botao.addEventListener("click", () => {
      const aberto = sidebar.classList.toggle("open");
      fundo.classList.toggle("show", aberto);
      botao.setAttribute("aria-expanded", String(aberto));
    });
    fundo.addEventListener("click", fechar);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });

    document.querySelectorAll("[data-coming-soon]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        toast(`${el.dataset.comingSoon}: funcionalidade ainda não implementada.`);
      });
    });
  }

  const FOCAVEIS =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Modal acessível: foco preso, Esc, clique no fundo e botões [data-close-modal].
  function criarModal(overlay, { aoFechar } = {}) {
    let ultimoFoco = null;
    let travado = false;
    const aberto = () => !overlay.hidden;

    function abrir() {
      ultimoFoco = document.activeElement;
      overlay.hidden = false;
      document.body.classList.add("modal-open");
      const alvo = overlay.querySelector("[data-autofocus]") || overlay.querySelector(FOCAVEIS);
      window.setTimeout(() => alvo && alvo.focus(), 0);
    }

    function fechar() {
      if (travado || !aberto()) return;
      overlay.hidden = true;
      document.body.classList.remove("modal-open");
      if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
      if (aoFechar) aoFechar();
    }

    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", fechar));

    document.addEventListener("keydown", (e) => {
      if (!aberto()) return;
      if (e.key === "Escape") { e.preventDefault(); fechar(); return; }
      if (e.key !== "Tab") return;
      const itens = [...overlay.querySelectorAll(FOCAVEIS)].filter((i) => i.offsetParent !== null);
      if (!itens.length) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });

    return { abrir, fechar, estaAberto: aberto, travar: (v) => { travado = v; } };
  }

  FC.ui = { toast, initSidebar, criarModal };
})();
