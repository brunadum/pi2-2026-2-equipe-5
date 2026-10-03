(() => {
  const toast = document.getElementById("toast");
  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("mobile-menu");
  const backdrop = document.getElementById("sidebar-backdrop");
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  document.querySelectorAll("[data-coming-soon]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      showToast(`${element.dataset.comingSoon}: funcionalidade ainda não implementada.`);
    });
  });

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    backdrop.classList.toggle("show", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });

  backdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });
})();


//conectar o front com backend
async function carregarCliente(){
  try {
    const resposta=await fetch("http://localhost:8001/api/clientes")
    if(!resposta.ok){
       throw new Error("Erro ao consultar o backend")
    }
    const clientes = await resposta.json();
    console.log(clientes)
  } catch (erro) {
    console.error("Erro:",erro);
  }
}

carregarCliente()

async function carregarVendas(){
  try {
    const resposta=await fetch("http://localhost:8001/api/vendas")

    if(!resposta.ok){
        throw new Error("Erro ao consultar o backeend")
    }
    const vendas= await resposta.json();
    console.log(vendas)
    
  } catch (erro) {
    console.error("Erro: ",erro)
  }
}

carregarVendas()