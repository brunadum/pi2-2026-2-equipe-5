const passwordInput = document.querySelector("#password");
const togglePasswordButton = document.querySelector("#toggle-password");
const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#username");
const formMessage = document.querySelector("#form-message");

togglePasswordButton.addEventListener("click", () => {
  const showingPassword = passwordInput.type === "text";
  passwordInput.type = showingPassword ? "password" : "text";
  togglePasswordButton.setAttribute(
    "aria-label",
    showingPassword ? "Mostrar senha" : "Ocultar senha",
  );
  togglePasswordButton.setAttribute(
    "title",
    showingPassword ? "Mostrar senha" : "Ocultar senha",
  );
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    formMessage.textContent = "Preencha o email e a senha.";
    formMessage.style.color = "#b42318";
    formMessage.classList.add("visible");
    return;
  }

  //conexão front end e back end

  try {
    const response = await fetch("http://localhost:8001/api/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: username,
        senha: password,
      }),
    });

    const data = await response.json();

console.log("Status HTTP:", response.status);
console.log("Nome recebido da API:", data.nome);

if (!response.ok) {
    // Mensagem única para credencial inválida: não revela se o usuário ou a senha está errado.
    showInfo(response.status === 401 ? "Usuário ou senha inválidos." : (data.erro || "Não foi possível entrar."), "#b42318");
    return;
}

if (data.token && data.perfil && data.nome) {
    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("perfil", data.perfil);
    sessionStorage.setItem("nome", data.nome);

    // Gerente abre o dashboard; funcionário vai direto para Nova Venda.
    window.location.href = ["ADMIN", "GERENTE"].includes(String(data.perfil).toUpperCase()) ? "dashboard.html" : "nova-venda.html";
} else {
    showInfo("Resposta incompleta do servidor.", "#b42318");
}
  } catch (error) {
    showInfo("Não foi possível conectar ao servidor.", "#b42318");
    console.error("Erro no login:", error);
  }
});

document.querySelector("#forgot-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A recuperação de senha ainda não está disponível.");
});

document.querySelector("#access-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A solicitação de acesso ainda não está disponível.");
});

// Avisos vindos de redirecionamentos: login.html?motivo=expirada | login | sair
const MOTIVOS = {
  expirada: ["Sua sessão expirou. Entre novamente para continuar.", "#b42318"],
  login: ["Faça login para acessar o sistema.", "#52627d"],
  sair: ["Você saiu do sistema com segurança.", "#0b9d4b"],
};
const motivo = MOTIVOS[new URLSearchParams(location.search).get("motivo")];
if (motivo) showInfo(motivo[0], motivo[1]);

function showInfo(message, color = "#52627d") {
  formMessage.textContent = message;
  formMessage.style.color = color;
  formMessage.classList.add("visible");
}


