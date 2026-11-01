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
       throw new Error("Autenticação necessária para acessar o dashboard.")
    }
    if(resposta.status===403){
        throw new Error("Apenas o gerente pode acessar o dashboard.")
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

const nomeUsuario = sessionStorage.getItem("nome");
const perfilUsuario = sessionStorage.getItem("perfil");

const nomeCabecalho = document.getElementById("nome-usuario");
const nomeSidebar = document.getElementById("nome-usuario-sidebar");
const avatarUsuario = document.getElementById("avatar-usuario");
const perfilSidebar = document.getElementById("perfil-usuario");

if (nomeCabecalho) {
    nomeCabecalho.textContent = nomeUsuario || "Usuário";
}

if (nomeSidebar) {
    nomeSidebar.textContent = nomeUsuario || "Usuário";
}

if (avatarUsuario && nomeUsuario) {
    avatarUsuario.textContent = nomeUsuario
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(parte => parte[0].toUpperCase())
        .join("");
}

if (perfilSidebar) {
    perfilSidebar.textContent =
        perfilUsuario === "ADMIN" ? "Administrador" :
        perfilUsuario === "COMUM" ? "Funcionário" : "Usuário";
}


console.log("Nome:", sessionStorage.getItem("nome"));
console.log("Perfil:", sessionStorage.getItem("perfil"));