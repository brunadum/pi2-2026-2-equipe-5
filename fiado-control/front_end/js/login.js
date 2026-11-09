const passwordInput = document.querySelector("#password");
const togglePasswordButton = document.querySelector("#toggle-password");
const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#username");
const formMessage = document.querySelector("#form-message");
const submitButton = loginForm.querySelector('button[type="submit"]');

const API_BASE_URL = (window.FC_CONFIG?.API_BASE_URL || "http://localhost:8001").replace(/\/$/, "");

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
    showInfo("Preencha o email e a senha.", "#b42318");
    return;
  }

  if (submitButton.disabled) return;
  submitButton.disabled = true;
  submitButton.textContent = "Entrando…";

  try {
    const response = await fetch(`${API_BASE_URL}/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, senha: password }),
    });

    let data = {};
    try { data = await response.json(); } catch { /* corpo não-JSON */ }

    if (!response.ok) {
      showInfo(response.status === 401 ? "Usuário ou senha inválidos." : (data.erro || "Não foi possível entrar."), "#b42318");
      return;
    }

    if (!data.token || !data.perfil || !data.nome) {
      showInfo("Resposta incompleta do servidor.", "#b42318");
      return;
    }

    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("perfil", data.perfil);
    sessionStorage.setItem("nome", data.nome);

    window.location.href = ["ADMIN", "GERENTE"].includes(String(data.perfil).toUpperCase()) ? "dashboard.html" : "nova-venda.html";
  } catch (error) {
    console.error("Erro na requisição:", error); // Adicionado log para ajudar em futuros debugs
    showInfo("Não foi possível conectar ao servidor.", "#b42318");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Entrar";
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