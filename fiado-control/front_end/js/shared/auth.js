// Sessão, perfil e proteção de páginas (namespace global FC.auth).
//
// Carregado no <head> de todas as páginas internas, antes de qualquer outro script, para:
//   1. mandar para o login quem não está autenticado (ou cuja sessão expirou);
//   2. bloquear páginas que o perfil não pode acessar (vai para sem-permissao.html);
//   3. preencher nome/perfil do usuário e esconder do menu o que o perfil não pode usar.
// A decisão final de permissão é sempre do back-end (403); aqui só evitamos mostrar o que não funciona.
(function () {
  const FC = (window.FC = window.FC || {});

  const CHAVES = ["token", "perfil", "nome"];
  const ROTULOS = { gerente: "Gerente", funcionario: "Funcionário" };

  // Páginas exclusivas do gerente (contrato da API: dashboard, limite, exceções, usuários, configurações, relatórios).
  const PAGINAS_GERENTE = [
    "dashboard.html", "relatorios-dashboard.html", "configuracoes.html", "usuarios.html", "cliente-limite.html",
  ];
  // Ações exclusivas do gerente usadas por quem monta a tela (FC.auth.pode("limite")).
  const ACOES_GERENTE = ["limite", "excluir_cliente", "usuarios", "dashboard", "configuracoes", "relatorios"];

  const ler = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  function limpar() { CHAVES.forEach((k) => { try { sessionStorage.removeItem(k); } catch { /* ignora */ } }); }

  // "ADMIN"/"GERENTE" → gerente; qualquer outro perfil → funcionario.
  function perfil() {
    const p = ler("perfil").trim().toUpperCase();
    if (!p) return "";
    return p === "ADMIN" || p === "GERENTE" ? "gerente" : "funcionario";
  }
  const nome = () => ler("nome").trim();
  const token = () => ler("token");

  // Momento em que o token vence (ms), lido do próprio JWT; null se não for possível ler.
  function expiraEm(t) {
    try {
      const b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const exp = JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).exp;
      return Number.isFinite(exp) ? exp * 1000 : null;
    } catch { return null; }
  }
  function expirado() {
    const t = token();
    const e = t ? expiraEm(t) : null;
    return !!(e && e <= Date.now());
  }
  const logado = () => !!token() && !expirado();

  const pagina = () => location.pathname.split("/").pop() || "";
  function irPara(destino) { location.replace(destino); }

  function paraLogin(motivo) { limpar(); irPara(`login.html?motivo=${motivo}`); }
  const sessaoExpirada = () => paraLogin("expirada");
  const sair = () => paraLogin("sair");
  const paginaInicial = () => (perfil() === "gerente" ? "dashboard.html" : "nova-venda.html");

  function pode(acao) { return perfil() === "gerente" || !ACOES_GERENTE.includes(acao); }
  function podeAcessar(arquivo) { return perfil() === "gerente" || !PAGINAS_GERENTE.includes(arquivo); }

  // -------------------------------------------------------- proteção da página
  const arquivo = pagina();
  const ehLogin = arquivo === "login.html";
  FC.auth = { perfil, nome, token, logado, pode, podeAcessar, sair, sessaoExpirada, paraLogin, paginaInicial, rotulo: () => ROTULOS[perfil()] || "Usuário" };

  if (!ehLogin) {
    if (!logado()) { paraLogin(token() ? "expirada" : "login"); return; }
    if (!podeAcessar(arquivo)) { irPara(`sem-permissao.html?de=${encodeURIComponent(arquivo)}`); return; }
  }

  // ----------------------------------------------------- aparência por perfil
  function iniciais(n) {
    const p = n.split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
  }

  const ESTILO = `
    .btn-sair{display:flex;align-items:center;gap:9px;width:100%;margin-top:10px;padding:9px 12px;border:1px solid rgba(255,255,255,.14);border-radius:9px;color:#c9d6ea;background:transparent;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .btn-sair:hover{color:#fff;background:rgba(255,255,255,.08)}
    .btn-sair svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    [data-somente="gerente"][hidden]{display:none!important}`;

  function aplicar() {
    if (ehLogin) return;
    const n = nome() || "Usuário";
    document.querySelectorAll(".account-copy strong").forEach((e) => { e.textContent = n; });
    document.querySelectorAll(".account-copy small").forEach((e) => { e.textContent = FC.auth.rotulo(); });
    document.querySelectorAll(".account-button .avatar").forEach((e) => { e.textContent = iniciais(n); });
    document.querySelectorAll("#nome-usuario").forEach((e) => { e.textContent = n.split(/\s+/)[0]; });

    // Menu: esconde o que o perfil não pode abrir.
    document.querySelectorAll(".main-nav .nav-link").forEach((a) => {
      const alvo = (a.getAttribute("href") || "").split("?")[0].split("/").pop();
      if (!podeAcessar(alvo)) { a.hidden = true; a.style.display = "none"; }
    });
    // Elementos marcados como exclusivos do gerente.
    document.querySelectorAll('[data-somente="gerente"]').forEach((e) => { const ocultar = !pode("limite"); e.hidden = ocultar; e.style.display = ocultar ? "none" : ""; });

    // Botão "Sair" no rodapé do menu.
    const rodape = document.querySelector(".sidebar-bottom");
    if (rodape && !rodape.querySelector(".btn-sair")) {
      const st = document.createElement("style");
      st.textContent = ESTILO;
      document.head.appendChild(st);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-sair";
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9"/></svg>Sair do sistema';
      b.addEventListener("click", sair);
      rodape.appendChild(b);
    }
  }
  FC.auth.aplicar = aplicar;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplicar);
  else aplicar();
})();
