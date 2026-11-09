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


// Cabeçalho com o token da sessão (guardado no login).
function cabecalhoAuth(){
  const token=sessionStorage.getItem("token")
  return token ? {"Accept":"application/json","Authorization":`Bearer ${token}`} : {"Accept":"application/json"}
}

//conectar o front com backend
async function carregarCliente(){
  try {
    const resposta=await fetch("http://localhost:8001/api/clientes",{headers:cabecalhoAuth()})
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
    const resposta=await fetch("http://localhost:8001/api/vendas",{headers:cabecalhoAuth()})

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

// Formatar valores em reais
function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(valor));
}

// Formatar data no padrão brasileiro
function formatarData(data) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function carregarDashboard() {
    const indicadores = [
    "total-a-receber",
    "total-em-atraso",
    "vendas-mes",
    "clientes-inadimplentes"
  ]

  const tabela=document.getElementById("installment-rows")

  try {
    const token=sessionStorage.getItem("token")
    const resposta = await fetch(
  "http://localhost:8001/api/dashboard?periodo=mes",
  {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`
    }
  }
)

    if(resposta.status===401){
       if(window.FC&&FC.auth) FC.auth.sessaoExpirada()
       throw new Error("Sua sessão expirou. Entre novamente.")
    }
    if(resposta.status===403){
        throw new Error("Você não tem permissão para acessar o dashboard.")
    }
    if(!resposta.ok){
        throw new Error("Erro ao consultar os dados do dashboard.")
    }

    const dados=await resposta.json()

    // Total a receber
    document.getElementById("total-a-receber").textContent =
      formatarMoeda(dados.total_a_receber);

    // Total em atraso
    const totalEmAtraso = dados.parcelas_vencidas.reduce(
      (soma, parcela) => soma + Number(parcela.valor_parcela),
      0
    );

    document.getElementById("total-em-atraso").textContent =
      formatarMoeda(totalEmAtraso);

    // Vendas aprovadas no mês
    document.getElementById("vendas-mes").textContent =
      formatarMoeda(dados.faturamento_total);

    // Contar clientes inadimplentes sem repetição
    const clientesInadimplentes = new Set(
      dados.parcelas_vencidas.map(parcela => parcela.id_cliente)
    );

    document.getElementById("clientes-inadimplentes").textContent =
      clientesInadimplentes.size;

       // Atualizar tabela de próximas parcelas
    tabela.replaceChildren();

    if (dados.parcelas_a_vencer.length === 0) {
      const linha = tabela.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 4;
      celula.textContent = "Nenhuma parcela a vencer no período.";
    } else {
      dados.parcelas_a_vencer.forEach(parcela => {
        const linha = tabela.insertRow();

        linha.insertCell().textContent = parcela.nome;
        linha.insertCell().textContent =
          formatarData(parcela.data_vencimento);
        linha.insertCell().textContent =
          formatarMoeda(parcela.valor_parcela);
        linha.insertCell().textContent = "A vencer";
      });
    }



  }catch (erro) {
    console.error("Erro no dashboard:", erro)

    indicadores.forEach(id => {
      document.getElementById(id).textContent = "Indisponível"
    })

    tabela.replaceChildren()

    const linha = tabela.insertRow()
    const celula = linha.insertCell()
    celula.colSpan = 4
    celula.textContent = erro.message
  }
}

carregarDashboard()
// Nome e perfil do usuário são preenchidos por js/shared/auth.js em todas as páginas.
